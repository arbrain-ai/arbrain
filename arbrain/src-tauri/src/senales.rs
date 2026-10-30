//! Señales de terminación en Unix (edición cliente, carril T, 11 oct 2026).
//!
//! Sin esto, si la app muere por `SIGTERM`/`SIGINT`/`SIGHUP` (un `kill`, el cierre de sesión, una terminal que se cierra)
//! y no por Cmd+Q, Tauri no emite `RunEvent::Exit`: el daemon se apagaba solo (su stdin vigía) pero el servidor web
//! (Next) y el motor de terminales quedaban vivos con su puerto y su socket, adoptados por launchd (ppid 1).
//!
//! Aquí: un manejador async-signal-safe que solo escribe un byte en una tubería (self-pipe) y un hilo que la lee y
//! corre el apagado ordenado que le pasa la app (daemon por `POST /apagar`, Next y motor matando su grupo). Una
//! segunda señal durante el apagado sale de inmediato; si el apagado se cuelga, un plazo sale de todos modos.
//!
//! Windows no pasa por aquí: los hijos viven en un Job Object con `KILL_ON_JOB_CLOSE` (hijos.rs), que Windows cierra
//! cuando la app muere por la causa que sea. La instalación de Daniel tampoco: `lib.rs` solo lo instala en cliente.

#[cfg(unix)]
mod unix {
    use std::io::Read;
    use std::os::fd::FromRawFd;
    use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
    use std::thread;
    use std::time::Duration;

    /// Extremo de escritura de la tubería (−1 = sin instalar). Lo lee el manejador; nada más lo toca.
    static ESCRITURA: AtomicI32 = AtomicI32::new(-1);
    static INSTALADO: AtomicBool = AtomicBool::new(false);

    /// Las señales que apagan la app en orden.
    pub const SENALES: [libc::c_int; 3] = [libc::SIGTERM, libc::SIGINT, libc::SIGHUP];

    extern "C" fn manejador(senal: libc::c_int) {
        // Solo llamadas async-signal-safe: write(2) y nada que asigne memoria ni tome candados.
        let fd = ESCRITURA.load(Ordering::Relaxed);
        if fd >= 0 {
            let b = senal as u8;
            unsafe {
                libc::write(fd, &b as *const u8 as *const libc::c_void, 1);
            }
        }
    }

    /// Instala el manejador una vez. `apagar` corre en un hilo propio con la primera señal; al volver (o pasado
    /// `plazo`), el proceso sale con `128 + señal`. Devuelve `false` si ya estaba instalado o el sistema no dejó.
    pub fn instalar<F>(apagar: F, plazo: Duration) -> bool
    where
        F: FnOnce(libc::c_int) + Send + 'static,
    {
        if INSTALADO.swap(true, Ordering::SeqCst) {
            return false;
        }
        let mut fds = [0 as libc::c_int; 2];
        if unsafe { libc::pipe(fds.as_mut_ptr()) } != 0 {
            INSTALADO.store(false, Ordering::SeqCst);
            return false;
        }
        for fd in fds {
            unsafe {
                libc::fcntl(fd, libc::F_SETFD, libc::FD_CLOEXEC);
            }
        }
        // Escritura no bloqueante: si la tubería se llenara (no pasa: 1 byte por señal), el manejador no se traba.
        unsafe {
            let flags = libc::fcntl(fds[1], libc::F_GETFL);
            libc::fcntl(fds[1], libc::F_SETFL, flags | libc::O_NONBLOCK);
        }
        ESCRITURA.store(fds[1], Ordering::SeqCst);
        for s in SENALES {
            unsafe {
                let mut accion: libc::sigaction = std::mem::zeroed();
                accion.sa_sigaction = manejador as *const () as usize;
                accion.sa_flags = libc::SA_RESTART;
                libc::sigemptyset(&mut accion.sa_mask);
                libc::sigaction(s, &accion, std::ptr::null_mut());
            }
        }
        let mut lectura = unsafe { std::fs::File::from_raw_fd(fds[0]) };
        thread::Builder::new()
            .name("arbrain-senales".into())
            .spawn(move || {
                let mut b = [0u8; 1];
                if lectura.read_exact(&mut b).is_err() {
                    return;
                }
                let senal = b[0] as libc::c_int;
                let codigo = 128 + senal;
                // Segunda señal (o el plazo): salir ya, sin esperar al apagado.
                thread::spawn(move || {
                    let mut b = [0u8; 1];
                    if lectura.read_exact(&mut b).is_ok() {
                        unsafe { libc::_exit(128 + b[0] as libc::c_int) };
                    }
                });
                thread::spawn(move || {
                    thread::sleep(plazo);
                    unsafe { libc::_exit(codigo) };
                });
                apagar(senal);
                std::process::exit(codigo);
            })
            .is_ok()
    }
}

#[cfg(unix)]
pub use unix::instalar;

#[cfg(test)]
#[cfg(unix)]
mod tests {
    //! La prueba se relanza a sí misma como hijo (variable `ARBRAIN_PRUEBA_SENALES`): el hijo instala el manejador,
    //! lanza dos procesos como los de la app (uno en su grupo, como Next; otro con `setsid`, como el motor) y espera.
    //! El padre le manda SIGTERM y comprueba que no queda ninguno vivo (sin huérfanos con ppid 1).
    use crate::hijos;
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    fn vivo(pid: i32) -> bool {
        unsafe { libc::kill(pid, 0) == 0 }
    }

    /// Lo que corre el hijo relanzado. Escribe `pid_hijo1 pid_hijo2` en el archivo de la variable y espera señal.
    fn modo_hijo(archivo: &str) {
        let mut cmd = Command::new("sleep");
        cmd.arg("300").stdin(Stdio::null());
        let hijo = std::sync::Arc::new(std::sync::Mutex::new(Some(hijos::lanzar(&mut cmd).unwrap())));
        // «Motor»: sesión propia (como `arbrain_motor::client::ensure`), con un nieto en su grupo.
        let mut motor = Command::new("sh");
        motor.args(["-c", "sleep 300 & wait"]).stdin(Stdio::null());
        unsafe {
            use std::os::unix::process::CommandExt;
            motor.pre_exec(|| {
                libc::setsid();
                Ok(())
            });
        }
        let motor = motor.spawn().unwrap();
        let motor_pid = motor.id();
        let pid_web = hijo.lock().unwrap().as_ref().unwrap().id();
        std::fs::write(archivo, format!("{} {}", pid_web, motor_pid)).unwrap();
        let h = hijo.clone();
        assert!(super::instalar(
            move |_| {
                if let Some(mut x) = h.lock().unwrap().take() {
                    hijos::terminar(&mut x, Duration::from_secs(2));
                }
                hijos::terminar_pid(motor_pid);
            },
            Duration::from_secs(10),
        ));
        assert!(!super::instalar(|_| {}, Duration::from_secs(1)), "se instala una sola vez");
        std::thread::sleep(Duration::from_secs(60));
        panic!("la señal no llegó");
    }

    #[test]
    fn sigterm_apaga_los_hijos_sin_huerfanos() {
        if let Ok(archivo) = std::env::var("ARBRAIN_PRUEBA_SENALES") {
            modo_hijo(&archivo);
            return;
        }
        let dir = std::env::temp_dir().join(format!("arbrain-senales-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let archivo = dir.join("pids");
        let exe = std::env::current_exe().unwrap();
        let mut app = Command::new(exe)
            .args(["--exact", "senales::tests::sigterm_apaga_los_hijos_sin_huerfanos", "--nocapture", "--test-threads=1"])
            .env("ARBRAIN_PRUEBA_SENALES", &archivo)
            .env("HOME", &dir)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        let t0 = Instant::now();
        let pids: Vec<i32> = loop {
            if let Ok(s) = std::fs::read_to_string(&archivo) {
                let v: Vec<i32> = s.split_whitespace().filter_map(|x| x.parse().ok()).collect();
                if v.len() == 2 {
                    break v;
                }
            }
            assert!(t0.elapsed() < Duration::from_secs(20), "el hijo no arrancó");
            std::thread::sleep(Duration::from_millis(50));
        };
        // El nieto del «motor» (sleep dentro de su sesión) también debe morir: se busca por grupo.
        std::thread::sleep(Duration::from_millis(300));
        for p in &pids {
            assert!(vivo(*p), "el proceso {p} no arrancó");
        }
        unsafe { libc::kill(app.id() as i32, libc::SIGTERM) };
        let estado = app.wait().unwrap();
        use std::os::unix::process::ExitStatusExt;
        assert_eq!(estado.code(), Some(128 + libc::SIGTERM), "salida ordenada con 128+SIGTERM: {estado:?} {:?}", estado.signal());
        let t1 = Instant::now();
        while t1.elapsed() < Duration::from_secs(5) && pids.iter().any(|p| vivo(*p)) {
            std::thread::sleep(Duration::from_millis(100));
        }
        for p in &pids {
            assert!(!vivo(*p), "quedó vivo {p} tras el SIGTERM de la app");
            // Grupo del motor (pgid = su pid por setsid): sin nadie dentro.
            assert!(unsafe { libc::kill(-*p, 0) } != 0, "quedó vivo el grupo {p}");
        }
        let _ = std::fs::remove_dir_all(dir);
    }
}
