//! El motor: hostea las PTYs y las multiplexa a N clientes por un socket unix.
//!
//! Hereda las invariantes de `sfterm-ptyd` (su doctrina se probó en producción):
//! 1. Nadie mata una terminal por accidente: solo `kill`/`shutdown` explícitos o que
//!    el proceso muera solo. Una desconexión NO mata.
//! 2. El replay son bytes crudos. Además, el motor mantiene un emulador VT sin cabeza
//!    por terminal (`vt100`) para que la vista «trabajos» lea la pantalla sin GUI.
//! 3. Un cliente lento no frena una terminal (cola con techo; al llenarse se le corta).
//! 4. Ningún lock envenenado mata al motor (`into_inner`).
//!
//! Y agrega dos cosas que el ptyd no tenía:
//! - **Relevo** (`handoff`): un motor nuevo recibe los masters por SCM_RIGHTS y el viejo
//!   se retira sin matar. Actualizar el motor deja de costar conversaciones.
//! - **Responder**: contesta consultas de terminal cuando ninguna vista mira.

use crate::fdpass;
use crate::proto::*;
use crate::responder::Responder;
use base64::Engine as _;
use portable_pty::{native_pty_system, Child, CommandBuilder, PtySize};
use std::collections::{HashMap, HashSet, VecDeque};
use std::io::Write;
use std::os::fd::{AsRawFd, FromRawFd, RawFd};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::mpsc::{sync_channel, SyncSender, TrySendError};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

const RING_MAX: usize = 4 * 1024 * 1024;
/// Replay que viaja en un relevo por terminal (el resto lo repinta el TUI).
const HANDOFF_RING_MAX: usize = 1024 * 1024;
const CLIENT_QUEUE_MAX: usize = 4096;
/// Ids propios muy por encima del contador del ptyd viejo: las adoptadas conservan
/// su id original (el layout guardado de SFTerm sigue apuntando bien) sin choques.
pub const OWN_ID_BASE: u32 = 100_000;
pub const RELEVO_CLIENT: &str = "arbrain-motor-relevo";

pub fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(PoisonError::into_inner)
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[derive(Clone)]
pub struct Config {
    pub sock: PathBuf,
    pub log: PathBuf,
    /// Edición cliente (red team 4 M4-3): token por apertura que todo saludo debe traer. Solo en memoria.
    pub token: Option<String>,
    /// `true` = el motor exige token (llegó por stdin). Sin token válido nadie entra; además el socket nace 0600 en
    /// una carpeta 0700 propia y el stdin hace de vigía. `false` = el motor de Daniel, sin cambio.
    pub token_requerido: bool,
}

impl std::fmt::Debug for Config {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Config")
            .field("sock", &self.sock)
            .field("log", &self.log)
            .field("token_requerido", &self.token_requerido)
            .finish()
    }
}

impl Config {
    /// ¿Este saludo entra? Sin token requerido, siempre (Daniel y SFTerm). Con token requerido, solo el exacto.
    pub fn saludo_valido(&self, dado: Option<&str>) -> bool {
        if !self.token_requerido {
            return true;
        }
        match (&self.token, dado) {
            (Some(t), Some(d)) => crate::mismo_secreto(t, d),
            _ => false,
        }
    }
}

/// Carpeta del socket privada (red team 4 M4-3): existe, es un directorio de verdad (no un enlace), es del usuario
/// que corre el motor y queda en 0700. En Linux `/tmp` es compartido: si otro usuario ya creó `arbrain-<hash>`, o es
/// un enlace, el motor NO escucha ahí.
pub fn carpeta_privada(dir: &std::path::Path) -> Result<(), String> {
    use std::os::unix::fs::{MetadataExt, PermissionsExt};
    std::fs::create_dir_all(dir).map_err(|e| format!("no pude crear {dir:?}: {e}"))?;
    let m = std::fs::symlink_metadata(dir).map_err(|e| e.to_string())?;
    if !m.file_type().is_dir() {
        return Err(format!("{dir:?} no es una carpeta"));
    }
    if m.uid() != unsafe { libc::getuid() } {
        return Err(format!("{dir:?} es de otro usuario"));
    }
    std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())
}

pub enum Backend {
    Own {
        fd: RawFd,
        child: Mutex<Option<Box<dyn Child + Send + Sync>>>,
        write: Mutex<()>,
        parked: AtomicBool,
    },
}

pub struct Term {
    pub id: u32,
    pub pid: u32,
    pub cwd: String,
    pub born_ms: u64,
    pub size: Mutex<(u16, u16)>,
    pub ring: Mutex<VecDeque<u8>>,
    pub vt: Mutex<vt100::Parser>,
    pub responder: Mutex<Responder>,
    pub backend: Backend,
}

impl Drop for Term {
    fn drop(&mut self) {
        let Backend::Own { fd, .. } = &self.backend;
        unsafe { libc::close(*fd) };
    }
}

impl Term {
    fn new(
        id: u32,
        pid: u32,
        cwd: String,
        cols: u16,
        rows: u16,
        born_ms: u64,
        backend: Backend,
    ) -> Self {
        Term {
            id,
            pid,
            cwd,
            born_ms,
            size: Mutex::new((cols, rows)),
            ring: Mutex::new(VecDeque::new()),
            vt: Mutex::new(vt100::Parser::new(rows.max(2), cols.max(10), 0)),
            responder: Mutex::new(Responder::default()),
            backend,
        }
    }
    fn fd(&self) -> RawFd {
        let Backend::Own { fd, .. } = &self.backend;
        *fd
    }
    /// Reinicia el espejo (antes de un replay completo del ptyd viejo).
    pub fn reset_mirror(&self) {
        lock(&self.ring).clear();
        let (c, r) = *lock(&self.size);
        *lock(&self.vt) = vt100::Parser::new(r.max(2), c.max(10), 0);
    }
}

pub struct Client {
    pub id: u64,
    out: SyncSender<Vec<u8>>,
    sock: UnixStream,
    attached: Mutex<HashSet<u32>>,
    /// El cliente del relevo no recibe eventos: su stream debe quedar limpio para los fds.
    quiet: AtomicBool,
    /// Quién saludó (`hello.client`): decide quién puede cerrar una terminal adoptada.
    name: Mutex<String>,
}

pub struct Hub {
    pub cfg: Config,
    pub terms: Mutex<HashMap<u32, Arc<Term>>>,
    clients: Mutex<Vec<Arc<Client>>>,
    next_id: AtomicU32,
    next_client: AtomicU64,
    paused: AtomicBool,
    pub started_ms: u64,
    pub relevos: AtomicU32,
    listener_fd: AtomicU32,
}

impl Hub {
    pub fn new(cfg: Config) -> Arc<Hub> {
        Arc::new(Hub {
            cfg,
            terms: Mutex::new(HashMap::new()),
            clients: Mutex::new(Vec::new()),
            next_id: AtomicU32::new(OWN_ID_BASE),
            next_client: AtomicU64::new(1),
            paused: AtomicBool::new(false),
            started_ms: now_ms(),
            relevos: AtomicU32::new(0),
            listener_fd: AtomicU32::new(u32::MAX),
        })
    }

    pub fn log(&self, msg: &str) {
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.cfg.log)
        {
            let _ = writeln!(f, "[{}] {}", now_ms(), msg);
        }
    }

    fn attached_count(&self, term: u32) -> usize {
        lock(&self.clients)
            .iter()
            .filter(|c| lock(&c.attached).contains(&term))
            .count()
    }

    /// Salida de una terminal: ring (replay), espejo VT, respuestas de terminal y clientes.
    pub fn feed(&self, term: &Term, bytes: &[u8]) {
        {
            let mut ring = lock(&term.ring);
            ring.extend(bytes.iter().copied());
            let sobra = ring.len().saturating_sub(RING_MAX);
            if sobra > 0 {
                ring.drain(..sobra);
            }
        }
        let cursor = {
            let mut vt = lock(&term.vt);
            vt.process(bytes);
            vt.screen().cursor_position()
        };
        if self.attached_count(term.id) == 0 {
            let reply = lock(&term.responder).scan(bytes, cursor);
            if !reply.is_empty() {
                let _ = self.write_term(term, &reply);
            }
        }
        self.broadcast_data(term.id, bytes);
    }

    fn broadcast_data(&self, term: u32, payload: &[u8]) {
        let frame = frame_bytes(KIND_DATA, term, payload);
        for c in lock(&self.clients).iter() {
            if !lock(&c.attached).contains(&term) {
                continue;
            }
            if let Err(TrySendError::Full(_)) = c.out.try_send(frame.clone()) {
                let _ = c.sock.shutdown(std::net::Shutdown::Both);
                self.log(&format!(
                    "cliente {} atascado: cortado (las terminales siguen)",
                    c.id
                ));
            }
        }
    }

    pub fn evt(&self, e: &Evt) {
        let frame = ctl_bytes(0, e);
        for c in lock(&self.clients).iter() {
            if !c.quiet.load(Ordering::Relaxed) {
                let _ = c.out.try_send(frame.clone());
            }
        }
    }

    pub fn write_term(&self, term: &Term, bytes: &[u8]) -> Result<(), String> {
        match &term.backend {
            Backend::Own { fd, write, .. } => {
                let _g = lock(write);
                write_all_fd(*fd, bytes).map_err(|e| e.to_string())
            }
        }
    }

    /// Una terminal terminó (su shell murió): se retira y se avisa a todos.
    pub fn exit_term(&self, id: u32, code: Option<i32>) {
        if lock(&self.terms).remove(&id).is_some() {
            self.evt(&Evt::Exit { id, code });
            self.log(&format!("terminal {id} terminó (code {code:?})"));
        }
    }

    fn fg_pgid(&self, t: &Term) -> i32 {
        unsafe { libc::tcgetpgrp(t.fd()) }
    }

    fn sorted_terms(&self) -> Vec<Arc<Term>> {
        let mut v: Vec<Arc<Term>> = lock(&self.terms).values().cloned().collect();
        v.sort_by_key(|t| t.id);
        v
    }
}

fn write_all_fd(fd: RawFd, mut bytes: &[u8]) -> std::io::Result<()> {
    while !bytes.is_empty() {
        let n = unsafe { libc::write(fd, bytes.as_ptr() as *const _, bytes.len()) };
        if n < 0 {
            let e = std::io::Error::last_os_error();
            if e.kind() == std::io::ErrorKind::Interrupted {
                continue;
            }
            if e.raw_os_error() == Some(libc::EAGAIN) {
                std::thread::sleep(Duration::from_millis(5));
                continue;
            }
            return Err(e);
        }
        bytes = &bytes[n as usize..];
    }
    Ok(())
}

fn set_winsize(fd: RawFd, cols: u16, rows: u16) -> bool {
    let ws = libc::winsize {
        ws_row: rows,
        ws_col: cols,
        ws_xpixel: 0,
        ws_ypixel: 0,
    };
    unsafe { libc::ioctl(fd, libc::TIOCSWINSZ, &ws) == 0 }
}

/// Lector de una PTY propia. Usa poll con timeout para poder ESTACIONARSE durante un
/// relevo (Herdr: «solo un servidor lee cada PTY a la vez») sin cerrar nada.
fn start_reader(hub: Arc<Hub>, term: Arc<Term>) {
    std::thread::spawn(move || {
        let Backend::Own {
            fd, parked, child, ..
        } = &term.backend;
        let fd = *fd;
        let mut buf = [0u8; 16384];
        loop {
            if hub.paused.load(Ordering::SeqCst) {
                parked.store(true, Ordering::SeqCst);
                std::thread::sleep(Duration::from_millis(20));
                continue;
            }
            parked.store(false, Ordering::SeqCst);
            let mut pfd = libc::pollfd {
                fd,
                events: libc::POLLIN,
                revents: 0,
            };
            let r = unsafe { libc::poll(&mut pfd, 1, 100) };
            if r == 0 {
                continue;
            }
            if r < 0 {
                if std::io::Error::last_os_error().kind() == std::io::ErrorKind::Interrupted {
                    continue;
                }
                break;
            }
            let n = unsafe { libc::read(fd, buf.as_mut_ptr() as *mut _, buf.len()) };
            if n > 0 {
                hub.feed(&term, &buf[..n as usize]);
                continue;
            }
            if n < 0 {
                let e = std::io::Error::last_os_error();
                if e.kind() == std::io::ErrorKind::Interrupted
                    || e.raw_os_error() == Some(libc::EAGAIN)
                {
                    continue;
                }
            }
            break; // EOF / EIO: el lado esclavo se cerró, el shell se fue
        }
        let mut code = None;
        if let Some(c) = lock(child).as_mut() {
            for _ in 0..20 {
                if let Ok(Some(s)) = c.try_wait() {
                    code = Some(s.exit_code() as i32);
                    break;
                }
                std::thread::sleep(Duration::from_millis(25));
            }
        }
        hub.exit_term(term.id, code);
    });
}

fn shell_inject_dir() -> Option<PathBuf> {
    let d = std::env::var("ARBRAIN_MOTOR_SHELL_INJECT")
        .map(PathBuf::from)
        .ok()
        .or_else(|| {
            std::env::var("HOME")
                .ok()
                .map(|h| PathBuf::from(h).join(".config/sfterm/shell"))
        })?;
    d.join(".zshrc").exists().then_some(d)
}

fn expand_tilde(p: &str) -> String {
    match (p.strip_prefix("~"), std::env::var("HOME")) {
        (Some(rest), Ok(h)) => format!("{h}{rest}"),
        _ => p.to_string(),
    }
}

/// Mismo shell que SFTerm (login + interactivo, scrub de la sesión Claude anidada).
/// Con `command`: `$SHELL -l -i -c '<cmd>; exec $SHELL -l -i'` — el comando corre SIN
/// teclearlo a ciegas (el ptyd lo escribía tras 700 ms) y al salir queda un shell.
fn build_command(
    id: u32,
    cwd: Option<String>,
    shell_integration: Option<bool>,
    colorfgbg: Option<String>,
    command: Option<String>,
) -> (CommandBuilder, String) {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let mut cmd = CommandBuilder::new(&shell);
    match command.as_deref().map(str::trim).filter(|c| !c.is_empty()) {
        Some(c) => cmd.args(["-l", "-i", "-c", &format!("{c}; exec {shell} -l -i")]),
        None => cmd.args(["-l", "-i"]),
    }
    for (key, _) in std::env::vars() {
        if key == "CLAUDECODE"
            || key == "CLAUDE_EFFORT"
            || key == "CLAUDE_CONFIG_DIR"
            || key == "CLAUDE_PID"
            || key.starts_with("CLAUDE_CODE_")
            || key.starts_with("CODEX_SANDBOX")
            || key == "ARBRAIN_MOTOR_SOCK"
            || key == "SFTERM_PTYD_SOCK"
        {
            cmd.env_remove(&key);
        }
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERM_PROGRAM", "Arbrain");
    cmd.env("ARBRAIN_TERM_ID", id.to_string());
    // SFTerm como vista: sus integraciones por terminal siguen funcionando
    cmd.env("SFTERM_TERM_ID", id.to_string());
    if std::env::var("LANG").is_err() {
        cmd.env("LANG", "en_US.UTF-8");
    }
    if let Some(v) = colorfgbg {
        cmd.env("COLORFGBG", v);
    }
    if shell_integration.unwrap_or(true) && shell.ends_with("zsh") {
        if let Some(inject) = shell_inject_dir() {
            let user_zdot = std::env::var("ZDOTDIR")
                .unwrap_or_else(|_| std::env::var("HOME").unwrap_or_default());
            cmd.env("SFTERM_INJECT_DIR", inject.to_string_lossy().to_string());
            cmd.env("SFTERM_USER_ZDOTDIR", user_zdot);
            cmd.env("ZDOTDIR", inject.to_string_lossy().to_string());
        }
    }
    let cwd_final =
        expand_tilde(&cwd.unwrap_or_else(|| std::env::var("HOME").unwrap_or_else(|_| "/".into())));
    if std::path::Path::new(&cwd_final).is_dir() {
        cmd.cwd(&cwd_final);
    }
    (cmd, cwd_final)
}

pub fn spawn_term(
    hub: &Arc<Hub>,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
    si: Option<bool>,
    cfb: Option<String>,
    command: Option<String>,
) -> Result<(u32, u32), String> {
    let pair = native_pty_system()
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;
    let id = hub.next_id.fetch_add(1, Ordering::SeqCst);
    let (cmd, cwd_final) = build_command(id, cwd, si, cfb, command);
    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let pid = child.process_id().unwrap_or(0);
    drop(pair.slave);
    let raw = pair.master.as_raw_fd().ok_or("master sin fd")?;
    // el motor guarda SU copia del master; la de portable-pty se suelta
    let fd = unsafe { libc::dup(raw) };
    if fd < 0 {
        return Err("dup del master falló".into());
    }
    drop(pair.master);
    let term = Arc::new(Term::new(
        id,
        pid,
        cwd_final.clone(),
        cols,
        rows,
        now_ms(),
        Backend::Own {
            fd,
            child: Mutex::new(Some(child)),
            write: Mutex::new(()),
            parked: AtomicBool::new(false),
        },
    ));
    lock(&hub.terms).insert(id, term.clone());
    start_reader(hub.clone(), term);
    hub.log(&format!("terminal {id} nacida (pid {pid}) en {cwd_final}"));
    Ok((id, pid))
}

/// Cierre completo, cortesía primero (SIGHUP al grupo en primer plano y al del shell)
/// y certeza después (SIGKILL a los 1.5 s si ignoró). Misma semántica que el ptyd.
fn kill_term_tree(t: &Term) {
    let Backend::Own { fd, child, .. } = &t.backend;
    let fg = unsafe { libc::tcgetpgrp(*fd) };
    if fg > 0 {
        unsafe { libc::killpg(fg, libc::SIGHUP) };
    }
    if t.pid > 0 && (t.pid as i32) != fg {
        unsafe { libc::killpg(t.pid as i32, libc::SIGHUP) };
    }
    if let Some(c) = lock(child).as_mut() {
        let _ = c.kill();
    } else if t.pid > 0 {
        unsafe { libc::kill(t.pid as i32, libc::SIGHUP) };
    }
    if fg > 0 {
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(1500));
            if unsafe { libc::killpg(fg, 0) } == 0 {
                unsafe { libc::killpg(fg, libc::SIGKILL) };
            }
        });
    }
}

// ───────────────────────── servidor ─────────────────────────

/// Arranque normal: si ya hay un motor vivo en el socket, no se hace nada.
pub fn run(cfg: Config) {
    let hub = Hub::new(cfg.clone());
    if UnixStream::connect(&cfg.sock).is_ok() {
        hub.log("ya había un motor vivo en el socket, salgo");
        return;
    }
    if let Some(dir) = cfg.sock.parent() {
        if cfg.token_requerido {
            if let Err(e) = carpeta_privada(dir) {
                hub.log(&format!("carpeta del socket insegura, no escucho: {e}"));
                return;
            }
        } else {
            let _ = std::fs::create_dir_all(dir);
        }
    }
    if cfg.token_requerido && cfg.token.is_none() {
        hub.log("se pidió token por stdin y no llegó: no escucho");
        return;
    }
    let _ = std::fs::remove_file(&cfg.sock);
    let listener = match UnixListener::bind(&cfg.sock) {
        Ok(l) => l,
        Err(e) => {
            hub.log(&format!("no pude escuchar en {:?}: {e}", cfg.sock));
            return;
        }
    };
    if cfg.token_requerido {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&cfg.sock, std::fs::Permissions::from_mode(0o600));
        vigia_stdin(hub.clone());
    }
    hub.log(&format!("motor arriba (pid {})", std::process::id()));
    serve(hub, listener);
}

/// Arranque por relevo: toma las PTYs y el socket del motor vivo; él se retira sin matar.
pub fn run_relevo(cfg: Config) -> Result<(), String> {
    let hub = Hub::new(cfg.clone());
    let mut s = UnixStream::connect(&cfg.sock)
        .map_err(|e| format!("no hay motor vivo que relevar: {e}"))?;
    s.set_read_timeout(Some(Duration::from_secs(20))).ok();
    write_ctl(
        &mut s,
        1,
        &Req::Hello {
            proto: PROTO,
            client: RELEVO_CLIENT.into(),
            token: cfg.token.clone(),
        },
    )
    .map_err(|e| e.to_string())?;
    let hello = read_res(&mut s, 1)?;
    let old_pid = match hello {
        Res::Hello { pid, .. } => pid,
        other => return Err(format!("saludo inesperado: {other:?}")),
    };
    write_ctl(&mut s, 2, &Req::Handoff).map_err(|e| e.to_string())?;
    let state = match read_res(&mut s, 2)? {
        Res::Handoff { state } => state,
        Res::Err { msg } => return Err(format!("el motor {old_pid} rechazó el relevo: {msg}")),
        other => return Err(format!("respuesta inesperada: {other:?}")),
    };
    let total = state.terms.len() + usize::from(state.listener);
    let fds = fdpass::recv_fds(s.as_raw_fd(), total).map_err(|e| e.to_string())?;
    let mut it = fds.into_iter();
    let listener = if state.listener {
        Some(unsafe { UnixListener::from_raw_fd(it.next().unwrap()) })
    } else {
        None
    };
    for (t, fd) in state.terms.iter().zip(it) {
        let term = Arc::new(Term::new(
            t.id,
            t.pid,
            t.cwd.clone(),
            t.cols,
            t.rows,
            t.born_ms,
            Backend::Own {
                fd,
                child: Mutex::new(None),
                write: Mutex::new(()),
                parked: AtomicBool::new(false),
            },
        ));
        if let Ok(ring) = base64::engine::general_purpose::STANDARD.decode(&t.ring_b64) {
            lock(&term.ring).extend(ring.iter().copied());
            lock(&term.vt).process(&ring);
        }
        lock(&hub.terms).insert(t.id, term);
    }
    hub.next_id
        .store(state.next_id.max(OWN_ID_BASE), Ordering::SeqCst);
    hub.relevos.store(state.relevos + 1, Ordering::SeqCst);
    write_ctl(&mut s, 3, &Req::HandoffCommit).map_err(|e| e.to_string())?;
    // esperar a que el viejo se retire (EOF) para no leer dos veces la misma PTY
    let t0 = Instant::now();
    while t0.elapsed() < Duration::from_secs(10) {
        match read_frame(&mut s) {
            Ok(None) | Err(_) => break,
            Ok(Some(_)) => continue,
        }
    }
    for _ in 0..100 {
        if unsafe { libc::kill(old_pid as i32, 0) } != 0 {
            break;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    let listener = match listener {
        Some(l) => l,
        None => {
            let _ = std::fs::remove_file(&cfg.sock);
            UnixListener::bind(&cfg.sock).map_err(|e| e.to_string())?
        }
    };
    hub.log(&format!(
        "relevo #{}: recibí {} terminales del motor {old_pid} (pid nuevo {})",
        state.relevos + 1,
        state.terms.len(),
        std::process::id()
    ));
    let terms: Vec<Arc<Term>> = hub.sorted_terms();
    for t in terms {
        start_reader(hub.clone(), t);
    }
    serve(hub, listener);
    Ok(())
}

/// Vigía de la edición cliente: el stdin del motor es un tubo cuyo otro extremo guarda la app. EOF (la app murió o
/// lo soltó) = matar las terminales propias y salir. No borra el socket: si ya hay otro motor en esa ruta, no es suyo;
/// el siguiente arranque lo reemplaza.
fn vigia_stdin(hub: Arc<Hub>) {
    std::thread::spawn(move || {
        use std::io::Read;
        let mut b = [0u8; 256];
        let mut stdin = std::io::stdin();
        loop {
            match stdin.read(&mut b) {
                Ok(0) => break,
                Ok(_) => continue,
                Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(_) => break,
            }
        }
        for t in hub.sorted_terms().iter() {
            kill_term_tree(t);
        }
        hub.log("la app soltó mi stdin: mato las propias y me apago");
        std::process::exit(0);
    });
}

fn read_res(s: &mut UnixStream, want: u32) -> Result<Res, String> {
    loop {
        match read_frame(s).map_err(|e| e.to_string())? {
            None => return Err("el motor cerró la conexión".into()),
            Some(f) if f.kind == KIND_CTL && f.id == want => {
                return serde_json::from_slice(&f.payload).map_err(|e| e.to_string())
            }
            Some(_) => continue,
        }
    }
}

static LOG_FD: std::sync::atomic::AtomicI32 = std::sync::atomic::AtomicI32::new(-1);

extern "C" fn al_morir(sig: libc::c_int) {
    // async-signal-safe: solo write(2) sobre un fd ya abierto y _exit
    let fd = LOG_FD.load(Ordering::SeqCst);
    if fd >= 0 {
        let msg: &[u8] = match sig {
            libc::SIGTERM => b"[senal] SIGTERM: me apago (las PTYs propias reciben SIGHUP)\n",
            libc::SIGINT => b"[senal] SIGINT: me apago (las PTYs propias reciben SIGHUP)\n",
            _ => b"[senal] fatal: me apago\n",
        };
        unsafe { libc::write(fd, msg.as_ptr() as *const _, msg.len()) };
    }
    unsafe { libc::_exit(128 + sig) };
}

/// Un daemon que existe para no morir debe (1) ignorar SIGHUP — cerrar la terminal o la
/// app que lo lanzó no es razón — y (2) dejar escrito POR QUÉ murió si algo lo mata.
/// Hallazgo del 30 sep: un motor de prueba murió sin una línea en su log.
fn blindar(hub: &Hub) {
    if let Ok(f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&hub.cfg.log)
    {
        use std::os::fd::IntoRawFd;
        LOG_FD.store(f.into_raw_fd(), Ordering::SeqCst);
    }
    unsafe {
        libc::signal(libc::SIGHUP, libc::SIG_IGN);
        libc::signal(libc::SIGPIPE, libc::SIG_IGN);
        libc::signal(libc::SIGTERM, al_morir as *const () as libc::sighandler_t);
        libc::signal(libc::SIGINT, al_morir as *const () as libc::sighandler_t);
    }
    let log = hub.cfg.log.clone();
    std::panic::set_hook(Box::new(move |info| {
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log)
        {
            let _ = writeln!(f, "[{}] PANIC en un hilo: {info}", now_ms());
        }
    }));
}

fn serve(hub: Arc<Hub>, listener: UnixListener) {
    blindar(&hub);
    hub.listener_fd
        .store(listener.as_raw_fd() as u32, Ordering::SeqCst);
    for stream in listener.incoming() {
        match stream {
            Ok(s) => {
                let hub = hub.clone();
                std::thread::spawn(move || serve_client(hub, s));
            }
            Err(e) => hub.log(&format!("accept falló: {e}")),
        }
    }
}

fn serve_client(hub: Arc<Hub>, stream: UnixStream) {
    let id = hub.next_client.fetch_add(1, Ordering::SeqCst);
    let (tx, rx) = sync_channel::<Vec<u8>>(CLIENT_QUEUE_MAX);
    let (Ok(csock), Ok(mut wsock)) = (stream.try_clone(), stream.try_clone()) else {
        return;
    };
    let client = Arc::new(Client {
        id,
        out: tx,
        sock: csock,
        attached: Mutex::new(HashSet::new()),
        quiet: AtomicBool::new(false),
        name: Mutex::new(String::new()),
    });
    lock(&hub.clients).push(client.clone());
    // escritor con Weak (la fuga de hilos del ptyd, 11 sep 2026)
    let weak = Arc::downgrade(&client);
    std::thread::spawn(move || {
        while let Ok(frame) = rx.recv() {
            if wsock.write_all(&frame).is_err() {
                break;
            }
        }
        drop(weak);
        let _ = wsock.shutdown(std::net::Shutdown::Both);
    });

    let mut rsock = stream;
    let mut saludado = false;
    loop {
        let frame = match read_frame(&mut rsock) {
            Ok(Some(f)) => f,
            Ok(None) => break,
            Err(e) => {
                hub.log(&format!("cliente {id} rompió el stream: {e}"));
                break;
            }
        };
        if frame.kind == KIND_DATA {
            // Nada se teclea en una terminal antes de un saludo aceptado (red team 4 M4-3: antes los bytes DATA se
            // escribían sin hello). SFTerm y la web siempre saludan primero.
            if !saludado {
                continue;
            }
            let t = lock(&hub.terms).get(&frame.id).cloned();
            if let Some(t) = t {
                let _ = hub.write_term(&t, &frame.payload);
            }
            continue;
        }
        let req: Req = match serde_json::from_slice(&frame.payload) {
            Ok(r) => r,
            Err(e) => {
                let _ = client
                    .out
                    .send(ctl_bytes(frame.id, &Res::Err { msg: e.to_string() }));
                continue;
            }
        };
        if !saludado {
            let res = match &req {
                Req::Hello { client: who, token, .. } if !hub.cfg.saludo_valido(token.as_deref()) => {
                    hub.log(&format!("hello de {who} sin token válido: lo corto"));
                    let _ = client.out.send(ctl_bytes(
                        frame.id,
                        &Res::Err {
                            msg: "no autorizado".into(),
                        },
                    ));
                    break;
                }
                Req::Hello { proto, client: who, .. } => {
                    saludado = true;
                    *lock(&client.name) = who.clone();
                    if who == RELEVO_CLIENT {
                        client.quiet.store(true, Ordering::SeqCst);
                    }
                    let terms = lock(&hub.terms).len();
                    hub.log(&format!(
                        "hello de {who} (proto {proto}), {terms} terminales"
                    ));
                    if *proto == PROTO {
                        Res::Hello {
                            proto: PROTO,
                            pid: std::process::id(),
                            terms,
                            auth: hub.cfg.token_requerido,
                        }
                    } else {
                        Res::Err {
                            msg: format!("proto {proto} != {PROTO}"),
                        }
                    }
                }
                _ => Res::Err {
                    msg: "falta hello".into(),
                },
            };
            let _ = client.out.send(ctl_bytes(frame.id, &res));
            continue;
        }
        if matches!(req, Req::Handoff) {
            if handoff(&hub, &client, &mut rsock, frame.id) {
                // relevo consumado: el motor nuevo ya tiene todo. Salir SIN matar nada
                // (los masters siguen abiertos en el proceso nuevo; el socket también).
                hub.log("relevo consumado: me retiro sin matar terminales");
                std::process::exit(0);
            }
            continue;
        }
        let res = handle(&hub, &client, req);
        let _ = client.out.send(ctl_bytes(frame.id, &res));
    }
    lock(&hub.clients).retain(|c| c.id != id);
    let _ = rsock.shutdown(std::net::Shutdown::Both);
    drop(client);
}

/// Lado del motor viejo. Devuelve true si el nuevo confirmó (hay que salir ya).
fn handoff(hub: &Arc<Hub>, client: &Arc<Client>, rsock: &mut UnixStream, req_id: u32) -> bool {
    let sock_fd = rsock.as_raw_fd();
    let send_err = |msg: &str| {
        let _ = client
            .out
            .send(ctl_bytes(req_id, &Res::Err { msg: msg.into() }));
    };
    // 1. estacionar lectores (nadie lee la PTY mientras cambia de dueño)
    hub.paused.store(true, Ordering::SeqCst);
    let own: Vec<Arc<Term>> = hub.sorted_terms().into_iter().collect();
    let t0 = Instant::now();
    while !own.iter().all(|t| {
        matches!(&t.backend, Backend::Own { parked, .. } if parked.load(Ordering::SeqCst))
            || !lock(&hub.terms).contains_key(&t.id)
    }) {
        if t0.elapsed() > Duration::from_secs(3) {
            hub.paused.store(false, Ordering::SeqCst);
            send_err("los lectores no se estacionaron a tiempo");
            return false;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    // 2. foto del estado
    let own: Vec<Arc<Term>> = own
        .into_iter()
        .filter(|t| lock(&hub.terms).contains_key(&t.id))
        .collect();
    let listener = hub.listener_fd.load(Ordering::SeqCst);
    let state = HandoffState {
        next_id: hub.next_id.load(Ordering::SeqCst),
        relevos: hub.relevos.load(Ordering::SeqCst),
        listener: listener != u32::MAX,
        terms: own
            .iter()
            .map(|t| {
                let ring = lock(&t.ring);
                let skip = ring.len().saturating_sub(HANDOFF_RING_MAX);
                let bytes: Vec<u8> = ring.iter().skip(skip).copied().collect();
                let (cols, rows) = *lock(&t.size);
                HandoffTerm {
                    id: t.id,
                    pid: t.pid,
                    cwd: t.cwd.clone(),
                    cols,
                    rows,
                    born_ms: t.born_ms,
                    ring_b64: base64::engine::general_purpose::STANDARD.encode(bytes),
                }
            })
            .collect(),
    };
    let mut fds: Vec<RawFd> = Vec::new();
    if state.listener {
        fds.push(listener as RawFd);
    }
    fds.extend(own.iter().map(|t| t.fd()));
    // 3. estado por el stream (directo: el cliente del relevo es silencioso y ya leyó
    //    su hello, así que nada más viaja en su socket) y luego los fds
    let mut w = match rsock.try_clone() {
        Ok(w) => w,
        Err(_) => {
            hub.paused.store(false, Ordering::SeqCst);
            return false;
        }
    };
    let ok = w
        .write_all(&ctl_bytes(req_id, &Res::Handoff { state }))
        .is_ok()
        && fdpass::send_fds(sock_fd, &fds).is_ok();
    if !ok {
        hub.paused.store(false, Ordering::SeqCst);
        hub.log("relevo abortado: no pude mandar el estado; sigo siendo el dueño");
        return false;
    }
    // 4. esperar el commit
    rsock.set_read_timeout(Some(Duration::from_secs(15))).ok();
    let committed = loop {
        match read_frame(rsock) {
            Ok(Some(f)) if f.kind == KIND_CTL => {
                if matches!(
                    serde_json::from_slice::<Req>(&f.payload),
                    Ok(Req::HandoffCommit)
                ) {
                    break true;
                }
            }
            Ok(Some(_)) => continue,
            _ => break false,
        }
    };
    rsock.set_read_timeout(None).ok();
    if !committed {
        hub.paused.store(false, Ordering::SeqCst);
        hub.log("relevo abortado: el motor nuevo no confirmó; sigo siendo el dueño");
    }
    committed
}

fn handle(hub: &Arc<Hub>, client: &Arc<Client>, req: Req) -> Res {
    match req {
        Req::Hello { .. } => Res::Ok,
        Req::List => Res::List {
            terms: hub
                .sorted_terms()
                .iter()
                .map(|t| {
                    let (cols, rows) = *lock(&t.size);
                    TermInfo {
                        id: t.id,
                        pid: t.pid,
                        cwd: t.cwd.clone(),
                        cols,
                        rows,
                        buffered: lock(&t.ring).len(),
                        born_ms: t.born_ms,
                    }
                })
                .collect(),
        },
        Req::Spawn {
            cwd,
            cols,
            rows,
            scrollback: _,
            shell_integration,
            colorfgbg,
            command,
        } => {
            match spawn_term(
                hub,
                cwd,
                cols.max(10),
                rows.max(2),
                shell_integration,
                colorfgbg,
                command,
            ) {
                Ok((id, pid)) => Res::Spawned { id, pid },
                Err(e) => Res::Err { msg: e },
            }
        }
        Req::Attach { id } => {
            let Some(term) = lock(&hub.terms).get(&id).cloned() else {
                return Res::Err {
                    msg: format!("no existe la terminal {id}"),
                };
            };
            lock(&client.attached).insert(id);
            let ring: Vec<u8> = lock(&term.ring).iter().copied().collect();
            let (cols, rows) = *lock(&term.size);
            let _ = client.out.send(frame_bytes(KIND_DATA, id, &ring));
            Res::Attached {
                id,
                bytes: ring.len(),
                cols,
                rows,
            }
        }
        Req::Detach { id } => {
            lock(&client.attached).remove(&id);
            Res::Ok
        }
        Req::Write { id, data } => match lock(&hub.terms).get(&id).cloned() {
            Some(t) => match hub.write_term(&t, data.as_bytes()) {
                Ok(()) => Res::Ok,
                Err(msg) => Res::Err { msg },
            },
            None => Res::Err {
                msg: format!("no existe la terminal {id}"),
            },
        },
        Req::Resize { id, cols, rows } => {
            let Some(term) = lock(&hub.terms).get(&id).cloned() else {
                return Res::Err {
                    msg: format!("no existe la terminal {id}"),
                };
            };
            let fd = term.fd();
            {
                *lock(&term.size) = (cols, rows);
                lock(&term.vt).set_size(rows.max(2), cols.max(10));
                if set_winsize(fd, cols, rows) {
                    Res::Ok
                } else {
                    Res::Err {
                        msg: "TIOCSWINSZ falló".into(),
                    }
                }
            }
        }
        Req::Kill { id, .. } => {
            let Some(t) = lock(&hub.terms).get(&id).cloned() else {
                return Res::Ok;
            };
            lock(&hub.terms).remove(&id);
            kill_term_tree(&t);
            hub.log(&format!(
                "terminal {id} matada por petición (árbol completo)"
            ));
            Res::Ok
        }
        Req::FgPgid { id } => match lock(&hub.terms).get(&id).cloned() {
            Some(t) => {
                let pgid = hub.fg_pgid(&t);
                if pgid > 0 {
                    Res::Pgid { id, pgid }
                } else {
                    Res::Err {
                        msg: "sin proceso en primer plano".into(),
                    }
                }
            }
            None => Res::Err {
                msg: format!("no existe la terminal {id}"),
            },
        },
        Req::FgPgids => Res::Pgids {
            list: hub
                .sorted_terms()
                .iter()
                .map(|t| PgidEntry {
                    id: t.id,
                    pid: t.pid,
                    pgid: hub.fg_pgid(t),
                })
                .collect(),
        },
        Req::Info => {
            Res::Info {
                motor: MotorInfo {
                    pid: std::process::id(),
                    sock: hub.cfg.sock.to_string_lossy().to_string(),
                    started_ms: hub.started_ms,
                    relevos: hub.relevos.load(Ordering::SeqCst),
                    // Campos del cable de la adopción retirada: el cliente TS aún los lee.
                    legacy: None,
                    legacy_connected: false,
                    legacy_readonly: false,
                },
                terms: hub
                    .sorted_terms()
                    .iter()
                    .map(|t| {
                        let (cols, rows) = *lock(&t.size);
                        TermDetail {
                            id: t.id,
                            pid: t.pid,
                            cwd: t.cwd.clone(),
                            cols,
                            rows,
                            born_ms: t.born_ms,
                            origin: "motor".into(),
                            readonly: false,
                            fg: crate::procinfo::fg_info(hub.fg_pgid(t)),
                        }
                    })
                    .collect(),
            }
        }
        Req::Screen { id, lines } => {
            let Some(t) = lock(&hub.terms).get(&id).cloned() else {
                return Res::Err {
                    msg: format!("no existe la terminal {id}"),
                };
            };
            let (text, rows, cols) = {
                let vt = lock(&t.vt);
                let (rows, cols) = vt.screen().size();
                (vt.screen().contents(), rows, cols)
            };
            let mut ls: Vec<&str> = text.lines().collect();
            while ls.last().is_some_and(|l| l.trim().is_empty()) {
                ls.pop();
            }
            let n = lines.unwrap_or(40).clamp(1, 400);
            let from = ls.len().saturating_sub(n);
            Res::Screen {
                id,
                text: ls[from..].join("\n"),
                cols,
                rows,
            }
        }
        Req::Handoff | Req::HandoffCommit => Res::Err {
            msg: "relevo fuera de lugar".into(),
        },
        Req::Shutdown => {
            // Solo las PROPIAS: las adoptadas son del ptyd de SFTerm y jamás se apagan desde aquí.
            for t in hub.sorted_terms().iter() {
                kill_term_tree(t);
            }
            hub.log(
                "shutdown pedido: mato las propias y me apago (las adoptadas siguen en su ptyd)",
            );
            let _ = std::fs::remove_file(&hub.cfg.sock);
            std::process::exit(0);
        }
    }
}
