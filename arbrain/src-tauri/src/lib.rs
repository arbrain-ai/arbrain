use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::env;
use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use tauri::menu::{Menu, MenuItem, MenuItemKind, Submenu};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_window_state::{AppHandleExt, StateFlags, WindowExt};
use uuid::Uuid;
mod chat_image;
#[cfg(target_os = "macos")]
mod actualizacion;
#[cfg(not(target_os = "macos"))]
#[path = "actualizacion_otros.rs"]
mod actualizacion;
mod daemon;
mod desktop_env;
// Solo en builds de prueba del empaquetado (`--features evidencia`); nunca en el build que se reparte.
#[cfg(feature = "evidencia")]
mod evidencia;
mod hijos;
mod llaves;
mod secretos;
mod senales;
mod motor;
mod permisos;
mod salud_cliente;
mod servidor;
mod tema;
mod ventanas;
use desktop_env::parse_env_file;

const DEFAULT_LOCAL_SERVER_HOST: &str = "127.0.0.1";
const DEFAULT_LOCAL_SERVER_PORT: u16 = 3218;
// Servidor web del Studio (launchd com.levy.arbrain-web): se actualiza solo tras cada push a main, así que la app
// lo prefiere y cada arreglo llega con Cmd+R. Si no responde, se usa el servidor embebido de siempre.
const STUDIO_WEB_PORT: u16 = 3300;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LocalServerInfo {
    url: String,
    ready: bool,
    managed: bool,
    pid: Option<u32>,
    mode: String,
    source_path: Option<String>,
    last_error: Option<String>,
}

impl Default for LocalServerInfo {
    fn default() -> Self {
        Self {
            url: local_server_url(DEFAULT_LOCAL_SERVER_PORT),
            ready: false,
            managed: false,
            pid: None,
            mode: "unknown".to_string(),
            source_path: None,
            last_error: None,
        }
    }
}

#[derive(Default)]
struct LocalServerState {
    child: Mutex<Option<hijos::Hijo>>,
    info: Mutex<LocalServerInfo>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopStatus {
    desktop: bool,
    server: LocalServerInfo,
    workspace_path: String,
    database_path: String,
    pending_count: i64,
    failed_count: i64,
    conflict_count: i64,
    last_synced_at: Option<String>,
    last_pack_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LocalTask {
    id: String,
    cloud_id: Option<String>,
    title: String,
    description: Option<String>,
    status: Option<String>,
    priority: Option<i64>,
    due_at: Option<String>,
    assignee_id: Option<String>,
    updated_at: String,
    deleted_at: Option<String>,
    sync_status: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LocalEvent {
    id: String,
    cloud_id: Option<String>,
    account_email: Option<String>,
    calendar_id: Option<String>,
    title: String,
    description: Option<String>,
    starts_at: String,
    ends_at: Option<String>,
    timezone: Option<String>,
    status: Option<String>,
    updated_at: String,
    deleted_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LocalDrawing {
    id: String,
    cloud_id: Option<String>,
    title: String,
    data_json: String,
    thumbnail_path: Option<String>,
    updated_at: String,
    deleted_at: Option<String>,
    sync_status: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LocalFile {
    id: String,
    source_uri: Option<String>,
    local_path: String,
    content_type: Option<String>,
    sha256: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncQueueItem {
    id: String,
    entity_type: String,
    entity_id: String,
    operation: String,
    payload_json: String,
    status: String,
    attempts: i64,
    last_error: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncResult {
    processed: i64,
    synced: i64,
    failed: i64,
    conflicts: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MarkSyncQueueItemInput {
    id: String,
    status: String,
    last_error: Option<String>,
    cloud_id: Option<String>,
    confirmed_selection: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OfflinePackRequest {
    name: Option<String>,
    notes: Option<String>,
    snapshots: Option<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OfflinePackResult {
    pack_path: String,
    manifest_path: String,
    generated_at: String,
    tasks: usize,
    events: usize,
    drawings: usize,
    files: usize,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotInput {
    module: String,
    key: String,
    payload: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchHit {
    id: String,
    module: String,
    title: String,
    subtitle: Option<String>,
    updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChatPromptInput {
    prompt: String,
    route: Option<String>,
    context_pack_id: Option<String>,
    local_context: Option<Value>,
}

fn now() -> String {
    Utc::now().to_rfc3339()
}

fn local_server_port() -> u16 {
    env::var("MISSION_CONTROL_DESKTOP_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(DEFAULT_LOCAL_SERVER_PORT)
}

/// Puerto del servidor web del Studio. `MISSION_CONTROL_STUDIO_PORT=0` (o `off`) lo desactiva.
fn studio_web_port() -> Option<u16> {
    // Edición cliente: la app nunca carga otro servidor que el suyo (un proceso cualquiera en 3300 recibiría IPC).
    if desktop_env::EDICION_CLIENTE {
        return None;
    }
    match env::var("MISSION_CONTROL_STUDIO_PORT") {
        Ok(value) if matches!(value.trim(), "0" | "off" | "") => None,
        Ok(value) => value.trim().parse::<u16>().ok().or(Some(STUDIO_WEB_PORT)),
        Err(_) => Some(STUDIO_WEB_PORT),
    }
}

/// Un puerto abierto no basta, y /login tampoco (7 oct 2026: el web respondía /login al instante mientras toda ruta
/// del chat esperaba para siempre la URL del daemon; la app lo eligió y Daniel quedó «Sin conexión con el Studio»).
/// Pide la salud REAL del chat, que recorre el camino de un mensaje con plazo propio de 5 s, y exige 2xx en 6 s.
/// Un servidor de antes de esa ruta contesta 404: entonces cae a /login para no abandonar al Studio por un deploy.
fn is_http_healthy(port: u16) -> bool {
    match http_status(port, "/api/salud/chat", Duration::from_secs(6)) {
        Some(head) if status_is_not_found(&head) => http_status(port, "/login", Duration::from_secs(2)).is_some_and(|h| status_is_healthy(&h)),
        Some(head) => status_is_success(&head),
        None => false,
    }
}

/// Las primeras 16 bytes de la respuesta (`HTTP/1.1 200 OK…`), o None si no contesta en `timeout`.
fn http_status(port: u16, path: &str, timeout: Duration) -> Option<[u8; 16]> {
    let addr = format!("{}:{}", DEFAULT_LOCAL_SERVER_HOST, port).parse::<std::net::SocketAddr>().ok()?;
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(800)).ok()?;
    let _ = stream.set_read_timeout(Some(timeout));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
    let request = format!("GET {} HTTP/1.1\r\nHost: {}:{}\r\nConnection: close\r\n\r\n", path, DEFAULT_LOCAL_SERVER_HOST, port);
    stream.write_all(request.as_bytes()).ok()?;
    let mut head = [0u8; 16];
    stream.read_exact(&mut head).ok()?;
    Some(head)
}

/// `HTTP/1.1 200`, `307`, `404`... sirven; `5xx` o cualquier otra cosa no.
fn status_is_healthy(head: &[u8]) -> bool {
    head.starts_with(b"HTTP/1.") && head.get(9).is_some_and(|digit| (b'1'..=b'4').contains(digit))
}

/// Solo `2xx`: la salud del chat responde 503 cuando el web está atorado.
fn status_is_success(head: &[u8]) -> bool {
    head.starts_with(b"HTTP/1.") && head.get(9) == Some(&b'2')
}

fn status_is_not_found(head: &[u8]) -> bool {
    head.starts_with(b"HTTP/1.") && head.get(9..12) == Some(b"404".as_slice())
}

fn local_server_url(port: u16) -> String {
    format!("http://{}:{}", DEFAULT_LOCAL_SERVER_HOST, port)
}

fn is_local_server_ready(port: u16) -> bool {
    TcpStream::connect((DEFAULT_LOCAL_SERVER_HOST, port)).is_ok()
}

fn wait_for_local_server(port: u16, timeout: Duration) -> bool {
    let started = Instant::now();
    while started.elapsed() < timeout {
        if is_local_server_ready(port) {
            return true;
        }
        // 60ms: con 250ms el loop desperdiciaba hasta un cuarto de segundo
        // DESPUÉS de que el server ya estaba listo, en cada apertura.
        thread::sleep(Duration::from_millis(60));
    }
    false
}

/// Nombre del Node que viaja con la app (`bundle.externalBin: binaries/arbrain-node`, edición cliente). No se llama
/// `node` para no chocar en Linux con el `/usr/bin/node` del sistema (el .deb instala los sidecars en `/usr/bin`).
pub(crate) const NODE_EMBEBIDO: &str = if cfg!(windows) { "arbrain-node.exe" } else { "arbrain-node" };

/// `\\?\C:\x` → `C:\x` y `\\?\UNC\srv\x` → `\\srv\x`. `None` si la ruta no es verbatim. Pura (se prueba en todo SO).
fn quitar_verbatim(ruta: &str) -> Option<String> {
    if let Some(resto) = ruta.strip_prefix(r"\\?\UNC\") {
        return Some(format!(r"\\{}", resto));
    }
    let resto = ruta.strip_prefix(r"\\?\")?;
    let b = resto.as_bytes();
    (b.len() >= 2 && b[0].is_ascii_alphabetic() && b[1] == b':').then(|| resto.to_string())
}

/// Ruta apta para un hijo de Node. En Windows `tauri-utils` canonicaliza el ejecutable y `resource_dir()` sale con el
/// prefijo verbatim `\\?\C:\…`; Node 22 no resuelve un script de entrada así (`EISDIR: lstat 'C:'` en
/// `resolveMainPath`): el daemon del alumno moría al nacer en Windows (run 38265923323, 12 oct 2026).
pub(crate) fn ruta_para_hijos(ruta: PathBuf) -> PathBuf {
    if cfg!(windows) {
        if let Some(simple) = ruta.to_str().and_then(quitar_verbatim) {
            return PathBuf::from(simple);
        }
    }
    ruta
}

/// `resource_dir()` sin prefijo verbatim: todo lo que de ahí se pasa a Node (daemon, plantilla, standalone de Next).
pub(crate) fn resource_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().resource_dir().ok().map(ruta_para_hijos)
}

/// Tauri deja el sidecar junto al ejecutable y sin sufijo de plataforma (`Contents/MacOS/arbrain-node`,
/// `arbrain-node.exe` junto a `Arbrain.exe`, `usr/bin/arbrain-node` en el .deb y el AppImage).
fn embedded_node_binary() -> Option<PathBuf> {
    let exe = env::current_exe().ok()?;
    let path = exe.parent()?.join(NODE_EMBEBIDO);
    path.is_file().then_some(path)
}

pub(crate) fn resolve_node_binary() -> PathBuf {
    // Red team 4 L4-6: en la edición cliente el entorno no sustituye el Node embebido.
    for key in ["MISSION_CONTROL_NODE_BINARY", "NODE_BINARY"].iter().filter(|_| !desktop_env::EDICION_CLIENTE) {
        if let Ok(value) = env::var(key) {
            let path = PathBuf::from(value);
            if path.exists() {
                return path;
            }
        }
    }

    // El embebido primero: el alumno no tiene (ni necesita) Node ni Homebrew. La app de Daniel no lo empaqueta y
    // sigue cayendo a los de siempre.
    if let Some(path) = embedded_node_binary() {
        return path;
    }

    #[cfg(windows)]
    let candidates: &[&str] = &["C:\\Program Files\\nodejs\\node.exe"];
    #[cfg(not(windows))]
    let candidates: &[&str] = &["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"];
    for candidate in candidates.iter().copied() {
        let path = PathBuf::from(candidate);
        if path.exists() {
            return path;
        }
    }

    PathBuf::from("node")
}

fn collect_env_paths(app: &AppHandle, server_dir: &Path) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    let mut seen = HashSet::new();

    fn push_path(paths: &mut Vec<PathBuf>, seen: &mut HashSet<String>, candidate: PathBuf) {
        if candidate.exists() {
            let key = candidate.to_string_lossy().to_string();
            if seen.insert(key) {
                paths.push(candidate);
            }
        }
    }

    fn push_ancestors(paths: &mut Vec<PathBuf>, seen: &mut HashSet<String>, path: &Path) {
        for ancestor in path.ancestors().take(12) {
            for candidate in [
                ancestor.join(".env.local"),
                ancestor.join("..").join(".env.local"),
                ancestor.join(".env"),
                ancestor.join("claudeclaw").join(".env"),
            ] {
                push_path(paths, seen, candidate);
            }
        }
    }

    // Edición cliente (AUDITORIA I1): solo las llaves del propio cliente. Nunca se suben carpetas buscando .env
    // ni se lee el paquete: en la Mac de un cliente cualquier .env vecino es ajeno.
    if desktop_env::EDICION_CLIENTE {
        if let Ok(config_dir) = app.path().app_config_dir() {
            for path in desktop_env::client_paths(&config_dir) {
                push_path(&mut paths, &mut seen, path);
            }
        }
        return paths;
    }

    // Runtime credentials must win over the .env snapshot inside the bundle.
    if let Some(home) = desktop_env::home_dir() {
        for path in desktop_env::live_paths(&home) {
            push_path(&mut paths, &mut seen, path);
        }
    }
    push_ancestors(&mut paths, &mut seen, server_dir);
    if let Ok(current_dir) = env::current_dir() {
        push_ancestors(&mut paths, &mut seen, &current_dir);
    }
    if let Ok(current_exe) = env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            push_ancestors(&mut paths, &mut seen, parent);
        }
    }
    if let Some(resource_dir) = resource_dir(app) {
        push_ancestors(&mut paths, &mut seen, &resource_dir);
    }
    if let Some(home) = desktop_env::home_dir() {
        let developer = home.join("Developer");
        // Instalación original: el repo vive en Developer/business-os o en Developer/software/business-os.
        for root in [
            developer.join("business-os"),
            developer.join("software").join("business-os"),
        ] {
            push_path(&mut paths, &mut seen, root.join(".env.local"));
            push_path(&mut paths, &mut seen, root.join(".env"));
            push_path(&mut paths, &mut seen, root.join("arbrain").join(".env.local"));
            push_path(&mut paths, &mut seen, root.join("claudeclaw").join(".env"));
        }
    }

    paths
}

fn desktop_server_env(app: &AppHandle, server_dir: &Path) -> HashMap<String, String> {
    let mut values = HashMap::new();
    for path in collect_env_paths(app, server_dir) {
        parse_env_file(&path, &mut values);
    }

    if let Some(value) = values.get("MC_SUPABASE_URL").cloned() {
        values
            .entry("NEXT_PUBLIC_SUPABASE_URL".to_string())
            .or_insert(value);
    }
    if let Some(value) = values.get("MC_SUPABASE_PUBLISHABLE_KEY").cloned() {
        values
            .entry("NEXT_PUBLIC_SUPABASE_ANON_KEY".to_string())
            .or_insert(value.clone());
        values
            .entry("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY".to_string())
            .or_insert(value);
    }
    if let Some(value) = values.get("MC_SUPABASE_SECRET_KEY").cloned() {
        values
            .entry("SUPABASE_SERVICE_ROLE_KEY".to_string())
            .or_insert(value);
    }
    if let Some(value) = values.get("SUPABASE_ACCESS_TOKEN").cloned() {
        values.entry("SF_SUPABASE_PAT".to_string()).or_insert(value);
    }

    values
}

fn candidate_next_roots(app: &AppHandle) -> Vec<PathBuf> {
    let mut roots = Vec::new();

    if let Ok(override_path) = env::var("MISSION_CONTROL_NEXT_STANDALONE") {
        roots.push(PathBuf::from(override_path));
    }

    if let Some(resource_dir) = resource_dir(app) {
        roots.push(resource_dir.join("next").join("standalone"));
        roots.push(resource_dir.join(".next").join("standalone"));
    }

    if let Ok(current_dir) = env::current_dir() {
        for ancestor in current_dir.ancestors().take(8) {
            roots.push(ancestor.join(".next").join("standalone"));
            roots.push(ancestor.join("next").join("standalone"));
        }
    }

    if let Ok(current_exe) = env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            for ancestor in parent.ancestors().take(10) {
                roots.push(ancestor.join(".next").join("standalone"));
                roots.push(ancestor.join("next").join("standalone"));
            }
        }
    }

    roots
}

fn find_next_server_js(app: &AppHandle) -> Option<PathBuf> {
    candidate_next_roots(app)
        .into_iter()
        .map(|root| {
            if root.file_name().and_then(|name| name.to_str()) == Some("server.js") {
                root
            } else {
                root.join("server.js")
            }
        })
        .find(|path| path.exists())
}

fn set_local_server_info(app: &AppHandle, info: LocalServerInfo) {
    // Una línea por arranque, para saber sin abrir devtools qué servidor eligió la app.
    eprintln!("[arbrain] servidor {} · {} · listo={}", info.mode, info.url, info.ready);
    let state = app.state::<LocalServerState>();
    if let Ok(mut current) = state.info.lock() {
        *current = info;
    };
}

fn local_server_info(app: &AppHandle) -> LocalServerInfo {
    let state = app.state::<LocalServerState>();
    state
        .info
        .lock()
        .map(|info| info.clone())
        .unwrap_or_default()
}

fn ultimo_servidor(app: &AppHandle) -> Option<String> {
    let dir = app.path().app_config_dir().ok()?;
    fs::read_to_string(dir.join("ultimo-servidor")).ok().map(|t| t.trim().to_string())
}

fn recordar_ultimo_servidor(app: &AppHandle, modo: &str) {
    if let Ok(dir) = app.path().app_config_dir() {
        let _ = fs::create_dir_all(&dir);
        let _ = fs::write(dir.join("ultimo-servidor"), modo);
    }
}

impl LocalServerInfo {
    fn studio(port: u16) -> Self {
        Self {
            url: local_server_url(port),
            ready: true,
            managed: false,
            pid: None,
            mode: "studio".to_string(),
            source_path: None,
            last_error: None,
        }
    }
}

/// ¿Es una URL de un servidor de esta máquina (127.0.0.1 / localhost)?
fn es_origen_local(url: &tauri::Url) -> bool {
    matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"))
}

fn ensure_local_server(app: &AppHandle) -> Result<LocalServerInfo, String> {
    // Edición cliente: solo su web local embebida (sin Studio, sin vigilante, sin adoptar servidores ajenos).
    if desktop_env::EDICION_CLIENTE {
        let info = ensure_local_server_cliente(app);
        if let Ok(i) = &info {
            set_local_server_info(app, i.clone());
        }
        return info;
    }
    if let Some(studio_port) = studio_web_port() {
        // Otro puerto es otro origen: localStorage e IndexedDB vacíos (conversación, panel, tema, borradores).
        // Si la última vez la app usó el Studio, se le espera (un deploy dura ~30 s; 11 oct 2026: 8 intentos con el
        // puerto cerrado se gastaban en 8 s). Lo que sea que se use si no llega es PROVISIONAL: servidor::vigilar
        // devuelve todas las ventanas al Studio en cuanto está sano.
        let plazo = servidor::espera_studio_al_arrancar(ultimo_servidor(app).as_deref());
        let inicio = Instant::now();
        loop {
            if is_http_healthy(studio_port) {
                recordar_ultimo_servidor(app, "studio");
                let info = LocalServerInfo::studio(studio_port);
                set_local_server_info(app, info.clone());
                return Ok(info);
            }
            if inicio.elapsed() >= plazo { break; }
            thread::sleep(Duration::from_millis(1500));
        }
    }
    // Si el Studio vuelve, servidor::vigilar muda las ventanas y recuerda «studio» otra vez; una máquina que dejó de
    // tener Studio solo paga la espera una vez.
    recordar_ultimo_servidor(app, "embebido");

    let info = lanzar_embebido(app, local_server_port());
    match &info {
        Ok(i) => set_local_server_info(app, i.clone()),
        Err(e) => {
            let mut i = LocalServerInfo { mode: "error".to_string(), last_error: Some(e.clone()), ..LocalServerInfo::default() };
            i.url = local_server_url(local_server_port());
            set_local_server_info(app, i);
        }
    }
    info
}

/// Levanta (o adopta) el servidor embebido en `port`. Un `next-server` ajeno que ya escucha ahí se adopta solo si
/// contesta HTTP sano y siempre como provisional (servidor::vigilar lo deja en cuanto el Studio vuelve o él muere).
fn lanzar_embebido(app: &AppHandle, port: u16) -> Result<LocalServerInfo, String> {
    // La edición cliente nunca pasa por aquí (su servidor nace en ensure_local_server_cliente con daemon y secretos).
    if desktop_env::EDICION_CLIENTE {
        return Err("La edición cliente no lanza el embebido de la instalación original".to_string());
    }
    let url = local_server_url(port);
    // Un hijo propio que ya salió se recoge antes de levantar otro.
    {
        let state = app.state::<LocalServerState>();
        let mut hijo = state.child.lock().map_err(|e| e.to_string())?;
        if let Some(c) = hijo.as_mut() {
            if matches!(c.child.try_wait(), Ok(Some(_))) { *hijo = None; }
        }
        if let Some(c) = hijo.as_ref() {
            if is_local_server_ready(port) {
                return Ok(LocalServerInfo {
                    url, ready: true, managed: true, pid: Some(c.id()), mode: "managed".to_string(), source_path: None, last_error: None,
                });
            }
        }
    }

    if is_local_server_ready(port) {
        if http_status(port, "/login", Duration::from_secs(3)).is_some_and(|h| status_is_healthy(&h)) {
            return Ok(LocalServerInfo {
                url,
                ready: true,
                managed: false,
                pid: None,
                mode: "external".to_string(),
                source_path: None,
                last_error: None,
            });
        }
        return Err(format!("El puerto {port} está ocupado por un proceso que no responde como servidor de Arbrain"));
    }

    let server_js = find_next_server_js(app).ok_or_else(|| {
        format!(
            "No Next standalone server found. Run `npm run build` first or set MISSION_CONTROL_NEXT_STANDALONE."
        )
    })?;
    let server_dir = server_js
        .parent()
        .ok_or_else(|| "Invalid Next standalone server path".to_string())?;
    let node_binary = resolve_node_binary();

    let server_env = desktop_server_env(app, server_dir);
    let mut command = Command::new(&node_binary);
    command
        .arg("server.js")
        .current_dir(server_dir)
        .envs(server_env)
        .env("PORT", port.to_string())
        .env("HOSTNAME", DEFAULT_LOCAL_SERVER_HOST)
        .env("MISSION_CONTROL_DESKTOP_EMBED", "1")
        .env("NODE_ENV", "production")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    let child = command.spawn().map_err(|error| {
        format!(
            "Could not start Next standalone server with `{}`: {}",
            node_binary.to_string_lossy(),
            error
        )
    })?;
    esperar_y_guardar_servidor(app, hijos::adoptar(child), port, url, &server_js)
}

/// Espera a que el servidor web abra su puerto (30 s) y lo deja como el servidor administrado de la app.
fn esperar_y_guardar_servidor(
    app: &AppHandle,
    mut hijo: hijos::Hijo,
    port: u16,
    url: String,
    server_js: &Path,
) -> Result<LocalServerInfo, String> {
    let pid = hijo.id();
    if !wait_for_local_server(port, Duration::from_secs(30)) {
        if desktop_env::EDICION_CLIENTE {
            hijos::terminar(&mut hijo, Duration::from_secs(2));
            let error = format!(
                "Next standalone server did not become ready on {} within 30s",
                url
            );
            let info = LocalServerInfo {
                url,
                ready: false,
                managed: true,
                pid: Some(pid),
                mode: "error".to_string(),
                source_path: Some(server_js.to_string_lossy().to_string()),
                last_error: Some(error.clone()),
            };
            set_local_server_info(app, info);
            return Err(error);
        }
        // Original: quien llama (ensure_local_server o servidor::vigilar) registra el error.
        let _ = hijo.child.kill();
        let _ = hijo.child.wait();
        return Err(format!("Next standalone server did not become ready on {} within 30s", url));
    }

    {
        let state = app.state::<LocalServerState>();
        let mut managed_child = state.child.lock().map_err(|error| error.to_string())?;
        *managed_child = Some(hijo);
    }

    Ok(LocalServerInfo {
        url,
        ready: true,
        managed: true,
        pid: Some(pid),
        mode: "managed".to_string(),
        source_path: Some(server_js.to_string_lossy().to_string()),
        last_error: None,
    })
}

/// Edición cliente: puertos libres propios (nunca 3000/3099/3218/3300 ni un servidor ajeno ya abierto), daemon
/// propio lanzado antes que la web, y la web con la URL y el token de ese daemon.
fn ensure_local_server_cliente(app: &AppHandle) -> Result<LocalServerInfo, String> {
    let rutas = daemon::rutas(app)?;
    desktop_env::mark_client_edition(&rutas.config)
        .map_err(|error| format!("No se pudo preparar la carpeta de la app: {}", error))?;

    let port = daemon::puerto(app, "puerto-web", &[])?;
    let url = local_server_url(port);
    daemon::preparar_puerto(app, &[port])?;
    // La ventana solo puede hablar con la app (IPC) desde el origen exacto de SU servidor (AUDITORIA, deseable):
    // ni `127.0.0.1:*` ni el 3300 del Studio.
    conceder_ipc_cliente(app, &url)?;
    daemon::ensure_daemon(app, &url)?;
    lanzar_web_cliente(app, port, url)
}

/// Lanza (o relanza, desde `vigilar_web_cliente`) el servidor web del alumno en `port` y lo espera hasta 30 s.
fn lanzar_web_cliente(app: &AppHandle, port: u16, url: String) -> Result<LocalServerInfo, String> {
    let rutas = daemon::rutas(app)?;
    let daemon_port = daemon::info(app).port;
    let server_js = find_next_server_js(app)
        .ok_or_else(|| "Esta app no trae su servidor web (falta resources/next/standalone).".to_string())?;
    let server_dir = server_js
        .parent()
        .ok_or_else(|| "Invalid Next standalone server path".to_string())?;
    let node_binary = resolve_node_binary();
    let token = daemon::token(app)?;
    let daemon_url = local_server_url(daemon_port);

    // El servidor sabe que es edición cliente y conoce el secreto por apertura (I5): sin él, ninguna petición es
    // «la app», venga con el Host que venga. Secretos por stdin (CONTRATO v2 §2.1): `node -e <preludio> server.js`
    // los lee y los pone en la memoria de ese proceso; su entorno inicial (lo que muestra `ps eww`) no los tiene.
    let secret = desktop_secret_for(app)?;
    let mut command = Command::new(&node_binary);
    command
        .arg("-e")
        .arg(secretos::PRELUDIO_WEB)
        .arg("server.js")
        .current_dir(server_dir)
        .envs(desktop_server_env(app, server_dir))
        .envs(daemon::entorno_web(&rutas))
        .env("CLAUDECLAW_URL", &daemon_url)
        .env("CLAUDECLAW_URL_PINNED", &daemon_url)
        .env(secretos::ENV_SECRETOS, "stdin")
        // Carril T: stdin abierto = la app vive; si muere (o queda huérfana con ppid 1), Next se cierra solo.
        .env("ARBRAIN_VIGILAR_STDIN", "1")
        .env("PORT", port.to_string())
        .env("HOSTNAME", DEFAULT_LOCAL_SERVER_HOST)
        .env("MISSION_CONTROL_DESKTOP_EMBED", "1")
        .env("NODE_ENV", "production")
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    // Después de `envs`: nada sensible llega por entorno, ni heredado ni de un `arbrain.env`.
    // Contrato v3: tampoco lo que cambia la política de los agentes (la web lee `ARBRAIN_SANDBOX` para su aviso).
    for key in secretos::NUNCA_POR_ENTORNO.iter().chain(["ANTHROPIC_AUTH_TOKEN", "NODE_OPTIONS", "ARBRAIN_MOTOR_SECRETOS"].iter()).chain(daemon::POLITICA_V3.iter()) {
        command.env_remove(key);
    }
    let mut hijo = hijos::lanzar(&mut command).map_err(|error| {
        format!("No se pudo arrancar el servidor web con `{}`: {}", node_binary.to_string_lossy(), error)
    })?;
    let a = secretos::apertura();
    let linea = secretos::linea(&[
        ("ARBRAIN_DESKTOP_SECRET", &secret),
        ("OPENCLAW_GATEWAY_TOKEN", &token),
        ("ARBRAIN_TOKEN_CONFIRMAR", daemon::token_confirmar()),
        ("ARBRAIN_PASE_AGENTE", &a.pase_agente),
        // Red team 4 M4-3: la web es cliente del motor (Taller); su saludo lleva este token.
        ("ARBRAIN_MOTOR_TOKEN", &a.motor),
    ]);
    if let Err(error) = secretos::entregar(&mut hijo.child, &linea, false) {
        hijos::terminar(&mut hijo, Duration::from_secs(2));
        return Err(format!("No se pudieron entregar los secretos al servidor web: {}", error));
    }
    esperar_y_guardar_servidor(app, hijo, port, url, &server_js)
}

/// Supervisor del servidor web de la edición cliente (resiliencia, 12 oct 2026). Antes nadie lo vigilaba: si Next
/// moría, la ventana quedaba sin servidor hasta cerrar la app. Cada 5 s: hijo vivo + `GET /api/version` (4 s). Muerto =
/// relanzar ya; colgado = tras 3 sondas; máx. 5 en 5 min y luego «necesito ayuda» (`salud_cliente::decidir`).
fn vigilar_web_cliente(app: AppHandle) {
    thread::spawn(move || {
        let mut fallos = 0u32;
        loop {
            thread::sleep(salud_cliente::CADA);
            let salud = app.state::<salud_cliente::WebSalud>();
            if salud.apagando.load(Ordering::SeqCst) {
                return;
            }
            let info = local_server_info(&app);
            let Some(port) = tauri::Url::parse(&info.url).ok().and_then(|u| u.port()) else { continue };
            let vivo = app
                .state::<LocalServerState>()
                .child
                .lock()
                .map(|mut c| c.as_mut().is_some_and(|h| h.vivo()))
                .unwrap_or(false);
            let sano = vivo && http_status(port, "/api/version", salud_cliente::PLAZO_SONDA).is_some_and(|h| status_is_success(&h));
            fallos = if sano { 0 } else { fallos.saturating_add(1) };
            let recientes = {
                let mut r = salud.reinicios.lock().unwrap_or_else(|e| e.into_inner());
                r.retain(|t| t.elapsed() < salud_cliente::VENTANA_REINICIOS);
                r.len()
            };
            match salud_cliente::decidir(sano, vivo, fallos, recientes) {
                salud_cliente::Paso::Nada => {
                    salud.reparando.store(false, Ordering::SeqCst);
                    salud.pausado.store(false, Ordering::SeqCst);
                }
                salud_cliente::Paso::Esperar => salud.reparando.store(true, Ordering::SeqCst),
                salud_cliente::Paso::Pausa => {
                    salud.reparando.store(false, Ordering::SeqCst);
                    if !salud.pausado.swap(true, Ordering::SeqCst) {
                        eprintln!("[arbrain] web: demasiados reinicios, supervisor en pausa");
                    }
                }
                salud_cliente::Paso::Reiniciar => {
                    fallos = 0;
                    salud.reinicios.lock().unwrap_or_else(|e| e.into_inner()).push(Instant::now());
                    salud.reparando.store(true, Ordering::SeqCst);
                    eprintln!("[arbrain] web sin salud (vivo={}): relanzando en {}", vivo, info.url);
                    relanzar_web_cliente(&app, port, info.url.clone());
                }
            }
        }
    });
}

/// Relanza el web en el mismo puerto y devuelve la ventana a la ruta donde estaba (nueva cookie de sesión).
fn relanzar_web_cliente(app: &AppHandle, port: u16, url: String) {
    terminar_web(app);
    let salud = app.state::<salud_cliente::WebSalud>();
    match lanzar_web_cliente(app, port, url.clone()) {
        Ok(nuevo) => {
            set_local_server_info(app, nuevo);
            *salud.ultimo_error.lock().unwrap_or_else(|e| e.into_inner()) = None;
            // La app ya cargada sigue sola (misma cookie: el secreto es por apertura) y no se recarga: no se pierde
            // lo escrito. Solo si la ventana quedó en una página de error (sin la marca que pone `EstadoArbrain`)
            // vuelve a entrar por la sesión a la misma ruta.
            if let (Some(w), Ok(secret)) = (app.get_webview_window("main"), desktop_secret_for(app)) {
                let ruta = w.url().ok().filter(|u| u.port() == Some(port)).map(|u| u.path().to_string()).unwrap_or_else(|| "/chat".into());
                let entrada = desktop_env::session_entry_url(&url, &secret, &ruta);
                if let Ok(js) = serde_json::to_string(&entrada) {
                    let _ = w.eval(&format!("if(!document.documentElement||document.documentElement.dataset.arbrainVivo!=='1')location.replace({})", js));
                }
            }
        }
        Err(e) => {
            eprintln!("[arbrain] web: el relanzamiento falló: {}", e);
            *salud.ultimo_error.lock().unwrap_or_else(|e| e.into_inner()) = Some(e);
        }
    }
}

/// Estado visible de la app del alumno (verde / reparando / necesito ayuda). Llega por IPC: la ventana lo pinta
/// aunque su servidor web esté caído.
#[tauri::command]
fn salud_app(app: AppHandle) -> Result<salud_cliente::SaludApp, String> {
    if !desktop_env::EDICION_CLIENTE {
        return Err("Solo en la edición cliente.".into());
    }
    let salud = app.state::<salud_cliente::WebSalud>();
    let info = local_server_info(&app);
    let reinicios_web = salud.reinicios.lock().map(|r| r.len()).unwrap_or(0);
    Ok(salud_cliente::estado(
        &daemon::info(&app),
        info.ready,
        salud.reparando.load(Ordering::SeqCst),
        salud.pausado.load(Ordering::SeqCst),
        reinicios_web,
    ))
}

/// «Reintentar» tras «necesito ayuda»: devuelve los intentos a los dos supervisores y relanza lo caído.
#[tauri::command]
fn salud_reintentar(app: AppHandle) -> Result<(), String> {
    if !desktop_env::EDICION_CLIENTE {
        return Err("Solo en la edición cliente.".into());
    }
    let salud = app.state::<salud_cliente::WebSalud>();
    salud.reinicios.lock().unwrap_or_else(|e| e.into_inner()).clear();
    let web_pausado = salud.pausado.swap(false, Ordering::SeqCst);
    if daemon::info(&app).pausado || !daemon::info(&app).ready {
        daemon::reintentar_tras_pausa(&app);
    }
    if web_pausado {
        let info = local_server_info(&app);
        if let Some(port) = tauri::Url::parse(&info.url).ok().and_then(|u| u.port()) {
            let h = app.clone();
            thread::spawn(move || relanzar_web_cliente(&h, port, info.url));
        }
    }
    Ok(())
}

/// Permisos IPC de la edición cliente, atados al origen exacto de su servidor local (el puerto se elige al
/// arrancar, por eso se conceden en tiempo de ejecución y no en `capabilities/`).
fn conceder_ipc_cliente(app: &AppHandle, origen: &str) -> Result<(), String> {
    static CONCEDIDO: OnceLock<()> = OnceLock::new();
    if CONCEDIDO.get().is_some() {
        return Ok(());
    }
    let capacidad = tauri::ipc::CapabilityBuilder::new("cliente-origen")
        .remote(origen.to_string())
        .local(false)
        .windows(["main", "pestana-*", "vista-*", "fantasma"])
        .permission("core:default")
        .permission("opener:default")
        .permission("core:window:allow-set-theme")
        .permission("core:window:allow-set-fullscreen")
        .permission("core:window:allow-is-fullscreen")
        .permission("allow-local-first")
        .permission("allow-permisos")
        .permission("allow-actualizacion")
        .permission("allow-tema-nativo")
        .permission("allow-read-chat-image")
        .permission("allow-cliente");
    app.add_capability(capacidad).map_err(|error| format!("Permisos de la ventana: {}", error))?;
    let _ = CONCEDIDO.set(());
    Ok(())
}

/// Apagado ordenado de la edición cliente fuera del ciclo normal de Tauri (señal de terminación): la web y su
/// grupo, el daemon por `POST /apagar` (y su árbol si no sale) y el motor. Cada paso es idempotente: si después
/// llega `RunEvent::Exit`, no queda nada que apagar.
#[cfg_attr(not(unix), allow(dead_code))]
fn apagar_hijos_cliente(app: &AppHandle) {
    stop_local_server(app);
    daemon::apagar(app);
    motor::apagar_cliente();
}

fn stop_local_server(app: &AppHandle) {
    // Apagado de la app: el supervisor del web no debe relanzar lo que se está cerrando.
    if desktop_env::EDICION_CLIENTE {
        app.state::<salud_cliente::WebSalud>().apagando.store(true, Ordering::SeqCst);
    }
    terminar_web(app);
}

/// Termina el hijo web gestionado (sin marcar apagado: el supervisor lo usa para relanzar).
fn terminar_web(app: &AppHandle) {
    let state = app.state::<LocalServerState>();
    if let Ok(mut child) = state.child.lock() {
        if let Some(mut hijo) = child.take() {
            if desktop_env::EDICION_CLIENTE {
                hijos::terminar(&mut hijo, Duration::from_secs(3));
            } else {
                let _ = hijo.child.kill();
                let _ = hijo.child.wait();
            }
        }
    };
}

/// Secreto de escritorio de la edición cliente: por apertura y solo en memoria (CONTRATO v2 §2.1). Antes vivía en
/// `<config>/desktop-secret`, legible por un agente con Bash, que con él podía pasar por «la app» ante la web y
/// resolver confirmaciones; ese archivo se borra al arrancar.
fn desktop_secret_for(app: &AppHandle) -> Result<String, String> {
    let dir = app.path().app_config_dir().map_err(|error| error.to_string())?;
    secretos::borrar_restos(&dir);
    Ok(secretos::apertura().escritorio.clone())
}

fn create_main_window(app: &AppHandle, server_url: &str) -> Result<(), tauri::Error> {
    // Arbrain abre en el chat (1 oct, pedido de Daniel): el atajo también cae ahí; Hoy queda a un toque.
    let hoy = take_hoy_intent();
    let destination = if desktop_env::EDICION_CLIENTE && local_server_info(app).managed {
        // Edición cliente: la primera carga cambia el secreto por una cookie HttpOnly del servidor local.
        match desktop_secret_for(app) {
            Ok(secret) => desktop_env::session_entry_url(server_url, &secret, if hoy { "/chat" } else { "/" }),
            Err(_) => server_url.to_string(),
        }
    } else if hoy { format!("{}/chat", server_url.trim_end_matches('/')) } else { server_url.to_string() };
    let url = tauri::Url::parse(&destination)
        .map(WebviewUrl::External)
        .map_err(tauri::Error::InvalidUrl)?;

    // Estado de ventana (4 oct 2026): tras una actualización la app volvía en el monitor izquierdo.
    // La ventana nace OCULTA, se le devuelve monitor, posición, tamaño y maximizada/pantalla completa
    // guardados, y solo entonces se muestra: no parpadea en el otro monitor. Sin estado guardado
    // (primer arranque) o con su monitor desconectado, nace maximizada en el principal como antes.
    let con_estado = estado_ventana_guardado(app);
    let ventana = WebviewWindowBuilder::new(app, "main", url)
        .title("Arbrain")
        .visible(false)
        .inner_size(1440.0, 920.0)
        .min_inner_size(1080.0, 720.0)
        .resizable(true)
        // Titlebar nativa en oscuro por default (la app arranca en tema dark). El
        // toggle de tema la sigue en runtime via getCurrentWindow().setTheme (JS).
        .theme(Some(tauri::Theme::Dark))
        // El handler nativo de drag&drop de Tauri intercepta los eventos HTML5
        // (draggable/onDrop del sidebar del canvas); sin esto, arrastrar pages
        // a folders no funciona en la desktop app.
        .disable_drag_drop_handler()
        .build()?;

    let _ = ventana.restore_state(ESTADO_VENTANA);
    if !con_estado && !ventana.is_maximized().unwrap_or(false) {
        let _ = ventana.maximize();
    }
    let _ = ventana.show();
    if !ARRANQUE_SILENCIOSO.load(Ordering::SeqCst) {
        let _ = ventana.set_focus();
    }

    Ok(())
}

/// Qué se recuerda de la ventana principal: monitor/posición, tamaño, maximizada y pantalla completa.
const ESTADO_VENTANA: StateFlags = StateFlags::SIZE
    .union(StateFlags::POSITION)
    .union(StateFlags::MAXIMIZED)
    .union(StateFlags::FULLSCREEN);

fn estado_ventana_guardado(app: &AppHandle) -> bool {
    let Ok(dir) = app.path().app_config_dir() else { return false };
    fs::read_to_string(dir.join(".window-state.json")).is_ok_and(|raw| raw.contains("\"main\""))
}

/// Guarda el estado ya, sin esperar al cierre (un relanzamiento por actualización o un crash no deben perderlo).
pub fn guardar_estado_ventana(app: &AppHandle) {
    let _ = app.save_window_state(ESTADO_VENTANA);
}

static GUARDADO_PROGRAMADO: AtomicBool = AtomicBool::new(false);

/// Mover o redimensionar llega a ráfagas: se agrupa en un solo guardado ~1 s después.
/// El guardado corre en el hilo principal: desde otro hilo, save_window_state toma el mutex
/// del plugin y espera al hilo principal para leer la ventana, mientras este espera ese mutex
/// en su propio on_window_event (Moved/Resized). Ese deadlock congeló la app el 4 oct.
fn programar_guardado_estado(app: &AppHandle) {
    if GUARDADO_PROGRAMADO.swap(true, Ordering::SeqCst) { return; }
    let app = app.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(1000));
        let app_principal = app.clone();
        let _ = app.run_on_main_thread(move || {
            GUARDADO_PROGRAMADO.store(false, Ordering::SeqCst);
            guardar_estado_ventana(&app_principal);
        });
    });
}

// F4's launcher writes only a short-lived intent, never a URL or script. The
// existing macOS reopen event brings the SAME installed window to the chat.
fn take_hoy_intent() -> bool {
    // El lanzador F4 y su carpeta `~/.config/arbrain` son de la instalación de Daniel.
    if desktop_env::EDICION_CLIENTE { return false; }
    let Some(home) = desktop_env::home_dir() else { return false; };
    let path = home.join(".config/arbrain/open-hoy.json");
    let Ok(raw) = fs::read_to_string(&path) else { return false; };
    let _ = fs::remove_file(&path);
    let Ok(value) = serde_json::from_str::<Value>(&raw) else { return false; };
    let timestamp = value.get("timestamp").and_then(Value::as_i64).unwrap_or(0);
    let age = Utc::now().timestamp() - timestamp;
    value.get("action").and_then(Value::as_str) == Some("hoy") && (0..120).contains(&age)
}

/// El relevo de una actualización deja una marca cuando Arbrain NO era la app al frente: esta
/// arrancada debe nacer sin activarse ni tomar el teclado (8 oct 2026, «me quita el focus»).
static ARRANQUE_SILENCIOSO: AtomicBool = AtomicBool::new(false);

fn take_relevo_silencioso() -> bool {
    // Solo la escribe el relevo de actualizacion.rs, que la edición cliente no usa.
    if desktop_env::EDICION_CLIENTE { return false; }
    let Some(home) = desktop_env::home_dir() else { return false; };
    let path = home.join(".config/arbrain/relevo-silencioso");
    let Ok(raw) = fs::read_to_string(&path) else { return false; };
    let _ = fs::remove_file(&path);
    let age = Utc::now().timestamp() - raw.trim().parse::<i64>().unwrap_or(0);
    (0..120).contains(&age)
}

fn workspace_root(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let root = base.join("workspaces").join("default");
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    fs::create_dir_all(root.join("packs")).map_err(|error| error.to_string())?;
    Ok(root)
}

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(workspace_root(app)?.join("db.sqlite"))
}

fn open_db(app: &AppHandle) -> Result<Connection, String> {
    let path = db_path(app)?;
    let conn = Connection::open(path).map_err(|error| error.to_string())?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        pragma journal_mode = WAL;
        pragma foreign_keys = ON;

        create table if not exists local_events (
          id text primary key,
          cloud_id text,
          account_email text,
          calendar_id text,
          title text not null,
          description text,
          starts_at text not null,
          ends_at text,
          timezone text,
          status text not null default 'local',
          updated_at text not null,
          deleted_at text
        );

        create table if not exists local_tasks (
          id text primary key,
          cloud_id text,
          title text not null,
          description text,
          status text,
          priority integer,
          due_at text,
          assignee_id text,
          updated_at text not null,
          deleted_at text,
          sync_status text not null default 'local'
        );

        create table if not exists local_drawings (
          id text primary key,
          cloud_id text,
          title text not null,
          data_json text not null,
          thumbnail_path text,
          updated_at text not null,
          deleted_at text,
          sync_status text not null default 'local'
        );

        create table if not exists local_files (
          id text primary key,
          source_uri text,
          local_path text not null,
          content_type text,
          sha256 text,
          created_at text not null,
          updated_at text not null
        );

        create table if not exists sync_queue (
          id text primary key,
          entity_type text not null,
          entity_id text not null,
          operation text not null,
          payload_json text not null,
          status text not null default 'pending',
          attempts integer not null default 0,
          last_error text,
          created_at text not null,
          updated_at text not null
        );

        create table if not exists sync_state (
          key text primary key,
          value_json text not null,
          updated_at text not null
        );

        create table if not exists local_snapshots (
          key text primary key,
          module text not null,
          payload_json text not null,
          updated_at text not null
        );

        create index if not exists idx_sync_queue_status on sync_queue(status, updated_at);
        create index if not exists idx_local_tasks_updated on local_tasks(updated_at);
        create index if not exists idx_local_events_range on local_events(starts_at, ends_at);
        create index if not exists idx_local_drawings_updated on local_drawings(updated_at);
        "#,
    )
    .map_err(|error| error.to_string())?;
    ensure_column(conn, "local_events", "account_email", "text")?;
    Ok(())
}

fn ensure_column(
    conn: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<(), String> {
    let mut stmt = conn
        .prepare(&format!("pragma table_info({})", table))
        .map_err(|error| error.to_string())?;
    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    if !columns.iter().any(|name| name == column) {
        conn.execute(
            &format!("alter table {} add column {} {}", table, column, definition),
            [],
        )
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn count_queue(conn: &Connection, status: &str) -> Result<i64, String> {
    conn.query_row(
        "select count(*) from sync_queue where status = ?1",
        params![status],
        |row| row.get(0),
    )
    .map_err(|error| error.to_string())
}

fn read_sync_state(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "select value_json from sync_state where key = ?1",
        params![key],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(|error| error.to_string())
}

fn write_sync_state(conn: &Connection, key: &str, value: Value) -> Result<(), String> {
    let updated = now();
    conn.execute(
        "insert into sync_state (key, value_json, updated_at)
         values (?1, ?2, ?3)
         on conflict(key) do update set value_json = excluded.value_json, updated_at = excluded.updated_at",
        params![key, value.to_string(), updated],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn enqueue(
    conn: &Connection,
    entity_type: &str,
    entity_id: &str,
    operation: &str,
    payload: Value,
) -> Result<SyncQueueItem, String> {
    let item = SyncQueueItem {
        id: format!("queue_{}", Uuid::new_v4()),
        entity_type: entity_type.to_string(),
        entity_id: entity_id.to_string(),
        operation: operation.to_string(),
        payload_json: payload.to_string(),
        status: "pending".to_string(),
        attempts: 0,
        last_error: None,
        created_at: now(),
        updated_at: now(),
    };
    conn.execute(
        "insert into sync_queue
         (id, entity_type, entity_id, operation, payload_json, status, attempts, last_error, created_at, updated_at)
         values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            item.id,
            item.entity_type,
            item.entity_id,
            item.operation,
            item.payload_json,
            item.status,
            item.attempts,
            item.last_error,
            item.created_at,
            item.updated_at
        ],
    )
    .map_err(|error| error.to_string())?;
    Ok(item)
}

fn row_to_queue(row: &rusqlite::Row<'_>) -> rusqlite::Result<SyncQueueItem> {
    Ok(SyncQueueItem {
        id: row.get(0)?,
        entity_type: row.get(1)?,
        entity_id: row.get(2)?,
        operation: row.get(3)?,
        payload_json: row.get(4)?,
        status: row.get(5)?,
        attempts: row.get(6)?,
        last_error: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

#[tauri::command]
fn desktop_status(app: AppHandle) -> Result<DesktopStatus, String> {
    let root = workspace_root(&app)?;
    let db = db_path(&app)?;
    let conn = open_db(&app)?;
    let last_synced_at = read_sync_state(&conn, "last_synced_at")?
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .and_then(|value| value.as_str().map(ToOwned::to_owned));
    let last_pack_path = read_sync_state(&conn, "last_pack_path")?
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .and_then(|value| value.as_str().map(ToOwned::to_owned));

    Ok(DesktopStatus {
        desktop: true,
        server: local_server_info(&app),
        workspace_path: root.to_string_lossy().to_string(),
        database_path: db.to_string_lossy().to_string(),
        pending_count: count_queue(&conn, "pending")?,
        failed_count: count_queue(&conn, "failed")?,
        conflict_count: count_queue(&conn, "conflict")?,
        last_synced_at,
        last_pack_path,
    })
}

#[tauri::command]
fn list_local_tasks(app: AppHandle) -> Result<Vec<LocalTask>, String> {
    let conn = open_db(&app)?;
    let mut stmt = conn
        .prepare(
            "select id, cloud_id, title, description, status, priority, due_at, assignee_id,
                    updated_at, deleted_at, sync_status
             from local_tasks
             where deleted_at is null
             order by updated_at desc",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(LocalTask {
                id: row.get(0)?,
                cloud_id: row.get(1)?,
                title: row.get(2)?,
                description: row.get(3)?,
                status: row.get(4)?,
                priority: row.get(5)?,
                due_at: row.get(6)?,
                assignee_id: row.get(7)?,
                updated_at: row.get(8)?,
                deleted_at: row.get(9)?,
                sync_status: row.get(10)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn upsert_local_task(
    app: AppHandle,
    task: LocalTask,
    queue: Option<bool>,
) -> Result<LocalTask, String> {
    let conn = open_db(&app)?;
    let updated_at = if task.updated_at.trim().is_empty() {
        now()
    } else {
        task.updated_at.clone()
    };
    let sync_status = task
        .sync_status
        .clone()
        .unwrap_or_else(|| "queued".to_string());
    conn.execute(
        "insert into local_tasks
         (id, cloud_id, title, description, status, priority, due_at, assignee_id, updated_at, deleted_at, sync_status)
         values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
         on conflict(id) do update set
           cloud_id = excluded.cloud_id,
           title = excluded.title,
           description = excluded.description,
           status = excluded.status,
           priority = excluded.priority,
           due_at = excluded.due_at,
           assignee_id = excluded.assignee_id,
           updated_at = excluded.updated_at,
           deleted_at = excluded.deleted_at,
           sync_status = excluded.sync_status",
        params![
            task.id,
            task.cloud_id,
            task.title,
            task.description,
            task.status,
            task.priority,
            task.due_at,
            task.assignee_id,
            updated_at,
            task.deleted_at,
            sync_status
        ],
    )
    .map_err(|error| error.to_string())?;

    let saved = LocalTask {
        updated_at,
        sync_status: Some(sync_status),
        ..task
    };
    if queue.unwrap_or(true) {
        enqueue(
            &conn,
            "task",
            &saved.id,
            "upsert",
            serde_json::to_value(&saved).map_err(|error| error.to_string())?,
        )?;
    }
    Ok(saved)
}

#[tauri::command]
fn list_local_events(
    app: AppHandle,
    from: Option<String>,
    to: Option<String>,
) -> Result<Vec<LocalEvent>, String> {
    let conn = open_db(&app)?;
    let mut sql = String::from(
        "select id, cloud_id, account_email, calendar_id, title, description, starts_at, ends_at, timezone, status, updated_at, deleted_at
         from local_events
         where deleted_at is null",
    );
    if from.is_some() {
        sql.push_str(" and starts_at >= ?1");
    }
    if to.is_some() {
        sql.push_str(if from.is_some() {
            " and starts_at <= ?2"
        } else {
            " and starts_at <= ?1"
        });
    }
    sql.push_str(" order by starts_at asc");

    let mut stmt = conn.prepare(&sql).map_err(|error| error.to_string())?;
    let map_row = |row: &rusqlite::Row<'_>| {
        Ok(LocalEvent {
            id: row.get(0)?,
            cloud_id: row.get(1)?,
            account_email: row.get(2)?,
            calendar_id: row.get(3)?,
            title: row.get(4)?,
            description: row.get(5)?,
            starts_at: row.get(6)?,
            ends_at: row.get(7)?,
            timezone: row.get(8)?,
            status: row.get(9)?,
            updated_at: row.get(10)?,
            deleted_at: row.get(11)?,
        })
    };

    let rows = match (from, to) {
        (Some(from), Some(to)) => stmt.query_map(params![from, to], map_row),
        (Some(from), None) => stmt.query_map(params![from], map_row),
        (None, Some(to)) => stmt.query_map(params![to], map_row),
        (None, None) => stmt.query_map([], map_row),
    }
    .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn upsert_local_event(
    app: AppHandle,
    event: LocalEvent,
    queue: Option<bool>,
) -> Result<LocalEvent, String> {
    let conn = open_db(&app)?;
    let updated_at = if event.updated_at.trim().is_empty() {
        now()
    } else {
        event.updated_at.clone()
    };
    let status = event.status.clone().unwrap_or_else(|| "queued".to_string());
    conn.execute(
        "insert into local_events
         (id, cloud_id, account_email, calendar_id, title, description, starts_at, ends_at, timezone, status, updated_at, deleted_at)
         values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
         on conflict(id) do update set
           cloud_id = excluded.cloud_id,
           account_email = excluded.account_email,
           calendar_id = excluded.calendar_id,
           title = excluded.title,
           description = excluded.description,
           starts_at = excluded.starts_at,
           ends_at = excluded.ends_at,
           timezone = excluded.timezone,
           status = excluded.status,
           updated_at = excluded.updated_at,
           deleted_at = excluded.deleted_at",
        params![
            event.id,
            event.cloud_id,
            event.account_email,
            event.calendar_id,
            event.title,
            event.description,
            event.starts_at,
            event.ends_at,
            event.timezone,
            status,
            updated_at,
            event.deleted_at
        ],
    )
    .map_err(|error| error.to_string())?;

    let saved = LocalEvent {
        updated_at,
        status: Some(status),
        ..event
    };
    if queue.unwrap_or(true) {
        enqueue(
            &conn,
            "calendar_event",
            &saved.id,
            "upsert",
            serde_json::to_value(&saved).map_err(|error| error.to_string())?,
        )?;
    }
    Ok(saved)
}

#[tauri::command]
fn list_local_drawings(app: AppHandle) -> Result<Vec<LocalDrawing>, String> {
    let conn = open_db(&app)?;
    let mut stmt = conn
        .prepare(
            "select id, cloud_id, title, data_json, thumbnail_path, updated_at, deleted_at, sync_status
             from local_drawings
             where deleted_at is null
             order by updated_at desc",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(LocalDrawing {
                id: row.get(0)?,
                cloud_id: row.get(1)?,
                title: row.get(2)?,
                data_json: row.get(3)?,
                thumbnail_path: row.get(4)?,
                updated_at: row.get(5)?,
                deleted_at: row.get(6)?,
                sync_status: row.get(7)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn upsert_local_drawing(
    app: AppHandle,
    drawing: LocalDrawing,
    queue: Option<bool>,
) -> Result<LocalDrawing, String> {
    let conn = open_db(&app)?;
    let updated_at = if drawing.updated_at.trim().is_empty() {
        now()
    } else {
        drawing.updated_at.clone()
    };
    let sync_status = drawing
        .sync_status
        .clone()
        .unwrap_or_else(|| "queued".to_string());
    conn.execute(
        "insert into local_drawings
         (id, cloud_id, title, data_json, thumbnail_path, updated_at, deleted_at, sync_status)
         values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         on conflict(id) do update set
           cloud_id = excluded.cloud_id,
           title = excluded.title,
           data_json = excluded.data_json,
           thumbnail_path = excluded.thumbnail_path,
           updated_at = excluded.updated_at,
           deleted_at = excluded.deleted_at,
           sync_status = excluded.sync_status",
        params![
            drawing.id,
            drawing.cloud_id,
            drawing.title,
            drawing.data_json,
            drawing.thumbnail_path,
            updated_at,
            drawing.deleted_at,
            sync_status
        ],
    )
    .map_err(|error| error.to_string())?;
    let saved = LocalDrawing {
        updated_at,
        sync_status: Some(sync_status),
        ..drawing
    };
    if queue.unwrap_or(true) {
        enqueue(
            &conn,
            "drawing",
            &saved.id,
            "upsert",
            serde_json::to_value(&saved).map_err(|error| error.to_string())?,
        )?;
    }
    Ok(saved)
}

#[tauri::command]
fn register_local_file(app: AppHandle, file: LocalFile) -> Result<LocalFile, String> {
    let conn = open_db(&app)?;
    conn.execute(
        "insert into local_files
         (id, source_uri, local_path, content_type, sha256, created_at, updated_at)
         values (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         on conflict(id) do update set
           source_uri = excluded.source_uri,
           local_path = excluded.local_path,
           content_type = excluded.content_type,
           sha256 = excluded.sha256,
           updated_at = excluded.updated_at",
        params![
            file.id,
            file.source_uri,
            file.local_path,
            file.content_type,
            file.sha256,
            file.created_at,
            file.updated_at
        ],
    )
    .map_err(|error| error.to_string())?;
    Ok(file)
}

#[tauri::command]
fn list_sync_queue(app: AppHandle) -> Result<Vec<SyncQueueItem>, String> {
    let conn = open_db(&app)?;
    let mut stmt = conn
        .prepare(
            "select id, entity_type, entity_id, operation, payload_json, status, attempts, last_error, created_at, updated_at
             from sync_queue
             order by updated_at desc
             limit 250",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([], row_to_queue)
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn mark_sync_queue_item(
    app: AppHandle,
    input: MarkSyncQueueItemInput,
) -> Result<SyncQueueItem, String> {
    let conn = open_db(&app)?;
    let item = conn
        .query_row(
            "select id, entity_type, entity_id, operation, payload_json, status, attempts, last_error, created_at, updated_at
             from sync_queue
             where id = ?1",
            params![&input.id],
            row_to_queue,
        )
        .optional()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("Sync queue item not found: {}", input.id))?;

    if input.status == "cancelled" && item.entity_type != "chat_prompt" {
        return Err("Only chat drafts support local cancellation".to_string());
    }
    if item.status == "cancelled" {
        return Ok(item);
    }

    if let Some(selection) = &input.confirmed_selection {
        if item.entity_type != "chat_prompt" || !["pending", "failed"].contains(&item.status.as_str()) || input.status != "pending" {
            return Err("El borrador ya no admite confirmar ajustes.".to_string());
        }
        let mut payload: Value = serde_json::from_str(&item.payload_json).map_err(|_| "Borrador inválido".to_string())?;
        let envelope = &mut payload["localContext"]["chatEnvelope"];
        let intent = &selection["intent"];
        if ![Some(1), Some(2)].contains(&envelope["version"].as_i64()) || envelope["intent"].is_object()
            || selection["localOwner"].as_str().filter(|s| !s.is_empty()).is_none()
            || envelope["expectedOwnerId"] != selection["localOwner"]
            || intent["account"] != envelope["account"] || intent["conversationId"] != envelope["chatSessionId"]
            || intent["version"].as_i64() != Some(1)
            || intent["owner"].as_str().filter(|s| !s.is_empty()).is_none()
            || intent["model"].as_str().filter(|s| !s.is_empty()).is_none()
            || !(intent["effort"].is_null() || intent["effort"].is_string())
            || !intent["fast"].is_boolean() || !intent["ultracode"].is_boolean() || !intent["observedAt"].is_string() {
            return Err("La selección no pertenece al borrador o ya fue confirmada.".to_string());
        }
        envelope["version"] = json!(2);
        envelope["intent"] = intent.clone();
        let changed = conn.execute(
            "update sync_queue set payload_json=?2, status='pending', last_error=null, updated_at=?3 where id=?1 and payload_json=?4 and status in ('pending','failed')",
            params![&input.id, payload.to_string(), now(), &item.payload_json],
        ).map_err(|error| error.to_string())?;
        if changed != 1 { return Err("El borrador cambió antes de confirmar sus ajustes.".to_string()); }
        return conn.query_row(
            "select id,entity_type,entity_id,operation,payload_json,status,attempts,last_error,created_at,updated_at from sync_queue where id=?1",
            params![&input.id], row_to_queue,
        ).map_err(|error| error.to_string());
    }

    let updated_at = now();
    conn.execute(
        "update sync_queue set status = ?2, attempts = attempts + 1, last_error = ?3, updated_at = ?4
         where id = ?1 and status != 'cancelled'
         and not (entity_type = 'chat_prompt' and status = 'synced' and ?2 not in ('pending', 'cancelled'))",
        params![&input.id, &input.status, &input.last_error, &updated_at],
    )
    .map_err(|error| error.to_string())?;

    let entity_status = if input.status == "pending" {
        "queued"
    } else {
        input.status.as_str()
    };
    match item.entity_type.as_str() {
        "task" => {
            conn.execute(
                "update local_tasks set cloud_id = coalesce(?2, cloud_id), sync_status = ?3 where id = ?1",
                params![&item.entity_id, &input.cloud_id, entity_status],
            )
            .map_err(|error| error.to_string())?;
        }
        "calendar_event" => {
            conn.execute(
                "update local_events set cloud_id = coalesce(?2, cloud_id), status = ?3 where id = ?1",
                params![&item.entity_id, &input.cloud_id, entity_status],
            )
            .map_err(|error| error.to_string())?;
        }
        "drawing" => {
            conn.execute(
                "update local_drawings set cloud_id = coalesce(?2, cloud_id), sync_status = ?3 where id = ?1",
                params![&item.entity_id, &input.cloud_id, entity_status],
            )
            .map_err(|error| error.to_string())?;
        }
        _ => {}
    }

    if input.status == "synced" {
        write_sync_state(&conn, "last_synced_at", json!(updated_at))?;
    }

    conn.query_row(
        "select id, entity_type, entity_id, operation, payload_json, status, attempts, last_error, created_at, updated_at
         from sync_queue
         where id = ?1",
        params![&input.id],
        row_to_queue,
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn queue_chat_prompt(app: AppHandle, input: ChatPromptInput) -> Result<SyncQueueItem, String> {
    let conn = open_db(&app)?;
    let entity_id = format!("chat_prompt_{}", Uuid::new_v4());
    enqueue(
        &conn,
        "chat_prompt",
        &entity_id,
        "send_prompt",
        json!({
            "prompt": input.prompt,
            "route": input.route,
            "contextPackId": input.context_pack_id,
            "localContext": input.local_context,
            "createdAt": now()
        }),
    )
}

#[tauri::command]
fn sync_now(app: AppHandle, online: Option<bool>) -> Result<SyncResult, String> {
    let conn = open_db(&app)?;
    let is_online = online.unwrap_or(true);
    let mut stmt = conn
        .prepare(
            "select id, entity_type, entity_id, operation, payload_json, status, attempts, last_error, created_at, updated_at
             from sync_queue
             where status in ('pending', 'failed')
             order by created_at asc
             limit 100",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([], row_to_queue)
        .map_err(|error| error.to_string())?;
    let items = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    let mut result = SyncResult {
        processed: 0,
        synced: 0,
        failed: 0,
        conflicts: 0,
    };
    for item in items {
        result.processed += 1;
        let updated_at = now();
        if !is_online {
            conn.execute(
                "update sync_queue set status = 'failed', attempts = attempts + 1, last_error = ?2, updated_at = ?3 where id = ?1",
                params![item.id, "Offline; queued for retry when connectivity returns", updated_at],
            )
            .map_err(|error| error.to_string())?;
            result.failed += 1;
            continue;
        }

        conn.execute(
            "update sync_queue set status = 'synced', attempts = attempts + 1, last_error = null, updated_at = ?2 where id = ?1",
            params![item.id, updated_at],
        )
        .map_err(|error| error.to_string())?;

        match item.entity_type.as_str() {
            "task" => {
                conn.execute(
                    "update local_tasks set sync_status = 'synced' where id = ?1",
                    params![item.entity_id],
                )
                .map_err(|error| error.to_string())?;
            }
            "calendar_event" => {
                conn.execute(
                    "update local_events set status = 'synced' where id = ?1",
                    params![item.entity_id],
                )
                .map_err(|error| error.to_string())?;
            }
            "drawing" => {
                conn.execute(
                    "update local_drawings set sync_status = 'synced' where id = ?1",
                    params![item.entity_id],
                )
                .map_err(|error| error.to_string())?;
            }
            _ => {}
        }
        result.synced += 1;
    }

    if result.synced > 0 {
        write_sync_state(&conn, "last_synced_at", json!(now()))?;
    }
    Ok(result)
}

fn write_json_file(path: &Path, value: &Value) -> Result<String, String> {
    let bytes = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
    fs::write(path, &bytes).map_err(|error| error.to_string())?;
    let digest = Sha256::digest(&bytes);
    Ok(format!("{:x}", digest))
}

#[tauri::command]
fn prepare_offline_pack(
    app: AppHandle,
    request: OfflinePackRequest,
) -> Result<OfflinePackResult, String> {
    let root = workspace_root(&app)?;
    let conn = open_db(&app)?;
    let generated_at = now();
    let safe_name = request
        .name
        .unwrap_or_else(|| format!("travel-pack-{}", generated_at[..10].to_string()))
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>();
    let pack_dir = root.join("packs").join(safe_name);
    fs::create_dir_all(pack_dir.join("docs")).map_err(|error| error.to_string())?;
    fs::create_dir_all(pack_dir.join("drawings")).map_err(|error| error.to_string())?;
    fs::create_dir_all(pack_dir.join("assets")).map_err(|error| error.to_string())?;
    fs::create_dir_all(pack_dir.join("transcripts")).map_err(|error| error.to_string())?;

    let tasks = list_local_tasks(app.clone())?;
    let events = list_local_events(app.clone(), None, None)?;
    let drawings = list_local_drawings(app.clone())?;
    let queue = list_sync_queue(app.clone())?;

    let tasks_hash = write_json_file(
        &pack_dir.join("docs").join("tasks.json"),
        &serde_json::to_value(&tasks).map_err(|error| error.to_string())?,
    )?;
    let events_hash = write_json_file(
        &pack_dir.join("docs").join("calendar-events.json"),
        &serde_json::to_value(&events).map_err(|error| error.to_string())?,
    )?;
    let drawings_hash = write_json_file(
        &pack_dir.join("drawings").join("drawings.json"),
        &serde_json::to_value(&drawings).map_err(|error| error.to_string())?,
    )?;
    let queue_hash = write_json_file(
        &pack_dir.join("docs").join("sync-queue.json"),
        &serde_json::to_value(&queue).map_err(|error| error.to_string())?,
    )?;
    let snapshots_hash = write_json_file(
        &pack_dir.join("docs").join("runtime-snapshots.json"),
        &request.snapshots.unwrap_or_else(|| json!({})),
    )?;

    let file_count: i64 = conn
        .query_row("select count(*) from local_files", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;

    let manifest = json!({
        "name": pack_dir.file_name().and_then(|name| name.to_str()).unwrap_or("offline-pack"),
        "generatedAt": generated_at,
        "workspacePath": root.to_string_lossy(),
        "notes": request.notes,
        "counts": {
            "tasks": tasks.len(),
            "events": events.len(),
            "drawings": drawings.len(),
            "files": file_count
        },
        "artifacts": [
            { "path": "docs/tasks.json", "sha256": tasks_hash },
            { "path": "docs/calendar-events.json", "sha256": events_hash },
            { "path": "drawings/drawings.json", "sha256": drawings_hash },
            { "path": "docs/sync-queue.json", "sha256": queue_hash },
            { "path": "docs/runtime-snapshots.json", "sha256": snapshots_hash }
        ],
        "directories": ["docs", "drawings", "assets", "transcripts"]
    });
    let manifest_path = pack_dir.join("manifest.json");
    write_json_file(&manifest_path, &manifest)?;
    write_sync_state(
        &conn,
        "last_pack_path",
        json!(pack_dir.to_string_lossy().to_string()),
    )?;

    Ok(OfflinePackResult {
        pack_path: pack_dir.to_string_lossy().to_string(),
        manifest_path: manifest_path.to_string_lossy().to_string(),
        generated_at,
        tasks: tasks.len(),
        events: events.len(),
        drawings: drawings.len(),
        files: file_count as usize,
    })
}

#[tauri::command]
fn cache_snapshot(app: AppHandle, input: SnapshotInput) -> Result<(), String> {
    let conn = open_db(&app)?;
    conn.execute(
        "insert into local_snapshots (key, module, payload_json, updated_at)
         values (?1, ?2, ?3, ?4)
         on conflict(key) do update set
           module = excluded.module,
           payload_json = excluded.payload_json,
           updated_at = excluded.updated_at",
        params![input.key, input.module, input.payload.to_string(), now()],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_cached_snapshot(app: AppHandle, key: String) -> Result<Option<Value>, String> {
    let conn = open_db(&app)?;
    let payload = conn
        .query_row(
            "select payload_json from local_snapshots where key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;

    match payload {
        Some(raw) => serde_json::from_str::<Value>(&raw)
            .map(Some)
            .map_err(|error| error.to_string()),
        None => Ok(None),
    }
}

#[tauri::command]
fn search_local(app: AppHandle, query: String) -> Result<Vec<SearchHit>, String> {
    let conn = open_db(&app)?;
    let needle = format!("%{}%", query.trim());
    let mut hits = Vec::new();

    let mut task_stmt = conn
        .prepare("select id, title, status, updated_at from local_tasks where deleted_at is null and title like ?1 limit 25")
        .map_err(|error| error.to_string())?;
    let task_rows = task_stmt
        .query_map(params![needle.clone()], |row| {
            Ok(SearchHit {
                id: row.get(0)?,
                module: "tasks".to_string(),
                title: row.get(1)?,
                subtitle: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })
        .map_err(|error| error.to_string())?;
    hits.extend(
        task_rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?,
    );

    let mut event_stmt = conn
        .prepare("select id, title, starts_at, updated_at from local_events where deleted_at is null and title like ?1 limit 25")
        .map_err(|error| error.to_string())?;
    let event_rows = event_stmt
        .query_map(params![needle.clone()], |row| {
            Ok(SearchHit {
                id: row.get(0)?,
                module: "calendar".to_string(),
                title: row.get(1)?,
                subtitle: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })
        .map_err(|error| error.to_string())?;
    hits.extend(
        event_rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?,
    );

    let mut drawing_stmt = conn
        .prepare("select id, title, sync_status, updated_at from local_drawings where deleted_at is null and title like ?1 limit 25")
        .map_err(|error| error.to_string())?;
    let drawing_rows = drawing_stmt
        .query_map(params![needle], |row| {
            Ok(SearchHit {
                id: row.get(0)?,
                module: "canvas".to_string(),
                title: row.get(1)?,
                subtitle: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })
        .map_err(|error| error.to_string())?;
    hits.extend(
        drawing_rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?,
    );

    Ok(hits)
}

#[tauri::command]
fn open_workspace(app: AppHandle) -> Result<String, String> {
    let root = workspace_root(&app)?;
    #[cfg(target_os = "macos")]
    let opener = "open";
    #[cfg(target_os = "windows")]
    let opener = "explorer";
    #[cfg(target_os = "linux")]
    let opener = "xdg-open";

    std::process::Command::new(opener)
        .arg(&root)
        .spawn()
        .map_err(|error| error.to_string())?;
    Ok(root.to_string_lossy().to_string())
}

/// Menú por defecto de macOS + «Terminal» (⌘J) en el menú Ver (o en un menú propio si no existe).
fn instalar_menu_terminal(app: &AppHandle) -> tauri::Result<()> {
    let menu = Menu::default(app)?;
    let item = MenuItem::with_id(app, "terminal-alternar", "Terminal", true, Some("CmdOrCtrl+J"))?;
    let mut puesto = false;
    for it in menu.items()? {
        if let MenuItemKind::Submenu(sm) = it {
            if matches!(sm.text()?.as_str(), "View" | "Ver" | "Vista") {
                sm.append(&item)?;
                puesto = true;
                break;
            }
        }
    }
    if !puesto {
        let sm = Submenu::with_items(app, "Terminal", true, &[&item])?;
        menu.append(&sm)?;
    }
    app.set_menu(menu)?;
    Ok(())
}

pub fn run() {
    let app = tauri::Builder::default()
        .manage(LocalServerState::default())
        .manage(daemon::DaemonState::default())
        .manage(salud_cliente::WebSalud::default())
        .manage(servidor::Mudanza::default())
        .manage(ventanas::Lugares::default())
        .plugin(tauri_plugin_opener::init())
        // Solo la principal: las ventanas desprendidas ya recuerdan su lugar en ventanas.rs.
        // La restauración la hace create_main_window (necesita decidir antes de mostrarla).
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(ESTADO_VENTANA)
                .with_filter(|etiqueta| etiqueta == "main")
                .skip_initial_state("main")
                .build(),
        )
        .on_menu_event(|app, event| {
            // ⌘J nativo (2 oct 2026): el webview carga una página remota y una tecla sintética o un
            // sistema de entrada ajeno puede no llegar al JS. El acelerador del menú sí llega siempre.
            if event.id() == "terminal-alternar" {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.eval("window.dispatchEvent(new CustomEvent('arbrain:terminal-alternar'))");
                }
            }
        })
        .setup(|app| {
            // Edición cliente (carril T): SIGTERM/SIGINT/SIGHUP apagan en orden lo que la app lanzó (sin esto, solo
            // Cmd+Q lo hacía y la web y el motor quedaban huérfanos con su puerto y su socket). Daniel: sin cambio.
            #[cfg(unix)]
            if desktop_env::EDICION_CLIENTE {
                let h = app.handle().clone();
                senales::instalar(move |_| apagar_hijos_cliente(&h), Duration::from_secs(12));
            }
            if desktop_env::EDICION_CLIENTE {
                // El motor de terminales del alumno vive en su carpeta, no en ~/.config/arbrain: se fija antes de
                // lanzar cualquier hilo (lo leen motor.rs y el propio motor al nacer, por herencia).
                if let Ok(rutas) = daemon::rutas(app.handle()) {
                    env::set_var("ARBRAIN_MOTOR_SOCK", &rutas.motor_sock);
                }
            }
            // Modo evidencia: la ventana se abre sin pedir el foco (no le quita el teclado a nadie).
            ARRANQUE_SILENCIOSO.store(take_relevo_silencioso() || cfg!(feature = "evidencia"), Ordering::SeqCst);
            #[cfg(feature = "evidencia")]
            evidencia::iniciar(app.handle());
            if let Err(e) = instalar_menu_terminal(app.handle()) {
                eprintln!("[arbrain] menu de terminal no instalado: {e}");
            }
            // Splash INMEDIATO: antes no existía NINGUNA ventana hasta que el
            // server Next standalone terminaba de bootear (460ms mínimo, 30s
            // peor caso — solo el ícono rebotando en el Dock). El splash es un
            // HTML estático bundleado (public/splash.html) que pinta en ~0;
            // el boot del server corre en un thread y al estar listo se crea
            // la ventana principal y el splash se destruye.
            let _splash = WebviewWindowBuilder::new(
                app,
                "splash",
                WebviewUrl::App("splash.html".into()),
            )
            .title("Arbrain")
            .focused(!ARRANQUE_SILENCIOSO.load(Ordering::SeqCst))
            .inner_size(420.0, 380.0)
            .resizable(false)
            .center()
            .build()?;

            // El motor (dueño de las PTYs) se asegura aparte y DESACOPLADO: cerrar la
            // app jamás lo toca. Ver src/motor.rs. `ARBRAIN_SIN_MOTOR=1` lo omite para
            // copias de desarrollo que no deben ni saludarlo.
            if env::var("ARBRAIN_SIN_MOTOR").map_or(true, |v| v != "1") {
                thread::spawn(|| {
                    let _ = motor::ensure();
                });
            }

            let handle = app.handle().clone();
            thread::spawn(move || match ensure_local_server(&handle) {
                Ok(server) => {
                    let h = handle.clone();
                    let url = server.url.clone();
                    let _ = handle.run_on_main_thread(move || {
                        let _ = create_main_window(&h, &url);
                        if let Some(splash) = h.get_webview_window("splash") {
                            // destroy() (no close()): close dispararía CloseRequested
                            let _ = splash.destroy();
                        }
                    });
                    // El servidor elegido no es para siempre: vuelve al Studio, o relanza el embebido si muere.
                    // Edición cliente: su único servidor es el suyo; lo supervisa `vigilar_web_cliente` (12 oct 2026).
                    if !desktop_env::EDICION_CLIENTE {
                        servidor::vigilar(handle.clone());
                    } else {
                        vigilar_web_cliente(handle.clone());
                    }
                }
                Err(error) => {
                    eprintln!("[arbrain] no arrancó: {}", error);
                    // Aun sin servidor, el vigilante sigue: si el Studio o el embebido aparecen, nace la ventana.
                    if !desktop_env::EDICION_CLIENTE {
                        servidor::vigilar(handle.clone());
                    }
                    let h = handle.clone();
                    let _ = handle.run_on_main_thread(move || {
                        if let Some(splash) = h.get_webview_window("splash") {
                            let msg = error
                                .replace('\\', "\\\\")
                                .replace('"', "\\\"")
                                .replace('\n', " ");
                            let _ = splash.eval(&format!(
                                "window.__splashError && window.__splashError(\"{}\")",
                                msg
                            ));
                        }
                    });
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            ventanas::al_evento(window, event);
            if window.label() == "main"
                && matches!(event, tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_))
            {
                programar_guardado_estado(window.app_handle());
            }
            // Solo la ventana principal apaga el server (el splash también emite
            // eventos de ventana y NO debe matar el Node que está arrancando).
            if matches!(event, tauri::WindowEvent::CloseRequested { .. })
                && window.label() == "main"
            {
                stop_local_server(&window.app_handle());
            }
        })
        .invoke_handler(tauri::generate_handler![
            chat_image::read_chat_image,
            desktop_status,
            list_local_tasks,
            upsert_local_task,
            list_local_events,
            upsert_local_event,
            list_local_drawings,
            upsert_local_drawing,
            register_local_file,
            list_sync_queue,
            mark_sync_queue_item,
            queue_chat_prompt,
            sync_now,
            prepare_offline_pack,
            cache_snapshot,
            get_cached_snapshot,
            search_local,
            open_workspace,
            motor::motor_status,
            permisos::permisos_estado,
            permisos::permisos_abrir,
            permisos::permisos_pedir,
            tema::tema_nativo,
            actualizacion::actualizacion_estado,
            actualizacion::actualizacion_aplicar,
            ventanas::abrir_ventana,
            ventanas::enfocar_ventana,
            ventanas::cerrar_ventana,
            ventanas::ventanas_abiertas,
            ventanas::ventanas_pestanas,
            ventanas::fantasma,
            servidor::servidor_mudanza_recibida,
            servidor::servidor_mudanza_lista,
            servidor::servidor_traspaso_tomar,
            daemon::daemon_estado,
            daemon::daemon_reiniciar,
            salud_app,
            salud_reintentar,
            daemon::llaves_estado,
            daemon::llave_guardar,
            daemon::llave_leer,
            daemon::llave_borrar,
            daemon::abrir_enlace
        ])
        .build(tauri::generate_context!())
        .expect("error while building Mission Control desktop runtime");

    app.run(|app_handle, event| {
        #[cfg(target_os = "macos")]
        if matches!(event, tauri::RunEvent::Reopen { .. }) {
            if let Some(window) = app_handle.get_webview_window("main") {
                if take_hoy_intent() {
                    let destination = format!("{}/chat", local_server_info(app_handle).url.trim_end_matches('/'));
                    if let Ok(url) = tauri::Url::parse(&destination) { let _ = window.navigate(url); }
                }
                let _ = window.unminimize();
                let _ = window.set_fullscreen(false);
                let _ = window.maximize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        if matches!(
            event,
            tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }
        ) {
            stop_local_server(app_handle);
        }
        // Edición cliente: el daemon y el motor son de la app y se van con ella (en el Studio los maneja launchd).
        if desktop_env::EDICION_CLIENTE && matches!(event, tauri::RunEvent::Exit) {
            daemon::apagar(app_handle);
            motor::apagar_cliente();
        }
        // Cierre real: si quedó una versión nueva esperando, se instala en silencio (no corta nada: ya se cierra).
        if matches!(event, tauri::RunEvent::Exit) {
            actualizacion::al_salir(app_handle);
        }
    });
}

#[cfg(test)]
mod studio_probe_tests {
    use super::{quitar_verbatim, status_is_healthy, status_is_not_found, status_is_success};

    #[test]
    fn rutas_verbatim_de_windows_se_simplifican_para_node() {
        assert_eq!(
            quitar_verbatim(r"\\?\C:\Users\ana\AppData\Local\Arbrain\daemon").as_deref(),
            Some(r"C:\Users\ana\AppData\Local\Arbrain\daemon")
        );
        assert_eq!(quitar_verbatim(r"\\?\UNC\srv\share\x").as_deref(), Some(r"\\srv\share\x"));
        // No verbatim, o verbatim sin letra de unidad (\\?\Volume{…}): se deja igual.
        assert_eq!(quitar_verbatim(r"C:\Arbrain"), None);
        assert_eq!(quitar_verbatim("/Applications/Arbrain.app/Contents/Resources"), None);
        assert_eq!(quitar_verbatim(r"\\?\Volume{abc}\x"), None);
    }

    #[test]
    fn chat_health_requires_success() {
        assert!(status_is_success(b"HTTP/1.1 200 OK\r\n"));
        assert!(!status_is_success(b"HTTP/1.1 503 Ser"));
        assert!(!status_is_success(b"HTTP/1.1 307 Tem"));
        assert!(status_is_not_found(b"HTTP/1.1 404 Not"));
        assert!(!status_is_not_found(b"HTTP/1.1 200 OK\r\n"));
    }

    #[test]
    fn accepts_normal_http_statuses() {
        assert!(status_is_healthy(b"HTTP/1.1 200 OK\r\n"));
        assert!(status_is_healthy(b"HTTP/1.1 307 Tem"));
        assert!(status_is_healthy(b"HTTP/1.1 404 Not"));
    }

    #[test]
    fn rejects_server_errors_and_garbage() {
        assert!(!status_is_healthy(b"HTTP/1.1 502 Bad "));
        assert!(!status_is_healthy(b"HTTP/1.1 503 Ser"));
        assert!(!status_is_healthy(b"SSH-2.0-OpenSSH_"));
        assert!(!status_is_healthy(b""));
    }
}
