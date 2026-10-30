//! Llaves del alumno (BYOK) en el llavero del sistema (AUDITORIA I9).
//!
//! macOS: Keychain · Windows: Credential Manager · Linux: Secret Service (GNOME Keyring, KWallet).
//! Las llaves nunca se escriben a disco ni a logs y nunca vuelven completas a la web: la pantalla solo recibe si
//! existen y una vista enmascarada. La app las lee al lanzar el daemon y se las pasa como variables de entorno.
//! Cambiar una llave reinicia el daemon para que la tome.
//!
//! Solo tres nombres, cerrados: no hay acceso genérico al llavero. Las dos del chat (Anthropic, OpenRouter) y, desde el
//! 21 oct 2026, la de voz (Groq, para dictar). La de voz nunca cuenta como «listo»: con ella sola Levy no conversa.
//!
//! 12 oct 2026 (decisión del autor): Arbrain no pide, guarda ni pasa tokens de la suscripción de claude.ai
//! (`CLAUDE_CODE_OAUTH_TOKEN`). El nombre ya no se acepta para guardar, leer ni lanzar el daemon; una entrada vieja de
//! una versión de prueba anterior queda inerte (nadie la lee) y la persona puede borrarla desde su llavero.

use serde::Serialize;

/// Nombres permitidos = nombre de la variable de entorno que recibe el daemon.
pub const LLAVES: [&str; 3] = ["ANTHROPIC_API_KEY", "OPENROUTER_API_KEY", "GROQ_API_KEY"];
/// Las que permiten conversar con Claude. Basta una.
pub const LLAVES_CHAT: [&str; 2] = ["ANTHROPIC_API_KEY", "OPENROUTER_API_KEY"];

/// ¿Hay con qué hablar con Claude? Solo cuentan las llaves del chat (la de voz no).
pub fn listo_de(llaves: &[EstadoLlave]) -> bool {
    llaves.iter().any(|l| l.presente && LLAVES_CHAT.contains(&l.nombre.as_str()))
}

/// Largo máximo aceptado (una llave real mide < 300; esto evita guardar basura enorme en el llavero).
const LARGO_MAXIMO: usize = 4096;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EstadoLlave {
    pub nombre: String,
    pub presente: bool,
    /// `sk-ant-…a1B2`: prefijo y últimos 4. Nunca el valor completo.
    pub vista: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EstadoLlaves {
    pub llaves: Vec<EstadoLlave>,
    /// Hay con qué hablar con Claude: API key de Anthropic o de OpenRouter.
    pub listo: bool,
    /// Backend del llavero de este sistema («macos-keychain», «windows-credential-manager», «linux-secret-service»).
    pub almacen: &'static str,
    /// El llavero respondió. `false` = el sistema no tiene llavero disponible (p. ej. Linux sin Secret Service).
    pub disponible: bool,
    pub error: Option<String>,
}

pub fn nombre_valido(nombre: &str) -> bool {
    LLAVES.iter().any(|n| *n == nombre)
}

pub const fn almacen() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos-keychain"
    } else if cfg!(target_os = "windows") {
        "windows-credential-manager"
    } else if cfg!(target_os = "linux") {
        "linux-secret-service"
    } else {
        "no-soportado"
    }
}

/// Limpia lo pegado: espacios, saltos de línea y comillas alrededor. Rechaza vacío, enorme o con caracteres de control.
pub fn normalizar(valor: &str) -> Result<String, String> {
    let limpio = valor.trim().trim_matches('"').trim_matches('\'').trim();
    if limpio.is_empty() {
        return Err("La llave está vacía.".into());
    }
    if limpio.len() > LARGO_MAXIMO {
        return Err("La llave es demasiado larga.".into());
    }
    if limpio.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return Err("La llave tiene espacios o saltos de línea en medio.".into());
    }
    Ok(limpio.to_string())
}

/// Vista enmascarada: hasta 7 caracteres de prefijo (p. ej. `sk-ant-`) y los últimos 4.
pub fn enmascarar(valor: &str) -> String {
    let chars: Vec<char> = valor.chars().collect();
    if chars.len() <= 12 {
        return "••••".to_string();
    }
    let prefijo: String = chars.iter().take(7).collect();
    let fin: String = chars[chars.len() - 4..].iter().collect();
    format!("{}…{}", prefijo, fin)
}

/// Solo la edición del alumno (`ai.arbrain.app`) usa el llavero. La edición original (la instalación del autor)
/// no tiene llaves BYOK: ningún camino la toca, porque con firma ad-hoc macOS pediría la contraseña del llavero
/// («Arbrain quiere acceder a la llave…») por algo que no le corresponde.
pub const NO_APLICA: &str = "Las llaves del llavero no aplican en esta edición de Arbrain.";

fn aplica() -> bool {
    crate::desktop_env::EDICION_CLIENTE
}

fn entrada(servicio: &str, nombre: &str) -> Result<keyring::Entry, String> {
    if !aplica() {
        return Err(NO_APLICA.into());
    }
    keyring::Entry::new(servicio, nombre).map_err(|e| e.to_string())
}

pub fn leer(servicio: &str, nombre: &str) -> Result<Option<String>, String> {
    match entrada(servicio, nombre)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn guardar(servicio: &str, nombre: &str, valor: &str) -> Result<(), String> {
    if !nombre_valido(nombre) {
        return Err("Llave no permitida.".into());
    }
    let valor = normalizar(valor)?;
    entrada(servicio, nombre)?.set_password(&valor).map_err(|e| e.to_string())
}

pub fn borrar(servicio: &str, nombre: &str) -> Result<(), String> {
    if !nombre_valido(nombre) {
        return Err("Llave no permitida.".into());
    }
    match entrada(servicio, nombre)?.delete_credential() {
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Plazo para leer el llavero al lanzar el daemon. El sistema puede mostrar un diálogo («Arbrain quiere usar tu
/// llavero»), sobre todo tras actualizar la app: se espera a la persona, pero nunca para siempre.
const PLAZO_LLAVERO: std::time::Duration = std::time::Duration::from_secs(45);

/// Las llaves presentes, para inyectarlas como entorno del daemon. Un fallo del llavero se trata como «sin llave»
/// (el daemon arranca y pide la llave en el chat). Solo en compilaciones de desarrollo, `ARBRAIN_SIN_LLAVERO=1`
/// salta el llavero (pruebas con HOME temporal, donde macOS no encuentra el llavero de sesión y pregunta).
pub fn para_daemon(servicio: &str) -> Vec<(String, String)> {
    if !aplica() {
        return Vec::new();
    }
    if cfg!(debug_assertions) && std::env::var("ARBRAIN_SIN_LLAVERO").is_ok_and(|v| v == "1") {
        return Vec::new();
    }
    let servicio = servicio.to_string();
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let llaves: Vec<(String, String)> = LLAVES
            .iter()
            .filter_map(|n| leer(&servicio, n).ok().flatten().map(|v| (n.to_string(), v)))
            .collect();
        let _ = tx.send(llaves);
    });
    rx.recv_timeout(PLAZO_LLAVERO).unwrap_or_else(|_| {
        eprintln!("[arbrain] el llavero no respondió en {} s: el daemon arranca sin llaves", PLAZO_LLAVERO.as_secs());
        Vec::new()
    })
}

pub fn estado(servicio: &str) -> EstadoLlaves {
    if !aplica() {
        return EstadoLlaves {
            llaves: LLAVES.iter().map(|n| EstadoLlave { nombre: n.to_string(), presente: false, vista: None }).collect(),
            listo: false,
            almacen: almacen(),
            disponible: false,
            error: Some(NO_APLICA.into()),
        };
    }
    let mut error = None;
    let mut disponible = true;
    let llaves: Vec<EstadoLlave> = LLAVES
        .iter()
        .map(|n| match leer(servicio, n) {
            Ok(v) => EstadoLlave { nombre: n.to_string(), presente: v.is_some(), vista: v.as_deref().map(enmascarar) },
            Err(e) => {
                disponible = false;
                error.get_or_insert(e);
                EstadoLlave { nombre: n.to_string(), presente: false, vista: None }
            }
        })
        .collect();
    let listo = listo_de(&llaves);
    EstadoLlaves { llaves, listo, almacen: almacen(), disponible, error }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn solo_tres_nombres() {
        assert!(nombre_valido("ANTHROPIC_API_KEY"));
        assert!(nombre_valido("OPENROUTER_API_KEY"));
        assert!(nombre_valido("GROQ_API_KEY"));
        assert!(!nombre_valido("LEMONFOX_API_KEY"));
        // Nunca un token de la suscripción de claude.ai.
        assert!(!nombre_valido("CLAUDE_CODE_OAUTH_TOKEN"));
        assert!(!nombre_valido("ANTHROPIC_AUTH_TOKEN"));
        assert!(!nombre_valido("SUPABASE_SERVICE_ROLE_KEY"));
        assert!(!nombre_valido("anthropic_api_key"));
        assert!(!nombre_valido(""));
    }

    #[test]
    fn la_llave_de_voz_sola_no_deja_conversar() {
        let e = |nombre: &str, presente: bool| EstadoLlave { nombre: nombre.into(), presente, vista: None };
        assert!(!listo_de(&[e("ANTHROPIC_API_KEY", false), e("OPENROUTER_API_KEY", false), e("GROQ_API_KEY", true)]));
        assert!(listo_de(&[e("OPENROUTER_API_KEY", true), e("GROQ_API_KEY", false)]));
        assert!(listo_de(&[e("ANTHROPIC_API_KEY", true)]));
    }

    #[test]
    fn normaliza_lo_pegado() {
        assert_eq!(normalizar("  sk-ant-abc123\n").unwrap(), "sk-ant-abc123");
        assert_eq!(normalizar("\"sk-or-v1-xyz\"").unwrap(), "sk-or-v1-xyz");
        assert!(normalizar("   ").is_err());
        assert!(normalizar("sk-ant abc").is_err());
        assert!(normalizar(&"a".repeat(5000)).is_err());
    }

    #[test]
    fn la_vista_nunca_trae_la_llave() {
        let llave = "sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-wxyz";
        let vista = enmascarar(llave);
        assert_eq!(vista, "sk-ant-…wxyz");
        assert!(!vista.contains("ABCDEFG"));
        assert_eq!(enmascarar("corta"), "••••");
    }

    #[test]
    fn la_edicion_original_nunca_toca_el_llavero() {
        // Estos tests corren en la edición original: ningún camino llega a keyring (sin diálogo del llavero).
        if aplica() {
            return;
        }
        // Cualquier servicio da igual: en la edición original `aplica()` corta antes de abrir el llavero.
        let servicio = "ai.arbrain.edicion-original";
        assert_eq!(leer(servicio, "OPENROUTER_API_KEY"), Err(NO_APLICA.to_string()));
        assert!(para_daemon(servicio).is_empty());
        let e = estado(servicio);
        assert!(!e.listo && !e.disponible && e.llaves.iter().all(|l| !l.presente));
        assert_eq!(e.error.as_deref(), Some(NO_APLICA));
    }

    #[test]
    fn rechaza_nombres_ajenos_sin_tocar_el_llavero() {
        assert!(guardar("ai.arbrain.app.test", "PATH", "x").is_err());
        assert!(borrar("ai.arbrain.app.test", "HOME").is_err());
    }
}
