//! Actualizar sin cortar (4 oct 2026, pedido de Daniel: «quítame a mí del medio»).
//!
//! `npm run desktop:install` ya no mata la app: deja la versión nueva firmada al lado
//! (`~/Applications/.Arbrain-pendiente.app` + `.Arbrain-pendiente.json`). La web (pastilla
//! «Versión nueva lista · Reiniciar») pregunta aquí si hay una, y la aplica sola en un momento
//! seguro (sin turno en curso y sin que Daniel toque nada) o cuando él pulsa. También se aplica
//! en silencio al cerrar la app.
//!
//! Aplicar = un ayudante `bash` SEPARADO (su propio grupo de procesos) espera a que esta app
//! termine, verifica la firma, cambia el paquete (el viejo queda en `.arbrain-backups`, nunca se
//! borra) y reabre. Si algo falla, el viejo se queda o vuelve. El motor (PTYs) es otro proceso y
//! no se toca. Cargar la web del Studio no depende de esto: un deploy web solo recarga el webview.
//!
//! Solo macOS (`.app`, `codesign`, `lsappinfo`). En Windows y Linux se compila `actualizacion_otros.rs`, que dice
//! «no aplicable»; su actualización será `tauri-plugin-updater` con llave propia.

use serde::{Deserialize, Serialize};
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};

static RELEVO_LANZADO: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Marca {
    stamp: String,
    #[serde(default = "verdadero")]
    cambia_binario: bool,
}
fn verdadero() -> bool { true }

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EstadoActualizacion {
    /// Hay una versión nueva firmada esperando.
    pub pendiente: bool,
    /// El ejecutable cambió: hace falta relanzar la app. Si no, solo se instala al cerrar.
    pub cambia_binario: bool,
    /// Esta app puede aplicarla (corre desde un .app instalado).
    pub aplicable: bool,
    pub stamp: Option<String>,
}

/// `…/Arbrain.app` de la app en ejecución, o None en desarrollo (binario suelto).
fn paquete_actual() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    exe.ancestors().find(|p| p.extension().is_some_and(|e| e == "app")).map(Path::to_path_buf)
}

fn rutas(paquete: &Path) -> Option<(PathBuf, PathBuf, PathBuf)> {
    let dir = paquete.parent()?;
    Some((dir.join(".Arbrain-pendiente.app"), dir.join(".Arbrain-pendiente.json"), dir.join(".arbrain-backups")))
}

fn leer_marca(marca: &Path) -> Option<Marca> {
    serde_json::from_slice(&std::fs::read(marca).ok()?).ok()
}

pub fn estado() -> EstadoActualizacion {
    let vacio = EstadoActualizacion { pendiente: false, cambia_binario: false, aplicable: false, stamp: None };
    // Edición cliente: este relevo verifica la firma sin revisar QUIÉN firmó (AUDITORIA I11) y busca la versión
    // nueva junto al paquete. Hasta tener firma con Developer ID y updater firmado, el alumno no se actualiza así.
    if crate::desktop_env::EDICION_CLIENTE { return vacio; }
    let Some(paquete) = paquete_actual() else { return vacio };
    let Some((pendiente, marca, _)) = rutas(&paquete) else { return vacio };
    match leer_marca(&marca) {
        Some(m) if pendiente.join("Contents/MacOS").is_dir() =>
            EstadoActualizacion { pendiente: true, cambia_binario: m.cambia_binario, aplicable: true, stamp: Some(m.stamp) },
        _ => EstadoActualizacion { aplicable: true, ..vacio },
    }
}

const AYUDANTE: &str = r#"
PID="$1"; DEST="$2"; STAGE="$3"; MARCA="$4"; RESPALDOS="$5"; REABRIR="$6"; STAMP="$7"; MI_ID="$8"
frente() { /usr/bin/lsappinfo info -only bundleid "$(/usr/bin/lsappinfo front)" 2>/dev/null | sed -n 's/.*bundleID="\([^"]*\)".*/\1/p'; }
# Quién tenía el frente ANTES de cerrar: si no era Arbrain, la app vuelve sin activarse ni tomar el teclado.
FRENTE="$(frente)"
for _ in $(seq 1 150); do kill -0 "$PID" 2>/dev/null || break; sleep 0.2; done
kill -0 "$PID" 2>/dev/null && exit 1
abrir() {
  if [ -n "$FRENTE" ] && [ "$FRENTE" != "$MI_ID" ]; then
    mkdir -p "$HOME/.config/arbrain" && date +%s > "$HOME/.config/arbrain/relevo-silencioso"
    /usr/bin/open -g "$1"
    # Sin «red de seguridad» que pelee el frente (8 oct, Daniel: «un agente peleando conmigo con la
    # pantalla»): el bucle de 30 s devolvía el frente con `open -b` cada vez que Arbrain quedaba
    # adelante, incluso cuando Daniel mismo le daba clic, y con Finder al frente cada `open -b
    # com.apple.finder` abría otra ventana «Recientes». `open -g` + la marca relevo-silencioso (el
    # arranque no llama set_focus) bastan. Nunca se vuelve a mover el frente desde aquí.
  else
    /usr/bin/open "$1"
  fi
}
reabrir_viejo() { [ "$REABRIR" = 1 ] && [ -d "$DEST" ] && abrir "$DEST"; }
[ -d "$STAGE" ] || exit 0
if ! /usr/bin/codesign --verify --deep --strict "$STAGE" 2>/dev/null; then
  mv "$STAGE" "$(dirname "$STAGE")/.Arbrain-fallida-$STAMP.app"; rm -f "$MARCA"; reabrir_viejo; exit 1
fi
mkdir -p "$RESPALDOS"
if [ -d "$DEST" ]; then mv "$DEST" "$RESPALDOS/Arbrain-$STAMP.app" || { reabrir_viejo; exit 1; }; fi
if ! mv "$STAGE" "$DEST"; then mv "$RESPALDOS/Arbrain-$STAMP.app" "$DEST"; reabrir_viejo; exit 1; fi
rm -f "$MARCA"
[ "$REABRIR" = 1 ] && abrir "$DEST"
exit 0
"#;

fn lanzar_relevo(app_id: String, reabrir: bool) -> Result<(), String> {
    let paquete = paquete_actual().ok_or("la app no corre desde un .app instalado")?;
    let (pendiente, marca, respaldos) = rutas(&paquete).ok_or("sin carpeta de instalación")?;
    let m = leer_marca(&marca).ok_or("no hay versión pendiente")?;
    if !pendiente.join("Contents/MacOS").is_dir() { return Err("la versión pendiente no está en disco".into()); }
    if RELEVO_LANZADO.swap(true, Ordering::SeqCst) { return Ok(()); }
    let lanzado = Command::new("/bin/bash")
        .args(["-c", AYUDANTE, "relevo"])
        .arg(std::process::id().to_string())
        .arg(&paquete).arg(&pendiente).arg(&marca).arg(&respaldos)
        .arg(if reabrir { "1" } else { "0" })
        .arg(&m.stamp)
        .arg(&app_id)
        .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
        .process_group(0)
        .spawn();
    match lanzado {
        Ok(_) => Ok(()),
        Err(e) => { RELEVO_LANZADO.store(false, Ordering::SeqCst); Err(e.to_string()) }
    }
}

/// Al cerrar la app: si quedó una versión esperando, se instala en silencio (sin reabrir).
pub fn al_salir(app: &tauri::AppHandle) {
    if estado().pendiente { let _ = lanzar_relevo(app.config().identifier.clone(), false); }
}

#[tauri::command]
pub fn actualizacion_estado() -> EstadoActualizacion {
    estado()
}

/// Relanza la app con la versión pendiente. La web decide CUÁNDO; aquí solo se ejecuta.
#[tauri::command]
pub fn actualizacion_aplicar(app: tauri::AppHandle) -> Result<(), String> {
    if !estado().pendiente { return Err("no hay versión pendiente".into()); }
    // Antes de relanzar: monitor, posición, tamaño y estado de la ventana, para que vuelva donde estaba.
    crate::guardar_estado_ventana(&app);
    lanzar_relevo(app.config().identifier.clone(), true)?;
    app.exit(0);
    Ok(())
}
