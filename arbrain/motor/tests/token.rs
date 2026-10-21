//! Red team 4 M4-3: en la edición cliente el socket del motor exige el token por apertura que la app le da por stdin.
//! Pruebas con el BINARIO real en carpetas aisladas de /tmp; nunca tocan el motor de Daniel.

use arbrain_motor::client::{ensure_con_token, Conn};
use arbrain_motor::proto::*;
use std::io::Write;
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::UnixStream;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const BIN: &str = env!("CARGO_BIN_EXE_arbrain-motor");
const TOKEN: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

fn banco(nombre: &str) -> PathBuf {
    let d = PathBuf::from(format!("/tmp/arbrain-motor-token-{}-{nombre}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}

/// Vivo y no zombi: el motor nace como hijo de esta prueba (como de la app), así que al salir hay que cosecharlo.
fn vivo(pid: u32) -> bool {
    let mut st = 0;
    if unsafe { libc::waitpid(pid as i32, &mut st, libc::WNOHANG) } == pid as i32 {
        return false;
    }
    unsafe { libc::kill(pid as i32, 0) == 0 }
}

fn esperar(seg: u64, mut f: impl FnMut() -> bool) -> bool {
    let t0 = Instant::now();
    while t0.elapsed() < Duration::from_secs(seg) {
        if f() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    false
}

/// Motor con token; se apaga al soltarse (Shutdown con el token y, si no, el vigía al cerrar su stdin).
struct Motor {
    sock: PathBuf,
    pid: u32,
    stdin: Option<std::process::ChildStdin>,
}
impl Drop for Motor {
    fn drop(&mut self) {
        if let Ok(mut c) = Conn::open_con(&self.sock, "prueba", Some(TOKEN)) {
            let _ = c.call(&Req::Shutdown);
        }
        drop(self.stdin.take());
        esperar(3, || !vivo(self.pid));
        if vivo(self.pid) {
            unsafe { libc::kill(self.pid as i32, libc::SIGKILL) };
        }
    }
}

fn motor(sock: &Path) -> Motor {
    let (pid, stdin) = ensure_con_token(sock, Path::new(BIN), &[], TOKEN).unwrap();
    Motor { sock: sock.to_path_buf(), pid, stdin: Some(stdin) }
}

fn spawn(c: &mut Conn, cmd: &str) -> u32 {
    match c
        .call(&Req::Spawn {
            cwd: Some("/tmp".into()),
            cols: 100,
            rows: 30,
            scrollback: None,
            shell_integration: Some(false),
            colorfgbg: None,
            command: Some(cmd.into()),
        })
        .unwrap()
    {
        Res::Spawned { id, .. } => id,
        o => panic!("{o:?}"),
    }
}

#[test]
fn sin_token_o_con_otro_no_entra_nadie() {
    let d = banco("saludo");
    let sock = d.join("motor.sock");
    let m = motor(&sock);
    assert!(Conn::open(&sock, "intruso").is_err(), "sin token entró");
    assert!(Conn::open_con(&sock, "intruso", Some(&"f".repeat(64))).is_err(), "con otro token entró");
    assert!(Conn::open_con(&sock, "intruso", Some(&TOKEN[..63])).is_err(), "con un prefijo entró");
    let c = Conn::open_con(&sock, "app", Some(TOKEN)).unwrap();
    assert!(c.auth);
    assert_eq!(c.hello.0, m.pid);
    // Sin saludo, ninguna operación: ni `spawn` ni `info` responden algo útil.
    let mut s = UnixStream::connect(&sock).unwrap();
    s.set_read_timeout(Some(Duration::from_secs(3))).ok();
    write_ctl(&mut s, 1, &Req::Info).unwrap();
    let f = read_frame(&mut s).unwrap().expect("respuesta");
    let r: Res = serde_json::from_slice(&f.payload).unwrap();
    assert!(matches!(r, Res::Err { .. }), "{r:?}");
}

#[test]
fn bytes_sin_saludo_no_llegan_a_la_terminal() {
    let d = banco("datos");
    let sock = d.join("motor.sock");
    let _m = motor(&sock);
    let mut app = Conn::open_con(&sock, "app", Some(TOKEN)).unwrap();
    let id = spawn(&mut app, "/bin/sh");
    let marca = d.join("escrito");
    // Un intruso escribe por DATA directo a la terminal, sin saludar.
    let mut s = UnixStream::connect(&sock).unwrap();
    let cmd = format!("touch {}\r", marca.display());
    let mut marco = vec![KIND_DATA];
    marco.extend_from_slice(&id.to_le_bytes());
    marco.extend_from_slice(&(cmd.len() as u32).to_le_bytes());
    marco.extend_from_slice(cmd.as_bytes());
    s.write_all(&marco).unwrap();
    // Y saluda mal y vuelve a intentarlo: la conexión se corta.
    write_ctl(&mut s, 1, &Req::Hello { proto: PROTO, client: "x".into(), token: Some("mal".into()) }).unwrap();
    let _ = s.write_all(&marco);
    std::thread::sleep(Duration::from_millis(800));
    assert!(!marca.exists(), "el intruso tecleó en la terminal");
    // La app sí puede (control: la terminal está viva y escribe).
    app.call(&Req::Write { id, data: format!("touch {}\r", marca.display()) }).unwrap();
    assert!(esperar(10, || marca.exists()), "la app no pudo escribir");
}

#[test]
fn socket_0600_en_carpeta_0700() {
    let d = banco("permisos");
    let dir = d.join("arbrain-abc123");
    let sock = dir.join("motor.sock");
    let _m = motor(&sock);
    assert_eq!(std::fs::metadata(&dir).unwrap().permissions().mode() & 0o777, 0o700);
    assert_eq!(std::fs::metadata(&sock).unwrap().permissions().mode() & 0o777, 0o600);
    // Una carpeta abierta de antes se cierra al arrancar.
    let d2 = banco("permisos-abierta");
    let dir2 = d2.join("arbrain-def456");
    std::fs::create_dir_all(&dir2).unwrap();
    std::fs::set_permissions(&dir2, std::fs::Permissions::from_mode(0o777)).unwrap();
    let _m2 = motor(&dir2.join("motor.sock"));
    assert_eq!(std::fs::metadata(&dir2).unwrap().permissions().mode() & 0o777, 0o700);
}

#[test]
fn carpeta_que_es_un_enlace_no_se_usa() {
    let d = banco("enlace");
    let real = d.join("real");
    std::fs::create_dir_all(&real).unwrap();
    let enlace = d.join("arbrain-enlace");
    std::os::unix::fs::symlink(&real, &enlace).unwrap();
    assert!(arbrain_motor::server::carpeta_privada(&enlace).is_err());
    assert!(ensure_con_token(&enlace.join("motor.sock"), Path::new(BIN), &[], TOKEN).is_err());
    assert!(!real.join("motor.sock").exists());
}

#[test]
fn se_apaga_cuando_la_app_suelta_su_stdin() {
    let d = banco("vigia");
    let sock = d.join("motor.sock");
    let mut m = motor(&sock);
    let mut c = Conn::open_con(&sock, "app", Some(TOKEN)).unwrap();
    let id = spawn(&mut c, "sleep 300");
    let hijo = match c.call(&Req::List).unwrap() {
        Res::List { terms } => terms.iter().find(|t| t.id == id).map(|t| t.pid).unwrap(),
        o => panic!("{o:?}"),
    };
    drop(c);
    drop(m.stdin.take());
    assert!(esperar(5, || !vivo(m.pid)), "el motor siguió vivo sin la app");
    assert!(esperar(5, || !vivo(hijo)), "su terminal siguió viva");
}

#[test]
fn sin_linea_de_token_no_escucha() {
    let d = banco("sin-linea");
    let sock = d.join("motor.sock");
    let mut hijo = std::process::Command::new(BIN)
        .env("ARBRAIN_MOTOR_SOCK", &sock)
        .env("ARBRAIN_MOTOR_SECRETOS", "stdin")
        .stdin(std::process::Stdio::piped())
        .spawn()
        .unwrap();
    hijo.stdin.take().unwrap().write_all(b"{}\n").unwrap();
    let fin = esperar(5, || matches!(hijo.try_wait(), Ok(Some(_))));
    if !fin {
        let _ = hijo.kill();
    }
    let _ = hijo.wait();
    assert!(fin, "el motor siguió sin token");
    assert!(UnixStream::connect(&sock).is_err());
}

#[test]
fn sin_token_configurado_el_cable_no_cambia() {
    // El motor de la instalación original (sin `ARBRAIN_MOTOR_SECRETOS`): cualquiera que salude entra y `auth` no viaja.
    let d = banco("original");
    let sock = d.join("m.sock");
    let mut hijo = std::process::Command::new(BIN).env("ARBRAIN_MOTOR_SOCK", &sock).spawn().unwrap();
    assert!(esperar(10, || Conn::open(&sock, "sfterm").is_ok()));
    let mut c = Conn::open(&sock, "sfterm").unwrap();
    assert!(!c.auth);
    let mut s = UnixStream::connect(&sock).unwrap();
    write_ctl(&mut s, 1, &Req::Hello { proto: PROTO, client: "sfterm".into(), token: None }).unwrap();
    let f = read_frame(&mut s).unwrap().unwrap();
    let txt = String::from_utf8_lossy(&f.payload).to_string();
    assert!(!txt.contains("auth"), "{txt}");
    let _ = c.call(&Req::Shutdown);
    let _ = hijo.wait();
}
