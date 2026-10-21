//! Modo de evidencia del empaquetado (11 oct 2026). SOLO existe con `cargo build --features evidencia`; el build que se
//! reparte (`npm run desktop:app:cliente` sin ese feature) no compila este archivo.
//!
//! Para qué: recorrer el primer arranque y el chat de la VENTANA REAL de la app del alumno sin tocar el ratón ni el
//! teclado de nadie. Los secretos de la app viven solo en memoria (CONTRATO-DAEMON v2) y las llaves solo existen por el
//! puente de Tauri, así que un navegador aparte no puede reproducir estas pantallas.
//!
//! Cómo: cada 250 ms mira `<app_data_dir>/evidencia/pedido.js` (carpeta 0700). Si existe, lo borra, lo evalúa en la
//! ventana `main` y escribe el resultado (JSON) en `respuesta.json`. Quien escribe ese archivo ya puede escribir en la
//! carpeta de datos de la app: este modo no existe en el build del alumno por eso mismo.

use std::fs;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Manager};

/// Marca que el escaneo del binario repartido busca para probar que este modo no viaja.
pub const MARCA: &str = "ARBRAIN_MODO_EVIDENCIA_ACTIVO";

pub fn iniciar(app: &AppHandle) {
    let Ok(base) = app.path().app_data_dir() else { return };
    let dir = base.join("evidencia");
    if fs::create_dir_all(&dir).is_err() {
        return;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&dir, fs::Permissions::from_mode(0o700));
    }
    eprintln!("[arbrain] {MARCA}: {}", dir.display());
    let app = app.clone();
    let mut a_la_vista = false;
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(250));
        // La ventana sin foco puede nacer en otro escritorio (Space) y `screencapture -l` no la alcanza: se deja visible
        // en todos, sin activarla ni moverle el foco a nadie.
        if !a_la_vista {
            if let Some(ventana) = app.get_webview_window("main") {
                a_la_vista = ventana.set_visible_on_all_workspaces(true).is_ok();
            }
        }
        // `foto` = nombre de archivo: instantánea del WKWebView (sirve aunque la ventana no esté en pantalla, p. ej. con
        // la sesión bloqueada, donde `screencapture -l` no alcanza ventanas nuevas).
        if let Ok(nombre) = fs::read_to_string(dir.join("foto")) {
            let _ = fs::remove_file(dir.join("foto"));
            let nombre = nombre.trim().replace(['/', '\\'], "_");
            if let (Some(ventana), false) = (app.get_webview_window("main"), nombre.is_empty()) {
                foto(&ventana, dir.join(nombre));
            }
        }
        let pedido = dir.join("pedido.js");
        let Ok(js) = fs::read_to_string(&pedido) else { continue };
        let _ = fs::remove_file(&pedido);
        let respuesta = dir.join("respuesta.json");
        let _ = fs::remove_file(&respuesta);
        let escribir = move |texto: String| {
            let tmp = respuesta.with_extension("tmp");
            if fs::write(&tmp, texto).is_ok() {
                let _ = fs::rename(&tmp, &respuesta);
            }
        };
        match app.get_webview_window("main") {
            Some(ventana) => {
                if let Err(error) = ventana.eval_with_callback(js, escribir) {
                    eprintln!("[arbrain] evidencia: {error}");
                }
            }
            None => escribir("\"__sin_ventana__\"".to_string()),
        }
    });
}

#[cfg(target_os = "macos")]
fn foto(ventana: &tauri::WebviewWindow, destino: std::path::PathBuf) {
    let _ = ventana.with_webview(move |vista| {
        use block2::RcBlock;
        use objc2::msg_send;
        use objc2::runtime::{AnyClass, AnyObject};
        let wk = vista.inner() as *mut AnyObject;
        let destino = destino.clone();
        let bloque = RcBlock::new(move |imagen: *mut AnyObject, _error: *mut AnyObject| {
            let escrito = (|| unsafe {
                if imagen.is_null() {
                    return None;
                }
                let tiff: *mut AnyObject = msg_send![imagen, TIFFRepresentation];
                let rep_cls = AnyClass::get(c"NSBitmapImageRep")?;
                let rep: *mut AnyObject = msg_send![rep_cls, imageRepWithData: tiff];
                if rep.is_null() {
                    return None;
                }
                let dic_cls = AnyClass::get(c"NSDictionary")?;
                let props: *mut AnyObject = msg_send![dic_cls, dictionary];
                // NSBitmapImageFileTypePNG = 4
                let png: *mut AnyObject = msg_send![rep, representationUsingType: 4usize, properties: props];
                if png.is_null() {
                    return None;
                }
                let largo: usize = msg_send![png, length];
                let bytes: *const u8 = msg_send![png, bytes];
                fs::write(&destino, std::slice::from_raw_parts(bytes, largo)).ok()
            })();
            if escrito.is_none() {
                let _ = fs::write(destino.with_extension("error"), "sin imagen");
            }
        });
        unsafe {
            let _: () = msg_send![wk, takeSnapshotWithConfiguration: std::ptr::null_mut::<AnyObject>(), completionHandler: &*bloque];
        }
    });
}

#[cfg(not(target_os = "macos"))]
fn foto(_ventana: &tauri::WebviewWindow, destino: std::path::PathBuf) {
    let _ = fs::write(destino.with_extension("error"), "solo macOS");
}
