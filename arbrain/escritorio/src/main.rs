//! Arbrain de escritorio (22 oct 2026): desde la primera vez, una app tan simple como las de escritorio de Claude o
//! Codex. Una ventana nativa con el Arbrain del modo servidor dentro:
//!
//!   1. Si `npm run servidor` ya corre (su control local responde), pide un pase y abre la web con sesión.
//!   2. Si no, lo enciende desde `~/Arbrain` (el mismo `arbrain/scripts/servidor.mjs`, el mismo daemon) y enseña el
//!      progreso mientras instala o compila. Cerrar la ventana no lo apaga: Levy y los recordatorios siguen vivos.
//!   3. Si el servidor se va (por ejemplo, porque una actualización lo reinicia), espera a que vuelva o lo
//!      vuelve a encender, y entra de nuevo.
//!
//! No es la app Tauri 0.1.x (`src-tauri/`): aquí no hay IPC de Tauri ni secretos; la web es la misma del navegador
//! (edición cliente en modo servidor) y no nota la diferencia. Empaquetar: `empaquetar.mjs`; instalar:
//! `arbrain/scripts/escritorio.mjs`.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod servidor;
mod ventana;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::thread::sleep;
use std::time::{Duration, Instant};
use tao::dpi::{LogicalPosition, LogicalSize};
use tao::event::{Event, StartCause, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoopBuilder, EventLoopProxy};
use tao::window::WindowBuilder;
use wry::{NewWindowResponse, PermissionKind, PermissionResponse, WebContext, WebViewBuilder};

enum Ev {
    Estado(String, String),
    Apagado(String, String),
    Fallo(String, String, String),
    Abrir(String),
    #[allow(dead_code)] // solo hay menú en macOS
    Menu(String),
}

const CARGANDO: &str = include_str!("cargando.html");
const LOGO_PNG_B64: &str = include_str!("../iconos/logo.png.b64");
const ENCENDIENDO: &str = "Encendiendo tu Arbrain…";
const PLAZO_ARRANQUE: Duration = Duration::from_secs(40 * 60);

fn js(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_else(|_| "\"\"".into())
}

fn pagina(inicial: &str) -> String {
    CARGANDO.replace("@LOGO@", LOGO_PNG_B64.trim()).replace("/*INICIAL*/", inicial)
}

type Fallo = (String, String, String);

fn fallo(titulo: &str, detalle: impl Into<String>, registro: impl Into<String>) -> Fallo {
    (titulo.to_string(), detalle.into(), registro.into())
}

/// Entra a un Arbrain que ya corre o lo enciende y espera a que responda. Devuelve la URL con pase.
fn conectar(proxy: &EventLoopProxy<Ev>) -> Result<String, Fallo> {
    let cfg = servidor::Config::cargar();
    if let Some(url) = servidor::pase(&cfg) {
        return Ok(url);
    }
    if !cfg.servidor_mjs().is_file() {
        return Err(fallo(
            "No encuentro tu Arbrain",
            format!(
                "Lo busqué en {}. Si todavía no lo instalas, abre Claude Code y pega: «Instala Arbrain siguiendo https://github.com/arbrain-ai/arbrain/blob/main/INSTALAR.md».",
                cfg.repo.display()
            ),
            "",
        ));
    }
    let path = servidor::path_completo(&cfg);
    let Some(node) = servidor::encontrar_node(&cfg, &path) else {
        return Err(fallo(
            "Falta Node en esta computadora",
            "Arbrain necesita Node 22 o más nuevo. Abre Claude Code en tu carpeta Arbrain y dile: «instala Node 22 para Arbrain».",
            "",
        ));
    };
    // Otro arranque en curso (por ejemplo «actualizar» lo reinició): se espera a ese en vez de encender otro.
    let inicio = Instant::now();
    let mut motivo = Motivo::nuevo();
    while servidor::otro_arrancando(&cfg) && inicio.elapsed() < PLAZO_ARRANQUE {
        let aviso = servidor::ultimo_aviso(&cfg.datos.join("logs").join("servidor.log")).unwrap_or_default();
        let _ = proxy.send_event(Ev::Estado(ENCENDIENDO.into(), motivo.detalle(aviso)));
        sleep(Duration::from_secs(2));
        match servidor::pase_o_motivo(&cfg) {
            Ok(url) => return Ok(url),
            Err(m) => motivo.anotar(&cfg, "esperando otro arranque", m),
        }
    }
    let _ = proxy.send_event(Ev::Estado(ENCENDIENDO.into(), "Preparando…".into()));
    let log = cfg.log();
    let mut hijo = servidor::arrancar(&cfg, &node, &path).map_err(|e| fallo("No pude encender Arbrain", e.to_string(), ""))?;
    let inicio = Instant::now();
    let mut ultima = String::new();
    let mut motivo = Motivo::nuevo();
    loop {
        sleep(Duration::from_millis(800));
        match servidor::pase_o_motivo(&cfg) {
            Ok(url) => return Ok(url),
            Err(m) => motivo.anotar(&cfg, "encendiendo", m),
        }
        if let Ok(Some(salida)) = hijo.try_wait() {
            // Otro arranque (la terminal, el arranque automático) pudo ganarle: ese también sirve.
            if let Some(url) = servidor::pase(&cfg) {
                return Ok(url);
            }
            return Err(fallo(
                "Arbrain no pudo encenderse",
                format!(
                    "El servidor se detuvo ({salida}). Abajo, sus últimos avisos. Si no sabes qué hacer, abre Claude Code en tu carpeta Arbrain y dile «Arbrain no enciende, revisa el registro»."
                ),
                servidor::ultimos_avisos(&log, 12).join("\n"),
            ));
        }
        if inicio.elapsed() > PLAZO_ARRANQUE {
            return Err(fallo(
                "Arbrain tarda demasiado en encender",
                "Sigue trabajando en segundo plano. Reintenta en unos minutos o abre Claude Code en tu carpeta Arbrain y dile «Arbrain no enciende, revisa el registro».",
                servidor::ultimos_avisos(&log, 12).join("\n"),
            ));
        }
        let linea = motivo.detalle(servidor::ultimo_aviso(&log).unwrap_or_else(|| "Preparando…".into()));
        if linea != ultima {
            let _ = proxy.send_event(Ev::Estado(ENCENDIENDO.into(), linea.clone()));
            ultima = linea;
        }
    }
}

/// Por qué todavía no se puede entrar (soporte 29 oct 2026: «Encendiendo tu Arbrain…» más de 2 minutos sin decir nada).
/// Cada 30 s anota el motivo en escritorio.log; pasado un minuto con el control del servidor ya vivo, la pantalla lo dice.
struct Motivo {
    inicio: Instant,
    anotado: Option<Instant>,
    ultimo: Option<String>,
}

impl Motivo {
    fn nuevo() -> Motivo {
        Motivo { inicio: Instant::now(), anotado: None, ultimo: None }
    }

    fn anotar(&mut self, cfg: &servidor::Config, etapa: &str, m: String) {
        if self.anotado.map(|t| t.elapsed() >= Duration::from_secs(30)).unwrap_or(true) {
            servidor::anotar(cfg, &format!("{etapa} ({} s): no puedo entrar todavía: {m}", self.inicio.elapsed().as_secs()));
            self.anotado = Some(Instant::now());
        }
        self.ultimo = Some(m);
    }

    /// El aviso del servidor y, si ya pasó un minuto y el control contesta pero algo más falla, el motivo.
    fn detalle(&self, aviso: String) -> String {
        match &self.ultimo {
            Some(m) if self.inicio.elapsed() > Duration::from_secs(60) && !m.starts_with("no hay servidor.json") && !m.starts_with("el control (") => {
                format!("{aviso}\nTu Arbrain responde pero todavía no me deja entrar: {m}.")
            }
            _ => aviso,
        }
    }
}

/// Con la web abierta: si el servidor deja de responder 3 veces seguidas, avisa y espera a que vuelva. No lo
/// enciende por su cuenta: «actualizar» lo apaga, integra el código nuevo y lo vuelve a encender; encenderlo a media
/// actualización arrancaría el código viejo. La persona puede pulsar «Encender ahora».
fn vigilar(proxy: &EventLoopProxy<Ev>, reintentar: &mpsc::Receiver<()>) {
    let mut fallos = 0;
    loop {
        sleep(Duration::from_secs(4));
        let cfg = servidor::Config::cargar();
        if servidor::vivo(&cfg).is_some() {
            fallos = 0;
            continue;
        }
        fallos += 1;
        if fallos < 3 {
            continue;
        }
        let _ = proxy.send_event(Ev::Apagado(
            "Tu Arbrain está apagado".into(),
            "Si se está actualizando, vuelve solo en cuanto termine.".into(),
        ));
        while reintentar.try_recv().is_ok() {}
        loop {
            match reintentar.recv_timeout(Duration::from_secs(2)) {
                Ok(()) => return,
                Err(mpsc::RecvTimeoutError::Disconnected) => return,
                Err(mpsc::RecvTimeoutError::Timeout) => {}
            }
            if servidor::vivo(&cfg).is_some() || servidor::otro_arrancando(&cfg) {
                return;
            }
        }
    }
}

fn vigia(proxy: EventLoopProxy<Ev>, reintentar: mpsc::Receiver<()>) {
    loop {
        match conectar(&proxy) {
            Ok(url) => {
                let _ = proxy.send_event(Ev::Abrir(url));
                vigilar(&proxy, &reintentar);
            }
            Err((titulo, detalle, registro)) => {
                while reintentar.try_recv().is_ok() {}
                let _ = proxy.send_event(Ev::Fallo(titulo, detalle, registro));
                if reintentar.recv().is_err() {
                    return;
                }
                let _ = proxy.send_event(Ev::Estado(ENCENDIENDO.into(), String::new()));
            }
        }
    }
}

/// Carpeta del perfil del navegador interno (cookies de la sesión). macOS la decide WebKit por el bundle id.
fn dir_perfil() -> Option<std::path::PathBuf> {
    if cfg!(target_os = "macos") {
        return None;
    }
    let base = if cfg!(windows) {
        std::env::var_os("LOCALAPPDATA").map(std::path::PathBuf::from).unwrap_or_else(|| servidor::home().join("AppData").join("Local"))
    } else {
        std::env::var_os("XDG_DATA_HOME").map(std::path::PathBuf::from).unwrap_or_else(|| servidor::home().join(".local").join("share"))
    };
    Some(base.join("ai.arbrain.escritorio"))
}

fn main() {
    let event_loop = EventLoopBuilder::<Ev>::with_user_event().build();
    let proxy = event_loop.create_proxy();
    #[cfg(target_os = "macos")]
    let menu = menu::crear(proxy.clone());

    // Al área útil del monitor (sin la barra de tareas): en 1280×720 la ventana fija de 1360×880 dejaba el botón de la
    // bienvenida fuera de la pantalla (ventana.rs).
    let m = ventana::medidas(ventana::area_util(&event_loop));
    let constructor = WindowBuilder::new()
        .with_title("Arbrain")
        .with_inner_size(LogicalSize::new(m.ancho, m.alto))
        .with_min_inner_size(LogicalSize::new(m.min_ancho, m.min_alto));
    let constructor = match m.posicion {
        Some((x, y)) => constructor.with_position(LogicalPosition::new(x, y)),
        None => constructor,
    };
    // Windows: ícono chico (barra de título) y grande (barra de tareas) desde el recurso del .exe, antes de crear la
    // ventana; sin el grande, la barra de tareas pinta uno genérico.
    #[cfg(windows)]
    let constructor = {
        use tao::platform::windows::{IconExtWindows, WindowBuilderExtWindows};
        let chico = tao::window::Icon::from_resource(1, None).ok();
        let grande = tao::window::Icon::from_resource(1, Some(tao::dpi::PhysicalSize::new(256, 256))).ok();
        constructor.with_window_icon(chico).with_taskbar_icon(grande)
    };
    let window = constructor.build(&event_loop).expect("no pude crear la ventana");

    let en_web = Arc::new(AtomicBool::new(false));
    let (tx_reintentar, rx_reintentar) = mpsc::channel::<()>();
    let mut contexto = WebContext::new(dir_perfil());
    let builder = WebViewBuilder::new_with_web_context(&mut contexto)
        .with_html(pagina(""))
        .with_background_color((5, 5, 8, 255))
        .with_devtools(cfg!(debug_assertions) || std::env::var_os("ARBRAIN_DEVTOOLS").is_some())
        .with_clipboard(true)
        .with_ipc_handler({
            let en_web = en_web.clone();
            move |req: wry::http::Request<String>| {
                // Solo la pantalla de carga habla con la app; la web de Arbrain no tiene nada que pedirle.
                if en_web.load(Ordering::SeqCst) {
                    return;
                }
                match req.body().as_str() {
                    "reintentar" => {
                        let _ = tx_reintentar.send(());
                    }
                    "registro" => servidor::mostrar_archivo(&servidor::Config::cargar().log()),
                    _ => {}
                }
            }
        })
        // Enlaces con target=_blank y window.open (OpenRouter, YouTube, documentación): al navegador del sistema,
        // como en la app 0.1.x. El canje de OpenRouter vuelve a 127.0.0.1 y lo resuelve el servidor.
        .with_new_window_req_handler(|url, _| {
            servidor::abrir_fuera(&url);
            NewWindowResponse::Deny
        })
        .with_permission_handler(|tipo| match tipo {
            PermissionKind::Microphone | PermissionKind::Camera => PermissionResponse::Allow,
            _ => PermissionResponse::Default,
        })
        .with_download_started_handler(|_, destino| {
            if !destino.is_absolute() {
                let nombre = destino.file_name().map(|n| n.to_os_string()).unwrap_or_else(|| "descarga".into());
                *destino = servidor::home().join("Downloads").join(nombre);
            }
            true
        });

    #[cfg(not(any(target_os = "linux", target_os = "dragonfly", target_os = "freebsd", target_os = "netbsd", target_os = "openbsd")))]
    let webview = builder.build(&window).expect("no pude crear la vista web");
    #[cfg(any(target_os = "linux", target_os = "dragonfly", target_os = "freebsd", target_os = "netbsd", target_os = "openbsd"))]
    let webview = {
        use tao::platform::unix::WindowExtUnix;
        use wry::WebViewBuilderExtUnix;
        builder.build_gtk(window.default_vbox().expect("sin caja gtk")).expect("no pude crear la vista web")
    };

    let mut rx_reintentar = Some(rx_reintentar);
    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        let _ = &window;
        match event {
            Event::NewEvents(StartCause::Init) => {
                #[cfg(target_os = "macos")]
                menu.init_for_nsapp();
                if let Some(rx) = rx_reintentar.take() {
                    let p = proxy.clone();
                    std::thread::spawn(move || vigia(p, rx));
                }
            }
            Event::UserEvent(Ev::Abrir(url)) => {
                en_web.store(true, Ordering::SeqCst);
                let _ = webview.load_url(&url);
            }
            Event::UserEvent(Ev::Estado(titulo, detalle)) => {
                let llamada = format!("estado({},{})", js(&titulo), js(&detalle));
                if en_web.swap(false, Ordering::SeqCst) {
                    let _ = webview.load_html(&pagina(&llamada));
                } else {
                    let _ = webview.evaluate_script(&format!("window.estado && {llamada}"));
                }
            }
            Event::UserEvent(Ev::Apagado(titulo, detalle)) => {
                let llamada = format!("espera({},{})", js(&titulo), js(&detalle));
                if en_web.swap(false, Ordering::SeqCst) {
                    let _ = webview.load_html(&pagina(&llamada));
                } else {
                    let _ = webview.evaluate_script(&format!("window.espera && {llamada}"));
                }
            }
            Event::UserEvent(Ev::Fallo(titulo, detalle, registro)) => {
                let llamada = format!("fallo({},{},{})", js(&titulo), js(&detalle), js(&registro));
                if en_web.swap(false, Ordering::SeqCst) {
                    let _ = webview.load_html(&pagina(&llamada));
                } else {
                    let _ = webview.evaluate_script(&format!("window.fallo && {llamada}"));
                }
            }
            Event::UserEvent(Ev::Menu(id)) => match id.as_str() {
                "recargar" => {
                    let _ = webview.reload();
                }
                "inicio" | "navegador" => {
                    let p = proxy.clone();
                    std::thread::spawn(move || {
                        if let Some(url) = servidor::pase(&servidor::Config::cargar()) {
                            if id == "inicio" {
                                let _ = p.send_event(Ev::Abrir(url));
                            } else {
                                servidor::abrir_fuera(&url);
                            }
                        }
                    });
                }
                "registro" => servidor::mostrar_archivo(&servidor::Config::cargar().log()),
                _ => {}
            },
            Event::WindowEvent { event: WindowEvent::CloseRequested, .. } => *control_flow = ControlFlow::Exit,
            _ => {}
        }
    });
}

#[cfg(target_os = "macos")]
mod menu {
    use super::Ev;
    use muda::accelerator::{Accelerator, Code, Modifiers};
    use muda::{AboutMetadata, Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu};
    use tao::event_loop::EventLoopProxy;

    /// Sin menú, macOS no da Copiar, Pegar ni Salir con el teclado dentro de la vista web.
    pub fn crear(proxy: EventLoopProxy<Ev>) -> Menu {
        let sep = || PredefinedMenuItem::separator();
        let acerca = AboutMetadata { name: Some("Arbrain".into()), version: Some(env!("CARGO_PKG_VERSION").into()), ..Default::default() };
        let app = Submenu::with_items(
            "Arbrain",
            true,
            &[
                &PredefinedMenuItem::about(Some("Acerca de Arbrain"), Some(acerca)),
                &sep(),
                &PredefinedMenuItem::hide(Some("Ocultar Arbrain")),
                &PredefinedMenuItem::hide_others(Some("Ocultar otros")),
                &PredefinedMenuItem::show_all(Some("Mostrar todo")),
                &sep(),
                &PredefinedMenuItem::quit(Some("Salir de Arbrain")),
            ],
        )
        .expect("menú");
        let editar = Submenu::with_items(
            "Edición",
            true,
            &[
                &PredefinedMenuItem::undo(Some("Deshacer")),
                &PredefinedMenuItem::redo(Some("Rehacer")),
                &sep(),
                &PredefinedMenuItem::cut(Some("Cortar")),
                &PredefinedMenuItem::copy(Some("Copiar")),
                &PredefinedMenuItem::paste(Some("Pegar")),
                &PredefinedMenuItem::select_all(Some("Seleccionar todo")),
            ],
        )
        .expect("menú");
        let cmd = |m: Modifiers, c: Code| Some(Accelerator::new(m, c));
        let ver = Submenu::with_items(
            "Ver",
            true,
            &[
                &MenuItem::with_id("recargar", "Recargar", true, cmd(Modifiers::META, Code::KeyR)),
                &MenuItem::with_id("inicio", "Volver al inicio", true, cmd(Modifiers::META | Modifiers::SHIFT, Code::KeyH)),
                &sep(),
                &MenuItem::with_id("navegador", "Abrir en el navegador", true, None),
                &MenuItem::with_id("registro", "Ver el registro del servidor", true, None),
                &sep(),
                &PredefinedMenuItem::fullscreen(Some("Pantalla completa")),
            ],
        )
        .expect("menú");
        let ventana = Submenu::with_items(
            "Ventana",
            true,
            &[
                &PredefinedMenuItem::minimize(Some("Minimizar")),
                &PredefinedMenuItem::maximize(Some("Zoom")),
                &sep(),
                &PredefinedMenuItem::close_window(Some("Cerrar ventana")),
            ],
        )
        .expect("menú");
        let menu = Menu::with_items(&[&app, &editar, &ver, &ventana]).expect("menú");
        let proxy = std::sync::Mutex::new(proxy);
        MenuEvent::set_event_handler(Some(move |e: MenuEvent| {
            if let Ok(p) = proxy.lock() {
                let _ = p.send_event(Ev::Menu(e.id().0.clone()));
            }
        }));
        menu
    }
}
