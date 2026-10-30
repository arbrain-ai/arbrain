//! Ventanas desprendidas (1 oct 2026, pedido de Daniel: «como CapCut, el panel en la segunda pantalla»;
//! el mismo día: «arrastrar la pestaña hasta la izquierda, y si la vuelvo a arrastrar al panel, la toma»).
//!
//! Cada pestaña del panel derecho (Tareas, Taller, o una vista que Levy fijó) sale de la ventana
//! principal a una ventana propia que carga una ruta de la MISMA web (`/panel?…`), así comparte
//! sesión, cookies y datos en vivo. Cada ventana recuerda su lugar (posición, tamaño y monitor) en
//! `ventanas.json`, dentro de la configuración de la app. Si la pestaña se soltó en un punto de la
//! pantalla (`x`, `y` lógicos), la ventana nace ahí, con el cursor sobre su cabecera; si ese monitor
//! ya no está conectado o no hay punto, usa el lugar recordado o nace junto a la principal.
//!
//! 5 oct 2026 (modelo de Chrome): una ventana ya no es UNA pestaña sino otra tira de pestañas
//! (`vista-ventana-N`, ruta `/panel?ventana=N`), y nace del tamaño de la ventana de donde salió la
//! pestaña (`ancho`, `alto`), no como ventanita. Lo demás (lugar recordado, cursor) no cambia.
//!
//! Lista blanca cerrada: etiquetas `pestana-tareas`, `pestana-taller` o `vista-<huella>` y rutas
//! que empiezan con `/panel`.
//!
//! 5 oct 2026 (Daniel: «arrastrarla y ver la animación entera desde que arrastro el componente hasta que
//! lo pego en la pestaña del segundo monitor»): el FANTASMA. Una sola ventana `fantasma` (ruta fija
//! `/panel/fantasma`), sin bordes, transparente, siempre encima, que no recibe el ratón ni puede tomar el
//! foco. Mientras se arrastra una pestaña fuera de su ventana, la ventana de origen (que sigue recibiendo el
//! arrastre aunque el cursor cruce de monitor) la mueve con el cursor por toda la pantalla. Se muestra con
//! `orderFrontRegardless` y no con `show()`: `show()` la haría ventana clave y le quitaría el foco al
//! arrastre. Se crea oculta la primera vez y se reutiliza.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, Window, WindowEvent};

const ANCHO: f64 = 480.0;
const ALTO: f64 = 860.0;
/// Dónde queda el cursor respecto de la esquina de una ventana soltada: sobre su cabecera, como al
/// soltar una pestaña de Chrome. Los mismos valores que `DESVIO_X`/`DESVIO_Y` de arrastre-geom.ts.
const DESVIO_X: f64 = 90.0;
const DESVIO_Y: f64 = 52.0;
/// Margen superior que respeta la barra de menús de macOS.
const BARRA_MENUS: f64 = 30.0;
/// La ventana que sigue al cursor mientras se arrastra una pestaña (no es «desprendida»: no se recuerda).
const FANTASMA: &str = "fantasma";

/// Rectángulo lógico de un monitor: (x, y, ancho, alto).
type Rect = (f64, f64, f64, f64);

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Lugar {
    x: f64,
    y: f64,
    ancho: f64,
    alto: f64,
    monitor: Option<String>,
}

/// Escribir el archivo solo cuando cambia algo (Moved llega muchas veces por arrastre).
#[derive(Default)]
pub struct Lugares(Mutex<Option<HashMap<String, Lugar>>>);

pub fn es_desprendida(etiqueta: &str) -> bool {
    matches!(etiqueta, "pestana-tareas" | "pestana-taller")
        || (etiqueta.starts_with("vista-")
            && etiqueta.len() <= 40
            && etiqueta[6..].chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
            && etiqueta.len() > 6)
}

fn archivo(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    let _ = fs::create_dir_all(&dir);
    Some(dir.join("ventanas.json"))
}

fn con_lugares<T>(app: &AppHandle, f: impl FnOnce(&mut HashMap<String, Lugar>) -> T) -> T {
    let estado = app.state::<Lugares>();
    let mut guardia = estado.0.lock().unwrap_or_else(|e| e.into_inner());
    let mapa = guardia.get_or_insert_with(|| {
        archivo(app)
            .and_then(|p| fs::read_to_string(p).ok())
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default()
    });
    f(mapa)
}

/// ¿El punto (lógico) cae dentro de algún monitor conectado? Se mira la esquina superior con
/// un margen, para que la barra de título quede alcanzable.
fn visible(app: &AppHandle, l: &Lugar) -> bool {
    let Ok(monitores) = app.available_monitors() else { return false };
    let (px, py) = (l.x + 40.0, l.y + 12.0);
    monitores.iter().any(|m| {
        let escala = m.scale_factor();
        let pos = m.position().to_logical::<f64>(escala);
        let tam = m.size().to_logical::<f64>(escala);
        px >= pos.x && px < pos.x + tam.width && py >= pos.y && py < pos.y + tam.height
    })
}

/// Dónde nace una ventana soltada en `cursor` (punto lógico de pantalla): con el cursor sobre su
/// cabecera y entera dentro del monitor que lo tiene. `None` si ningún monitor contiene el cursor.
/// Devuelve (x, y, ancho, alto).
fn lugar_desde_cursor(cursor: (f64, f64), ancho: f64, alto: f64, monitores: &[Rect]) -> Option<Rect> {
    let (cx, cy) = cursor;
    let (mx, my, mw, mh) = *monitores.iter().find(|(x, y, w, h)| cx >= *x && cx < x + w && cy >= *y && cy < y + h)?;
    let ancho = ancho.min(mw);
    let alto = alto.min(mh - BARRA_MENUS).max(200.0);
    let x = (cx - DESVIO_X).clamp(mx, (mx + mw - ancho).max(mx));
    let y = (cy - DESVIO_Y).clamp(my + BARRA_MENUS, (my + mh - alto).max(my + BARRA_MENUS));
    Some((x, y, ancho, alto))
}

fn monitores_logicos(app: &AppHandle) -> Vec<Rect> {
    let Ok(monitores) = app.available_monitors() else { return vec![] };
    monitores
        .iter()
        .map(|m| {
            let escala = m.scale_factor();
            let pos = m.position().to_logical::<f64>(escala);
            let tam = m.size().to_logical::<f64>(escala);
            (pos.x, pos.y, tam.width, tam.height)
        })
        .collect()
}

fn leer_lugar(app: &AppHandle, etiqueta: &str) -> Option<Lugar> {
    let l = con_lugares(app, |m| m.get(etiqueta).cloned())?;
    (l.ancho >= 200.0 && l.alto >= 200.0 && visible(app, &l)).then_some(l)
}

/// Guarda el lugar actual de una ventana desprendida (al moverla, cambiarle el tamaño o cerrarla).
pub fn recordar(window: &Window) {
    let etiqueta = window.label().to_string();
    if !es_desprendida(&etiqueta) {
        return;
    }
    if window.is_minimized().unwrap_or(false) || window.is_fullscreen().unwrap_or(false) {
        return;
    }
    let Ok(escala) = window.scale_factor() else { return };
    let (Ok(pos), Ok(tam)) = (window.outer_position(), window.inner_size()) else { return };
    let pos = pos.to_logical::<f64>(escala);
    let tam = tam.to_logical::<f64>(escala);
    let monitor = window.current_monitor().ok().flatten().and_then(|m| m.name().cloned());
    let nuevo = Lugar { x: pos.x, y: pos.y, ancho: tam.width, alto: tam.height, monitor };
    let app = window.app_handle();
    let texto = con_lugares(app, |m| {
        let igual = m.get(&etiqueta).is_some_and(|v| {
            (v.x - nuevo.x).abs() < 1.0 && (v.y - nuevo.y).abs() < 1.0 && (v.ancho - nuevo.ancho).abs() < 1.0 && (v.alto - nuevo.alto).abs() < 1.0 && v.monitor == nuevo.monitor
        });
        if igual {
            return None;
        }
        m.insert(etiqueta.clone(), nuevo);
        serde_json::to_string_pretty(m).ok()
    });
    if let (Some(texto), Some(ruta)) = (texto, archivo(app)) {
        let _ = fs::write(ruta, texto);
    }
}

pub fn al_evento(window: &Window, event: &WindowEvent) {
    match event {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) | WindowEvent::CloseRequested { .. } => recordar(window),
        _ => {}
    }
    // Sin la principal no hay a dónde acoplar: sus ventanas desprendidas (y el fantasma) se van con ella.
    if window.label() == "main" && matches!(event, WindowEvent::CloseRequested { .. }) {
        for (etiqueta, w) in window.app_handle().webview_windows() {
            if es_desprendida(&etiqueta) || etiqueta == FANTASMA {
                let _ = w.close();
            }
        }
    }
}

fn traer_al_frente(w: &WebviewWindow, con_foco: bool) {
    let _ = w.unminimize();
    let _ = w.show();
    if con_foco {
        let _ = w.set_focus();
    }
}

/// Abre (o trae al frente) una ventana desprendida con una ruta de la misma web que la llama.
/// `x`, `y`: punto lógico de pantalla donde se soltó la pestaña (opcional).
#[tauri::command]
pub fn abrir_ventana(
    app: AppHandle,
    webview: WebviewWindow,
    etiqueta: String,
    ruta: String,
    titulo: String,
    x: Option<f64>,
    y: Option<f64>,
    ancho: Option<f64>,
    alto: Option<f64>,
    sin_foco: Option<bool>,
) -> Result<(), String> {
    // `sin_foco`: reabrir al arrancar (tras una actualización) nunca le quita el teclado a quien esté usando otra app.
    let con_foco = !sin_foco.unwrap_or(false);
    if !es_desprendida(&etiqueta) {
        return Err("Ventana no permitida".into());
    }
    if !(ruta == "/panel" || ruta.starts_with("/panel?")) || ruta.len() > 6000 {
        return Err("Ruta no permitida".into());
    }
    let base = webview.url().map_err(|e| e.to_string())?;
    let url = base.join(&ruta).map_err(|e| e.to_string())?;
    if url.origin() != base.origin() {
        return Err("Origen distinto".into());
    }
    let titulo: String = titulo.chars().filter(|c| !c.is_control()).take(80).collect();
    let cursor = match (x, y) {
        (Some(x), Some(y)) if x.is_finite() && y.is_finite() => Some((x, y)),
        _ => None,
    };
    // Tamaño de la primera vez: el que pide la web (el de la ventana de origen), con un mínimo sensato.
    let nuevo = (
        ancho.filter(|v| v.is_finite()).map_or(ANCHO, |v| v.clamp(320.0, 4000.0)),
        alto.filter(|v| v.is_finite()).map_or(ALTO, |v| v.clamp(360.0, 3000.0)),
    );

    if let Some(w) = app.get_webview_window(&etiqueta) {
        // La misma pestaña reutiliza su ventana (y su lugar): se cambia lo que muestra.
        if w.url().map(|u| u != url).unwrap_or(true) {
            let _ = w.navigate(url);
        }
        let _ = w.set_title(&titulo);
        // Soltada otra vez en un punto: la ventana se va ahí, con su tamaño actual.
        if let (Some(c), Ok(escala), Ok(tam)) = (cursor, w.scale_factor(), w.inner_size()) {
            let tam = tam.to_logical::<f64>(escala);
            if let Some((px, py, _, _)) = lugar_desde_cursor(c, tam.width, tam.height, &monitores_logicos(&app)) {
                let _ = w.set_position(tauri::LogicalPosition::new(px, py));
            }
        }
        traer_al_frente(&w, con_foco);
        return Ok(());
    }

    let mut b = WebviewWindowBuilder::new(&app, &etiqueta, WebviewUrl::External(url))
        .title(titulo)
        .min_inner_size(320.0, 360.0)
        .resizable(true)
        .theme(Some(tauri::Theme::Dark))
        .focused(con_foco)
        .disable_drag_drop_handler();
    let recordado = leer_lugar(&app, &etiqueta);
    // Soltada en un punto: nace ahí (con el tamaño que recordaba, o el de siempre). Si el punto no
    // cae en ningún monitor, vale el lugar recordado.
    let lugar = cursor
        .and_then(|c| {
            let (an, al) = recordado.as_ref().map(|l| (l.ancho, l.alto)).unwrap_or(nuevo);
            lugar_desde_cursor(c, an, al, &monitores_logicos(&app))
        })
        .map(|(x, y, ancho, alto)| Lugar { x, y, ancho, alto, monitor: None })
        .or(recordado);
    match &lugar {
        Some(l) => b = b.inner_size(l.ancho, l.alto).position(l.x, l.y),
        None => {
            // Primera vez (o su monitor ya no está): junto al borde derecho de la principal.
            b = b.inner_size(nuevo.0, nuevo.1);
            if let (Ok(escala), Ok(pos), Ok(tam)) = (webview.scale_factor(), webview.outer_position(), webview.outer_size()) {
                let pos = pos.to_logical::<f64>(escala);
                let tam = tam.to_logical::<f64>(escala);
                b = b.position((pos.x + tam.width - nuevo.0 - 24.0).max(pos.x), pos.y + 48.0);
            } else {
                b = b.center();
            }
        }
    }
    let w = b.build().map_err(|e| e.to_string())?;
    // En macOS el builder ubica con la escala y la altura del monitor principal; entre monitores
    // de distinto tamaño eso desplaza la ventana. Ya creada, se reafirma su lugar en lógico.
    if let Some(l) = &lugar {
        let _ = w.set_size(tauri::LogicalSize::new(l.ancho, l.alto));
        let _ = w.set_position(tauri::LogicalPosition::new(l.x, l.y));
    }
    traer_al_frente(&w, con_foco);
    Ok(())
}

/// Trae al frente una ventana desprendida. Devuelve false si no existe.
#[tauri::command]
pub fn enfocar_ventana(app: AppHandle, etiqueta: String) -> bool {
    if !es_desprendida(&etiqueta) {
        return false;
    }
    match app.get_webview_window(&etiqueta) {
        Some(w) => {
            traer_al_frente(&w, true);
            true
        }
        None => false,
    }
}

/// Cierra una ventana desprendida (al acoplarla). Recuerda su lugar antes de cerrarla.
#[tauri::command]
pub fn cerrar_ventana(app: AppHandle, etiqueta: String) -> bool {
    if !es_desprendida(&etiqueta) {
        return false;
    }
    match app.get_webview_window(&etiqueta) {
        Some(w) => {
            recordar(&w.as_ref().window());
            w.close().is_ok()
        }
        None => false,
    }
}

/// Qué ventanas desprendidas están abiertas ahora.
#[tauri::command]
pub fn ventanas_abiertas(app: AppHandle) -> Vec<String> {
    app.webview_windows().into_keys().filter(|e| es_desprendida(e)).collect()
}

/// Muestra u oculta el fantasma sin activarlo (macOS): `orderFrontRegardless` lo pone encima sin hacerlo
/// ventana clave; `orderOut:` lo quita.
#[cfg(target_os = "macos")]
fn fantasma_a_la_vista(w: &WebviewWindow, si: bool) {
    let Ok(ptr) = w.ns_window() else { return };
    if ptr.is_null() {
        return;
    }
    let ptr = ptr as usize;
    let _ = w.run_on_main_thread(move || unsafe {
        use objc2::msg_send;
        use objc2::runtime::AnyObject;
        let ventana = &*(ptr as *const AnyObject);
        if si {
            let _: () = msg_send![ventana, orderFrontRegardless];
        } else {
            let _: () = msg_send![ventana, orderOut: std::ptr::null::<AnyObject>()];
        }
    });
}

#[cfg(not(target_os = "macos"))]
fn fantasma_a_la_vista(w: &WebviewWindow, si: bool) {
    let _ = if si { w.show() } else { w.hide() };
}

fn crear_fantasma(app: &AppHandle, webview: &WebviewWindow) -> Result<WebviewWindow, String> {
    let base = webview.url().map_err(|e| e.to_string())?;
    let url = base.join("/panel/fantasma").map_err(|e| e.to_string())?;
    let w = WebviewWindowBuilder::new(app, FANTASMA, WebviewUrl::External(url))
        .title("")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .focusable(false)
        .visible(false)
        .inner_size(1200.0, 860.0)
        .disable_drag_drop_handler()
        .build()
        .map_err(|e| e.to_string())?;
    let _ = w.set_ignore_cursor_events(true);
    Ok(w)
}

/// El fantasma del arrastre. `accion`: «preparar» (lo crea oculto, una vez), «mostrar» (en `x`,`y` lógicos
/// de pantalla, con `ancho`×`alto` si vienen), «mover» o «ocultar».
#[tauri::command]
pub fn fantasma(
    app: AppHandle,
    webview: WebviewWindow,
    accion: String,
    x: Option<f64>,
    y: Option<f64>,
    ancho: Option<f64>,
    alto: Option<f64>,
) -> Result<(), String> {
    let existente = app.get_webview_window(FANTASMA);
    if accion == "ocultar" {
        if let Some(w) = existente {
            fantasma_a_la_vista(&w, false);
        }
        return Ok(());
    }
    let w = match existente {
        Some(w) => w,
        None => crear_fantasma(&app, &webview)?,
    };
    if let (Some(an), Some(al)) = (ancho, alto) {
        if an.is_finite() && al.is_finite() {
            let _ = w.set_size(tauri::LogicalSize::new(an.clamp(100.0, 6000.0), al.clamp(100.0, 4000.0)));
        }
    }
    if let (Some(x), Some(y)) = (x, y) {
        if x.is_finite() && y.is_finite() {
            let _ = w.set_position(tauri::LogicalPosition::new(x, y));
        }
    }
    match accion.as_str() {
        "preparar" | "mover" => Ok(()),
        "mostrar" => {
            let _ = w.set_ignore_cursor_events(true);
            fantasma_a_la_vista(&w, true);
            Ok(())
        }
        _ => Err("Acción desconocida".into()),
    }
}

/// La web pregunta si esta app ya sabe abrir una ventana por pestaña (`pestana-*`, posición donde se
/// soltó). Una app instalada antes no tiene este comando y la web no deja arrastrar pestañas fuera:
/// la web se publica antes de reinstalar el escritorio. Devuelve la versión del protocolo:
/// 2 = `abrir_ventana` acepta `ancho`/`alto` (ventanas con su propia tira, 5 oct 2026).
/// 3 = existe `fantasma` (la pestaña arrastrada sigue al cursor por toda la pantalla, 5 oct 2026).
#[tauri::command]
pub fn ventanas_pestanas() -> u32 {
    3
}

#[cfg(test)]
mod tests {
    use super::{es_desprendida, lugar_desde_cursor, Rect};

    #[test]
    fn solo_etiquetas_de_la_lista_blanca() {
        assert!(es_desprendida("pestana-tareas"));
        assert!(es_desprendida("pestana-taller"));
        assert!(es_desprendida("vista-calendario"));
        assert!(es_desprendida("vista-negocio-2"));
        assert!(es_desprendida("vista-1a2b3c"));
        assert!(!es_desprendida("pestana-otra"));
        assert!(!es_desprendida("pestana-"));
        assert!(!es_desprendida("panel"));
        assert!(!es_desprendida("main"));
        assert!(!es_desprendida("splash"));
        assert!(!es_desprendida("vista-"));
        assert!(!es_desprendida("vista-../x"));
        assert!(!es_desprendida("vista-Calendario"));
        // El fantasma del arrastre no es una ventana del panel: no se recuerda ni se cierra con ellas.
        assert!(!es_desprendida("fantasma"));
    }

    const PRINCIPAL: Rect = (0.0, 0.0, 1728.0, 1117.0);
    const SEGUNDO: Rect = (1728.0, -200.0, 2560.0, 1440.0);

    #[test]
    fn la_ventana_nace_con_el_cursor_sobre_su_cabecera() {
        let (x, y, an, al) = lugar_desde_cursor((600.0, 200.0), 480.0, 860.0, &[PRINCIPAL]).unwrap();
        assert_eq!((x, y, an, al), (510.0, 148.0, 480.0, 860.0));
    }

    #[test]
    fn no_se_sale_del_monitor_donde_se_solto() {
        // Soltada junto al borde derecho: la ventana se recorre para caber entera.
        let (x, _, an, _) = lugar_desde_cursor((1700.0, 400.0), 480.0, 860.0, &[PRINCIPAL]).unwrap();
        assert_eq!(x + an, 1728.0);
        // Soltada pegada arriba: respeta la barra de menús.
        let (_, y, _, _) = lugar_desde_cursor((600.0, 3.0), 480.0, 860.0, &[PRINCIPAL]).unwrap();
        assert_eq!(y, 30.0);
        // Un monitor más bajo que la ventana la acorta, no la desborda.
        let (_, y, _, al) = lugar_desde_cursor((600.0, 400.0), 480.0, 2000.0, &[PRINCIPAL]).unwrap();
        assert!(y + al <= 1117.0);
    }

    #[test]
    fn elige_el_monitor_que_contiene_el_cursor() {
        let (x, y, _, _) = lugar_desde_cursor((2000.0, -100.0), 480.0, 860.0, &[PRINCIPAL, SEGUNDO]).unwrap();
        assert_eq!((x, y), (1910.0, -152.0));
        // Un punto fuera de todo monitor no decide nada (vale el lugar recordado).
        assert!(lugar_desde_cursor((9000.0, 9000.0), 480.0, 860.0, &[PRINCIPAL, SEGUNDO]).is_none());
    }
}
