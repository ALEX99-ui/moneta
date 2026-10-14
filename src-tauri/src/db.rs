//! Capa de acceso a SQLite (única propietaria del archivo de datos).
//!
//! * Consultas SIEMPRE parametrizadas; solo se aceptan SELECT/INSERT/UPDATE/DELETE/WITH.
//! * `batch` ejecuta varias sentencias en una única transacción (todo o nada).
//! * Respaldo con `VACUUM INTO` + verificación; restauración validada sobre una copia temporal
//!   y aplicada con la API de respaldo de SQLite (atómica) tras crear un respaldo previo.

use crate::migrations;
use rusqlite::backup::{Backup, StepResult};
use rusqlite::types::{Value, ValueRef};
use rusqlite::{params_from_iter, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value as Json};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const DB_FILE: &str = "moneta.db";

#[derive(Deserialize, Debug)]
pub struct Stmt {
    pub sql: String,
    #[serde(default)]
    pub params: Vec<Json>,
}

#[derive(Serialize, Debug, Clone)]
pub struct ExecResult {
    pub changes: usize,
}

#[derive(Serialize, Debug, Clone)]
pub struct VerifyReport {
    pub ok: bool,
    pub errors: Vec<String>,
    pub schema_version: i64,
    pub app_schema_version: i64,
    pub counts: BTreeMap<String, i64>,
}

#[derive(Serialize, Debug, Clone)]
pub struct BackupInfo {
    pub path: String,
    pub size_bytes: u64,
    pub counts: BTreeMap<String, i64>,
}

#[derive(Serialize, Debug, Clone)]
pub struct RestoreReport {
    pub pre_restore_backup: String,
    pub counts: BTreeMap<String, i64>,
}

pub struct Database {
    conn: Mutex<Connection>,
    pub path: PathBuf,
    pub data_dir: PathBuf,
}

const REQUIRED_TABLES: &[&str] = &[
    "accounts", "categories", "subcategories", "transactions", "transfers", "savings_goals",
    "goal_contributions", "budgets", "recurring_rules", "tags", "transaction_tags", "settings",
    "saved_filters", "schema_migrations",
];
const COUNT_TABLES: &[&str] = &[
    "accounts", "categories", "transactions", "transfers", "savings_goals", "goal_contributions",
    "budgets", "recurring_rules",
];

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn open_rw(path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(err)?;
    conn.busy_timeout(std::time::Duration::from_secs(5)).map_err(err)?;
    conn.pragma_update(None, "foreign_keys", "ON").map_err(err)?;
    conn.pragma_update(None, "journal_mode", "WAL").map_err(err)?;
    conn.pragma_update(None, "synchronous", "FULL").map_err(err)?;
    Ok(conn)
}

fn timestamp() -> String {
    chrono::Local::now().format("%Y%m%d-%H%M%S").to_string()
}

fn json_to_value(j: &Json) -> Result<Value, String> {
    Ok(match j {
        Json::Null => Value::Null,
        Json::Bool(b) => Value::Integer(*b as i64),
        Json::Number(n) => {
            if let Some(i) = n.as_i64() {
                Value::Integer(i)
            } else if let Some(f) = n.as_f64() {
                Value::Real(f)
            } else {
                return Err("Número fuera de rango".into());
            }
        }
        Json::String(s) => Value::Text(s.clone()),
        _ => return Err("Parámetro SQL no soportado".into()),
    })
}

fn check_sql(sql: &str) -> Result<(), String> {
    let head = sql.trim_start().to_ascii_lowercase();
    let ok = ["select", "insert", "update", "delete", "with", "replace"]
        .iter()
        .any(|k| head.starts_with(k));
    if ok {
        Ok(())
    } else {
        Err("Sentencia SQL no permitida".into())
    }
}

fn value_ref_to_json(v: ValueRef) -> Json {
    match v {
        ValueRef::Null => Json::Null,
        ValueRef::Integer(i) => Json::from(i),
        ValueRef::Real(f) => Json::from(f),
        ValueRef::Text(t) => Json::String(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(b) => Json::String(b.iter().map(|x| format!("{x:02x}")).collect()),
    }
}

fn run_select(conn: &Connection, sql: &str, params: &[Json]) -> Result<Vec<Map<String, Json>>, String> {
    check_sql(sql)?;
    let values: Vec<Value> = params.iter().map(json_to_value).collect::<Result<_, _>>()?;
    let mut stmt = conn.prepare(sql).map_err(err)?;
    let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let mut rows = stmt.query(params_from_iter(values.iter())).map_err(err)?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(err)? {
        let mut m = Map::new();
        for (i, n) in names.iter().enumerate() {
            m.insert(n.clone(), value_ref_to_json(row.get_ref(i).map_err(err)?));
        }
        out.push(m);
    }
    Ok(out)
}

fn run_execute(conn: &Connection, sql: &str, params: &[Json]) -> Result<usize, String> {
    check_sql(sql)?;
    let values: Vec<Value> = params.iter().map(json_to_value).collect::<Result<_, _>>()?;
    let mut stmt = conn.prepare(sql).map_err(err)?;
    stmt.execute(params_from_iter(values.iter())).map_err(err)
}

fn counts_of(conn: &Connection) -> BTreeMap<String, i64> {
    let mut m = BTreeMap::new();
    for t in COUNT_TABLES {
        let sql = if *t == "transactions" || *t == "transfers" {
            format!("SELECT COUNT(*) FROM {t} WHERE deleted_at IS NULL")
        } else {
            format!("SELECT COUNT(*) FROM {t}")
        };
        if let Ok(n) = conn.query_row(&sql, [], |r| r.get::<_, i64>(0)) {
            m.insert((*t).to_string(), n);
        }
    }
    m
}

/// Verificación profunda de un archivo de base de datos (no lo modifica).
pub fn verify_file(path: &Path) -> VerifyReport {
    let mut report = VerifyReport {
        ok: false,
        errors: vec![],
        schema_version: 0,
        app_schema_version: migrations::latest_version(),
        counts: BTreeMap::new(),
    };
    if !path.is_file() {
        report.errors.push("El archivo no existe".into());
        return report;
    }
    let conn = match Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX) {
        Ok(c) => c,
        Err(e) => {
            report.errors.push(format!("No se puede abrir: {e}"));
            return report;
        }
    };
    // 1. Integridad física
    match conn.prepare("PRAGMA integrity_check").and_then(|mut s| {
        let rows: Vec<String> = s.query_map([], |r| r.get::<_, String>(0))?.collect::<Result<_, _>>()?;
        Ok(rows)
    }) {
        Ok(rows) => {
            if rows != vec!["ok".to_string()] {
                report.errors.push(format!("Integridad: {}", rows.join("; ")));
                return report;
            }
        }
        Err(e) => {
            report.errors.push(format!("El archivo no es una base de datos válida: {e}"));
            return report;
        }
    }
    // 2. Tablas requeridas
    for t in REQUIRED_TABLES {
        let exists: i64 = conn
            .query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1", [t], |r| r.get(0))
            .unwrap_or(0);
        if exists == 0 {
            report.errors.push(format!("Falta la tabla '{t}'"));
        }
    }
    if !report.errors.is_empty() {
        return report;
    }
    // 3. Versión de esquema
    report.schema_version = conn
        .query_row("SELECT COALESCE(MAX(version),0) FROM schema_migrations", [], |r| r.get(0))
        .unwrap_or(0);
    if report.schema_version > report.app_schema_version {
        report.errors.push(format!(
            "El respaldo es de una versión más nueva ({}) que la aplicación ({})",
            report.schema_version, report.app_schema_version
        ));
    }
    if report.schema_version < 1 {
        report.errors.push("El respaldo no tiene versión de esquema".into());
    }
    // 4. Integridad referencial
    match conn.prepare("PRAGMA foreign_key_check").and_then(|mut s| {
        let n = s.query_map([], |_| Ok(()))?.count();
        Ok(n)
    }) {
        Ok(0) => {}
        Ok(n) => report.errors.push(format!("{n} referencias rotas entre tablas")),
        Err(e) => report.errors.push(format!("No se pudo verificar referencias: {e}")),
    }
    // 5. Validez semántica de los datos (dinero entero positivo, fechas, tipos)
    let checks: &[(&str, &str)] = &[
        ("transactions", "SELECT COUNT(*) FROM transactions WHERE typeof(amount) <> 'integer' OR amount <= 0 OR type NOT IN ('income','expense') OR date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'"),
        ("transfers", "SELECT COUNT(*) FROM transfers WHERE typeof(amount) <> 'integer' OR amount <= 0 OR from_account_id = to_account_id OR date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'"),
        ("accounts", "SELECT COUNT(*) FROM accounts WHERE typeof(initial_balance) <> 'integer'"),
        ("goal_contributions", "SELECT COUNT(*) FROM goal_contributions WHERE typeof(amount) <> 'integer' OR amount <= 0 OR kind NOT IN ('deposit','withdrawal')"),
        ("budgets", "SELECT COUNT(*) FROM budgets WHERE typeof(amount) <> 'integer' OR amount <= 0"),
        ("transactions", "SELECT COUNT(*) FROM transactions t JOIN categories c ON c.id = t.category_id WHERE c.kind <> t.type"),
        ("goal_contributions", "SELECT COUNT(*) FROM (SELECT goal_id FROM goal_contributions GROUP BY goal_id HAVING SUM(CASE kind WHEN 'deposit' THEN amount ELSE -amount END) < 0)"),
    ];
    for (table, sql) in checks {
        match conn.query_row(sql, [], |r| r.get::<_, i64>(0)) {
            Ok(0) => {}
            Ok(n) => report.errors.push(format!("{n} registros inválidos en '{table}'")),
            Err(e) => report.errors.push(format!("No se pudo validar '{table}': {e}")),
        }
    }
    report.counts = counts_of(&conn);
    report.ok = report.errors.is_empty();
    report
}

fn vacuum_into(conn: &Connection, dest: &Path) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    let _ = fs::remove_file(dest);
    conn.execute("VACUUM INTO ?1", [dest.to_string_lossy().as_ref()]).map_err(err)?;
    Ok(())
}

impl Database {
    /// Abre (o crea) la base de datos en `data_dir`, hace un respaldo previo si hay migraciones pendientes y migra.
    pub fn open(data_dir: &Path) -> Result<Self, String> {
        fs::create_dir_all(data_dir).map_err(|e| format!("No se pudo crear la carpeta de datos: {e}"))?;
        let path = data_dir.join(DB_FILE);
        let existed = path.is_file();
        let conn = open_rw(&path).map_err(|e| format!("No se pudo abrir la base de datos: {e}"))?;
        let cur = migrations::current_version(&conn).map_err(err)?;
        let pending = migrations::pending_count(&conn).map_err(err)?;
        if existed && cur > 0 && pending > 0 {
            let dest = data_dir.join("backups").join(format!("pre-migration-v{cur}-{}.db", timestamp()));
            vacuum_into(&conn, &dest).map_err(|e| format!("No se pudo crear el respaldo previo a la migración: {e}"))?;
        }
        migrations::migrate(&conn)?;
        Ok(Self { conn: Mutex::new(conn), path, data_dir: data_dir.to_path_buf() })
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
        self.conn.lock().map_err(|_| "La conexión a la base de datos quedó bloqueada".to_string())
    }

    pub fn select(&self, sql: &str, params: &[Json]) -> Result<Vec<Map<String, Json>>, String> {
        let conn = self.lock()?;
        run_select(&conn, sql, params)
    }

    pub fn execute(&self, sql: &str, params: &[Json]) -> Result<ExecResult, String> {
        let conn = self.lock()?;
        run_execute(&conn, sql, params).map(|changes| ExecResult { changes })
    }

    /// Todas las sentencias en una transacción: si una falla, no se aplica ninguna.
    pub fn batch(&self, stmts: &[Stmt]) -> Result<Vec<ExecResult>, String> {
        let mut conn = self.lock()?;
        let tx = conn.transaction().map_err(err)?;
        let mut out = Vec::with_capacity(stmts.len());
        for s in stmts {
            let changes = run_execute(&tx, &s.sql, &s.params)?;
            out.push(ExecResult { changes });
        }
        tx.commit().map_err(err)?;
        Ok(out)
    }

    pub fn quick_check(&self) -> Result<Vec<String>, String> {
        let conn = self.lock()?;
        let mut s = conn.prepare("PRAGMA quick_check").map_err(err)?;
        let rows: Vec<String> = s.query_map([], |r| r.get::<_, String>(0)).map_err(err)?.collect::<Result<_, _>>().map_err(err)?;
        Ok(rows)
    }

    /// Crea un respaldo consistente en `dest` (se escribe a un temporal, se verifica y luego se renombra).
    pub fn backup_to(&self, dest: &Path) -> Result<BackupInfo, String> {
        if dest == self.path {
            return Err("El destino no puede ser la base de datos activa".into());
        }
        let tmp = dest.with_extension(format!("tmp-{}", timestamp()));
        {
            let conn = self.lock()?;
            vacuum_into(&conn, &tmp)?;
        }
        let report = verify_file(&tmp);
        if !report.ok {
            let _ = fs::remove_file(&tmp);
            return Err(format!("El respaldo no pasó la verificación: {}", report.errors.join("; ")));
        }
        fs::rename(&tmp, dest).map_err(|e| {
            let _ = fs::remove_file(&tmp);
            format!("No se pudo guardar el respaldo: {e}")
        })?;
        let size_bytes = fs::metadata(dest).map(|m| m.len()).unwrap_or(0);
        Ok(BackupInfo { path: dest.to_string_lossy().into_owned(), size_bytes, counts: report.counts })
    }

    pub fn default_backup_dir(&self) -> PathBuf {
        self.data_dir.join("backups")
    }

    /// Restaura desde `src`. La base activa solo se modifica al final, de forma atómica, y existe
    /// siempre un respaldo previo (`pre-restore-*.db`) para volver atrás.
    pub fn restore_from(&self, src: &Path) -> Result<RestoreReport, String> {
        if src == self.path {
            return Err("El respaldo no puede ser la base de datos activa".into());
        }
        let first = verify_file(src);
        if !first.ok {
            return Err(format!("El respaldo no es válido: {}", first.errors.join("; ")));
        }
        // Copia temporal sobre la que se valida/migra sin tocar el original ni la base activa.
        let tmp_path = self.data_dir.join(format!("restore-tmp-{}.db", timestamp()));
        fs::copy(src, &tmp_path).map_err(|e| format!("No se pudo leer el respaldo: {e}"))?;
        let result = self.restore_from_temp(&tmp_path);
        for suffix in ["", "-wal", "-shm", "-journal"] {
            let _ = fs::remove_file(PathBuf::from(format!("{}{}", tmp_path.display(), suffix)));
        }
        result
    }

    fn restore_from_temp(&self, tmp_path: &Path) -> Result<RestoreReport, String> {
        {
            let tmp = Connection::open(tmp_path).map_err(err)?;
            tmp.pragma_update(None, "foreign_keys", "ON").map_err(err)?;
            migrations::migrate(&tmp)?;
        }
        let checked = verify_file(tmp_path);
        if !checked.ok {
            return Err(format!("Los datos del respaldo no son válidos: {}", checked.errors.join("; ")));
        }
        // Respaldo de seguridad de lo actual.
        let pre = self.default_backup_dir().join(format!("pre-restore-{}.db", timestamp()));
        let pre_info = self.backup_to(&pre)?;
        // Aplicación atómica.
        let applied = {
            let mut live = self.lock()?;
            let src = Connection::open_with_flags(tmp_path, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(err)?;
            Self::copy_all(&src, &mut live)
        };
        if let Err(e) = applied {
            return Err(format!("No se pudo restaurar (la base actual no fue modificada): {e}"));
        }
        // Verificación posterior; si falla, volver al respaldo previo.
        let post = self.post_restore_ok();
        if let Err(msg) = post {
            let mut live = self.lock()?;
            let prev = Connection::open_with_flags(&pre, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(err)?;
            let rolled = Self::copy_all(&prev, &mut live);
            return Err(format!(
                "La verificación posterior falló ({msg}). {}",
                if rolled.is_ok() { "Se volvió al estado anterior." } else { "No se pudo volver automáticamente: usa el respaldo previo." }
            ));
        }
        let counts = {
            let live = self.lock()?;
            counts_of(&live)
        };
        Ok(RestoreReport { pre_restore_backup: pre_info.path, counts })
    }

    fn copy_all(src: &Connection, dst: &mut Connection) -> Result<(), String> {
        {
            let backup = Backup::new(src, dst).map_err(err)?;
            // step(-1) copia todo en un único paso: o se aplica completo o no se aplica nada.
            match backup.step(-1).map_err(err)? {
                StepResult::Done => {}
                other => return Err(format!("Copia incompleta: {other:?}")),
            }
        }
        dst.pragma_update(None, "journal_mode", "WAL").map_err(err)?;
        dst.pragma_update(None, "foreign_keys", "ON").map_err(err)?;
        Ok(())
    }

    fn post_restore_ok(&self) -> Result<(), String> {
        let conn = self.lock()?;
        let ic: String = conn.query_row("PRAGMA integrity_check", [], |r| r.get(0)).map_err(err)?;
        if ic != "ok" {
            return Err(format!("integridad: {ic}"));
        }
        let broken = conn.prepare("PRAGMA foreign_key_check").map_err(err)?.query_map([], |_| Ok(())).map_err(err)?.count();
        if broken > 0 {
            return Err(format!("{broken} referencias rotas"));
        }
        Ok(())
    }

    /// Respaldo automático local: máximo uno por `interval_hours`; conserva los `keep` más recientes.
    pub fn auto_backup(&self, dir: Option<&Path>, keep: usize, interval_hours: u64) -> Result<Option<BackupInfo>, String> {
        let dir = dir.map(Path::to_path_buf).unwrap_or_else(|| self.default_backup_dir());
        fs::create_dir_all(&dir).map_err(err)?;
        let mut existing: Vec<(std::time::SystemTime, PathBuf)> = fs::read_dir(&dir)
            .map_err(err)?
            .filter_map(|e| e.ok())
            .filter(|e| {
                let n = e.file_name().to_string_lossy().into_owned();
                n.starts_with("moneta-auto-") && n.ends_with(".db")
            })
            .filter_map(|e| Some((e.metadata().ok()?.modified().ok()?, e.path())))
            .collect();
        existing.sort_by(|a, b| b.0.cmp(&a.0));
        if let Some((newest, _)) = existing.first() {
            let age = std::time::SystemTime::now().duration_since(*newest).unwrap_or_default();
            if age < std::time::Duration::from_secs(interval_hours * 3600) {
                return Ok(None);
            }
        }
        let info = self.backup_to(&dir.join(format!("moneta-auto-{}.db", timestamp())))?;
        existing.insert(0, (std::time::SystemTime::now(), PathBuf::from(&info.path)));
        for (_, p) in existing.iter().skip(keep.max(1)) {
            let _ = fs::remove_file(p);
        }
        Ok(Some(info))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn open_tmp() -> (tempfile::TempDir, Database) {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(dir.path()).unwrap();
        (dir, db)
    }

    fn insert_tx(db: &Database, id: &str, amount: i64) {
        db.execute(
            "INSERT INTO transactions (id,type,amount,date,account_id,category_id,description,created_at,updated_at) VALUES (?1,'expense',?2,'2025-01-15','acc_cash','cat_alimentacion','x','t','t')",
            &[json!(id), json!(amount)],
        )
        .unwrap();
    }

    fn count_tx(db: &Database) -> i64 {
        db.select("SELECT COUNT(*) AS n FROM transactions", &[]).unwrap()[0]["n"].as_i64().unwrap()
    }

    #[test]
    fn migrations_apply_on_fresh_db_and_seed() {
        let (_d, db) = open_tmp();
        let rows = db.select("SELECT COUNT(*) AS n FROM categories", &[]).unwrap();
        assert_eq!(rows[0]["n"], json!(24));
        let v = db.select("SELECT MAX(version) AS v FROM schema_migrations", &[]).unwrap();
        assert_eq!(v[0]["v"], json!(migrations::latest_version()));
        assert!(db.quick_check().unwrap() == vec!["ok".to_string()]);
    }

    #[test]
    fn reopen_keeps_data() {
        let dir = tempfile::tempdir().unwrap();
        {
            let db = Database::open(dir.path()).unwrap();
            insert_tx(&db, "t1", 1000);
        }
        let db = Database::open(dir.path()).unwrap();
        assert_eq!(count_tx(&db), 1);
    }

    #[test]
    fn batch_is_atomic() {
        let (_d, db) = open_tmp();
        let ok = Stmt { sql: "INSERT INTO transactions (id,type,amount,date,account_id,category_id,description,created_at,updated_at) VALUES ('a','expense',500,'2025-01-01','acc_cash','cat_alimentacion','','t','t')".into(), params: vec![] };
        let bad = Stmt { sql: "INSERT INTO transactions (id,type,amount,date,account_id,category_id,description,created_at,updated_at) VALUES ('b','expense',-5,'2025-01-01','acc_cash','cat_alimentacion','','t','t')".into(), params: vec![] };
        assert!(db.batch(&[ok, bad]).is_err());
        assert_eq!(count_tx(&db), 0, "ninguna sentencia debe haberse aplicado");
    }

    #[test]
    fn rejects_non_dml_and_multiple_statements() {
        let (_d, db) = open_tmp();
        assert!(db.execute("DROP TABLE transactions", &[]).is_err());
        assert!(db.execute("ATTACH DATABASE 'x.db' AS x", &[]).is_err());
        assert!(db.select("PRAGMA user_version", &[]).is_err());
        assert!(db.select("SELECT 1; DROP TABLE accounts", &[]).is_err());
    }

    #[test]
    fn integrity_constraints_hold() {
        let (_d, db) = open_tmp();
        // categoría de ingreso en un gasto
        assert!(db.execute(
            "INSERT INTO transactions (id,type,amount,date,account_id,category_id,description,created_at,updated_at) VALUES ('x','expense',10,'2025-01-01','acc_cash','cat_ing_salario','','t','t')", &[]).is_err());
        // cuenta inexistente
        assert!(db.execute(
            "INSERT INTO transactions (id,type,amount,date,account_id,category_id,description,created_at,updated_at) VALUES ('x','expense',10,'2025-01-01','nope','cat_alimentacion','','t','t')", &[]).is_err());
        // transferencia a la misma cuenta
        assert!(db.execute("INSERT INTO transfers (id,from_account_id,to_account_id,amount,date,created_at,updated_at) VALUES ('t','acc_cash','acc_cash',5,'2025-01-01','t','t')", &[]).is_err());
        // no se puede borrar una categoría con movimientos
        insert_tx(&db, "t1", 100);
        assert!(db.execute("DELETE FROM categories WHERE id='cat_alimentacion'", &[]).is_err());
    }

    #[test]
    fn backup_verify_and_restore_roundtrip() {
        let (dir, db) = open_tmp();
        insert_tx(&db, "t1", 1000);
        insert_tx(&db, "t2", 2000);
        let bak = dir.path().join("mi-respaldo.db");
        let info = db.backup_to(&bak).unwrap();
        assert_eq!(info.counts["transactions"], 2);
        assert!(verify_file(&bak).ok);
        // se agrega un movimiento más y luego se restaura el respaldo
        insert_tx(&db, "t3", 3000);
        assert_eq!(count_tx(&db), 3);
        let rep = db.restore_from(&bak).unwrap();
        assert_eq!(count_tx(&db), 2);
        assert!(Path::new(&rep.pre_restore_backup).is_file());
        // el respaldo previo conserva el estado anterior (3 movimientos)
        let pre = verify_file(Path::new(&rep.pre_restore_backup));
        assert!(pre.ok);
        assert_eq!(pre.counts["transactions"], 3);
        // la base sigue siendo escribible tras restaurar
        insert_tx(&db, "t4", 10);
        assert_eq!(count_tx(&db), 3);
    }

    #[test]
    fn restore_rejects_garbage_and_keeps_data() {
        let (dir, db) = open_tmp();
        insert_tx(&db, "t1", 1000);
        let junk = dir.path().join("junk.db");
        fs::write(&junk, b"esto no es sqlite, solo texto plano para probar").unwrap();
        assert!(db.restore_from(&junk).is_err());
        assert!(!verify_file(&junk).ok);
        assert!(!verify_file(&dir.path().join("no-existe.db")).ok);
        assert_eq!(count_tx(&db), 1, "los datos originales no deben cambiar");
    }

    #[test]
    fn restore_rejects_semantically_invalid_data() {
        let (dir, db) = open_tmp();
        insert_tx(&db, "t1", 1000);
        let bak = dir.path().join("bad.db");
        db.backup_to(&bak).unwrap();
        {
            // Se corrompe a propósito el respaldo: monto negativo sin las restricciones CHECK.
            let c = Connection::open(&bak).unwrap();
            c.execute_batch("PRAGMA writable_schema=ON; PRAGMA ignore_check_constraints=ON; UPDATE transactions SET amount=-5;").unwrap();
        }
        let r = verify_file(&bak);
        assert!(!r.ok, "debe detectar montos inválidos: {:?}", r.errors);
        assert!(db.restore_from(&bak).is_err());
        assert_eq!(count_tx(&db), 1);
    }

    #[test]
    fn restore_rejects_newer_schema_version() {
        let (dir, db) = open_tmp();
        let bak = dir.path().join("future.db");
        db.backup_to(&bak).unwrap();
        {
            let c = Connection::open(&bak).unwrap();
            c.execute("INSERT INTO schema_migrations (version,name,applied_at) VALUES (999,'future','x')", []).unwrap();
        }
        let r = verify_file(&bak);
        assert!(!r.ok);
        assert!(db.restore_from(&bak).is_err());
    }

    #[test]
    fn auto_backup_respects_interval_and_keeps_n() {
        let (dir, db) = open_tmp();
        let target = dir.path().join("auto");
        let first = db.auto_backup(Some(&target), 3, 20).unwrap();
        assert!(first.is_some());
        // dentro del intervalo no se crea otro
        assert!(db.auto_backup(Some(&target), 3, 20).unwrap().is_none());
        // con intervalo 0 se crean y se podan
        for _ in 0..4 {
            std::thread::sleep(std::time::Duration::from_millis(1100));
            db.auto_backup(Some(&target), 3, 0).unwrap();
        }
        let n = fs::read_dir(&target).unwrap().count();
        assert_eq!(n, 3);
    }

    #[test]
    fn older_db_is_backed_up_before_migration() {
        let dir = tempfile::tempdir().unwrap();
        {
            // Simula una base en versión 1 (sin la migración de semillas)
            let conn = open_rw(&dir.path().join(DB_FILE)).unwrap();
            conn.execute_batch("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT;").unwrap();
            conn.execute_batch(migrations::MIGRATIONS[0].2).unwrap();
            conn.execute("INSERT INTO schema_migrations VALUES (1,'init','x')", []).unwrap();
        }
        let db = Database::open(dir.path()).unwrap();
        let v = db.select("SELECT MAX(version) AS v FROM schema_migrations", &[]).unwrap();
        assert_eq!(v[0]["v"], json!(migrations::latest_version()));
        let backups: Vec<_> = fs::read_dir(dir.path().join("backups")).unwrap().collect();
        assert_eq!(backups.len(), 1);
    }
}
