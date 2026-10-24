//! El daemon viaja con la app (edición cliente).
//!
//! En el Studio de Daniel el daemon (`claudeclaw`) lo levanta launchd y la app no lo toca: nada de este módulo
//! corre sin `ARBRAIN_EDICION=cliente`. En la edición cliente la app:
//!   1. elige puertos libres en 127.0.0.1 (recordados entre aperturas, nunca 3000/3099/3218/3300),
//!   2. usa secretos aleatorios por apertura, solo en memoria (secretos.rs; nunca en disco ni en el entorno),
//!   3. guarda todo en SU carpeta de datos (`app_data_dir`): store, cerebro, configuración, sesión de Claude,
//!   4. lanza `node <recursos>/daemon/dist/index.js` con el Node embebido y le escribe por stdin el token, el
//!      secreto de confirmar, el pase de agente y las llaves del llavero (CONTRATO v2 §2.1; v3 no cambia el lanzamiento),
//!   5. lo supervisa (salud con token cada 5 s; reinicio con freno si se cae) y lo apaga al salir.
//!
//! Contrato de variables: `docs/builds/empaquetado-2026-10-11/CONTRATO-DAEMON.md`.

use crate::{desktop_env, hijos, llaves, secretos};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

const HOST: &str = "127.0.0.1";
/// Puertos del sistema de Daniel (y del desarrollo): la app del alumno jamás los usa.
pub const RESERVADOS: [u16; 4] = [3000, 3099, 3218, 3300];
const SALUD_CADA: Duration = Duration::from_secs(5);
const FALLOS_PARA_REINICIAR: u32 = 3;
const MAX_REINICIOS: usize = 5;
const VENTANA_REINICIOS: Duration = Duration::from_secs(300);
const LOG_MAXIMO: u64 = 5 * 1024 * 1024;
/// Código de salida del daemon cuando le falta configuración (CONTRATO §2).
const SALIDA_CONFIG: i32 = 78;

#[derive(Debug, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct DaemonInfo {
    pub url: String,
    pub port: u16,
    pub ready: bool,
    pub pid: Option<u32>,
    pub reinicios: usize,
    pub last_error: Option<String>,
    /// Agotó los reinicios (5 en 5 min): el supervisor dejó de reintentar y la UI pide ayuda (resiliencia, 12 oct).
    pub pausado: bool,
}

#[derive(Default)]
pub struct DaemonState {
    hijo: Mutex<Option<hijos::Hijo>>,
    info: Mutex<DaemonInfo>,
    reinicios: Mutex<Vec<Instant>>,
    supervisor: AtomicBool,
    apagando: AtomicBool,
    origen_web: Mutex<String>,
    /// Entre «guardé/quité una llave» y el daemon nuevo arriba (humo de instaladores, 13 oct 2026): mientras sea
    /// `true`, `ready` queda en `false` y el supervisor no lo vuelve a `true` con el daemon VIEJO. Antes la prueba
    /// automática tras guardar caía en el daemon que se estaba apagando: «No pude probar la conexión».
    reiniciando: AtomicBool,
}

/// Marca el reinicio ANTES de devolver el comando a la web: `esperarDaemon` ya ve `ready: false` y espera al nuevo.
fn marcar_reinicio(app: &AppHandle) {
    app.state::<DaemonState>().reiniciando.store(true, Ordering::SeqCst);
    actualizar(app, |i| i.ready = false);
}

/// Carpetas de la instalación del alumno. Todas viven dentro de `app_data_dir` (ninguna en `~/.config/arbrain`,
/// que es de Daniel). Disposición del contrato (CONTRATO-DAEMON.md §2):
///   <app_data_dir>/daemon/          ARBRAIN_DATA_DIR (store/, config/, uploads/, claude/, cohorte/ los crea el daemon)
///   <app_data_dir>/daemon/config/   ARBRAIN_CONFIG_DIR (también para la web y el motor)
///   <app_data_dir>/cerebro/         ARBRAIN_HOME (workspace del alumno, cwd de los agentes)
///   <app_data_dir>/web/             ARBRAIN_DATA_DIR del servidor web (su base local de chat y lienzo)
///   <app_data_dir>/logs/            daemon.log
#[derive(Debug, Clone)]
pub struct Rutas {
    pub datos: PathBuf,
    pub daemon: PathBuf,
    pub web: PathBuf,
    pub store: PathBuf,
    pub cerebro: PathBuf,
    pub config: PathBuf,
    pub claude: PathBuf,
    pub logs: PathBuf,
    pub motor_sock: PathBuf,
}

impl Rutas {
    pub fn desde(datos: &Path) -> Rutas {
        let daemon = datos.join("daemon");
        let config = daemon.join("config");
        Rutas {
            datos: datos.to_path_buf(),
            store: daemon.join("store"),
            claude: daemon.join("claude"),
            cerebro: datos.join("cerebro"),
            web: datos.join("web"),
            logs: datos.join("logs"),
            motor_sock: sock_motor(&config),
            config,
            daemon,
        }
    }

    fn crear(&self) -> std::io::Result<()> {
        for dir in [&self.datos, &self.daemon, &self.web, &self.store, &self.cerebro, &self.config, &self.claude, &self.logs] {
            fs::create_dir_all(dir)?;
            privada(dir);
        }
        Ok(())
    }
}

/// Socket del motor dentro de la carpeta del alumno. Los sockets Unix tienen un límite de ~104 bytes de ruta: si
/// la carpeta es muy larga se usa la carpeta temporal del usuario (privada en macOS) con un nombre derivado.
fn sock_motor(config: &Path) -> PathBuf {
    let directo = config.join("motor.sock");
    if directo.to_string_lossy().len() <= 100 {
        return directo;
    }
    use sha2::{Digest, Sha256};
    let hash = Sha256::digest(config.to_string_lossy().as_bytes());
    let corto: String = hash.iter().take(6).map(|b| format!("{:02x}", b)).collect();
    std::env::temp_dir().join(format!("arbrain-{}", corto)).join("motor.sock")
}

fn privada(dir: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(dir, fs::Permissions::from_mode(0o700));
    }
    #[cfg(not(unix))]
    let _ = dir;
}

pub fn rutas(app: &AppHandle) -> Result<Rutas, String> {
    let datos = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(Rutas::desde(&datos))
}

/// Servicio del llavero = identificador de la app (`ai.arbrain.app` en la edición cliente).
pub fn servicio_llavero(app: &AppHandle) -> String {
    app.config().identifier.clone()
}

/// Secreto de confirmación humana (I8, CONTRATO §6): solo lo conocen la app, su servidor web y el daemon, que lo
/// reciben por stdin (nunca por entorno). Nuevo en cada apertura, nunca en disco.
pub fn token_confirmar() -> &'static str {
    &secretos::apertura().confirmar
}

/// Receptor del monitoreo de cohorte, fijado al compilar (`ARBRAIN_COHORTE_URL`). Vacío por defecto: nada sale.
const COHORTE_URL: Option<&str> = option_env!("ARBRAIN_COHORTE_URL");

/// Token entre la app, su servidor web y el daemon (64 hex). Por apertura y solo en memoria (CONTRATO v2 §2.1): antes
/// vivía en `<config>/daemon-token`, donde un agente con Bash podía leerlo; ese archivo se borra al arrancar.
pub fn token(app: &AppHandle) -> Result<String, String> {
    static RESTOS: std::sync::Once = std::sync::Once::new();
    RESTOS.call_once(|| {
        if let Ok(dir) = app.path().app_config_dir() {
            secretos::borrar_restos(&dir);
        }
    });
    Ok(secretos::apertura().daemon.clone())
}

/// Libre en 127.0.0.1 **y** en `[::1]` (red team OAuth, M1). Si otro proceso escucha en `[::1]:<puerto>`, todo lo que
/// resuelva `localhost` (el navegador prueba `::1` primero) le llega a él y no a Arbrain. Un equipo sin IPv6 cuenta
/// como libre en esa familia; solo «ocupado» o «sin permiso» la descartan.
fn puerto_libre(port: u16) -> bool {
    port != 0 && !RESERVADOS.contains(&port) && TcpListener::bind((HOST, port)).is_ok() && libre_en_ipv6(port)
}

fn libre_en_ipv6(port: u16) -> bool {
    match TcpListener::bind((std::net::Ipv6Addr::LOCALHOST, port)) {
        Ok(_) => true,
        Err(e) => !matches!(e.kind(), std::io::ErrorKind::AddrInUse | std::io::ErrorKind::PermissionDenied),
    }
}

/// Puerto recordado en `<config>/<archivo>` si sigue libre; si no, uno nuevo que el sistema da libre.
/// Recordarlo importa: otro puerto es otro origen y el webview perdería su localStorage (tema, borradores).
pub fn puerto(app: &AppHandle, archivo: &str, evitar: &[u16]) -> Result<u16, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let ruta = dir.join(archivo);
    if let Some(p) = fs::read_to_string(&ruta).ok().and_then(|t| t.trim().parse::<u16>().ok()) {
        if !evitar.contains(&p) && puerto_libre(p) {
            return Ok(p);
        }
    }
    for _ in 0..20 {
        let listener = TcpListener::bind((HOST, 0)).map_err(|e| e.to_string())?;
        let p = listener.local_addr().map_err(|e| e.to_string())?.port();
        drop(listener);
        if !evitar.contains(&p) && puerto_libre(p) {
            let _ = fs::create_dir_all(&dir);
            let _ = fs::write(&ruta, p.to_string());
            return Ok(p);
        }
    }
    Err("No hay un puerto libre en 127.0.0.1 y [::1]".into())
}

/// `GET /health` con el token de esta instalación. 200 = el daemon está vivo y es NUESTRO.
pub fn salud(port: u16, token: &str, espera: Duration) -> bool {
    let Ok(addr) = format!("{}:{}", HOST, port).parse::<SocketAddr>() else { return false };
    let Ok(mut s) = TcpStream::connect_timeout(&addr, Duration::from_millis(800)) else { return false };
    let _ = s.set_read_timeout(Some(espera));
    let _ = s.set_write_timeout(Some(Duration::from_secs(2)));
    let req = format!(
        "GET /health HTTP/1.1\r\nHost: {}:{}\r\nAuthorization: Bearer {}\r\nConnection: close\r\n\r\n",
        HOST, port, token
    );
    if s.write_all(req.as_bytes()).is_err() {
        return false;
    }
    let mut head = [0u8; 12];
    s.read_exact(&mut head).is_ok() && head.starts_with(b"HTTP/1.") && &head[9..12] == b"200"
}

/// Entorno que comparten el daemon y el servidor web de la edición cliente (edición y rutas del alumno). La
/// configuración (`ARBRAIN_CONFIG_DIR`: computer use, voz, panel) es UNA para los dos.
pub fn entorno_comun(r: &Rutas) -> Vec<(String, String)> {
    let s = |p: &Path| p.to_string_lossy().to_string();
    vec![
        ("ARBRAIN_EDICION".into(), "cliente".into()),
        ("ARBRAIN_CONFIG_DIR".into(), s(&r.config)),
        ("ARBRAIN_HOME".into(), s(&r.cerebro)),
        ("ARBRAIN_MOTOR_SOCK".into(), s(&r.motor_sock)),
    ]
}

/// Lo propio del daemon: su carpeta de datos (CONTRATO §2) y su base.
fn entorno_daemon(r: &Rutas) -> Vec<(String, String)> {
    let s = |p: &Path| p.to_string_lossy().to_string();
    let mut env = entorno_comun(r);
    env.push(("ARBRAIN_DATA_DIR".into(), s(&r.daemon)));
    env.push(("CLAUDECLAW_STORE_DIR".into(), s(&r.store)));
    env
}

/// Lo propio del servidor web: su carpeta de datos (pedido D → B en ESTADO.md).
pub fn entorno_web(r: &Rutas) -> Vec<(String, String)> {
    let mut env = entorno_comun(r);
    env.push(("ARBRAIN_DATA_DIR".into(), r.web.to_string_lossy().to_string()));
    env
}

/// Variables heredadas que nunca deben llegar al daemon del alumno desde el entorno de quien lanza la app:
/// las llaves solo salen del llavero, y la configuración del daemon solo de la app.
const HEREDADAS_PROHIBIDAS: [&str; 28] = [
    "ARBRAIN_PASE_AGENTE",
    // Red team 4 M4-3: el token del motor es de la app y la web; el daemon y sus agentes nunca lo ven.
    "ARBRAIN_MOTOR_TOKEN",
    "ARBRAIN_MOTOR_SECRETOS",
    // Red team 4 L4-6: inyectar código en el Node del daemon (`--require`) o volver a encender Chrome desde fuera.
    "NODE_OPTIONS",
    "LEVY_CHROME",
    "ARBRAIN_DESKTOP_SECRET",
    "ARBRAIN_SECRETOS",
    "ANTHROPIC_API_KEY",
    // Sin vía de suscripción (12 oct 2026): ni el token de claude.ai ni la ruta del almacén de credenciales del CLI
    // pueden llegar heredados al daemon.
    "CLAUDE_CODE_OAUTH_TOKEN",
    "CLAUDE_CODE_OAUTH_REFRESH_TOKEN",
    "CLAUDE_SECURESTORAGE_CONFIG_DIR",
    "OPENROUTER_API_KEY",
    // Voz (21 oct 2026): la llave de Groq del alumno solo llega por stdin desde su llavero.
    "GROQ_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "OPENCLAW_GATEWAY_TOKEN",
    "ARBRAIN_DAEMON_TOKEN",
    "ARBRAIN_TOKEN_CONFIRMAR",
    "ARBRAIN_WEB_URL",
    "ARBRAIN_COHORTE_URL",
    "ARBRAIN_PERFIL",
    "MC_SERVER_PORT",
    "MISSION_CONTROL_ORIGIN",
    "MISSION_CONTROL_URL",
    "CLAUDECLAW_ROLE",
    "CLAUDECLAW_URL",
    "CLAUDECLAW_URL_PINNED",
    "CLAUDE_CONFIG_DIR",
    "GOG_KEYRING_PASSWORD",
];

/// Contrato v3 (§6.1, §4): variables que cambian la política de los agentes o el proveedor del chat. Heredadas de quien
/// lanza la app, apagarían el sandbox del Bash (`ARBRAIN_SANDBOX=0`), mandarían la llave del alumno a otro servidor
/// (`ANTHROPIC_BASE_URL`), alargarían la ventana de «la cita» de manos o sembrarían el cerebro desde otra carpeta.
/// Nunca llegan ni al daemon ni a la web (la web lee `ARBRAIN_SANDBOX` para avisar si no hay sandbox): solo la app o
/// el daemon las fijan.
/// 0.1.2 (computer use en cliente): tampoco qué app de manos se abre, su socket, su token, el adaptador, el modo ni el
/// binario de Windows, y nunca la plataforma «de prueba» que enciende computer use donde no existe.
/// Modo espejo (24 oct 2026): `ARBRAIN_ESPEJO_GUARDA` (la cerca que el daemon consulta antes de cada rutina) solo la fija el
/// modo servidor con el espejo encendido; la app de escritorio nunca, y heredada correría un script ajeno.
pub const POLITICA_V3: [&str; 17] = [
    "ARBRAIN_SANDBOX",
    "ANTHROPIC_BASE_URL",
    "ARBRAIN_PROVEEDOR_CLAUDE",
    "ARBRAIN_PLANTILLA_DIR",
    "MANOS_VOZ_VENTANA_MIN",
    "ARBRAIN_PLATAFORMA_PRUEBA",
    "MANOS_ADAPTADOR",
    "MANOS_MODO",
    "MANOS_EDICION",
    "MANOS_CASA_APP",
    "MANOS_CASA_SOCKET",
    "MANOS_CASA_TOKEN_ARCHIVO",
    "MANOS_WINDOWS_EXE",
    "MANOS_WINDOWS_FUENTE",
    "MANOS_WINDOWS_CSC",
    "MANOS_WINDOWS_CACHE",
    "ARBRAIN_ESPEJO_GUARDA",
];

/// ArbrainManos.app que viaja dentro de la app del alumno en macOS (`Contents/Resources/manos/`, la arma
/// scripts/empaquetar-manos-mac.mjs). El adaptador `casa` la encuentra solo; la variable lo deja explícito.
fn manos_mac(app: &AppHandle) -> Option<PathBuf> {
    if !cfg!(target_os = "macos") {
        return None;
    }
    let p = crate::resource_dir(app)?.join("manos").join("ArbrainManos.app");
    p.join("Contents").join("MacOS").join("ArbrainManos").exists().then_some(p)
}

fn recursos_daemon(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(p) = std::env::var("ARBRAIN_DAEMON_DIR") {
        let p = PathBuf::from(p);
        if p.join("dist").join("index.js").exists() {
            return Some(p);
        }
    }
    // Sin `\\?\` (Windows): Node no arranca un script de entrada con ruta verbatim (crate::ruta_para_hijos).
    let dir = crate::resource_dir(app)?.join("daemon");
    dir.join("dist").join("index.js").exists().then_some(dir)
}

fn plantilla_cerebro(app: &AppHandle) -> Option<PathBuf> {
    let dir = crate::resource_dir(app)?.join("plantilla-cerebro");
    dir.is_dir().then_some(dir)
}

/// `<datos>/bin/node` → el Node que usa la app (enlace en Unix; enlace duro o copia en Windows). Devuelve la
/// carpeta para anteponerla al PATH del daemon. Si el Node es el del sistema, su propia carpeta.
fn bin_node(r: &Rutas, node: &Path) -> Option<PathBuf> {
    let es_embebido = node.file_name().is_some_and(|n| n == crate::NODE_EMBEBIDO);
    if !es_embebido {
        return node.parent().filter(|p| !p.as_os_str().is_empty()).map(Path::to_path_buf);
    }
    let bin = r.datos.join("bin");
    fs::create_dir_all(&bin).ok()?;
    let destino = bin.join(if cfg!(windows) { "node.exe" } else { "node" });
    #[cfg(unix)]
    {
        if fs::read_link(&destino).ok().as_deref() != Some(node) {
            let _ = fs::remove_file(&destino);
            std::os::unix::fs::symlink(node, &destino).ok()?;
        }
    }
    #[cfg(not(unix))]
    {
        let mismo = fs::metadata(&destino).ok().map(|m| m.len()) == fs::metadata(node).ok().map(|m| m.len());
        if !mismo {
            let _ = fs::remove_file(&destino);
            if fs::hard_link(node, &destino).is_err() {
                fs::copy(node, &destino).ok()?;
            }
        }
    }
    Some(bin)
}

fn abrir_log(r: &Rutas) -> Option<fs::File> {
    let ruta = r.logs.join("daemon.log");
    if fs::metadata(&ruta).map(|m| m.len() > LOG_MAXIMO).unwrap_or(false) {
        let _ = fs::rename(&ruta, r.logs.join("daemon.log.1"));
    }
    fs::OpenOptions::new().create(true).append(true).open(ruta).ok()
}

#[derive(Serialize, Deserialize)]
struct Registro {
    pid: u32,
    port: u16,
}

fn registro(r: &Rutas) -> PathBuf {
    r.datos.join("daemon.json")
}

/// Si la app anterior se cayó y dejó su daemon vivo, se apaga. Con stdin vigía (§5) el daemon ya se apaga solo al
/// morir la app; esto cubre el resto. El token es por apertura (no hay con qué preguntarle): se reconoce por el pid
/// registrado cuya línea de comando es la de NUESTRO daemon (`<recursos>/daemon/dist/index.js`); un pid reciclado por
/// otro proceso no coincide. Windows: el Job Object ya mató el árbol con la app.
fn apagar_huerfano(r: &Rutas, daemon_js: &Path) {
    let Ok(raw) = fs::read_to_string(registro(r)) else { return };
    let Ok(reg) = serde_json::from_str::<Registro>(&raw) else { return };
    if es_nuestro_daemon(reg.pid, daemon_js) {
        eprintln!("[arbrain] daemon huérfano de la apertura anterior (pid {}): se apaga", reg.pid);
        hijos::terminar_pid(reg.pid);
    }
    let _ = fs::remove_file(registro(r));
}

#[cfg(unix)]
fn es_nuestro_daemon(pid: u32, daemon_js: &Path) -> bool {
    // `ps -o command=` (sin `e`): solo la línea de comando, nunca el entorno de nadie.
    Command::new("ps")
        .args(["-o", "command=", "-p", &pid.to_string()])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .is_some_and(|o| String::from_utf8_lossy(&o.stdout).contains(&*daemon_js.to_string_lossy()))
}

#[cfg(not(unix))]
fn es_nuestro_daemon(_pid: u32, _daemon_js: &Path) -> bool {
    false
}

fn lanzar(app: &AppHandle, port: u16, origen_web: &str) -> Result<hijos::Hijo, String> {
    let r = rutas(app)?;
    r.crear().map_err(|e| format!("No se pudo crear la carpeta de datos: {}", e))?;
    let dir = recursos_daemon(app).ok_or("El daemon no viene en esta app (falta resources/daemon).")?;
    let node = crate::resolve_node_binary();
    let token = token(app)?;

    let mut cmd = Command::new(&node);
    cmd.arg(dir.join("dist").join("index.js")).current_dir(&r.daemon);
    for k in HEREDADAS_PROHIBIDAS.iter().chain(POLITICA_V3.iter()) {
        cmd.env_remove(k);
    }
    // El Node embebido primero en PATH, con el nombre `node`: lo que el daemon lance como `node` usa el mismo.
    if let Some(bin) = bin_node(&r, &node) {
        let mut rutas_path = vec![bin];
        if let Some(actual) = std::env::var_os("PATH") {
            rutas_path.extend(std::env::split_paths(&actual));
        }
        if let Ok(path) = std::env::join_paths(rutas_path) {
            cmd.env("PATH", path);
        }
    }
    cmd.envs(entorno_daemon(&r))
        .env("NODE_ENV", "production")
        .env("MC_SERVER_PORT", port.to_string())
        .env("MISSION_CONTROL_ORIGIN", origen_web)
        // Contrato v2 §2.1: los secretos van en la primera línea de stdin, no aquí (`ps eww` vería el entorno).
        .env(secretos::ENV_SECRETOS, "stdin")
        .env("CLAUDECLAW_ROLE", "full")
        .env("CLAUDE_CONFIG_DIR", &r.claude)
        // Si la app muere, se cierra este stdin y el daemon se apaga solo (CONTRATO §5): sin huérfanos.
        .env("ARBRAIN_VIGILAR_STDIN", "1")
        .env("ARBRAIN_NODE_BINARY", &node)
        // Puente con arbrain.ai (21 oct 2026): la señal opcional dice qué versión tiene instalada el alumno.
        .env("ARBRAIN_VERSION", env!("CARGO_PKG_VERSION"));
    if let Some(url) = COHORTE_URL.filter(|u| !u.trim().is_empty()) {
        cmd.env("ARBRAIN_COHORTE_URL", url);
    }
    if let Some(p) = plantilla_cerebro(app) {
        cmd.env("ARBRAIN_PLANTILLA_DIR", p);
    }
    if let Some(p) = manos_mac(app) {
        cmd.env("MANOS_CASA_APP", p);
    }
    let llaves_del_llavero = llaves::para_daemon(&servicio_llavero(app));
    // stdin en pipe: primero recibe los secretos; después el extremo de escritura vive en el `Child` guardado y se
    // cierra solo si la app muere o lo apaga (vigía §5).
    cmd.stdin(Stdio::piped());
    match abrir_log(&r) {
        Some(log) => {
            let err = log.try_clone().map(Stdio::from).unwrap_or_else(|_| Stdio::null());
            cmd.stdout(Stdio::from(log)).stderr(err);
        }
        None => {
            cmd.stdout(Stdio::null()).stderr(Stdio::null());
        }
    }
    let mut hijo = hijos::lanzar(&mut cmd)
        .map_err(|e| format!("No se pudo arrancar el daemon con `{}`: {}", node.to_string_lossy(), e))?;
    let a = secretos::apertura();
    let mut pares: Vec<(&str, &str)> = vec![
        ("OPENCLAW_GATEWAY_TOKEN", &token),
        ("ARBRAIN_TOKEN_CONFIRMAR", &a.confirmar),
        ("ARBRAIN_PASE_AGENTE", &a.pase_agente),
    ];
    for (k, v) in &llaves_del_llavero {
        pares.push((k.as_str(), v.as_str()));
    }
    if let Err(e) = secretos::entregar(&mut hijo.child, &secretos::linea(&pares), false) {
        hijos::terminar(&mut hijo, Duration::from_secs(1));
        return Err(format!("No se pudieron entregar los secretos al daemon: {}", e));
    }
    let reg = Registro { pid: hijo.id(), port };
    let _ = desktop_env::write_private(&registro(&r), &serde_json::to_string(&reg).unwrap_or_default());
    Ok(hijo)
}

fn actualizar(app: &AppHandle, f: impl FnOnce(&mut DaemonInfo)) {
    let state = app.state::<DaemonState>();
    if let Ok(mut info) = state.info.lock() {
        f(&mut info);
    };
}

pub fn info(app: &AppHandle) -> DaemonInfo {
    app.state::<DaemonState>().info.lock().map(|i| i.clone()).unwrap_or_default()
}

/// Puerto del daemon (elegido una vez por apertura y recordado entre aperturas).
pub fn preparar_puerto(app: &AppHandle, evitar: &[u16]) -> Result<u16, String> {
    let actual = info(app).port;
    if actual != 0 {
        return Ok(actual);
    }
    let p = puerto(app, "puerto-daemon", evitar)?;
    actualizar(app, |i| {
        i.port = p;
        i.url = format!("http://{}:{}", HOST, p);
    });
    Ok(p)
}

/// Arranca el daemon (si no corre ya) y su supervisor. No espera a que esté sano: la ventana abre en paralelo y
/// el supervisor marca `ready`. Un error aquí (sin Node, sin daemon en el paquete) sí se devuelve.
pub fn ensure_daemon(app: &AppHandle, origen_web: &str) -> Result<DaemonInfo, String> {
    if !desktop_env::EDICION_CLIENTE {
        return Err("El daemon solo lo lanza la edición cliente.".into());
    }
    let state = app.state::<DaemonState>();
    state.apagando.store(false, Ordering::SeqCst);
    if let Ok(mut o) = state.origen_web.lock() {
        *o = origen_web.to_string();
    }
    let r = rutas(app)?;
    let port = preparar_puerto(app, &[])?;
    {
        let mut hijo = state.hijo.lock().map_err(|e| e.to_string())?;
        if hijo.as_mut().is_some_and(|h| h.vivo()) {
            return Ok(info(app));
        }
        if let Some(dir) = recursos_daemon(app) {
            apagar_huerfano(&r, &dir.join("dist").join("index.js"));
        }
        match lanzar(app, port, origen_web) {
            Ok(h) => {
                let pid = h.id();
                *hijo = Some(h);
                actualizar(app, |i| {
                    i.pid = Some(pid);
                    i.ready = false;
                    i.last_error = None;
                });
            }
            Err(e) => {
                actualizar(app, |i| i.last_error = Some(e.clone()));
                return Err(e);
            }
        }
    }
    if !state.supervisor.swap(true, Ordering::SeqCst) {
        let h = app.clone();
        thread::spawn(move || supervisar(h));
    }
    Ok(info(app))
}

fn supervisar(app: AppHandle) {
    let mut fallos = 0u32;
    loop {
        thread::sleep(SALUD_CADA);
        let state = app.state::<DaemonState>();
        if state.apagando.load(Ordering::SeqCst) {
            state.supervisor.store(false, Ordering::SeqCst);
            return;
        }
        let Ok(token) = token(&app) else { continue };
        let port = info(&app).port;
        let (vivo, salida) = state
            .hijo
            .lock()
            .map(|mut h| match h.as_mut() {
                Some(h) => (h.vivo(), h.salida()),
                None => (false, None),
            })
            .unwrap_or((false, None));
        // 78 = configuración incompleta (CONTRATO §2): reiniciar no lo arregla; se informa y se espera a la app.
        if salida == Some(SALIDA_CONFIG) {
            actualizar(&app, |i| {
                i.ready = false;
                i.last_error = Some("El daemon no arrancó: configuración incompleta (revisa logs/daemon.log).".into());
            });
            continue;
        }
        let sano = vivo && salud(port, &token, Duration::from_secs(4));
        if state.reiniciando.load(Ordering::SeqCst) {
            continue; // un /health del daemon que se está apagando no cuenta
        }
        if sano {
            fallos = 0;
            actualizar(&app, |i| {
                i.ready = true;
                i.pausado = false;
            });
            continue;
        }
        fallos += 1;
        actualizar(&app, |i| i.ready = false);
        // Un daemon que arranca tarda en contestar: se le dan 3 vueltas (15 s) salvo que ya haya muerto.
        if vivo && fallos < FALLOS_PARA_REINICIAR {
            continue;
        }
        {
            let mut r = state.reinicios.lock().unwrap_or_else(|e| e.into_inner());
            r.retain(|t| t.elapsed() < VENTANA_REINICIOS);
            if r.len() >= MAX_REINICIOS {
                actualizar(&app, |i| {
                    i.pausado = true;
                    i.last_error = Some(format!(
                        "El daemon se cayó {} veces en 5 minutos; se deja de reintentar. Revisa logs/daemon.log.",
                        MAX_REINICIOS
                    ))
                });
                if fallos == FALLOS_PARA_REINICIAR {
                    eprintln!("[arbrain] daemon: demasiados reinicios, supervisor en pausa");
                }
                continue;
            }
            r.push(Instant::now());
        }
        eprintln!("[arbrain] daemon sin salud ({} fallos, vivo={}): reinicio", fallos, vivo);
        reiniciar(&app);
        fallos = 0;
    }
}

/// Apaga y vuelve a lanzar el daemon (al cambiar una llave o si se cae). Mismo puerto y token.
pub fn reiniciar(app: &AppHandle) {
    if !desktop_env::EDICION_CLIENTE {
        return;
    }
    let state = app.state::<DaemonState>();
    if state.apagando.load(Ordering::SeqCst) {
        state.reiniciando.store(false, Ordering::SeqCst);
        return;
    }
    let origen = state.origen_web.lock().map(|o| o.clone()).unwrap_or_default();
    let port = info(app).port;
    marcar_reinicio(app);
    let Ok(mut hijo) = state.hijo.lock() else {
        state.reiniciando.store(false, Ordering::SeqCst);
        return;
    };
    if let Some(h) = hijo.take() {
        apagar_hijo(app, port, h);
    }
    match lanzar(app, port, &origen) {
        Ok(h) => {
            let pid = h.id();
            *hijo = Some(h);
            actualizar(app, |i| {
                i.pid = Some(pid);
                i.ready = false;
                i.reinicios += 1;
                i.last_error = None;
            });
        }
        Err(e) => actualizar(app, |i| i.last_error = Some(e)),
    }
    // Desde aquí el supervisor solo ve al daemon nuevo: el primer /health sano lo marca listo.
    state.reiniciando.store(false, Ordering::SeqCst);
}

/// Apagado limpio (CONTRATO §5): `POST /apagar` (la única vía en Windows), hasta 5 s para que cierre la base, y
/// después se fuerza el árbol entero.
fn apagar_hijo(app: &AppHandle, port: u16, mut h: hijos::Hijo) {
    if h.vivo() {
        if let Ok(token) = token(app) {
            pedir_apagado(port, &token);
        }
        let inicio = Instant::now();
        while inicio.elapsed() < Duration::from_secs(5) && h.vivo() {
            thread::sleep(Duration::from_millis(100));
        }
    }
    hijos::terminar(&mut h, Duration::from_secs(2));
}

fn pedir_apagado(port: u16, token: &str) {
    let Ok(addr) = format!("{}:{}", HOST, port).parse::<SocketAddr>() else { return };
    let Ok(mut s) = TcpStream::connect_timeout(&addr, Duration::from_millis(500)) else { return };
    let _ = s.set_read_timeout(Some(Duration::from_secs(2)));
    let req = format!(
        "POST /apagar HTTP/1.1\r\nHost: {}:{}\r\nAuthorization: Bearer {}\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{{}}",
        HOST, port, token
    );
    if s.write_all(req.as_bytes()).is_ok() {
        let mut buf = [0u8; 64];
        let _ = s.read(&mut buf);
    }
}

/// Apaga el daemon al salir de la app (y su árbol: CLI de Claude, servidores MCP).
pub fn apagar(app: &AppHandle) {
    let state = app.state::<DaemonState>();
    state.apagando.store(true, Ordering::SeqCst);
    let port = info(app).port;
    if let Ok(mut hijo) = state.hijo.lock() {
        if let Some(h) = hijo.take() {
            apagar_hijo(app, port, h);
        }
    }
    if let Ok(r) = rutas(app) {
        let _ = fs::remove_file(registro(&r));
    }
}

// ─── Comandos Tauri (contrato en CONTRATO-DAEMON.md › «Comandos Tauri») ─────────────────────────────────────────

/// Estado del daemon del alumno: puerto, salud, reinicios y último error.
#[tauri::command]
pub fn daemon_estado(app: AppHandle) -> DaemonInfo {
    info(&app)
}

/// Reinicia el daemon a pedido (botón «Reintentar» del primer arranque).
#[tauri::command]
pub fn daemon_reiniciar(app: AppHandle) -> Result<(), String> {
    if !desktop_env::EDICION_CLIENTE {
        return Err("Solo en la edición cliente.".into());
    }
    reintentar_tras_pausa(&app);
    Ok(())
}

/// «Reintentar» de la persona: borra el freno anti-bucle (vuelve a tener 5 intentos) y relanza el daemon.
pub fn reintentar_tras_pausa(app: &AppHandle) {
    let state = app.state::<DaemonState>();
    if let Ok(mut r) = state.reinicios.lock() {
        r.clear();
    }
    actualizar(app, |i| i.pausado = false);
    let h = app.clone();
    thread::spawn(move || reiniciar(&h));
}

/// Los comandos del llavero son `async` y leen en un hilo aparte: un comando síncrono de Tauri corre en el hilo
/// principal, y si macOS muestra su diálogo del llavero (firma ad-hoc cambiada tras reinstalar) la ventana se
/// congelaría. La UI sigue viva mientras la persona decide; el daemon ya tiene su propio plazo (`PLAZO_LLAVERO`).
async fn en_hilo<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())
}

/// Si existen las llaves (sin valores): `{ llaves: [{nombre, presente, vista}], listo, almacen, disponible }`.
/// En la edición original no toca el llavero (devuelve «no aplica»).
#[tauri::command]
pub async fn llaves_estado(app: AppHandle) -> Result<llaves::EstadoLlaves, String> {
    let servicio = servicio_llavero(&app);
    en_hilo(move || llaves::estado(&servicio)).await
}

/// Guarda una llave en el llavero y reinicia el daemon para que la tome. Devuelve el estado nuevo.
#[tauri::command]
pub async fn llave_guardar(app: AppHandle, nombre: String, valor: String) -> Result<llaves::EstadoLlaves, String> {
    if !desktop_env::EDICION_CLIENTE {
        return Err("Solo en la edición cliente.".into());
    }
    let servicio = servicio_llavero(&app);
    let nuevo = en_hilo(move || {
        llaves::guardar(&servicio, &nombre, &valor)?;
        Ok::<_, String>(llaves::estado(&servicio))
    })
    .await??;
    marcar_reinicio(&app);
    let h = app.clone();
    thread::spawn(move || reiniciar(&h));
    Ok(nuevo)
}

/// Vista enmascarada de una llave (`sk-ant-…wxyz`) o null. El valor completo nunca sale del lado nativo.
#[tauri::command]
pub async fn llave_leer(app: AppHandle, nombre: String) -> Result<Option<String>, String> {
    if !desktop_env::EDICION_CLIENTE {
        return Err(llaves::NO_APLICA.into());
    }
    if !llaves::nombre_valido(&nombre) {
        return Err("Llave no permitida.".into());
    }
    let servicio = servicio_llavero(&app);
    en_hilo(move || Ok::<_, String>(llaves::leer(&servicio, &nombre)?.as_deref().map(llaves::enmascarar))).await?
}

/// Borra una llave del llavero y reinicia el daemon sin ella.
#[tauri::command]
pub async fn llave_borrar(app: AppHandle, nombre: String) -> Result<llaves::EstadoLlaves, String> {
    if !desktop_env::EDICION_CLIENTE {
        return Err("Solo en la edición cliente.".into());
    }
    let servicio = servicio_llavero(&app);
    let nuevo = en_hilo(move || {
        llaves::borrar(&servicio, &nombre)?;
        Ok::<_, String>(llaves::estado(&servicio))
    })
    .await??;
    marcar_reinicio(&app);
    let h = app.clone();
    thread::spawn(move || reiniciar(&h));
    Ok(nuevo)
}

/// Abre un enlace https en el navegador del sistema sin pasar la URL por los argumentos de un proceso (red team OAuth,
/// M2): la URL de OpenRouter lleva el `state` y el `code_challenge`, y `/usr/bin/open <url>` (lo que hace el opener en
/// macOS) los deja un instante a la vista en `ps`. macOS: `NSWorkspace.openURL`. Windows: el opener ya usa
/// `ShellExecuteW`, sin proceso hijo. Linux: `xdg-open <url>` (residual documentado en RED-TEAM-OAUTH.md).
#[tauri::command]
pub fn abrir_enlace(url: String) -> Result<(), String> {
    if !desktop_env::EDICION_CLIENTE {
        return Err("Solo en la edición cliente.".into());
    }
    if !enlace_valido(&url) {
        return Err("Solo se abren enlaces https.".into());
    }
    abrir_en_sistema(&url)
}

/// `https://` con host, sin espacios ni controles y de largo razonable.
fn enlace_valido(url: &str) -> bool {
    url.len() <= 4096
        && url.strip_prefix("https://").is_some_and(|resto| !resto.is_empty() && !resto.starts_with('/'))
        && !url.chars().any(|c| c.is_whitespace() || c.is_control())
}

#[cfg(target_os = "macos")]
fn abrir_en_sistema(url: &str) -> Result<(), String> {
    use objc2::msg_send;
    use objc2::runtime::{AnyClass, AnyObject, Bool};
    let c = std::ffi::CString::new(url).map_err(|_| "Enlace inválido.".to_string())?;
    let (Some(cadena), Some(nsurl), Some(espacio)) = (AnyClass::get(c"NSString"), AnyClass::get(c"NSURL"), AnyClass::get(c"NSWorkspace")) else {
        return Err("No pude abrir tu navegador.".into());
    };
    // SAFETY: mensajes de Foundation/AppKit con sus tipos documentados; los objetos devueltos son autoliberados y no
    // se guardan más allá de esta llamada.
    unsafe {
        let s: *mut AnyObject = msg_send![cadena, stringWithUTF8String: c.as_ptr()];
        if s.is_null() {
            return Err("Enlace inválido.".into());
        }
        let u: *mut AnyObject = msg_send![nsurl, URLWithString: s];
        if u.is_null() {
            return Err("Enlace inválido.".into());
        }
        let ws: *mut AnyObject = msg_send![espacio, sharedWorkspace];
        if ws.is_null() {
            return Err("No pude abrir tu navegador.".into());
        }
        let ok: Bool = msg_send![ws, openURL: u];
        if ok.as_bool() { Ok(()) } else { Err("No pude abrir tu navegador.".into()) }
    }
}

#[cfg(not(target_os = "macos"))]
fn abrir_en_sistema(url: &str) -> Result<(), String> {
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn puerto_ocupado_en_ipv6_no_esta_libre() {
        // Un «squatter» en [::1] (red team OAuth, M1): con 127.0.0.1 libre, el puerto igual se descarta.
        let Ok(v6) = TcpListener::bind((std::net::Ipv6Addr::LOCALHOST, 0)) else { return }; // equipo sin IPv6
        let p = v6.local_addr().unwrap().port();
        if RESERVADOS.contains(&p) || TcpListener::bind((HOST, p)).is_err() {
            return;
        }
        assert!(!puerto_libre(p));
        drop(v6);
        // Y ocupado en IPv4 tampoco.
        let v4 = TcpListener::bind((HOST, 0)).unwrap();
        assert!(!puerto_libre(v4.local_addr().unwrap().port()));
    }

    #[test]
    fn solo_enlaces_https() {
        assert!(enlace_valido("https://openrouter.ai/auth?callback_url=http%3A%2F%2F127.0.0.1%3A4100%2Fx&state=abc"));
        for malo in ["http://openrouter.ai", "file:///etc/passwd", "https://", "https:///x", "javascript:alert(1)", "https://a b", "https://a\nb", "openrouter.ai"] {
            assert!(!enlace_valido(malo), "{malo}");
        }
        assert!(!enlace_valido(&format!("https://a/{}", "x".repeat(5000))));
    }

    #[test]
    fn rutas_viven_dentro_de_la_carpeta_de_la_app() {
        let datos = Path::new("/tmp/ai.arbrain.app");
        let r = Rutas::desde(datos);
        for p in [&r.daemon, &r.web, &r.store, &r.cerebro, &r.config, &r.claude, &r.logs, &r.motor_sock] {
            assert!(p.starts_with(datos), "{} fuera de la carpeta de la app", p.display());
        }
        assert!(!r.config.to_string_lossy().contains(".config/arbrain"));
    }

    #[test]
    fn socket_largo_cae_a_temporal() {
        let largo = PathBuf::from(format!("/tmp/{}/arbrain", "x".repeat(120)));
        let s = sock_motor(&largo);
        assert!(s.to_string_lossy().len() < 104 + 40);
        assert!(s.ends_with("motor.sock"));
        assert!(!s.starts_with(&largo));
    }

    #[test]
    fn nunca_puertos_de_la_instalacion_original() {
        for p in RESERVADOS {
            assert!(!puerto_libre(p));
        }
        assert!(!puerto_libre(0));
    }

    #[test]
    fn entorno_comun_es_de_la_edicion_cliente() {
        let r = Rutas::desde(Path::new("/tmp/ai.arbrain.app"));
        let env = entorno_comun(&r);
        assert!(env.iter().any(|(k, v)| k == "ARBRAIN_EDICION" && v == "cliente"));
        assert!(env.iter().all(|(k, _)| !k.contains("KEY") && !k.contains("TOKEN")));
    }

    #[test]
    fn llaves_nunca_heredadas() {
        for n in llaves::LLAVES {
            assert!(HEREDADAS_PROHIBIDAS.contains(&n));
        }
    }

    #[test]
    fn secretos_nunca_por_entorno() {
        // Lo que la app entrega por stdin tampoco puede colarse heredado del entorno de quien la lanzó.
        for n in secretos::NUNCA_POR_ENTORNO {
            assert!(HEREDADAS_PROHIBIDAS.contains(&n), "{} podría heredarse", n);
        }
        assert!(HEREDADAS_PROHIBIDAS.contains(&secretos::ENV_SECRETOS));
        assert_eq!(token_confirmar(), secretos::apertura().confirmar);
        assert_ne!(token_confirmar(), secretos::apertura().daemon);
    }

    #[test]
    fn politica_v3_nunca_heredada_ni_fijada_por_entorno_comun() {
        // Lo que cambia el sandbox, el proveedor o la cita de manos no sale del entorno de quien lanza la app.
        for n in ["ARBRAIN_SANDBOX", "ANTHROPIC_BASE_URL", "ARBRAIN_PROVEEDOR_CLAUDE", "ARBRAIN_PLATAFORMA_PRUEBA", "MANOS_CASA_APP", "MANOS_CASA_SOCKET", "MANOS_WINDOWS_EXE", "ARBRAIN_ESPEJO_GUARDA"] {
            assert!(POLITICA_V3.contains(&n), "{} podría heredarse", n);
        }
        let r = Rutas::desde(Path::new("/tmp/arbrain-prueba"));
        assert!(entorno_daemon(&r).iter().chain(entorno_web(&r).iter()).all(|(k, _)| !POLITICA_V3.contains(&k.as_str())));
    }

    #[cfg(unix)]
    #[test]
    fn huerfano_se_reconoce_por_su_linea_de_comando() {
        // El propio proceso de la prueba no es «nuestro daemon»: un pid reciclado nunca se mata.
        assert!(!es_nuestro_daemon(std::process::id(), Path::new("/nada/daemon/dist/index.js")));
        let mut hijo = Command::new("sleep").arg("30").spawn().unwrap();
        assert!(es_nuestro_daemon(hijo.id(), Path::new("sleep 30")));
        let _ = hijo.kill();
        let _ = hijo.wait();
    }

    #[test]
    fn salud_sin_servidor_es_falsa() {
        let l = TcpListener::bind((HOST, 0)).unwrap();
        let p = l.local_addr().unwrap().port();
        drop(l);
        assert!(!salud(p, "x", Duration::from_millis(300)));
    }
}
