//! El lado «servidor» de la app de escritorio: encontrar la copia del alumno, saber si su `npm run servidor` ya corre,
//! encenderlo si no y pedirle un pase de entrada. Habla con el supervisor de `arbrain/scripts/servidor.mjs` por su
//! control local (127.0.0.1, `tokenCli` de `servidor.json`), igual que `npm run servidor -- abrir`.
//!
//! Carpetas (las mismas que `scripts/servidor/rutas.mjs`):
//!   <datos>/daemon/config/servidor.json   proceso vivo: puertoControl + tokenCli (0600)
//!   <datos>/logs/escritorio.log           lo que imprime el servidor cuando lo enciende esta app
//! Configuración de la app: `~/.config/arbrain/escritorio.json` (la escribe `node arbrain/scripts/escritorio.mjs
//! instalar`): `{ "repo": "...", "node": "...", "path": "..." }`. Todo es opcional; sin ella, `~/Arbrain`.

use serde_json::Value;
use std::ffi::OsString;
use std::fs;
use std::io::{Read, Seek, SeekFrom, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

pub const ID_SERVIDOR: &str = "ai.arbrain.servidor";

#[allow(deprecated)] // home_dir ya es correcta en Windows desde Rust 1.85
pub fn home() -> PathBuf {
    std::env::home_dir().unwrap_or_else(|| PathBuf::from("."))
}

fn env_no_vacio(nombre: &str) -> Option<String> {
    std::env::var(nombre).ok().map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

pub struct Config {
    pub repo: PathBuf,
    pub datos: PathBuf,
    pub node: Option<PathBuf>,
    pub path: Vec<PathBuf>,
}

pub fn ruta_config() -> PathBuf {
    home().join(".config").join("arbrain").join("escritorio.json")
}

/// `dirDatosPorDefecto` de rutas.mjs.
fn datos_por_defecto() -> PathBuf {
    if let Some(d) = env_no_vacio("ARBRAIN_SERVIDOR_DATOS") {
        return PathBuf::from(d);
    }
    if cfg!(target_os = "macos") {
        return home().join("Library").join("Application Support").join(ID_SERVIDOR);
    }
    if cfg!(windows) {
        let appdata = env_no_vacio("APPDATA").map(PathBuf::from).unwrap_or_else(|| home().join("AppData").join("Roaming"));
        return appdata.join(ID_SERVIDOR);
    }
    let xdg = env_no_vacio("XDG_DATA_HOME").map(PathBuf::from).unwrap_or_else(|| home().join(".local").join("share"));
    xdg.join(ID_SERVIDOR)
}

impl Config {
    pub fn cargar() -> Config {
        let j: Value = fs::read_to_string(ruta_config()).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or(Value::Null);
        let texto = |k: &str| j.get(k).and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty()).map(String::from);
        let repo = env_no_vacio("ARBRAIN_REPO").or_else(|| texto("repo")).map(PathBuf::from).unwrap_or_else(|| home().join("Arbrain"));
        let datos = env_no_vacio("ARBRAIN_SERVIDOR_DATOS").or_else(|| texto("datos")).map(PathBuf::from).unwrap_or_else(datos_por_defecto);
        let node = texto("node").map(PathBuf::from).filter(|p| p.is_file());
        let path = texto("path").map(|p| std::env::split_paths(&OsString::from(p)).collect()).unwrap_or_default();
        Config { repo, datos, node, path }
    }

    pub fn servidor_mjs(&self) -> PathBuf {
        self.repo.join("arbrain").join("scripts").join("servidor.mjs")
    }

    pub fn log(&self) -> PathBuf {
        self.datos.join("logs").join("escritorio.log")
    }

    fn proceso(&self) -> PathBuf {
        self.datos.join("daemon").join("config").join("servidor.json")
    }
}

// ── Control local del supervisor ──────────────────────────────────────────────────────────────────────────────

/// HTTP/1.0 a 127.0.0.1 (sin chunked ni keep-alive). Devuelve (estado, cuerpo).
fn pedir(puerto: u16, metodo: &str, ruta: &str, token: &str, cuerpo: &str) -> Option<(u16, String)> {
    let dir = SocketAddr::from(([127, 0, 0, 1], puerto));
    let mut s = TcpStream::connect_timeout(&dir, Duration::from_secs(2)).ok()?;
    s.set_read_timeout(Some(Duration::from_secs(5))).ok()?;
    s.set_write_timeout(Some(Duration::from_secs(5))).ok()?;
    let req = format!(
        "{metodo} {ruta} HTTP/1.0\r\nHost: 127.0.0.1:{puerto}\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{cuerpo}",
        cuerpo.len()
    );
    s.write_all(req.as_bytes()).ok()?;
    let mut resp = Vec::new();
    s.take(256 * 1024).read_to_end(&mut resp).ok()?;
    let texto = String::from_utf8_lossy(&resp);
    let (cabeza, cuerpo) = texto.split_once("\r\n\r\n")?;
    let estado = cabeza.split_whitespace().nth(1)?.parse().ok()?;
    Some((estado, cuerpo.to_string()))
}

struct Proceso {
    puerto_control: u16,
    token: String,
}

fn proceso(cfg: &Config) -> Option<Proceso> {
    let j: Value = serde_json::from_str(&fs::read_to_string(cfg.proceso()).ok()?).ok()?;
    let puerto_control = u16::try_from(j.get("puertoControl")?.as_u64()?).ok()?;
    let token = j.get("tokenCli")?.as_str()?.to_string();
    Some(Proceso { puerto_control, token })
}

/// ¿Corre un supervisor con esta carpeta de datos? Devuelve el puerto de la web.
pub fn vivo(cfg: &Config) -> Option<u16> {
    let p = proceso(cfg)?;
    let (estado, cuerpo) = pedir(p.puerto_control, "GET", "/estado", &p.token, "")?;
    if estado != 200 {
        return None;
    }
    let j: Value = serde_json::from_str(&cuerpo).ok()?;
    u16::try_from(j.get("puertoWeb")?.as_u64()?).ok()
}

/// Pase de un solo uso (2 min) para entrar con sesión: la URL que abre `npm run servidor -- abrir`.
pub fn pase(cfg: &Config) -> Option<String> {
    let p = proceso(cfg)?;
    let (estado, cuerpo) = pedir(p.puerto_control, "POST", "/ticket", &p.token, "{}")?;
    if estado != 200 {
        return None;
    }
    let j: Value = serde_json::from_str(&cuerpo).ok()?;
    let ticket = j.get("ticket")?.as_str()?;
    let puerto = j.get("puertoWeb")?.as_u64()?;
    if !ticket.chars().all(|c| c.is_ascii_alphanumeric()) {
        return None;
    }
    Some(format!("http://127.0.0.1:{puerto}/api/desktop/entrar?pase={ticket}"))
}

// ── Encender ──────────────────────────────────────────────────────────────────────────────────────────────────

/// PATH para el servidor. Una app abierta desde el Dock, el Finder o el menú Inicio no hereda el PATH de la terminal:
/// sin esto no se encuentran `node`, `git` ni el `claude` de la persona (su suscripción). Orden: el PATH que guardó el
/// instalador, el del shell de inicio de sesión (macOS y Linux), el heredado y carpetas habituales.
pub fn path_completo(cfg: &Config) -> OsString {
    let mut dirs: Vec<PathBuf> = cfg.path.clone();
    #[cfg(unix)]
    dirs.extend(path_del_shell());
    if let Some(p) = std::env::var_os("PATH") {
        dirs.extend(std::env::split_paths(&p));
    }
    #[cfg(unix)]
    {
        let h = home();
        for d in [
            h.join(".local/bin"),
            h.join(".claude/local"),
            h.join(".npm-global/bin"),
            h.join(".volta/bin"),
            PathBuf::from("/opt/homebrew/bin"),
            PathBuf::from("/usr/local/bin"),
            PathBuf::from("/usr/bin"),
            PathBuf::from("/bin"),
        ] {
            dirs.push(d);
        }
    }
    let mut vistos = std::collections::HashSet::new();
    dirs.retain(|d| !d.as_os_str().is_empty() && vistos.insert(d.clone()));
    std::env::join_paths(dirs).unwrap_or_default()
}

/// `$SHELL -ilc` con plazo de 5 s: ahí viven Homebrew, nvm y el instalador de Claude.
#[cfg(unix)]
fn path_del_shell() -> Vec<PathBuf> {
    let shell = env_no_vacio("SHELL").unwrap_or_else(|| "/bin/zsh".into());
    let Ok(mut hijo) = Command::new(&shell)
        .args(["-ilc", "printf '\\n__ARBRAIN_PATH__%s\\n' \"$PATH\""])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    else {
        return vec![];
    };
    let inicio = Instant::now();
    loop {
        match hijo.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if inicio.elapsed() < Duration::from_secs(5) => std::thread::sleep(Duration::from_millis(50)),
            _ => {
                let _ = hijo.kill();
                let _ = hijo.wait();
                return vec![];
            }
        }
    }
    let mut salida = String::new();
    if let Some(mut s) = hijo.stdout.take() {
        let _ = s.read_to_string(&mut salida);
    }
    salida
        .lines()
        .find_map(|l| l.strip_prefix("__ARBRAIN_PATH__"))
        .map(|p| std::env::split_paths(&OsString::from(p)).collect())
        .unwrap_or_default()
}

pub fn encontrar_node(cfg: &Config, path: &OsString) -> Option<PathBuf> {
    if let Some(n) = &cfg.node {
        return Some(n.clone());
    }
    let nombre = if cfg!(windows) { "node.exe" } else { "node" };
    std::env::split_paths(path).map(|d| d.join(nombre)).find(|p| p.is_file())
}

/// Lanza `node arbrain/scripts/servidor.mjs --sin-navegador` desacoplado: sigue vivo aunque se cierre la ventana
/// (el daemon, los recordatorios y Levy no dependen de ella). Salida a `<datos>/logs/escritorio.log`.
pub fn arrancar(cfg: &Config, node: &Path, path: &OsString) -> std::io::Result<Child> {
    let log = cfg.log();
    fs::create_dir_all(log.parent().unwrap_or(Path::new(".")))?;
    let mut f = fs::OpenOptions::new().create(true).append(true).open(&log)?;
    let _ = writeln!(f, "\n── La app de escritorio enciende Arbrain ({}) ──", cfg.repo.display());
    let err = f.try_clone()?;
    let mut cmd = Command::new(node);
    cmd.arg(cfg.servidor_mjs())
        .arg("--sin-navegador")
        .current_dir(cfg.repo.join("arbrain"))
        .env("PATH", path)
        .env("ARBRAIN_ESCRITORIO", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::from(f))
        .stderr(Stdio::from(err));
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW (consola oculta que heredan npm y sus hijos) | CREATE_NEW_PROCESS_GROUP.
        cmd.creation_flags(0x0800_0000 | 0x0000_0200);
    }
    cmd.spawn()
}

/// Últimas `n` líneas del registro, sin colores ni la marca de hora de servidor.mjs.
pub fn ultimas_lineas(ruta: &Path, n: usize) -> Vec<String> {
    let Ok(mut f) = fs::File::open(ruta) else { return vec![] };
    let largo = f.metadata().map(|m| m.len()).unwrap_or(0);
    let _ = f.seek(SeekFrom::Start(largo.saturating_sub(16 * 1024)));
    let mut b = Vec::new();
    let _ = f.read_to_end(&mut b);
    let texto = String::from_utf8_lossy(&b);
    let mut lineas: Vec<String> = texto
        .split(['\n', '\r'])
        .map(limpiar)
        .filter(|l| !l.is_empty())
        .collect();
    let desde = lineas.len().saturating_sub(n);
    lineas.drain(..desde);
    lineas
}

fn limpiar(l: &str) -> String {
    let mut s = String::new();
    let mut chars = l.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' {
            // ESC [ ... letra
            if chars.peek() == Some(&'[') {
                chars.next();
                while let Some(&d) = chars.peek() {
                    chars.next();
                    if d.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
            continue;
        }
        if !c.is_control() {
            s.push(c);
        }
    }
    let s = s.trim();
    // «[arbrain 13:02:11] Compilando…» → «Compilando…»
    let s = match s.strip_prefix("[arbrain ") {
        Some(resto) => resto.split_once("] ").map(|(_, r)| r).unwrap_or(resto),
        None => s,
    };
    s.trim().chars().take(240).collect()
}

/// Abre una dirección en el navegador del sistema (solo http, https y mailto).
pub fn abrir_fuera(url: &str) {
    if !(url.starts_with("https://") || url.starts_with("http://") || url.starts_with("mailto:")) {
        return;
    }
    #[cfg(target_os = "macos")]
    let r = Command::new("/usr/bin/open").arg(url).spawn();
    #[cfg(windows)]
    let r = Command::new("rundll32").args(["url.dll,FileProtocolHandler", url]).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let r = Command::new("xdg-open").arg(url).spawn();
    let _ = r;
}

/// Muestra el registro en el explorador de archivos del sistema.
pub fn mostrar_archivo(ruta: &Path) {
    #[cfg(target_os = "macos")]
    let r = Command::new("/usr/bin/open").arg("-R").arg(ruta).spawn();
    #[cfg(windows)]
    let r = Command::new("explorer").arg(format!("/select,{}", ruta.display())).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let r = Command::new("xdg-open").arg(ruta.parent().unwrap_or(ruta)).spawn();
    let _ = r;
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn limpia_colores_y_marca() {
        assert_eq!(limpiar("\u{1b}[32m[arbrain 13:02:11] Compilando la web\u{1b}[0m"), "Compilando la web");
        assert_eq!(limpiar("  npm warn algo  "), "npm warn algo");
    }
}
