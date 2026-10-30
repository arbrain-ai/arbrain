//! El motor de Arbrain: un solo dueño de las PTYs inmortales.
//!
//! - `server`: hostea PTYs, espejo VT sin cabeza, relevo sin matar.
//! - `proto`: el cable de `sfterm-ptyd` PROTO 1 + operaciones aditivas.
//! - `client`: saber si hay motor y levantarlo desacoplado (lo usa el escritorio).

pub mod client;
pub mod fdpass;
pub mod procinfo;
pub mod proto;
pub mod responder;
pub mod server;

use std::path::PathBuf;

fn home() -> PathBuf {
    std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/"))
}

/// Socket del motor: `ARBRAIN_MOTOR_SOCK` o `~/.config/arbrain/motor.sock` (no /tmp:
/// una limpieza del sistema no debe llevárselo con terminales colgando).
pub fn default_sock() -> PathBuf {
    match std::env::var("ARBRAIN_MOTOR_SOCK") {
        Ok(p) if !p.is_empty() => PathBuf::from(p),
        _ => home().join(".config/arbrain/motor.sock"),
    }
}

/// Marca: «tu token viene en la primera línea de stdin» (edición cliente).
pub const ENV_SECRETOS_MOTOR: &str = "ARBRAIN_MOTOR_SECRETOS";
/// Nombre del token por apertura (en la línea JSON de stdin; nunca en el entorno).
pub const ENV_TOKEN_MOTOR: &str = "ARBRAIN_MOTOR_TOKEN";

/// Config desde el entorno. Con `ARBRAIN_MOTOR_SECRETOS=stdin` (edición cliente, red team 4 M4-3) lee el token de la
/// primera línea de stdin y lo exige en cada saludo; sin línea o sin token, `token_requerido` sigue en `true` y nadie
/// entra (falla del lado seguro). El stdin queda para el vigía (`server::run`).
pub fn config_from_env() -> server::Config {
    let sock = default_sock();
    let por_stdin = std::env::var(ENV_SECRETOS_MOTOR).is_ok_and(|v| v == "stdin");
    std::env::remove_var(ENV_SECRETOS_MOTOR);
    std::env::remove_var(ENV_TOKEN_MOTOR);
    let token = if por_stdin { token_de_stdin() } else { None };
    server::Config {
        log: PathBuf::from(format!("{}.log", sock.to_string_lossy())),
        sock,
        token,
        token_requerido: por_stdin,
    }
}

/// Lee byte a byte hasta el primer salto (no consume más: lo que siga es del vigía). JSON `{"ARBRAIN_MOTOR_TOKEN":"…"}`;
/// solo cuenta un token de 32 a 256 caracteres.
fn token_de_stdin() -> Option<String> {
    use std::io::Read;
    let mut linea = Vec::new();
    let mut b = [0u8; 1];
    let mut stdin = std::io::stdin().lock();
    while linea.len() < 4096 {
        match stdin.read(&mut b) {
            Ok(1) if b[0] == b'\n' => break,
            Ok(1) => linea.push(b[0]),
            _ => break,
        }
    }
    let v: serde_json::Value = serde_json::from_slice(&linea).ok()?;
    let t = v.get(ENV_TOKEN_MOTOR)?.as_str()?;
    (32..=256).contains(&t.len()).then(|| t.to_string())
}

/// Comparación en tiempo constante (para el token del saludo).
pub fn mismo_secreto(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}
