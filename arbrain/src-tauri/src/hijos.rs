//! Procesos hijos de la app en edición cliente (servidor web y daemon).
//!
//! - Unix: cada hijo nace en su propio grupo de procesos; apagarlo manda SIGTERM al grupo entero (Node y lo que
//!   haya lanzado: el CLI de Claude, servidores MCP) y, si no termina en unos segundos, SIGKILL.
//! - Windows: sin ventana de consola (CREATE_NO_WINDOW) y dentro de un Job Object con KILL_ON_JOB_CLOSE: si la
//!   app se cierra o se cae, Windows mata el árbol completo.
//!
//! La instalación de Daniel no pasa por aquí: sus hijos se lanzan y se apagan como siempre.

use std::process::{Child, Command};
use std::thread;
use std::time::{Duration, Instant};

/// Un hijo administrado: el proceso y, en Windows, el Job Object que lo contiene.
pub struct Hijo {
    pub child: Child,
    #[cfg(windows)]
    job: Option<windows::Job>,
}

impl Hijo {
    pub fn id(&self) -> u32 {
        self.child.id()
    }

    /// `true` si el proceso sigue vivo.
    pub fn vivo(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }

    /// Código de salida si ya terminó (None si sigue vivo o murió por señal).
    pub fn salida(&mut self) -> Option<i32> {
        self.child.try_wait().ok().flatten().and_then(|s| s.code())
    }
}

/// Ajusta el comando antes de lanzarlo (grupo propio, sin consola).
pub fn preparar(cmd: &mut Command) {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // Sin PR_SET_PDEATHSIG en Linux: se dispara cuando muere el HILO que lanzó al hijo, no la app, y aquí
        // se lanza desde hilos de trabajo. Si la app se cae, el hijo ve ARBRAIN_PADRE_PID y la próxima apertura
        // apaga al huérfano (daemon.rs).
        cmd.process_group(0);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        cmd.creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP);
    }
}

/// Envuelve un hijo lanzado a la manera de siempre (instalación de Daniel): sin grupo propio ni Job Object.
pub fn adoptar(child: Child) -> Hijo {
    #[cfg(windows)]
    return Hijo { child, job: None };
    #[cfg(not(windows))]
    Hijo { child }
}

/// Lanza el comando ya preparado y lo deja bajo control de la app.
pub fn lanzar(cmd: &mut Command) -> std::io::Result<Hijo> {
    preparar(cmd);
    let child = cmd.spawn()?;
    #[cfg(windows)]
    {
        let job = windows::Job::para(&child);
        return Ok(Hijo { child, job });
    }
    #[cfg(not(windows))]
    Ok(Hijo { child })
}

/// Apaga el hijo y todo su árbol. Espera hasta `gracia` a que salga solo antes de forzar.
pub fn terminar(hijo: &mut Hijo, gracia: Duration) {
    #[cfg(unix)]
    {
        let pid = hijo.child.id() as i32;
        if pid > 0 {
            unsafe {
                libc::kill(-pid, libc::SIGTERM);
            }
        }
        let inicio = Instant::now();
        while inicio.elapsed() < gracia {
            if !hijo.vivo() {
                break;
            }
            thread::sleep(Duration::from_millis(100));
        }
        if pid > 0 {
            // El grupo entero: algún nieto pudo ignorar SIGTERM aunque el hijo ya saliera.
            unsafe {
                libc::kill(-pid, libc::SIGKILL);
            }
        }
        let _ = hijo.child.wait();
    }
    #[cfg(windows)]
    {
        let _ = gracia;
        if let Some(job) = hijo.job.take() {
            job.terminar();
        }
        let _ = hijo.child.kill();
        let _ = hijo.child.wait();
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = gracia;
        let _ = hijo.child.kill();
        let _ = hijo.child.wait();
    }
}

/// Apaga un proceso huérfano de una ejecución anterior (la app se cayó), conocido solo por su pid.
/// Solo se usa después de comprobar que ese pid es nuestro (respondió con el token de esta instalación).
pub fn terminar_pid(pid: u32) {
    #[cfg(unix)]
    unsafe {
        let pid = pid as i32;
        if pid > 1 {
            libc::kill(-pid, libc::SIGTERM);
            libc::kill(pid, libc::SIGTERM);
            thread::sleep(Duration::from_millis(1500));
            libc::kill(-pid, libc::SIGKILL);
            libc::kill(pid, libc::SIGKILL);
        }
    }
    #[cfg(windows)]
    windows::terminar_pid(pid);
}

#[cfg(windows)]
mod windows {
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
        TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    use windows_sys::Win32::System::Threading::{OpenProcess, TerminateProcess, PROCESS_TERMINATE};

    pub struct Job(HANDLE);
    // El handle del job solo se usa para cerrarlo o terminarlo; Windows lo permite desde cualquier hilo.
    unsafe impl Send for Job {}
    unsafe impl Sync for Job {}

    impl Job {
        pub fn para(child: &Child) -> Option<Job> {
            unsafe {
                let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
                if job.is_null() {
                    return None;
                }
                let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                let ok = SetInformationJobObject(
                    job,
                    JobObjectExtendedLimitInformation,
                    &info as *const _ as *const core::ffi::c_void,
                    std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                );
                if ok == 0 || AssignProcessToJobObject(job, child.as_raw_handle() as HANDLE) == 0 {
                    CloseHandle(job);
                    return None;
                }
                Some(Job(job))
            }
        }

        pub fn terminar(self) {
            unsafe {
                TerminateJobObject(self.0, 1);
            }
        }
    }

    impl Drop for Job {
        fn drop(&mut self) {
            // Cerrar el último handle mata el árbol (KILL_ON_JOB_CLOSE).
            unsafe {
                CloseHandle(self.0);
            }
        }
    }

    pub fn terminar_pid(pid: u32) {
        unsafe {
            let h = OpenProcess(PROCESS_TERMINATE, 0, pid);
            if !h.is_null() {
                TerminateProcess(h, 1);
                CloseHandle(h);
            }
        }
    }
}
