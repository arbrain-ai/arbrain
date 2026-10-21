//! Titlebar nativa que sigue el tema de la app (4 oct 2026, Daniel: «cuando cambio de claro a oscuro se queda
//! esa franja blanca, y al revés»). La web elige el tema; aquí se aplica a TODAS las ventanas, dos veces:
//! `set_theme` (NSApp.appearance) y la apariencia de cada NSWindow, que es lo que pinta su barra de título.
//! Va por un comando propio (permiso `allow-tema-nativo`) y no por `plugin:window|set_theme`: si el ACL del
//! plugin de ventana rechaza al origen remoto, aquella llamada fallaba en silencio y la barra se quedaba vieja.

use tauri::{AppHandle, Manager, Theme};

#[tauri::command]
pub fn tema_nativo(app: AppHandle, tema: String) -> Result<(), String> {
    let theme = match tema.as_str() {
        "dark" => Theme::Dark,
        "light" => Theme::Light,
        otro => return Err(format!("tema desconocido: {otro}")),
    };
    // Los comandos async corren fuera del hilo principal; AppKit exige hilo principal.
    let ventanas: Vec<_> = app.webview_windows().into_values().collect();
    app.run_on_main_thread(move || {
        for w in ventanas {
            let _ = w.set_theme(Some(theme));
            #[cfg(target_os = "macos")]
            mac::apariencia_ventana(&w, theme == Theme::Dark);
        }
    })
    .map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
mod mac {
    use objc2::msg_send;
    use objc2::runtime::{AnyClass, AnyObject};
    use objc2::ffi::nil;
    use std::ffi::CStr;

    pub fn apariencia_ventana(w: &tauri::WebviewWindow, oscuro: bool) {
        let Ok(ptr) = w.ns_window() else { return };
        if ptr.is_null() { return; }
        unsafe {
            let ventana = &*(ptr as *const AnyObject);
            let Some(clase) = AnyClass::get(CStr::from_bytes_with_nul(b"NSAppearance\0").unwrap()) else { return };
            let nombre = if oscuro { "NSAppearanceNameDarkAqua" } else { "NSAppearanceNameAqua" };
            let ns_nombre = nsstring(nombre);
            let apariencia: *mut AnyObject = msg_send![clase, appearanceNamed: ns_nombre];
            let _: () = msg_send![ventana, setAppearance: apariencia];
            // La barra de título se repinta sola al cambiar la apariencia, pero a veces espera al siguiente
            // evento de la ventana (se veía «un paso atrás»): se fuerza ya.
            let vista: *mut AnyObject = msg_send![ventana, contentView];
            if vista != nil as *mut AnyObject {
                let marco: *mut AnyObject = msg_send![vista, superview];
                if marco != nil as *mut AnyObject {
                    let _: () = msg_send![marco, setNeedsDisplay: true];
                    let _: () = msg_send![marco, displayIfNeeded];
                }
            }
            let _: () = msg_send![ventana, invalidateShadow];
        }
    }

    unsafe fn nsstring(s: &str) -> *mut AnyObject {
        let clase = AnyClass::get(CStr::from_bytes_with_nul(b"NSString\0").unwrap()).unwrap();
        let c = std::ffi::CString::new(s).unwrap();
        msg_send![clase, stringWithUTF8String: c.as_ptr()]
    }
}
