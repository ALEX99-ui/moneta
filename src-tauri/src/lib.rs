//! MONETA — comandos de Tauri. Toda la información se guarda localmente; no hay red.

mod db;
mod migrations;

use db::{BackupInfo, Database, ExecResult, RestoreReport, Stmt, VerifyReport};
use serde::Serialize;
use serde_json::{Map, Value as Json};
use std::path::PathBuf;
use tauri::{Manager, State};

struct AppState {
    db: Option<Database>,
    init_error: Option<String>,
    data_dir: PathBuf,
}

impl AppState {
    fn db(&self) -> Result<&Database, String> {
        self.db.as_ref().ok_or_else(|| {
            self.init_error.clone().unwrap_or_else(|| "Base de datos no disponible".to_string())
        })
    }
}

#[derive(Serialize)]
struct AppStatus {
    ready: bool,
    error: Option<String>,
    version: String,
    data_dir: String,
    db_path: String,
    default_backup_dir: String,
    schema_version: i64,
    health: Vec<String>,
}

#[tauri::command]
fn app_status(state: State<AppState>) -> AppStatus {
    let (health, schema_version) = match state.db.as_ref() {
        Some(db) => {
            let v = db
                .select("SELECT COALESCE(MAX(version),0) AS v FROM schema_migrations", &[])
                .ok()
                .and_then(|r| r.first().and_then(|m| m["v"].as_i64()))
                .unwrap_or(0);
            (db.quick_check().unwrap_or_else(|e| vec![e]), v)
        }
        None => (vec![], 0),
    };
    AppStatus {
        ready: state.db.is_some(),
        error: state.init_error.clone(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        data_dir: state.data_dir.to_string_lossy().into_owned(),
        db_path: state.db.as_ref().map(|d| d.path.to_string_lossy().into_owned()).unwrap_or_default(),
        default_backup_dir: state.db.as_ref().map(|d| d.default_backup_dir().to_string_lossy().into_owned()).unwrap_or_default(),
        schema_version,
        health,
    }
}

#[tauri::command]
fn db_select(state: State<AppState>, sql: String, params: Vec<Json>) -> Result<Vec<Map<String, Json>>, String> {
    state.db()?.select(&sql, &params)
}

#[tauri::command]
fn db_execute(state: State<AppState>, sql: String, params: Vec<Json>) -> Result<ExecResult, String> {
    state.db()?.execute(&sql, &params)
}

#[tauri::command]
fn db_batch(state: State<AppState>, statements: Vec<Stmt>) -> Result<Vec<ExecResult>, String> {
    state.db()?.batch(&statements)
}

#[tauri::command]
fn backup_create(state: State<AppState>, dest: String) -> Result<BackupInfo, String> {
    state.db()?.backup_to(&PathBuf::from(dest))
}

#[tauri::command]
fn backup_verify(path: String) -> VerifyReport {
    db::verify_file(&PathBuf::from(path))
}

#[tauri::command]
fn backup_restore(state: State<AppState>, path: String) -> Result<RestoreReport, String> {
    state.db()?.restore_from(&PathBuf::from(path))
}

#[tauri::command]
fn backup_auto(state: State<AppState>, dir: Option<String>, keep: usize, interval_hours: u64) -> Result<Option<BackupInfo>, String> {
    let dir = dir.filter(|d| !d.trim().is_empty()).map(PathBuf::from);
    state.db()?.auto_backup(dir.as_deref(), keep, interval_hours)
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    write_atomic(&PathBuf::from(path), contents.as_bytes())
}

#[tauri::command]
fn write_binary_file(path: String, data: Vec<u8>) -> Result<(), String> {
    write_atomic(&PathBuf::from(path), &data)
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    let p = PathBuf::from(path);
    let meta = std::fs::metadata(&p).map_err(|e| format!("No se puede leer el archivo: {e}"))?;
    if meta.len() > 50 * 1024 * 1024 {
        return Err("El archivo supera los 50 MB".into());
    }
    let bytes = std::fs::read(&p).map_err(|e| format!("No se puede leer el archivo: {e}"))?;
    // Tolera BOM UTF-8 y, si no es UTF-8 válido, intenta interpretarlo como Latin-1.
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF][..]).unwrap_or(&bytes);
    Ok(match std::str::from_utf8(bytes) {
        Ok(s) => s.to_string(),
        Err(_) => bytes.iter().map(|&b| b as char).collect(),
    })
}

fn write_atomic(path: &PathBuf, data: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("moneta-tmp");
    std::fs::write(&tmp, data).map_err(|e| format!("No se pudo escribir el archivo: {e}"))?;
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("No se pudo guardar el archivo: {e}")
    })
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // %APPDATA%\com.moneta.personalfinance en Windows (nunca junto al ejecutable ni al código fuente).
            let data_dir = app.path().app_data_dir().expect("no se pudo resolver la carpeta de datos");
            let state = match Database::open(&data_dir) {
                Ok(db) => AppState { db: Some(db), init_error: None, data_dir },
                Err(e) => AppState { db: None, init_error: Some(e), data_dir },
            };
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_status,
            db_select,
            db_execute,
            db_batch,
            backup_create,
            backup_verify,
            backup_restore,
            backup_auto,
            write_text_file,
            write_binary_file,
            read_text_file,
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar MONETA");
}
