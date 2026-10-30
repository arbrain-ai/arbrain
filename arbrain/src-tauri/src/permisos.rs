//! Centro de permisos de macOS (Ajustes → Permisos).
//!
//! Tres reglas, las mismas de Claude y ChatGPT de escritorio:
//! 1. Consultar NUNCA pregunta: cada estado sale de una API de solo lectura
//!    (preflight); ningún diálogo aparece por abrir Ajustes ni la app.
//! 2. Pedir solo cuando Daniel pulsa «Permitir» o una función lo necesita, y solo
//!    si macOS aún no decidió. Si ya lo negó, el único camino es el panel exacto
//!    de Ajustes del Sistema, que `permisos_abrir` abre directo.
//! 3. La identidad de firma se muestra: TCC guarda cada permiso contra el requisito
//!    designado del binario. Si ese requisito es un cdhash (firma ad hoc), cada
//!    compilación es «otra app» para macOS y vuelve a preguntar todo.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Permiso {
    pub id: &'static str,
    /// concedido · denegado · pendiente · restringido · sin_dato
    pub estado: &'static str,
    pub detalle: Option<String>,
    /// macOS permite mostrar su diálogo desde la app (solo cuando `estado` es pendiente).
    pub se_puede_pedir: bool,
}

#[derive(Debug, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Identidad {
    pub ruta: Option<String>,
    pub identificador: Option<String>,
    pub autoridad: Option<String>,
    /// estable (certificado + identificador) · cambia (ad hoc, cdhash) · desconocida
    pub firma: &'static str,
    pub requisito: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EstadoPermisos {
    pub soportado: bool,
    pub bundle_id: Option<String>,
    pub permisos: Vec<Permiso>,
    pub app: Identidad,
    pub motor: Option<Identidad>,
}

/// Lee la firma de un binario o bundle con `codesign` (solo lectura).
pub fn identidad_de(ruta: &Path) -> Identidad {
    let mut id = Identidad { ruta: Some(ruta.to_string_lossy().to_string()), firma: "desconocida", ..Default::default() };
    if let Ok(out) = Command::new("/usr/bin/codesign").args(["-d", "-r-", "-vv"]).arg(ruta).output() {
        let texto = format!("{}{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr));
        for linea in texto.lines() {
            if let Some(v) = linea.strip_prefix("Identifier=") { id.identificador = Some(v.trim().to_string()); }
            if id.autoridad.is_none() { if let Some(v) = linea.strip_prefix("Authority=") { id.autoridad = Some(v.trim().to_string()); } }
            if let Some(pos) = linea.find("designated => ") {
                let req = linea[pos + "designated => ".len()..].trim().to_string();
                id.firma = if req.starts_with("cdhash") { "cambia" } else if req.contains("certificate") || req.contains("anchor") { "estable" } else { "desconocida" };
                id.requisito = Some(req);
            }
        }
        if texto.contains("Signature=adhoc") { id.firma = "cambia"; }
    }
    id
}

/// El bundle `.app` que contiene al ejecutable actual (o el ejecutable suelto en desarrollo).
fn ruta_app() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let bundle = exe.ancestors().find(|p| p.extension().is_some_and(|e| e == "app")).map(Path::to_path_buf);
    Some(bundle.unwrap_or(exe))
}

/// Ruta del ejecutable del motor vivo (dueño de las terminales). Solo sondea: nunca lo levanta.
#[cfg(unix)]
fn ruta_motor() -> Option<PathBuf> {
    let sock = arbrain_motor::default_sock();
    let pid = arbrain_motor::client::Conn::open(&sock, "arbrain-permisos").ok()?.hello.0;
    ruta_de_pid(pid as i32)
}

/// Windows no tiene motor (ver motor.rs).
#[cfg(not(unix))]
fn ruta_motor() -> Option<PathBuf> {
    None
}

#[cfg(target_os = "macos")]
fn ruta_de_pid(pid: i32) -> Option<PathBuf> {
    extern "C" { fn proc_pidpath(pid: i32, buffer: *mut u8, size: u32) -> i32; }
    let mut buf = vec![0u8; 4096];
    let n = unsafe { proc_pidpath(pid, buf.as_mut_ptr(), buf.len() as u32) };
    (n > 0).then(|| PathBuf::from(String::from_utf8_lossy(&buf[..n as usize]).to_string()))
}

#[cfg(all(unix, not(target_os = "macos")))]
fn ruta_de_pid(_pid: i32) -> Option<PathBuf> { None }

/// Panel exacto de Ajustes del Sistema para cada permiso (lista cerrada: nada de URLs libres).
fn url_panel(id: &str, bundle_id: Option<&str>) -> Option<String> {
    let privacidad = |ancla: &str| format!("x-apple.systempreferences:com.apple.preference.security?{ancla}");
    Some(match id {
        "accesibilidad" => privacidad("Privacy_Accessibility"),
        "pantalla" => privacidad("Privacy_ScreenCapture"),
        "microfono" => privacidad("Privacy_Microphone"),
        "voz" => privacidad("Privacy_SpeechRecognition"),
        "camara" => privacidad("Privacy_Camera"),
        "automatizacion" => privacidad("Privacy_Automation"),
        "entrada" => privacidad("Privacy_ListenEvent"),
        "disco" => privacidad("Privacy_AllFiles"),
        "gestion_apps" => privacidad("Privacy_AppBundles"),
        "notificaciones" => match bundle_id {
            Some(b) => format!("x-apple.systempreferences:com.apple.Notifications-Settings.extension?id={b}"),
            None => "x-apple.systempreferences:com.apple.Notifications-Settings.extension".to_string(),
        },
        _ => return None,
    })
}

#[tauri::command]
pub async fn permisos_estado() -> EstadoPermisos {
    let app = ruta_app().map(|p| identidad_de(&p)).unwrap_or_default();
    let motor = ruta_motor().map(|p| identidad_de(&p));
    EstadoPermisos { soportado: cfg!(target_os = "macos"), bundle_id: mac::bundle_id(), permisos: mac::estados(), app, motor }
}

#[tauri::command]
pub async fn permisos_abrir(id: String) -> Result<(), String> {
    let url = url_panel(&id, mac::bundle_id().as_deref()).ok_or("Permiso desconocido")?;
    Command::new("/usr/bin/open").arg(url).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

/// Muestra el diálogo de macOS para UN permiso. Solo se llama desde un clic o desde la
/// función que lo necesita en ese momento; si macOS ya decidió, devuelve el estado sin preguntar.
#[tauri::command]
pub async fn permisos_pedir(id: String) -> Result<Permiso, String> {
    mac::pedir(&id)
}

#[cfg(not(target_os = "macos"))]
mod mac {
    use super::Permiso;
    pub fn bundle_id() -> Option<String> { None }
    pub fn estados() -> Vec<Permiso> { Vec::new() }
    pub fn pedir(_id: &str) -> Result<Permiso, String> { Err("Solo en macOS".into()) }
}

#[cfg(target_os = "macos")]
mod mac {
    use super::Permiso;
    use block2::RcBlock;
    use objc2::msg_send;
    use objc2::runtime::{AnyClass, AnyObject, Bool};
    use std::ffi::{c_void, CStr};
    use std::sync::mpsc;
    use std::time::Duration;

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrusted() -> bool;
        fn AXIsProcessTrustedWithOptions(options: *const c_void) -> bool;
        static kAXTrustedCheckOptionPrompt: *const c_void;
    }
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGPreflightScreenCaptureAccess() -> bool;
        fn CGRequestScreenCaptureAccess() -> bool;
    }
    #[link(name = "IOKit", kind = "framework")]
    extern "C" {
        fn IOHIDCheckAccess(request_type: u32) -> u32;
        fn IOHIDRequestAccess(request_type: u32) -> bool;
    }
    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        static kCFBooleanTrue: *const c_void;
        static kCFTypeDictionaryKeyCallBacks: u8;
        static kCFTypeDictionaryValueCallBacks: u8;
        fn CFDictionaryCreate(a: *const c_void, k: *const *const c_void, v: *const *const c_void, n: isize, kc: *const c_void, vc: *const c_void) -> *const c_void;
        fn CFRelease(cf: *const c_void);
    }
    #[repr(C)]
    struct AEDesc { descriptor_type: u32, data_handle: *mut c_void }
    #[link(name = "CoreServices", kind = "framework")]
    extern "C" {
        fn AECreateDesc(type_code: u32, data: *const c_void, size: isize, result: *mut AEDesc) -> i16;
        fn AEDisposeDesc(desc: *mut AEDesc) -> i16;
        fn AEDeterminePermissionToAutomateTarget(target: *const AEDesc, class: u32, id: u32, ask: bool) -> i32;
    }
    #[link(name = "AVFoundation", kind = "framework")]
    extern "C" {
        static AVMediaTypeAudio: *const AnyObject;
        static AVMediaTypeVideo: *const AnyObject;
    }
    #[link(name = "Speech", kind = "framework")]
    extern "C" {}
    #[link(name = "UserNotifications", kind = "framework")]
    extern "C" {}

    const LISTEN_EVENT: u32 = 1; // kIOHIDRequestTypeListenEvent
    const TYPE_BUNDLE_ID: u32 = u32::from_be_bytes(*b"bund");
    const WILDCARD: u32 = u32::from_be_bytes(*b"****");
    /// Destinos de Apple Events que tocan los agentes. La app no envía Apple Events: se consulta
    /// sin preguntar (`ask = false`) y nunca se pide desde aquí.
    const DESTINOS: [(&str, &str); 2] = [("com.apple.systemevents", "System Events"), ("com.google.Chrome", "Google Chrome")];

    fn clase(nombre: &CStr) -> Option<&'static AnyClass> { AnyClass::get(nombre) }

    fn ns_string(s: &str) -> *mut AnyObject {
        let Some(cls) = clase(c"NSString") else { return std::ptr::null_mut() };
        let c = std::ffi::CString::new(s).unwrap_or_default();
        unsafe { msg_send![cls, stringWithUTF8String: c.as_ptr()] }
    }

    fn texto(obj: *mut AnyObject) -> Option<String> {
        if obj.is_null() { return None; }
        let p: *const std::ffi::c_char = unsafe { msg_send![obj, UTF8String] };
        (!p.is_null()).then(|| unsafe { CStr::from_ptr(p) }.to_string_lossy().to_string())
    }

    fn main_bundle() -> *mut AnyObject {
        let Some(cls) = clase(c"NSBundle") else { return std::ptr::null_mut() };
        unsafe { msg_send![cls, mainBundle] }
    }

    pub fn bundle_id() -> Option<String> {
        let b = main_bundle();
        if b.is_null() { return None; }
        texto(unsafe { msg_send![b, bundleIdentifier] })
    }

    /// Corre como `.app` de verdad: sin bundle, UNUserNotificationCenter lanza excepción
    /// y TCC mata al proceso que pide micrófono o voz sin su texto de uso.
    fn es_bundle() -> bool {
        let b = main_bundle();
        if b.is_null() || bundle_id().is_none() { return false; }
        texto(unsafe { msg_send![b, bundlePath] }).is_some_and(|p| p.ends_with(".app"))
    }

    fn tiene_clave(clave: &str) -> bool {
        let b = main_bundle();
        if b.is_null() { return false; }
        let v: *mut AnyObject = unsafe { msg_send![b, objectForInfoDictionaryKey: ns_string(clave)] };
        !v.is_null()
    }

    fn p(id: &'static str, estado: &'static str, detalle: Option<String>) -> Permiso {
        Permiso { id, estado, detalle, se_puede_pedir: false }
    }

    fn pedible(mut permiso: Permiso, puede: bool) -> Permiso {
        permiso.se_puede_pedir = puede && permiso.estado == "pendiente";
        permiso
    }

    // AVAuthorizationStatus: 0 sin decidir · 1 restringido · 2 denegado · 3 concedido
    fn av(media: *const AnyObject) -> &'static str {
        let Some(cls) = clase(c"AVCaptureDevice") else { return "sin_dato" };
        let s: isize = unsafe { msg_send![cls, authorizationStatusForMediaType: media] };
        match s { 0 => "pendiente", 1 => "restringido", 2 => "denegado", 3 => "concedido", _ => "sin_dato" }
    }

    // SFSpeechRecognizerAuthorizationStatus: 0 sin decidir · 1 denegado · 2 restringido · 3 concedido
    fn voz() -> &'static str {
        let Some(cls) = clase(c"SFSpeechRecognizer") else { return "sin_dato" };
        let s: isize = unsafe { msg_send![cls, authorizationStatus] };
        match s { 0 => "pendiente", 1 => "denegado", 2 => "restringido", 3 => "concedido", _ => "sin_dato" }
    }

    fn entrada() -> &'static str {
        match unsafe { IOHIDCheckAccess(LISTEN_EVENT) } { 0 => "concedido", 1 => "denegado", _ => "pendiente" }
    }

    fn centro_notificaciones() -> Option<*mut AnyObject> {
        if !es_bundle() { return None; }
        let cls = clase(c"UNUserNotificationCenter")?;
        let c: *mut AnyObject = unsafe { msg_send![cls, currentNotificationCenter] };
        (!c.is_null()).then_some(c)
    }

    // UNAuthorizationStatus: 0 sin decidir · 1 denegado · 2 concedido · 3 provisional · 4 efímero
    fn notificaciones() -> &'static str {
        let Some(centro) = centro_notificaciones() else { return "sin_dato" };
        let (tx, rx) = mpsc::channel::<isize>();
        let bloque = RcBlock::new(move |ajustes: *mut AnyObject| {
            let s: isize = if ajustes.is_null() { -1 } else { unsafe { msg_send![ajustes, authorizationStatus] } };
            let _ = tx.send(s);
        });
        unsafe { let _: () = msg_send![centro, getNotificationSettingsWithCompletionHandler: &*bloque]; }
        match rx.recv_timeout(Duration::from_secs(2)) {
            Ok(0) => "pendiente",
            Ok(1) => "denegado",
            Ok(2..=4) => "concedido",
            _ => "sin_dato",
        }
    }

    /// Con Acceso total al disco el proceso puede abrir la base de TCC del usuario; sin él, no.
    /// Abrirla no muestra diálogo: es la prueba estándar de las apps de escritorio.
    fn disco() -> &'static str {
        let Ok(home) = std::env::var("HOME") else { return "sin_dato" };
        let ruta = format!("{home}/Library/Application Support/com.apple.TCC/TCC.db");
        match std::fs::File::open(ruta) {
            Ok(_) => "concedido",
            // Sin el permiso, macOS no solo niega la base: oculta su carpeta (NotFound).
            Err(e) if matches!(e.kind(), std::io::ErrorKind::PermissionDenied | std::io::ErrorKind::NotFound) => "pendiente",
            Err(_) => "sin_dato",
        }
    }

    // OSStatus: 0 concedido · -1743 denegado · -1744 pediría permiso · -600 destino cerrado
    fn automatizar(bundle: &str) -> i32 {
        let mut desc = AEDesc { descriptor_type: 0, data_handle: std::ptr::null_mut() };
        let creado = unsafe { AECreateDesc(TYPE_BUNDLE_ID, bundle.as_ptr() as *const c_void, bundle.len() as isize, &mut desc) };
        if creado != 0 { return -1; }
        let r = unsafe { AEDeterminePermissionToAutomateTarget(&desc, WILDCARD, WILDCARD, false) };
        unsafe { AEDisposeDesc(&mut desc); }
        r
    }

    fn automatizacion() -> Permiso {
        let mut partes = Vec::new();
        let (mut concedidos, mut negados, mut pendientes) = (0, 0, 0);
        for (bundle, nombre) in DESTINOS {
            let r = automatizar(bundle);
            let e = match r { 0 => { concedidos += 1; "permitido" } -1743 => { negados += 1; "negado" } -1744 => { pendientes += 1; "sin decidir" } -600 => "cerrado, sin dato", _ => "sin dato" };
            partes.push(format!("{nombre}: {e}"));
        }
        let estado = if negados > 0 { "denegado" } else if pendientes > 0 { "pendiente" } else if concedidos > 0 { "concedido" } else { "sin_dato" };
        p("automatizacion", estado, Some(partes.join(" · ")))
    }

    pub fn estados() -> Vec<Permiso> {
        let bundle = es_bundle();
        let mic_ok = bundle && tiene_clave("NSMicrophoneUsageDescription");
        let voz_ok = bundle && tiene_clave("NSSpeechRecognitionUsageDescription");
        vec![
            pedible(p("accesibilidad", if unsafe { AXIsProcessTrusted() } { "concedido" } else { "pendiente" }, None), true),
            pedible(p("pantalla", if unsafe { CGPreflightScreenCaptureAccess() } { "concedido" } else { "pendiente" }, None), true),
            pedible(p("microfono", av(unsafe { AVMediaTypeAudio }), None), mic_ok),
            pedible(p("voz", voz(), None), voz_ok),
            automatizacion(),
            pedible(p("notificaciones", notificaciones(), None), bundle),
            pedible(p("disco", disco(), None), false),
            pedible(p("entrada", entrada(), None), true),
            p("camara", av(unsafe { AVMediaTypeVideo }), Some("Arbrain no usa la cámara hoy; no la pide.".into())),
        ]
    }

    fn esperar<T: Send + 'static>(rx: mpsc::Receiver<T>) -> Option<T> { rx.recv_timeout(Duration::from_secs(120)).ok() }

    pub fn pedir(id: &str) -> Result<Permiso, String> {
        let actual = estados().into_iter().find(|x| x.id == id).ok_or("Permiso desconocido")?;
        if !actual.se_puede_pedir { return Ok(actual); }
        match id {
            "accesibilidad" => unsafe {
                let claves = [kAXTrustedCheckOptionPrompt];
                let valores = [kCFBooleanTrue];
                let opciones = CFDictionaryCreate(std::ptr::null(), claves.as_ptr(), valores.as_ptr(), 1,
                    &kCFTypeDictionaryKeyCallBacks as *const _ as *const c_void, &kCFTypeDictionaryValueCallBacks as *const _ as *const c_void);
                AXIsProcessTrustedWithOptions(opciones);
                if !opciones.is_null() { CFRelease(opciones); }
            },
            "pantalla" => { unsafe { CGRequestScreenCaptureAccess(); } }
            "entrada" => { unsafe { IOHIDRequestAccess(LISTEN_EVENT); } }
            "microfono" => {
                let cls = clase(c"AVCaptureDevice").ok_or("AVFoundation no disponible")?;
                let (tx, rx) = mpsc::channel::<bool>();
                let bloque = RcBlock::new(move |ok: Bool| { let _ = tx.send(ok.as_bool()); });
                unsafe { let _: () = msg_send![cls, requestAccessForMediaType: AVMediaTypeAudio, completionHandler: &*bloque]; }
                esperar(rx);
            }
            "voz" => {
                let cls = clase(c"SFSpeechRecognizer").ok_or("Speech no disponible")?;
                let (tx, rx) = mpsc::channel::<isize>();
                let bloque = RcBlock::new(move |s: isize| { let _ = tx.send(s); });
                unsafe { let _: () = msg_send![cls, requestAuthorization: &*bloque]; }
                esperar(rx);
            }
            "notificaciones" => {
                let centro = centro_notificaciones().ok_or("Notificaciones solo en la app instalada")?;
                let (tx, rx) = mpsc::channel::<bool>();
                let bloque = RcBlock::new(move |ok: Bool, _error: *mut AnyObject| { let _ = tx.send(ok.as_bool()); });
                // UNAuthorizationOptionBadge | Sound | Alert
                unsafe { let _: () = msg_send![centro, requestAuthorizationWithOptions: 7usize, completionHandler: &*bloque]; }
                esperar(rx);
            }
            _ => return Ok(actual),
        }
        estados().into_iter().find(|x| x.id == id).ok_or_else(|| "Permiso desconocido".into())
    }
}
