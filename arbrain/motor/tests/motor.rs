//! Pruebas del motor con el BINARIO real, en sockets aislados de /tmp.
//! Nunca tocan el ptyd ni el motor de Daniel.

use arbrain_motor::client::Conn;
use arbrain_motor::proto::*;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::time::{Duration, Instant};

const BIN: &str = env!("CARGO_BIN_EXE_arbrain-motor");

fn banco(nombre: &str) -> PathBuf {
    let d = PathBuf::from(format!(
        "/tmp/arbrain-motor-test-{}-{nombre}",
        std::process::id()
    ));
    std::fs::create_dir_all(&d).unwrap();
    d
}

/// Hijo que se mata al soltarse: una prueba que falla no deja motores colgados.
struct Hijo(Child);
impl Drop for Hijo {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
impl std::ops::Deref for Hijo {
    type Target = Child;
    fn deref(&self) -> &Child {
        &self.0
    }
}
impl std::ops::DerefMut for Hijo {
    fn deref_mut(&mut self) -> &mut Child {
        &mut self.0
    }
}

fn motor(sock: &Path, extra: &[&str]) -> Hijo {
    let mut c = Command::new(BIN);
    c.args(extra).env("ARBRAIN_MOTOR_SOCK", sock);
    Hijo(c.spawn().unwrap())
}

fn esperar<T>(seg: u64, mut f: impl FnMut() -> Option<T>) -> T {
    let t0 = Instant::now();
    loop {
        if let Some(v) = f() {
            return v;
        }
        assert!(
            t0.elapsed() < Duration::from_secs(seg),
            "condición no se cumplió a tiempo"
        );
        std::thread::sleep(Duration::from_millis(100));
    }
}

fn conn(sock: &Path) -> Conn {
    esperar(10, || Conn::open(sock, "prueba").ok())
}

fn spawn(c: &mut Conn, cmd: &str) -> (u32, u32) {
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
        Res::Spawned { id, pid } => (id, pid),
        o => panic!("{o:?}"),
    }
}

fn pantalla(c: &mut Conn, id: u32) -> String {
    match c
        .call(&Req::Screen {
            id,
            lines: Some(30),
        })
        .unwrap()
    {
        Res::Screen { text, .. } => text,
        o => format!("{o:?}"),
    }
}

fn lista(c: &mut Conn) -> Vec<TermInfo> {
    match c.call(&Req::List).unwrap() {
        Res::List { terms } => terms,
        o => panic!("{o:?}"),
    }
}

fn vivo(pid: u32) -> bool {
    unsafe { libc::kill(pid as i32, 0) == 0 }
}

#[test]
fn nace_escribe_y_se_lee_sin_gui() {
    let d = banco("basico");
    let sock = d.join("m.sock");
    let mut m = motor(&sock, &[]);
    let mut c = conn(&sock);
    let (id, pid) = spawn(&mut c, "printf 'HOLA-%s\\n' MOTOR");
    assert!(id >= 100_000 && vivo(pid));
    esperar(15, || {
        pantalla(&mut c, id).contains("HOLA-MOTOR").then_some(())
    });
    // escribir por DATA como lo hace SFTerm
    c.call(&Req::Write {
        id,
        data: "echo ESCRITO-$((20+22))\r".into(),
    })
    .unwrap();
    esperar(10, || {
        pantalla(&mut c, id).contains("ESCRITO-42").then_some(())
    });
    let _ = c.call(&Req::Shutdown);
    let _ = m.wait();
}

#[test]
fn contesta_la_posicion_del_cursor_sin_vista() {
    let d = banco("cpr");
    let sock = d.join("m.sock");
    let mut m = motor(&sock, &[]);
    let mut c = conn(&sock);
    // un TUI que pregunta CSI 6n y espera la respuesta (como crossterm en codex)
    let py = r#"/usr/bin/python3 -c "import os,sys,tty,termios,select;fd=sys.stdin.fileno();old=termios.tcgetattr(fd);tty.setraw(fd);os.write(1,b'\x1b[6n');r,_,_=select.select([fd],[],[],3);d=os.read(fd,32) if r else b'';termios.tcsetattr(fd,termios.TCSADRAIN,old);print('CPR-OK' if d.endswith(b'R') else 'CPR-FALTA')""#;
    let (id, _) = spawn(&mut c, py);
    let txt = esperar(15, || {
        let t = pantalla(&mut c, id);
        (t.contains("CPR-OK") || t.contains("CPR-FALTA")).then_some(t)
    });
    assert!(txt.contains("CPR-OK"), "{txt}");
    let _ = c.call(&Req::Shutdown);
    let _ = m.wait();
}

#[test]
fn relevo_sin_matar_mismo_pid_mismo_socket() {
    let d = banco("relevo");
    let sock = d.join("m.sock");
    let mut viejo = motor(&sock, &[]);
    let mut c = conn(&sock);
    let (id, pid) = spawn(&mut c, "printf 'ANTES-%s\\n' RELEVO");
    esperar(15, || {
        pantalla(&mut c, id).contains("ANTES-RELEVO").then_some(())
    });
    let pid_viejo = c.hello.0;
    drop(c);
    let mut nuevo = motor(&sock, &["--relevo"]);
    // el viejo se retira solo, con código 0, sin matar
    let st = esperar(15, || viejo.try_wait().unwrap());
    assert!(st.success());
    assert!(vivo(pid), "el shell murió en el relevo");
    let mut c = conn(&sock);
    assert_ne!(c.hello.0, pid_viejo);
    let t = lista(&mut c);
    assert!(t.iter().any(|t| t.id == id && t.pid == pid), "{t:?}");
    // el replay viajó y el nuevo motor lee y escribe la misma PTY
    assert!(pantalla(&mut c, id).contains("ANTES-RELEVO"));
    c.call(&Req::Write {
        id,
        data: "echo DESPUES-$((1+1))\r".into(),
    })
    .unwrap();
    esperar(10, || {
        pantalla(&mut c, id).contains("DESPUES-2").then_some(())
    });
    // un segundo relevo encadenado
    drop(c);
    let mut tercero = motor(&sock, &["--relevo"]);
    esperar(15, || nuevo.try_wait().unwrap());
    let mut c = conn(&sock);
    assert!(lista(&mut c).iter().any(|t| t.id == id && t.pid == pid));
    if let Res::Info { motor, .. } = c.call(&Req::Info).unwrap() {
        assert_eq!(motor.relevos, 2);
    }
    // y las terminales que nazcan después no chocan de id
    let (id2, _) = spawn(&mut c, "true");
    assert!(id2 > id);
    let _ = c.call(&Req::Shutdown);
    let _ = tercero.wait();
    assert!(esperar(5, || (!vivo(pid)).then_some(true)));
}
