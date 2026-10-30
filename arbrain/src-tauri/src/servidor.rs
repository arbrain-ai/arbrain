//! El embebido es temporal, no un destino (11 oct 2026, incidente del domingo).
//!
//! La app arrancó a las 10:22:45 mientras el Studio (127.0.0.1:3300) se desplegaba, cayó al puerto del embebido
//! (3218), adoptó ahí un `next-server` huérfano de otra sesión y se quedó en ese origen TODO EL DÍA. A las 18:18 un
//! agente mató a los huérfanos y siguieron ~2 h de «conexión rechazada» con el Studio sano. Reglas de este módulo:
//!
//! 1. Si el Studio es el servidor configurado y la app está en el embebido (propio o ajeno), un vigilante sigue
//!    sondeando la salud del Studio; en cuanto está sano, TODAS las ventanas vuelven a él con su ruta.
//! 2. Si el servidor en uso muere (el hijo sale o el puerto deja de aceptar conexiones), la app vuelve al Studio si
//!    está sano o relanza el embebido. Nunca horas de «conexión rechazada» en silencio.
//! 3. Un `next-server` ajeno en 3218 solo se adopta como provisional: no le gana al Studio.
//!
//! Cambiar de puerto es cambiar de ORIGEN: localStorage e IndexedDB son por origen (commit 528f452b). Por eso la
//! mudanza es un acuerdo con la web: Rust avisa a cada ventana (`arbrain:mudar-servidor`), la web espera un momento
//! seguro, entrega sus borradores y su fila al lado nativo (`servidor_mudanza_lista`) y Rust la navega al origen
//! nuevo con la MISMA ruta; allá la web los recoge (`servidor_traspaso_tomar`). La sesión no se pierde: las cookies
//! son por host (127.0.0.1), no por puerto, y la cola local (sync_queue) vive en el SQLite de Tauri. Una página
//! que no responde al aviso (build anterior a este mecanismo) se navega igual tras un plazo.

use crate::{
    create_main_window, es_origen_local, is_http_healthy, lanzar_embebido, local_server_info, local_server_port,
    local_server_url, recordar_ultimo_servidor, set_local_server_info, studio_web_port, LocalServerInfo, LocalServerState,
};
use serde_json::json;
use std::collections::HashMap;
use std::net::TcpStream;
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, Url, WebviewWindow};

/// Cada cuánto mira el vigilante.
pub const TICK: Duration = Duration::from_secs(5);
/// El Studio debe salir sano en este número de sondeos SEGUIDOS antes de mudarse (un deploy a medias no cuenta).
pub const STUDIO_SANOS_PARA_VOLVER: u32 = 2;
/// Ticks seguidos con el servidor en uso caído antes de actuar (10 s).
pub const CAIDAS_PARA_ACTUAR: u32 = 2;
/// En el Studio solo se abandona tras 3 min sin aceptar conexiones: un deploy dura ~30 s y la salud del chat que
/// falla con el web vivo (daemon atorado) no es motivo para cambiar de origen.
pub const CAIDAS_STUDIO_PARA_DEJARLO: u32 = 36;
/// Al arrancar, si la última vez fue el Studio, se le espera hasta esto (el deploy del 11 oct tardó 30 s).
pub const ESPERA_STUDIO_AL_ARRANCAR: Duration = Duration::from_secs(45);
/// Una ventana que no contesta el aviso en este plazo es de una web anterior: se navega sin traspaso.
pub const PLAZO_SIN_RESPUESTA: Duration = Duration::from_secs(20);
/// Con el servidor viejo muerto, una ventana que dijo «recibido» tiene esto para irse antes de moverla a la fuerza.
pub const PLAZO_URGENTE: Duration = Duration::from_secs(60);
/// El traspaso de borradores solo vale para la mudanza en curso.
pub const VIGENCIA_TRASPASO: Duration = Duration::from_secs(15 * 60);
/// Tope del traspaso (texto + imágenes en base64): más que esto no cabe en un mensaje IPC razonable.
pub const TOPE_TRASPASO: usize = 48 * 1024 * 1024;

// ---------------------------------------------------------------------------------------------------------------
// Lógica pura (probada abajo)
// ---------------------------------------------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Modo {
    Studio,
    /// Embebido propio (hijo gestionado), ajeno adoptado o en error: provisional mientras el Studio exista.
    Provisional,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Accion {
    Nada,
    /// Mudar todas las ventanas al Studio.
    VolverAlStudio,
    /// El servidor provisional murió y el Studio no está: levantar el embebido otra vez.
    RelanzarEmbebido,
    /// El Studio lleva minutos sin aceptar conexiones: pasar al embebido (provisional).
    CaerAlEmbebido,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct Senales {
    pub studio_configurado: bool,
    /// Sondeos seguidos con el Studio sano (salud real del chat).
    pub studio_sanos_seguidos: u32,
    /// Ticks seguidos con el servidor en uso caído (puerto cerrado o hijo salido).
    pub actual_caidas_seguidas: u32,
    /// Ya se puede intentar relanzar (el respiro entre intentos venció).
    pub relanzar_permitido: bool,
}

pub fn decidir(modo: Modo, s: Senales) -> Accion {
    match modo {
        Modo::Studio => {
            if s.actual_caidas_seguidas >= CAIDAS_STUDIO_PARA_DEJARLO && s.relanzar_permitido {
                Accion::CaerAlEmbebido
            } else {
                Accion::Nada
            }
        }
        Modo::Provisional => {
            if s.studio_configurado && s.studio_sanos_seguidos >= STUDIO_SANOS_PARA_VOLVER {
                Accion::VolverAlStudio
            } else if s.actual_caidas_seguidas >= CAIDAS_PARA_ACTUAR && s.relanzar_permitido {
                Accion::RelanzarEmbebido
            } else {
                Accion::Nada
            }
        }
    }
}

/// Respiro entre relanzamientos fallidos: 5 s, 10 s, 20 s… hasta 2 min.
pub fn respiro_relanzar(fallos: u32) -> Duration {
    Duration::from_secs((5u64 << fallos.min(5)).min(120))
}

/// Cuánto esperar al Studio al arrancar antes de caer al embebido.
pub fn espera_studio_al_arrancar(ultimo: Option<&str>) -> Duration {
    if ultimo == Some("studio") { ESPERA_STUDIO_AL_ARRANCAR } else { Duration::ZERO }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PasoVentana {
    /// Mandarle (o repetirle) el aviso de mudanza.
    Avisar,
    /// Esperar a que la web termine (respondió y su servidor sigue vivo, o aún no vence el plazo).
    Esperar,
    /// Navegarla ya, sin traspaso.
    Forzar,
}

/// Qué hacer con una ventana que sigue en el origen viejo.
/// `avisada`: hace cuánto se le avisó por primera vez; `respondio`: dijo «recibido»; `urgente`: hace cuánto se sabe
/// que su servidor está muerto (None = vivo).
pub fn paso_ventana(avisada: Option<Duration>, respondio: bool, urgente: Option<Duration>) -> PasoVentana {
    let Some(desde) = avisada else { return PasoVentana::Avisar };
    if !respondio {
        return if desde >= PLAZO_SIN_RESPUESTA { PasoVentana::Forzar } else { PasoVentana::Esperar };
    }
    match urgente {
        Some(t) if t >= PLAZO_URGENTE => PasoVentana::Forzar,
        _ => PasoVentana::Esperar,
    }
}

/// ¿Esta URL de ventana está en otro origen local distinto del servidor vigente? (splash y páginas propias de la
/// app no son http y no se tocan.)
pub fn fuera_de_origen(url_ventana: &Url, vigente: &Url) -> bool {
    matches!(url_ventana.scheme(), "http" | "https")
        && es_origen_local(url_ventana)
        && url_ventana.origin() != vigente.origin()
}

/// Ruta (path + query + fragmento) que la ventana conserva al mudarse. Solo rutas absolutas del mismo sitio.
pub fn ruta_segura(ruta: &str) -> Option<&str> {
    (ruta.starts_with('/') && !ruta.starts_with("//") && !ruta.contains('\\') && ruta.len() <= 6000).then_some(ruta)
}

pub fn ruta_de(url: &Url) -> String {
    let mut r = url.path().to_string();
    if let Some(q) = url.query() { r.push('?'); r.push_str(q); }
    if let Some(f) = url.fragment() { r.push('#'); r.push_str(f); }
    r
}

/// Destino de una ventana: el origen vigente con su ruta. Las ventanas desprendidas solo pueden vivir en `/panel…`.
pub fn destino(vigente: &Url, etiqueta: &str, ruta: &str) -> Option<Url> {
    let ruta = ruta_segura(ruta)?;
    if crate::ventanas::es_desprendida(etiqueta) && !(ruta == "/panel" || ruta.starts_with("/panel?") || ruta.starts_with("/panel/")) {
        return None;
    }
    let url = vigente.join(ruta).ok()?;
    (url.origin() == vigente.origin()).then_some(url)
}

// ---------------------------------------------------------------------------------------------------------------
// Estado y vigilante
// ---------------------------------------------------------------------------------------------------------------

struct Aviso {
    desde: Instant,
    respondio: bool,
}

#[derive(Default)]
pub struct Mudanza {
    avisos: Mutex<HashMap<String, Aviso>>,
    traspaso: Mutex<Option<(Instant, String)>>,
    /// Servidor del origen que se deja (sus ventanas aún pueden estar ahí).
    anterior: Mutex<Option<String>>,
    /// Desde cuándo ese servidor está muerto (para las ventanas que aún no se van).
    viejo_muerto: Mutex<Option<Instant>>,
}

fn puerto_abierto(port: u16) -> bool {
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&addr, Duration::from_millis(800)).is_ok()
}

fn puerto_de(url: &str) -> Option<u16> {
    Url::parse(url).ok()?.port_or_known_default()
}

/// ¿Sigue vivo el servidor en uso? El hijo gestionado que salió está muerto aunque otro proceso tome su puerto.
fn actual_vivo(app: &AppHandle, info: &LocalServerInfo) -> bool {
    if info.managed {
        let estado = app.state::<LocalServerState>();
        let salio = estado.child.lock().map(|mut c| match c.as_mut() {
            Some(hijo) => !hijo.vivo(),
            None => true,
        });
        if salio.unwrap_or(false) {
            return false;
        }
    }
    info.ready && puerto_de(&info.url).is_some_and(puerto_abierto)
}

/// Arranca el hilo vigilante (una vez, tras crear la ventana principal).
pub fn vigilar(app: AppHandle) {
    thread::spawn(move || {
        let mut studio_sanos = 0u32;
        let mut caidas = 0u32;
        let mut fallos_relanzar = 0u32;
        let mut proximo_relanzar = Instant::now();
        let mut ultimo_sondeo_studio = Instant::now() - Duration::from_secs(60);
        loop {
            thread::sleep(TICK);
            let info = local_server_info(&app);
            let studio = studio_web_port();
            let en_studio = info.mode == "studio";
            let modo = if en_studio { Modo::Studio } else { Modo::Provisional };

            let vivo = actual_vivo(&app, &info);
            caidas = if vivo { 0 } else { caidas.saturating_add(1) };

            // El Studio se sondea solo en provisional y cada 10 s (is_http_healthy puede tardar hasta 6 s).
            if !en_studio {
                if let Some(port) = studio {
                    if ultimo_sondeo_studio.elapsed() >= Duration::from_secs(10) || !vivo {
                        ultimo_sondeo_studio = Instant::now();
                        studio_sanos = if is_http_healthy(port) { studio_sanos + 1 } else { 0 };
                    }
                } else {
                    studio_sanos = 0;
                }
            } else {
                studio_sanos = 0;
            }

            let accion = decidir(modo, Senales {
                studio_configurado: studio.is_some(),
                studio_sanos_seguidos: studio_sanos,
                actual_caidas_seguidas: caidas,
                relanzar_permitido: Instant::now() >= proximo_relanzar,
            });
            match accion {
                Accion::Nada => {}
                Accion::VolverAlStudio => {
                    let port = studio.expect("studio configurado");
                    eprintln!("[arbrain] el Studio volvió: las ventanas se mudan a {}", local_server_url(port));
                    recordar_ultimo_servidor(&app, "studio");
                    set_local_server_info(&app, LocalServerInfo::studio(port));
                    reiniciar_mudanza(&app, &info.url, !vivo);
                    studio_sanos = 0;
                    caidas = 0;
                }
                Accion::RelanzarEmbebido | Accion::CaerAlEmbebido => {
                    eprintln!("[arbrain] el servidor {} no responde: se levanta el embebido", info.url);
                    match lanzar_embebido(&app, local_server_port()) {
                        Ok(nuevo) => {
                            fallos_relanzar = 0;
                            let cambia_origen = nuevo.url != info.url;
                            set_local_server_info(&app, nuevo);
                            if cambia_origen { reiniciar_mudanza(&app, &info.url, true); }
                            caidas = 0;
                        }
                        Err(e) => {
                            eprintln!("[arbrain] el embebido no arrancó: {e}");
                            fallos_relanzar += 1;
                            proximo_relanzar = Instant::now() + respiro_relanzar(fallos_relanzar);
                        }
                    }
                }
            }
            reconciliar(&app);
            asegurar_ventana_principal(&app);
        }
    });
}

/// Si el arranque falló (ni Studio ni embebido) y ahora hay servidor, nace la ventana principal y se va el splash.
fn asegurar_ventana_principal(app: &AppHandle) {
    let info = local_server_info(app);
    if !info.ready || app.get_webview_window("main").is_some() { return; }
    let h = app.clone();
    let _ = app.run_on_main_thread(move || {
        if h.get_webview_window("main").is_some() { return; }
        let _ = create_main_window(&h, &info.url);
        if let Some(splash) = h.get_webview_window("splash") { let _ = splash.destroy(); }
    });
}

/// Empieza una mudanza nueva desde `anterior`: olvida avisos previos. `viejo_muerto` = ese servidor ya no contesta.
fn reiniciar_mudanza(app: &AppHandle, anterior: &str, viejo_muerto: bool) {
    let m = app.state::<Mudanza>();
    m.avisos.lock().unwrap_or_else(|e| e.into_inner()).clear();
    *m.anterior.lock().unwrap_or_else(|e| e.into_inner()) = Some(anterior.to_string());
    *m.viejo_muerto.lock().unwrap_or_else(|e| e.into_inner()) = viejo_muerto.then(Instant::now);
    reconciliar(app);
}

/// Lleva cada ventana al origen vigente: avisa, espera o fuerza según `paso_ventana`.
fn reconciliar(app: &AppHandle) {
    let info = local_server_info(app);
    let Ok(vigente) = Url::parse(&info.url) else { return };
    if !info.ready { return; }
    let m = app.state::<Mudanza>();
    // ¿Murió el servidor que se deja? Entonces las ventanas que siguen ahí no tienen nada que esperar.
    let anterior = m.anterior.lock().unwrap_or_else(|e| e.into_inner()).clone();
    {
        let mut viejo = m.viejo_muerto.lock().unwrap_or_else(|e| e.into_inner());
        let vivo = anterior.as_deref().and_then(puerto_de).is_none_or(puerto_abierto);
        if !vivo && viejo.is_none() { *viejo = Some(Instant::now()); }
    }
    let urgente = *m.viejo_muerto.lock().unwrap_or_else(|e| e.into_inner());
    let mut pendientes = 0;
    for (etiqueta, w) in app.webview_windows() {
        let Ok(url) = w.url() else { continue };
        if !fuera_de_origen(&url, &vigente) { continue; }
        // El fantasma del arrastre se recrea solo desde la ventana que lo pide, ya en el origen nuevo.
        if etiqueta == "fantasma" { let _ = w.destroy(); continue; }
        pendientes += 1;
        let (avisada, respondio) = {
            let avisos = m.avisos.lock().unwrap_or_else(|e| e.into_inner());
            avisos.get(&etiqueta).map(|a| (Some(a.desde.elapsed()), a.respondio)).unwrap_or((None, false))
        };
        match paso_ventana(avisada, respondio, urgente.map(|t| t.elapsed())) {
            PasoVentana::Avisar => {
                avisar(&w, &vigente, &etiqueta, urgente.is_some());
                m.avisos.lock().unwrap_or_else(|e| e.into_inner()).insert(etiqueta, Aviso { desde: Instant::now(), respondio: false });
            }
            // Se repite el aviso: la web solo guarda la última urgencia y el destino (idempotente).
            PasoVentana::Esperar => avisar(&w, &vigente, &etiqueta, urgente.is_some()),
            PasoVentana::Forzar => {
                eprintln!("[arbrain] la ventana {etiqueta} no se mudó sola: se navega a {}", vigente);
                if let Some(dest) = destino(&vigente, &etiqueta, &ruta_de(&url)).or_else(|| destino(&vigente, &etiqueta, if crate::ventanas::es_desprendida(&etiqueta) { "/panel" } else { "/" })) {
                    let _ = w.navigate(dest);
                }
                m.avisos.lock().unwrap_or_else(|e| e.into_inner()).remove(&etiqueta);
            }
        }
    }
    if pendientes == 0 {
        m.avisos.lock().unwrap_or_else(|e| e.into_inner()).clear();
        *m.anterior.lock().unwrap_or_else(|e| e.into_inner()) = None;
        *m.viejo_muerto.lock().unwrap_or_else(|e| e.into_inner()) = None;
        // Ya nadie usa el embebido: si era hijo nuestro y la app volvió al Studio, se apaga.
        if info.mode == "studio" { crate::stop_local_server(app); }
    }
}

fn avisar(w: &WebviewWindow, vigente: &Url, etiqueta: &str, urgente: bool) {
    let detalle = json!({
        "destino": vigente.origin().ascii_serialization(),
        // Los borradores y la fila son del origen, no de la ventana: los entrega solo la principal.
        "exportar": etiqueta == "main",
        "urgente": urgente,
    });
    let _ = w.eval(&format!("window.dispatchEvent(new CustomEvent('arbrain:mudar-servidor',{{detail:{detalle}}}))"));
}

// ---------------------------------------------------------------------------------------------------------------
// Comandos que usa la web
// ---------------------------------------------------------------------------------------------------------------

/// La web recibió el aviso y se mudará sola en cuanto sea seguro.
#[tauri::command]
pub fn servidor_mudanza_recibida(app: AppHandle, webview: WebviewWindow) {
    let m = app.state::<Mudanza>();
    let mut avisos = m.avisos.lock().unwrap_or_else(|e| e.into_inner());
    avisos.entry(webview.label().to_string()).or_insert(Aviso { desde: Instant::now(), respondio: true }).respondio = true;
}

/// La web ya guardó lo suyo: deja el traspaso (si lo trae) y pide ir al origen vigente con `ruta`.
#[tauri::command]
pub fn servidor_mudanza_lista(app: AppHandle, webview: WebviewWindow, ruta: String, traspaso: Option<String>) -> Result<(), String> {
    let info = local_server_info(&app);
    let vigente = Url::parse(&info.url).map_err(|e| e.to_string())?;
    let actual = webview.url().map_err(|e| e.to_string())?;
    if !fuera_de_origen(&actual, &vigente) {
        return Ok(()); // ya está donde debe (aviso viejo)
    }
    if let Some(t) = traspaso {
        if t.len() > TOPE_TRASPASO { return Err("traspaso demasiado grande".into()); }
        *app.state::<Mudanza>().traspaso.lock().unwrap_or_else(|e| e.into_inner()) = Some((Instant::now(), t));
    }
    let etiqueta = webview.label().to_string();
    let dest = destino(&vigente, &etiqueta, &ruta).ok_or("ruta no permitida")?;
    app.state::<Mudanza>().avisos.lock().unwrap_or_else(|e| e.into_inner()).remove(&etiqueta);
    webview.navigate(dest).map_err(|e| e.to_string())
}

/// En el origen nuevo: entrega (una vez) los borradores y la fila que trajo la mudanza.
#[tauri::command]
pub fn servidor_traspaso_tomar(app: AppHandle, webview: WebviewWindow) -> Option<String> {
    let info = local_server_info(&app);
    let vigente = Url::parse(&info.url).ok()?;
    let actual = webview.url().ok()?;
    // Solo lo toma una página del origen vigente (no una que aún no se muda).
    if actual.origin() != vigente.origin() { return None; }
    let (desde, t) = app.state::<Mudanza>().traspaso.lock().unwrap_or_else(|e| e.into_inner()).take()?;
    (desde.elapsed() <= VIGENCIA_TRASPASO).then_some(t)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s() -> Senales {
        Senales { studio_configurado: true, studio_sanos_seguidos: 0, actual_caidas_seguidas: 0, relanzar_permitido: true }
    }

    #[test]
    fn provisional_vuelve_al_studio_con_dos_sondeos_sanos_seguidos() {
        assert_eq!(decidir(Modo::Provisional, Senales { studio_sanos_seguidos: 1, ..s() }), Accion::Nada);
        assert_eq!(decidir(Modo::Provisional, Senales { studio_sanos_seguidos: 2, ..s() }), Accion::VolverAlStudio);
        // Sin Studio configurado (MacBook, cliente sin Studio) el embebido es el destino normal.
        assert_eq!(decidir(Modo::Provisional, Senales { studio_configurado: false, studio_sanos_seguidos: 9, ..s() }), Accion::Nada);
    }

    #[test]
    fn el_studio_sano_le_gana_a_relanzar() {
        // 11 oct: 3218 muerto con el Studio sano = volver al Studio, no levantar otro embebido.
        let senales = Senales { studio_sanos_seguidos: 2, actual_caidas_seguidas: 5, ..s() };
        assert_eq!(decidir(Modo::Provisional, senales), Accion::VolverAlStudio);
    }

    #[test]
    fn provisional_muerto_sin_studio_relanza_el_embebido() {
        assert_eq!(decidir(Modo::Provisional, Senales { actual_caidas_seguidas: 1, ..s() }), Accion::Nada);
        assert_eq!(decidir(Modo::Provisional, Senales { actual_caidas_seguidas: 2, ..s() }), Accion::RelanzarEmbebido);
        assert_eq!(decidir(Modo::Provisional, Senales { actual_caidas_seguidas: 2, relanzar_permitido: false, ..s() }), Accion::Nada);
        assert_eq!(decidir(Modo::Provisional, Senales { studio_configurado: false, actual_caidas_seguidas: 2, ..s() }), Accion::RelanzarEmbebido);
    }

    #[test]
    fn el_studio_no_se_abandona_por_un_deploy() {
        // ~30 s de puerto cerrado (6 ticks) no mueve a nadie de origen.
        assert_eq!(decidir(Modo::Studio, Senales { actual_caidas_seguidas: 6, ..s() }), Accion::Nada);
        assert_eq!(decidir(Modo::Studio, Senales { actual_caidas_seguidas: CAIDAS_STUDIO_PARA_DEJARLO - 1, ..s() }), Accion::Nada);
        assert_eq!(decidir(Modo::Studio, Senales { actual_caidas_seguidas: CAIDAS_STUDIO_PARA_DEJARLO, ..s() }), Accion::CaerAlEmbebido);
    }

    #[test]
    fn respiro_crece_y_tiene_techo() {
        assert_eq!(respiro_relanzar(0), Duration::from_secs(5));
        assert_eq!(respiro_relanzar(1), Duration::from_secs(10));
        assert_eq!(respiro_relanzar(3), Duration::from_secs(40));
        assert_eq!(respiro_relanzar(9), Duration::from_secs(120));
    }

    #[test]
    fn al_arrancar_se_espera_al_studio_si_fue_el_ultimo() {
        // El deploy del 11 oct tardó 30 s: 8 intentos instantáneos (puerto cerrado) no alcanzaban.
        assert!(espera_studio_al_arrancar(Some("studio")) >= Duration::from_secs(40));
        assert_eq!(espera_studio_al_arrancar(Some("embebido")), Duration::ZERO);
        assert_eq!(espera_studio_al_arrancar(None), Duration::ZERO);
    }

    #[test]
    fn ventana_avisa_espera_o_se_fuerza() {
        assert_eq!(paso_ventana(None, false, None), PasoVentana::Avisar);
        assert_eq!(paso_ventana(Some(Duration::from_secs(5)), false, None), PasoVentana::Esperar);
        // Web anterior a este mecanismo: no contesta y se navega sin traspaso.
        assert_eq!(paso_ventana(Some(PLAZO_SIN_RESPUESTA), false, None), PasoVentana::Forzar);
        // Contestó y su servidor vive: espera su momento seguro sin límite (Daniel está trabajando ahí).
        assert_eq!(paso_ventana(Some(Duration::from_secs(3600)), true, None), PasoVentana::Esperar);
        // Contestó pero su servidor murió: un minuto para entregar sus borradores y luego se mueve.
        assert_eq!(paso_ventana(Some(Duration::from_secs(3600)), true, Some(Duration::from_secs(10))), PasoVentana::Esperar);
        assert_eq!(paso_ventana(Some(Duration::from_secs(3600)), true, Some(PLAZO_URGENTE)), PasoVentana::Forzar);
    }

    #[test]
    fn solo_se_mudan_ventanas_http_locales_de_otro_origen() {
        let studio = Url::parse("http://127.0.0.1:3300").unwrap();
        assert!(fuera_de_origen(&Url::parse("http://127.0.0.1:3218/chat").unwrap(), &studio));
        assert!(!fuera_de_origen(&Url::parse("http://127.0.0.1:3300/chat?x=1").unwrap(), &studio));
        assert!(!fuera_de_origen(&Url::parse("tauri://localhost/splash.html").unwrap(), &studio));
        assert!(!fuera_de_origen(&Url::parse("https://example.com/").unwrap(), &studio));
    }

    #[test]
    fn la_ruta_se_conserva_y_no_escapa_del_origen() {
        let studio = Url::parse("http://127.0.0.1:3300").unwrap();
        let u = Url::parse("http://127.0.0.1:3218/chat?s=abc#fin").unwrap();
        assert_eq!(ruta_de(&u), "/chat?s=abc#fin");
        assert_eq!(destino(&studio, "main", "/chat?s=abc#fin").unwrap().as_str(), "http://127.0.0.1:3300/chat?s=abc#fin");
        assert!(destino(&studio, "main", "//evil.com/x").is_none());
        assert!(destino(&studio, "main", "https://evil.com/").is_none());
        assert!(destino(&studio, "main", "chat").is_none());
        // Una ventana desprendida solo vive en /panel.
        assert!(destino(&studio, "vista-ventana-1", "/panel?ventana=1").is_some());
        assert!(destino(&studio, "vista-ventana-1", "/chat").is_none());
    }
}
