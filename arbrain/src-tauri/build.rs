//! Edición de la app, fijada al compilar (la lee `desktop_env::EDICION_CLIENTE`).
//!
//! - `ARBRAIN_EDICION` explícita manda (`cliente` o cualquier otro valor = instalación original).
//! - Sin ella, el marcador del repo `../EDICION` (`arbrain/EDICION`, lo escribe el generador en la copia del alumno;
//!   el repo original no lo tiene) con `cliente` fija la edición cliente (carril O, red team A3).
//! - Sin ella, decide el identificador: el de `tauri.original.conf.json` (la app original, que solo existe en su
//!   repo) es la instalación original; cualquier otro (el `tauri.conf.json` que viaja, `ai.arbrain.app`) es la
//!   edición cliente. Así la copia del alumno compila su edición sin depender de una variable.
//! - Edición cliente con el identificador de la app original detiene el build: compartiría su carpeta de datos,
//!   su llavero y su ventana.

use std::path::Path;

fn identificador(valor: &serde_json::Value) -> Option<String> {
    valor.get("identifier").and_then(|v| v.as_str()).map(str::to_string)
}

fn leer(ruta: &Path) -> Option<serde_json::Value> {
    serde_json::from_str(&std::fs::read_to_string(ruta).ok()?).ok()
}

/// Valor del marcador: la primera línea que no es comentario (`#`) ni vacía, en minúsculas.
fn marcador(ruta: &Path) -> Option<String> {
    let texto = std::fs::read_to_string(ruta).ok()?;
    texto.lines().map(str::trim).find(|l| !l.is_empty() && !l.starts_with('#')).map(str::to_lowercase)
}

fn main() {
    println!("cargo:rerun-if-env-changed=ARBRAIN_EDICION");
    let ruta_marcador = Path::new("../EDICION");
    // Solo si existe: un rerun-if-changed sobre un archivo ausente haría correr este script en cada build del original.
    if ruta_marcador.exists() {
        println!("cargo:rerun-if-changed=../EDICION");
    }
    let marcador_cliente = marcador(ruta_marcador).as_deref() == Some("cliente");
    println!("cargo:rerun-if-env-changed=TAURI_CONFIG");
    println!("cargo:rerun-if-changed=tauri.conf.json");
    println!("cargo:rerun-if-changed=tauri.original.conf.json");

    let base = leer(Path::new("tauri.conf.json")).and_then(|c| identificador(&c));
    // La CLI de Tauri pasa los --config fusionados en TAURI_CONFIG.
    let parche = std::env::var("TAURI_CONFIG").ok().and_then(|t| serde_json::from_str(&t).ok()).and_then(|c| identificador(&c));
    let efectivo = parche.or(base).unwrap_or_default();
    let original = leer(Path::new("tauri.original.conf.json")).and_then(|c| identificador(&c));

    let explicita = std::env::var("ARBRAIN_EDICION").ok().map(|v| v.trim().to_lowercase()).filter(|v| !v.is_empty());
    let cliente = match explicita.as_deref() {
        Some(v) => v == "cliente",
        None => marcador_cliente || original.as_deref() != Some(efectivo.as_str()),
    };
    if cliente && original.as_deref() == Some(efectivo.as_str()) {
        panic!("Edición cliente con el identificador de la app original ({efectivo}). Compila sin tauri.original.conf.json.");
    }
    println!("cargo:rustc-env=ARBRAIN_EDICION_EFECTIVA={}", if cliente { "cliente" } else { "original" });
    if cliente {
        marcadores_para_compilar();
    }
    tauri_build::build()
}

/// `tauri_build` exige que existan los recursos y el sidecar declarados en la config. Para que `cargo check` y
/// `cargo test` funcionen en un clon limpio (sin haber corrido `desktop:app:cliente`), se crean carpetas vacías y un
/// sidecar vacío SOLO si faltan. Un build real los reemplaza antes de compilar (beforeBuildCommand:
/// fetch-node.mjs verifica el hash y reescribe el sidecar; empaquetar-daemon.mjs llena resources/daemon;
/// empaquetar-manos-mac.mjs, resources/manos).
fn marcadores_para_compilar() {
    for dir in ["resources/next", "resources/daemon", "resources/plantilla-cerebro", "resources/manos"] {
        let _ = std::fs::create_dir_all(dir);
    }
    let triple = std::env::var("TARGET").unwrap_or_default();
    let ext = if triple.contains("windows") { ".exe" } else { "" };
    let sidecar = format!("binaries/arbrain-node-{triple}{ext}");
    if !Path::new(&sidecar).exists() {
        let _ = std::fs::create_dir_all("binaries");
        let _ = std::fs::write(&sidecar, b"");
    }
}
