//! Autocuración de la edición cliente (resiliencia, 12 oct 2026).
//!
//! El alumno no tiene a nadie mirando logs: Arbrain se repara solo o le dice exactamente qué hacer. Antes de esto el
//! daemon tenía supervisor (`daemon.rs`) pero el servidor web (Next) no tenía ninguno: si moría, la ventana quedaba
//! sin servidor hasta cerrar la app. Y cuando el daemon agotaba sus reinicios, el supervisor se pausaba sin que la UI
//! lo dijera.
//!
//! Aquí vive lo puro (decisión del supervisor del web y el estado visible verde / reparando / necesito ayuda), con sus
//! pruebas. El hilo que sondea y relanza vive en `lib.rs` (`vigilar_web_cliente`) porque usa su estado privado.

use std::sync::atomic::AtomicBool;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::daemon::DaemonInfo;

/// Sondeo del web: cada 5 s, `GET /api/version` (público, sin base ni daemon) con plazo de 4 s.
pub const CADA: Duration = Duration::from_secs(5);
pub const PLAZO_SONDA: Duration = Duration::from_secs(4);
/// Fallos seguidos con el proceso vivo antes de reiniciar (colgado ≈ 15 s). Muerto = de inmediato.
pub const FALLOS_PARA_REINICIAR: u32 = 3;
/// Freno anti-bucle: como el daemon, máx. 5 reinicios en 5 minutos; después «necesito ayuda».
pub const MAX_REINICIOS: usize = 5;
pub const VENTANA_REINICIOS: Duration = Duration::from_secs(300);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Paso {
    /// Sano.
    Nada,
    /// Vivo pero sin contestar: se le dan unas vueltas más.
    Esperar,
    /// Muerto o colgado: relanzar en el mismo puerto.
    Reiniciar,
    /// Agotó los reinicios: se deja de reintentar solo y se pide ayuda a la persona.
    Pausa,
}

/// `fallos` = sondas fallidas seguidas, contando la actual.
pub fn decidir(sano: bool, vivo: bool, fallos: u32, reinicios_recientes: usize) -> Paso {
    if sano {
        return Paso::Nada;
    }
    if vivo && fallos < FALLOS_PARA_REINICIAR {
        return Paso::Esperar;
    }
    if reinicios_recientes >= MAX_REINICIOS {
        return Paso::Pausa;
    }
    Paso::Reiniciar
}

/// Estado del supervisor del web (lo lee `salud_app`).
#[derive(Default)]
pub struct WebSalud {
    pub reparando: AtomicBool,
    pub pausado: AtomicBool,
    pub apagando: AtomicBool,
    pub reinicios: Mutex<Vec<Instant>>,
    pub ultimo_error: Mutex<Option<String>>,
}

/// Lo que la UI pinta (comando `salud_app`). `estado` ∈ `ok` · `reparando` · `ayuda`.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SaludApp {
    pub estado: &'static str,
    pub mensaje: Option<String>,
    /// `reintentar` = la UI muestra el botón que llama `salud_reintentar`.
    pub accion: Option<&'static str>,
    pub daemon_listo: bool,
    pub web_listo: bool,
    pub reinicios_daemon: usize,
    pub reinicios_web: usize,
}

/// Juicio puro del estado visible. La ventana puede pintarlo aunque el web esté caído: llega por IPC, no por Next.
pub fn estado(daemon: &DaemonInfo, web_listo: bool, web_reparando: bool, web_pausado: bool, reinicios_web: usize) -> SaludApp {
    let base = |estado, mensaje: Option<String>, accion| SaludApp {
        estado,
        mensaje,
        accion,
        daemon_listo: daemon.ready,
        web_listo,
        reinicios_daemon: daemon.reinicios,
        reinicios_web,
    };
    if daemon.pausado || web_pausado {
        let que = match (daemon.pausado, web_pausado) {
            (true, true) => "el motor y la ventana de Arbrain se cayeron",
            (true, false) => "el motor de Arbrain se cayó",
            _ => "la ventana de Arbrain se cayó",
        };
        return base(
            "ayuda",
            Some(format!(
                "Necesito ayuda: {} varias veces seguidas y ya no lo reintento solo. Toca «Reintentar». Si vuelve a pasar, cierra Arbrain y ábrelo de nuevo. Tus conversaciones y mensajes guardados no se pierden.",
                que
            )),
            Some("reintentar"),
        );
    }
    if !daemon.ready || !web_listo || web_reparando {
        let que = if !daemon.ready { "el motor" } else { "la ventana" };
        let veces = daemon.reinicios + reinicios_web;
        let mensaje = if veces == 0 && !web_reparando {
            "Arbrain está arrancando…".to_string()
        } else {
            format!("Reparando {} de Arbrain; vuelve solo en unos segundos. Tus mensajes quedan guardados y salen en cuanto vuelva.", que)
        };
        return base("reparando", Some(mensaje), None);
    }
    base("ok", None, None)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn daemon(ready: bool, reinicios: usize, pausado: bool) -> DaemonInfo {
        DaemonInfo { ready, reinicios, pausado, ..Default::default() }
    }

    #[test]
    fn web_muerto_se_reinicia_de_inmediato_colgado_tras_tres_sondas() {
        assert_eq!(decidir(true, true, 0, 0), Paso::Nada);
        assert_eq!(decidir(false, false, 1, 0), Paso::Reiniciar);
        assert_eq!(decidir(false, true, 1, 0), Paso::Esperar);
        assert_eq!(decidir(false, true, 2, 0), Paso::Esperar);
        assert_eq!(decidir(false, true, 3, 0), Paso::Reiniciar);
    }

    #[test]
    fn freno_anti_bucle_pasa_a_pedir_ayuda() {
        assert_eq!(decidir(false, false, 1, MAX_REINICIOS - 1), Paso::Reiniciar);
        assert_eq!(decidir(false, false, 1, MAX_REINICIOS), Paso::Pausa);
        assert_eq!(decidir(true, true, 0, MAX_REINICIOS), Paso::Nada);
    }

    #[test]
    fn detecta_y_actua_en_menos_de_un_minuto() {
        // Peor caso: colgado vivo. 3 sondas × (intervalo + plazo) < 60 s.
        let peor = (CADA + PLAZO_SONDA) * FALLOS_PARA_REINICIAR;
        assert!(peor < Duration::from_secs(60), "{:?}", peor);
    }

    #[test]
    fn estado_visible_verde_reparando_ayuda() {
        let ok = estado(&daemon(true, 0, false), true, false, false, 0);
        assert_eq!(ok.estado, "ok");
        assert!(ok.mensaje.is_none());

        let arrancando = estado(&daemon(false, 0, false), true, false, false, 0);
        assert_eq!(arrancando.estado, "reparando");
        assert_eq!(arrancando.mensaje.as_deref(), Some("Arbrain está arrancando…"));

        let motor = estado(&daemon(false, 2, false), true, false, false, 0);
        assert_eq!(motor.estado, "reparando");
        assert!(motor.mensaje.unwrap().contains("Reparando el motor"));

        let ventana = estado(&daemon(true, 0, false), false, true, false, 1);
        assert!(ventana.mensaje.unwrap().contains("Reparando la ventana"));

        let ayuda = estado(&daemon(false, 5, true), true, false, false, 0);
        assert_eq!(ayuda.estado, "ayuda");
        assert_eq!(ayuda.accion, Some("reintentar"));
        let texto = ayuda.mensaje.unwrap();
        assert!(texto.contains("Reintentar") && texto.contains("cierra Arbrain"), "{}", texto);
        assert!(!texto.contains("log"), "al alumno no se le manda a leer logs: {}", texto);
    }
}
