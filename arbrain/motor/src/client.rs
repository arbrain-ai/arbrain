//! Cliente mínimo (síncrono) del motor: lo usan el escritorio (asegurar que el motor
//! viva, desacoplado de la app) y las pruebas.

use crate::proto::*;
use std::os::unix::net::UnixStream;
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

pub struct Conn {
    s: UnixStream,
    next: u32,
    pub hello: (u32, usize),
    /// El motor confirmó el token de esta apertura (`Res::Hello.auth`).
    pub auth: bool,
}

impl Conn {
    pub fn open(sock: &Path, who: &str) -> Result<Conn, String> {
        Conn::open_con(sock, who, None)
    }
    /// Como `open`, con el token por apertura (edición cliente). `hello.2` = el motor confirmó el token.
    pub fn open_con(sock: &Path, who: &str, token: Option<&str>) -> Result<Conn, String> {
        let s = UnixStream::connect(sock)
            .map_err(|e| format!("motor no disponible en {}: {e}", sock.display()))?;
        s.set_read_timeout(Some(Duration::from_secs(5))).ok();
        let mut c = Conn {
            s,
            next: 1,
            hello: (0, 0),
            auth: false,
        };
        match c.call(&Req::Hello {
            proto: PROTO,
            client: who.into(),
            token: token.map(str::to_string),
        })? {
            Res::Hello { pid, terms, auth, .. } => {
                c.hello = (pid, terms);
                c.auth = auth;
            }
            other => return Err(format!("saludo inesperado: {other:?}")),
        }
        Ok(c)
    }
    pub fn call(&mut self, req: &Req) -> Result<Res, String> {
        let id = self.next;
        self.next += 1;
        write_ctl(&mut self.s, id, req).map_err(|e| e.to_string())?;
        loop {
            match read_frame(&mut self.s).map_err(|e| e.to_string())? {
                None => return Err("el motor cerró".into()),
                Some(f) if f.kind == KIND_CTL && f.id == id => {
                    return serde_json::from_slice(&f.payload).map_err(|e| e.to_string())
                }
                Some(_) => continue,
            }
        }
    }
}

/// `info` del motor vivo como JSON (para `--estado` y el escritorio).
pub fn info(sock: &Path) -> Result<String, String> {
    let mut c = Conn::open(sock, "arbrain-estado")?;
    match c.call(&Req::Info)? {
        Res::Info { motor, terms } => {
            Ok(serde_json::json!({ "motor": motor, "terms": terms }).to_string())
        }
        other => Err(format!("{other:?}")),
    }
}

/// ¿Hay motor? Si no, lo levanta DESACOPLADO (sesión propia: cerrar la app que lo
/// lanzó no le manda SIGHUP) y espera su socket. Devuelve el pid del motor.
pub fn ensure(
    sock: &Path,
    exe: &Path,
    args: &[&str],
    envs: &[(String, String)],
) -> Result<u32, String> {
    if let Ok(c) = Conn::open(sock, "arbrain-escritorio") {
        return Ok(c.hello.0);
    }
    let mut cmd = std::process::Command::new(exe);
    cmd.args(args)
        .env("ARBRAIN_MOTOR_SOCK", sock)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    for (k, v) in envs {
        cmd.env(k, v);
    }
    unsafe {
        cmd.pre_exec(|| {
            libc::setsid();
            Ok(())
        });
    }
    cmd.spawn()
        .map_err(|e| format!("no pude lanzar el motor: {e}"))?;
    let t0 = Instant::now();
    while t0.elapsed() < Duration::from_secs(5) {
        if let Ok(c) = Conn::open(sock, "arbrain-escritorio") {
            return Ok(c.hello.0);
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    Err("el motor no abrió su socket en 5 s".into())
}

pub fn default_sock() -> PathBuf {
    crate::default_sock()
}

/// Edición cliente (red team 4 M4-3): levanta un motor que EXIGE `token` en el saludo. El token viaja en la primera
/// línea de su stdin (`{"ARBRAIN_MOTOR_TOKEN":"…"}`, nunca por entorno: `ps eww` lo vería) y el stdin queda abierto
/// como vigía: cuando la app muere y el extremo se cierra, el motor mata sus terminales y sale. Devuelve el pid y ese
/// extremo, que la app guarda mientras viva. Espera hasta 5 s a que el socket salude con `auth`.
pub fn ensure_con_token(
    sock: &Path,
    exe: &Path,
    args: &[&str],
    token: &str,
) -> Result<(u32, std::process::ChildStdin), String> {
    use std::io::Write;
    let mut cmd = std::process::Command::new(exe);
    cmd.args(args)
        .env("ARBRAIN_MOTOR_SOCK", sock)
        .env(crate::ENV_SECRETOS_MOTOR, "stdin")
        .env_remove(crate::ENV_TOKEN_MOTOR)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    unsafe {
        cmd.pre_exec(|| {
            libc::setsid();
            Ok(())
        });
    }
    let mut hijo = cmd
        .spawn()
        .map_err(|e| format!("no pude lanzar el motor: {e}"))?;
    let mut stdin = hijo.stdin.take().ok_or("el motor no tiene stdin")?;
    let linea = format!("{}\n", serde_json::json!({ (crate::ENV_TOKEN_MOTOR): token }));
    stdin
        .write_all(linea.as_bytes())
        .and_then(|_| stdin.flush())
        .map_err(|e| format!("no pude darle su token al motor: {e}"))?;
    let t0 = Instant::now();
    while t0.elapsed() < Duration::from_secs(5) {
        if let Ok(c) = Conn::open_con(sock, "arbrain-escritorio", Some(token)) {
            if c.auth {
                return Ok((c.hello.0, stdin));
            }
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    Err("el motor no abrió su socket en 5 s".into())
}
