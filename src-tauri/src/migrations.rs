//! Migraciones versionadas. Los archivos SQL viven en `db/migrations` (compartidos con las pruebas TypeScript).
//! Cada migración se aplica dentro de una transacción junto con su registro en `schema_migrations`.

use rusqlite::Connection;

pub const MIGRATIONS: &[(i64, &str, &str)] = &[
    (1, "init", include_str!("../../db/migrations/0001_init.sql")),
    (2, "seed_defaults", include_str!("../../db/migrations/0002_seed_defaults.sql")),
];

pub fn latest_version() -> i64 {
    MIGRATIONS.last().map(|m| m.0).unwrap_or(0)
}

pub fn current_version(conn: &Connection) -> rusqlite::Result<i64> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL
        ) STRICT;",
    )?;
    conn.query_row("SELECT COALESCE(MAX(version), 0) FROM schema_migrations", [], |r| r.get(0))
}

/// Cantidad de migraciones pendientes para esta conexión.
pub fn pending_count(conn: &Connection) -> rusqlite::Result<usize> {
    let cur = current_version(conn)?;
    Ok(MIGRATIONS.iter().filter(|m| m.0 > cur).count())
}

pub fn migrate(conn: &Connection) -> Result<(), String> {
    let cur = current_version(conn).map_err(|e| e.to_string())?;
    if cur > latest_version() {
        return Err(format!(
            "La base de datos tiene la versión {cur}, más nueva que esta aplicación ({}). Actualiza MONETA.",
            latest_version()
        ));
    }
    for (version, name, sql) in MIGRATIONS.iter().filter(|m| m.0 > cur) {
        let script = format!(
            "BEGIN IMMEDIATE;\n{sql}\nINSERT INTO schema_migrations (version, name, applied_at) VALUES ({version}, '{name}', strftime('%Y-%m-%dT%H:%M:%fZ','now'));\nCOMMIT;"
        );
        if let Err(e) = conn.execute_batch(&script) {
            let _ = conn.execute_batch("ROLLBACK;");
            return Err(format!("Falló la migración {version} ({name}): {e}"));
        }
    }
    Ok(())
}
