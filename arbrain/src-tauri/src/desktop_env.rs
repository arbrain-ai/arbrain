use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

/// Edición para clientes (seguridad, 10 oct 2026; docs/builds/seguridad-empaquetado-2026-10-09): se fija al compilar.
/// `build.rs` la decide: `ARBRAIN_EDICION` explícita, o el identificador de la app (el de `tauri.conf.json` que viaja
/// es la edición cliente; la instalación original compila con `tauri.original.conf.json` y no cambia).
pub const EDICION_CLIENTE: bool = es_cliente(option_env!("ARBRAIN_EDICION_EFECTIVA"));

const fn es_cliente(valor: Option<&str>) -> bool {
    let Some(valor) = valor else { return false };
    let (a, b) = (valor.as_bytes(), b"cliente".as_slice());
    if a.len() != b.len() {
        return false;
    }
    let mut i = 0;
    while i < a.len() {
        if a[i] != b[i] {
            return false;
        }
        i += 1;
    }
    true
}

/// Edición cliente: las únicas llaves que lee la app son las del propio cliente, en su carpeta de configuración
/// (`~/Library/Application Support/<id>/arbrain.env`). Nunca `.env` de carpetas vecinas, del repo ni del paquete.
pub fn client_paths(config_dir: &Path) -> Vec<PathBuf> {
    vec![config_dir.join("arbrain.env")]
}

// El secreto de escritorio (AUDITORIA I5) ya no vive en disco: es por apertura y en memoria (secretos.rs, CONTRATO v2).

/// Escribe un archivo legible solo por el usuario (0600 en Unix).
pub fn write_private(path: &Path, contents: &str) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;
        let mut file = fs::OpenOptions::new().create(true).write(true).truncate(true).mode(0o600).open(path)?;
        file.write_all(contents.as_bytes())?;
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))
    }
    #[cfg(not(unix))]
    {
        fs::write(path, contents)
    }
}

/// Marca de edición cliente para los procesos que no nacen de la app (servidor MCP de manos que lanza Claude):
/// `<ARBRAIN_CONFIG_DIR>/edicion` = «cliente», dentro de la carpeta de la app del alumno. Nunca en
/// `~/.config/arbrain`, que es de la instalación de Daniel: en su Mac esa marca cambiaría su daemon.
/// Lo leen `arbrain/server/src/edicion.ts` (con `ARBRAIN_CONFIG_DIR`) y el freno de manos.
pub fn mark_client_edition(config_arbrain: &Path) -> std::io::Result<()> {
    fs::create_dir_all(config_arbrain)?;
    write_private(&config_arbrain.join("edicion"), "cliente\n")
}

/// Carpeta personal del usuario, portable (macOS/Linux: `$HOME`; Windows: perfil del usuario).
pub fn home_dir() -> Option<PathBuf> {
    dirs::home_dir()
}


/// URL de entrada de la ventana en edición cliente: el servidor local cambia el secreto por una cookie HttpOnly y
/// redirige al destino. El secreto nunca queda en la URL final ni en el historial de la página.
pub fn session_entry_url(server_url: &str, secret: &str, destination_path: &str) -> String {
    let path = if destination_path.starts_with('/') && !destination_path.starts_with("//") { destination_path } else { "/" };
    let encoded: String = path.bytes().map(|b| match b {
        b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' => (b as char).to_string(),
        _ => format!("%{:02X}", b),
    }).collect();
    format!("{}/api/desktop/sesion?t={}&a={}", server_url.trim_end_matches('/'), secret, encoded)
}

/// Live configuration precedes snapshots shipped inside an older app bundle.
pub fn live_paths(home: &Path) -> Vec<PathBuf> {
    let developer = home.join("Developer");
    [developer.join("business-os"), developer.join("software/business-os")]
        .into_iter()
        .flat_map(|root| [root.join("arbrain/.env.local"), root.join(".env.local"), root.join(".env")])
        .collect()
}

pub fn parse_env_file(path: &Path, values: &mut HashMap<String, String>) {
    let Ok(raw) = fs::read_to_string(path) else { return };
    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') { continue; }
        let Some((key, value)) = trimmed.split_once('=') else { continue };
        let key = key.trim();
        if key.is_empty() { continue; }
        values.entry(key.to_string()).or_insert_with(||
            value.trim().trim_matches('"').trim_matches('\'').to_string());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn live_credentials_win_over_old_bundle_and_keep_fallback() {
        let home = std::env::temp_dir().join(format!("arbrain-env-test-{}", std::process::id()));
        let paths = live_paths(&home);
        fs::create_dir_all(paths[0].parent().unwrap()).unwrap();
        fs::write(&paths[0], "OPENCLAW_GATEWAY_TOKEN=new-test-value\n").unwrap();
        let bundle = home.join("bundle.env");
        fs::write(&bundle, "OPENCLAW_GATEWAY_TOKEN=old-test-value\nOTHER_TEST=fallback\n").unwrap();
        let mut values = HashMap::new();
        for path in paths.iter().chain(std::iter::once(&bundle)) { parse_env_file(path, &mut values); }
        assert_eq!(values["OPENCLAW_GATEWAY_TOKEN"], "new-test-value");
        assert_eq!(values["OTHER_TEST"], "fallback");
        fs::remove_dir_all(home).unwrap();
    }

    #[test]
    fn edition_flag_is_exact() {
        assert!(es_cliente(Some("cliente")));
        assert!(!es_cliente(Some("original")));
        assert!(!es_cliente(Some("clientes")));
        assert!(!es_cliente(None));
    }

    #[test]
    fn client_edition_reads_only_its_own_config_file() {
        let dir = Path::new("/tmp/arbrain-config");
        assert_eq!(client_paths(dir), vec![dir.join("arbrain.env")]);
    }

    #[test]
    fn client_edition_mark_lives_in_the_app_folder() {
        let dir = std::env::temp_dir().join(format!("arbrain-mark-test-{}", std::process::id())).join("arbrain");
        mark_client_edition(&dir).unwrap();
        assert_eq!(fs::read_to_string(dir.join("edicion")).unwrap(), "cliente\n");
        fs::remove_dir_all(dir.parent().unwrap()).unwrap();
    }

    #[test]
    fn the_shipped_config_is_the_client_app() {
        let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        assert_eq!(conf["identifier"].as_str().unwrap(), "ai.arbrain.app");
        assert!(!conf["app"]["security"]["csp"].is_null());
    }

    #[test]
    fn session_entry_never_redirects_off_origin() {
        assert_eq!(session_entry_url("http://127.0.0.1:3218/", "ab", "/chat"), "http://127.0.0.1:3218/api/desktop/sesion?t=ab&a=/chat");
        assert!(session_entry_url("http://127.0.0.1:3218", "ab", "//evil.example").ends_with("&a=/"));
        assert!(session_entry_url("http://127.0.0.1:3218", "ab", "https://evil.example").ends_with("&a=/"));
    }
}
