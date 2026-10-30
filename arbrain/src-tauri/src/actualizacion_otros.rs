//! Actualizar sin cortar: en Windows y Linux no aplica (el relevo de `actualizacion.rs` es de macOS: `.app`,
//! `codesign`, `lsappinfo`). Mismos comandos para que la web no distinga; siempre «nada pendiente, no aplicable».

use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EstadoActualizacion {
    pub pendiente: bool,
    pub cambia_binario: bool,
    pub aplicable: bool,
    pub stamp: Option<String>,
}

pub fn estado() -> EstadoActualizacion {
    EstadoActualizacion { pendiente: false, cambia_binario: false, aplicable: false, stamp: None }
}

pub fn al_salir(_app: &tauri::AppHandle) {}

#[tauri::command]
pub fn actualizacion_estado() -> EstadoActualizacion {
    estado()
}

#[tauri::command]
pub fn actualizacion_aplicar(_app: tauri::AppHandle) -> Result<(), String> {
    Err("Actualizar desde la app no está disponible en este sistema.".into())
}
