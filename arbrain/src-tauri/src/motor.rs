//! El escritorio y el motor de Arbrain.
//!
//! Las PTYs NO son hijas de la app: viven en el motor (`--motor`, mismo binario), que
//! nace en su propia sesión (`setsid`). Cerrar la app no lo toca; abrirla lo vuelve a
//! encontrar. En el servidor (Studio) lo arranca su LaunchAgent; aquí la app solo lo
//! asegura si la máquina lo tiene habilitado (`ARBRAIN_MOTOR=1` o el archivo
//! `~/.config/arbrain/motor.enabled`), para que un cliente como la MacBook no levante
//! terminales propias por abrir la app.
//!
//! Edición cliente: el socket vive en la carpeta de la app del alumno (`ARBRAIN_MOTOR_SOCK`, que la app fija al
//! arrancar), nunca en `~/.config/arbrain`, y el motor se habilita solo en Unix (macOS, Linux).
//! Windows no tiene motor (sockets Unix, paso de fds y grupos de procesos): `motor_status` responde vacío.
//!
//! Red team 4 M4-3: en cliente el socket exige un token por apertura (`secretos::apertura().motor`). La app se lo da al
//! motor en la primera línea de su stdin (nunca por entorno) y a la web por su línea de secretos; el daemon y los
//! agentes no lo tienen. El socket nace 0600 en una carpeta 0700 propia (también la alterna de `$TMPDIR`), y el stdin
//! del motor queda abierto como vigía: si la app muere, el motor mata sus terminales y sale.

use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MotorStatus {
    pub sock: String,
    pub enabled: bool,
    pub alive: bool,
    pub pid: Option<u32>,
    pub terms: Option<usize>,
    pub error: Option<String>,
}

#[cfg(unix)]
fn enabled() -> bool {
    if crate::desktop_env::EDICION_CLIENTE {
        return true;
    }
    std::env::var("ARBRAIN_MOTOR").is_ok_and(|v| v == "1")
        || crate::desktop_env::home_dir().is_some_and(|h| h.join(".config/arbrain/motor.enabled").exists())
}

/// Extremo de escritura del stdin del motor del alumno: mientras la app lo guarde, el motor vive (vigía).
#[cfg(unix)]
static VIGIA_MOTOR: std::sync::Mutex<Option<std::process::ChildStdin>> = std::sync::Mutex::new(None);

/// Edición cliente: asegurar un motor que exige el token de esta apertura. Un motor en la ruta que no lo confirma (de
/// una versión anterior sin token) se apaga; uno que rechaza el token (de otra apertura que no murió) pierde la ruta.
#[cfg(unix)]
fn ensure_cliente(sock: std::path::PathBuf) -> MotorStatus {
    static UNO_A_LA_VEZ: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _turno = UNO_A_LA_VEZ.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
    let mut st = MotorStatus { sock: sock.to_string_lossy().to_string(), enabled: true, alive: false, pid: None, terms: None, error: None };
    // Sin la ruta que fija la app, `default_sock` sería `~/.config/arbrain/motor.sock` (el motor de Daniel si la app del
    // alumno se abre en su Mac): no se toca.
    if std::env::var("ARBRAIN_MOTOR_SOCK").map_or(true, |v| v.is_empty()) {
        st.error = Some("Sin carpeta para el motor de terminales.".into());
        return st;
    }
    let token = crate::secretos::apertura().motor.as_str();
    if let Ok(mut c) = arbrain_motor::client::Conn::open_con(&sock, "arbrain-escritorio", Some(token)) {
        if c.auth {
            st.alive = true;
            st.pid = Some(c.hello.0);
            st.terms = Some(c.hello.1);
            return st;
        }
        let pid = c.hello.0;
        let _ = c.call(&arbrain_motor::proto::Req::Shutdown);
        drop(c);
        let inicio = std::time::Instant::now();
        while inicio.elapsed() < std::time::Duration::from_secs(2) && pid > 1 && unsafe { libc::kill(pid as i32, 0) } == 0 {
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
    }
    if let Some(dir) = sock.parent() {
        if let Err(e) = arbrain_motor::server::carpeta_privada(dir) {
            st.error = Some(e);
            return st;
        }
    }
    if std::os::unix::net::UnixStream::connect(&sock).is_ok() {
        let _ = std::fs::remove_file(&sock);
    }
    match std::env::current_exe() {
        Ok(exe) => match arbrain_motor::client::ensure_con_token(&sock, &exe, &["--motor"], token) {
            Ok((pid, stdin)) => {
                if let Ok(mut v) = VIGIA_MOTOR.lock() {
                    *v = Some(stdin);
                }
                st.alive = true;
                st.pid = Some(pid);
            }
            Err(e) => st.error = Some(e),
        },
        Err(e) => st.error = Some(e.to_string()),
    }
    st
}

/// Probar (y, si está habilitado, levantar) el motor. Nunca lo mata.
#[cfg(unix)]
pub fn ensure() -> MotorStatus {
    let sock = arbrain_motor::default_sock();
    if crate::desktop_env::EDICION_CLIENTE {
        return ensure_cliente(sock);
    }
    let on = enabled();
    let mut st = MotorStatus { sock: sock.to_string_lossy().to_string(), enabled: on, alive: false, pid: None, terms: None, error: None };
    if let Ok(c) = arbrain_motor::client::Conn::open(&sock, "arbrain-escritorio") {
        st.alive = true;
        st.pid = Some(c.hello.0);
        st.terms = Some(c.hello.1);
        return st;
    }
    if !on {
        return st;
    }
    if let Some(dir) = sock.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    match std::env::current_exe() {
        Ok(exe) => match arbrain_motor::client::ensure(&sock, &exe, &["--motor"], &[]) {
            Ok(pid) => {
                st.alive = true;
                st.pid = Some(pid);
            }
            Err(e) => st.error = Some(e),
        },
        Err(e) => st.error = Some(e.to_string()),
    }
    st
}

/// Edición cliente (carril T): el motor del alumno se va con la app. Primero se le pide `Shutdown` por su socket
/// (mata sus terminales y sale); si sigue vivo, SIGTERM y SIGKILL a su grupo (nace con `setsid`: grupo = su pid).
/// En la instalación de Daniel no hace nada: su motor es inmortal a propósito.
#[cfg(unix)]
pub fn apagar_cliente() {
    if !crate::desktop_env::EDICION_CLIENTE {
        return;
    }
    let sock = arbrain_motor::default_sock();
    let token = crate::secretos::apertura().motor.as_str();
    let conexion = arbrain_motor::client::Conn::open_con(&sock, "arbrain-escritorio", Some(token));
    // Soltar el vigía: aunque el `Shutdown` no llegue, el motor ve EOF y sale con sus terminales.
    if let Ok(mut v) = VIGIA_MOTOR.lock() {
        drop(v.take());
    }
    let Ok(mut c) = conexion else { return };
    if !c.auth {
        return;
    }
    let pid = c.hello.0;
    let _ = c.call(&arbrain_motor::proto::Req::Shutdown);
    drop(c);
    let inicio = std::time::Instant::now();
    while inicio.elapsed() < std::time::Duration::from_secs(2) && pid > 1 && unsafe { libc::kill(pid as i32, 0) } == 0 {
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    if pid > 1 && unsafe { libc::kill(pid as i32, 0) } == 0 {
        crate::hijos::terminar_pid(pid);
    }
}

#[cfg(not(unix))]
pub fn apagar_cliente() {}

#[cfg(not(unix))]
pub fn ensure() -> MotorStatus {
    MotorStatus {
        sock: String::new(),
        enabled: false,
        alive: false,
        pid: None,
        terms: None,
        error: Some("El motor de terminales no existe en este sistema.".into()),
    }
}

#[tauri::command]
pub fn motor_status() -> MotorStatus {
    ensure()
}
