//! Secretos de la edición cliente por stdin, nunca por entorno (endurecimiento, 11 oct 2026; CONTRATO-DAEMON.md v2 §2.1).
//!
//! Lo que viaja en variables de entorno lo ve cualquier proceso del mismo usuario (`ps eww <pid>`,
//! `/proc/<pid>/environ`) y lo hereda todo hijo, incluidos los agentes que corren dentro del daemon. Por eso:
//!
//! - Los secretos son **por apertura** y viven solo en la memoria de la app: token del daemon, secreto de confirmar,
//!   pase de agente y secreto de escritorio. Nada en disco (las versiones anteriores dejaban `daemon-token` y
//!   `desktop-secret` en la carpeta de configuración, a la vista de un agente con Bash: se borran al arrancar).
//! - Al daemon se le escriben en UNA línea JSON en su stdin (con las llaves BYOK del llavero); el stdin queda abierto
//!   porque es su vigía de vida. El daemon los guarda en memoria y arma el entorno de cada agente con lista blanca.
//! - Al servidor web (Next standalone) también: `node -e <PRELUDIO_WEB> server.js` lee la línea, la pone en el
//!   `process.env` de ESE proceso (en memoria: `ps eww` muestra el entorno inicial, que no la tiene) y carga Next.
//!   La web nunca recibe las llaves BYOK. Carril T: con `ARBRAIN_VIGILAR_STDIN=1` su stdin queda abierto como el del
//!   daemon y es su vigía: si la app muere (EOF) o su padre cambia (huérfano adoptado por launchd/init), Next sale.
//!
//! La instalación de Daniel no pasa por aquí (solo la edición cliente lanza daemon y web así).

use std::io::Write;
use std::path::Path;
use std::process::Child;
use std::sync::OnceLock;

/// Marca para el hijo: «tus secretos vienen en la primera línea de stdin».
pub const ENV_SECRETOS: &str = "ARBRAIN_SECRETOS";

/// Nombres que la app nunca deja pasar por entorno a sus hijos (ni heredados de quien la lanzó).
pub const NUNCA_POR_ENTORNO: [&str; 10] = [
    "OPENCLAW_GATEWAY_TOKEN",
    "ARBRAIN_MOTOR_TOKEN",
    "ARBRAIN_DAEMON_TOKEN",
    "ARBRAIN_TOKEN_CONFIRMAR",
    "ARBRAIN_PASE_AGENTE",
    "ARBRAIN_DESKTOP_SECRET",
    "ANTHROPIC_API_KEY",
    "CLAUDE_CODE_OAUTH_TOKEN",
    "OPENROUTER_API_KEY",
    "GROQ_API_KEY",
];

/// Lee la primera línea de stdin (solo esa: no espera EOF), pone los secretos conocidos en `process.env` de este proceso y carga el
/// `server.js` de Next que llega como primer argumento. Sin secretos (línea vacía o ilegible) Next arranca igual y
/// nadie es «la app» (falla del lado seguro). Comillas simples: Windows no tiene que escapar nada.
///
/// Además, ningún hijo de la web los hereda (lo que Next lance —git, gog, python— mostraría su entorno con `ps eww`
/// mientras vive): se filtran del entorno de `spawn`/`exec`/`execFile`/`fork` (vía `ChildProcess.prototype.spawn`,
/// por donde pasan todos los asíncronos) y de `spawnSync`/`execSync`/`execFileSync`.
///
/// Vigía (carril T, con `ARBRAIN_VIGILAR_STDIN=1`): EOF o error en stdin = la app murió → sale; y cada 2 s compara su
/// `ppid` con el del arranque (en Unix un huérfano pasa a launchd/init). En Windows el Job Object ya mata el árbol.
pub const PRELUDIO_WEB: &str = concat!(
    "'use strict';const fs=require('fs'),path=require('path'),cp=require('child_process'),M=require('module');",
    "const N=['ARBRAIN_DESKTOP_SECRET','OPENCLAW_GATEWAY_TOKEN','ARBRAIN_TOKEN_CONFIRMAR','ARBRAIN_PASE_AGENTE','ARBRAIN_MOTOR_TOKEN','VAPID_PRIVATE_KEY'];",
    "const linea=()=>{const b=Buffer.alloc(4096),w=new Int32Array(new SharedArrayBuffer(4)),t=Date.now()+15000;let a=Buffer.alloc(0);",
    "for(;;){let n;try{n=fs.readSync(0,b,0,b.length,null)}catch(e){if(e.code==='EOF')break;",
    "if((e.code==='EAGAIN'||e.code==='EWOULDBLOCK')&&Date.now()<t){Atomics.wait(w,0,0,20);continue}throw e}",
    "if(!n)break;a=Buffer.concat([a,b.subarray(0,n)]);const i=a.indexOf(10);if(i>=0)return a.subarray(0,i).toString('utf8')}return a.toString('utf8')};",
    "let s={};try{s=JSON.parse(linea()||'{}')}",
    "catch(e){process.stderr.write('arbrain: la web arranca sin secretos de la app\\n')}",
    "for(const k of N){if(s&&typeof s[k]==='string'&&s[k])process.env[k]=s[k]}delete process.env.ARBRAIN_SECRETOS;",
    "if(process.env.ARBRAIN_VIGILAR_STDIN==='1'){const salir=()=>process.exit(0);process.stdin.on('end',salir);process.stdin.on('error',salir);",
    "process.stdin.resume();const p0=process.ppid;setInterval(()=>{if(process.ppid!==p0)salir()},2000).unref()}delete process.env.ARBRAIN_VIGILAR_STDIN;",
    "const fuera=k=>N.some(n=>n.toUpperCase()===String(k).toUpperCase());",
    "const limpio=e=>{const o={};for(const[k,v]of Object.entries(e||process.env))if(!fuera(k))o[k]=v;return o};",
    "const P=cp.ChildProcess.prototype,sp=P.spawn;",
    "P.spawn=function(o){if(o&&Array.isArray(o.envPairs))o.envPairs=o.envPairs.filter(p=>!fuera(String(p).split('=')[0]));return sp.call(this,o)};",
    "for(const f of ['spawnSync','execSync','execFileSync']){const g=cp[f];cp[f]=function(...a){",
    "const i=a.findIndex((x,j)=>j>0&&x&&typeof x==='object'&&!Array.isArray(x));",
    "if(i<0)a.push({env:limpio()});else a[i]=Object.assign({},a[i],{env:limpio(a[i].env)});return g.apply(this,a)}}",
    "M.syncBuiltinESMExports();require(path.resolve(process.argv[1]))"
);

/// Secretos de esta apertura de la app (64 hex de dos UUID v4: aleatorios del sistema).
pub struct Apertura {
    pub daemon: String,
    pub confirmar: String,
    pub pase_agente: String,
    pub escritorio: String,
    /// Red team 4 M4-3: token del motor de terminales. Lo reciben el motor (stdin) y la web (stdin); nunca el daemon
    /// ni los agentes.
    pub motor: String,
}

pub fn aleatorio() -> String {
    format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple())
}

pub fn apertura() -> &'static Apertura {
    static A: OnceLock<Apertura> = OnceLock::new();
    A.get_or_init(|| Apertura { daemon: aleatorio(), confirmar: aleatorio(), pase_agente: aleatorio(), escritorio: aleatorio(), motor: aleatorio() })
}

/// Una línea JSON (con su salto) con los pares dados. Los valores vacíos no viajan.
pub fn linea(pares: &[(&str, &str)]) -> String {
    let mut mapa = serde_json::Map::new();
    for (k, v) in pares {
        if !v.is_empty() {
            mapa.insert((*k).to_string(), serde_json::Value::String((*v).to_string()));
        }
    }
    let mut s = serde_json::Value::Object(mapa).to_string();
    s.push('\n');
    s
}

/// Escribe la línea en el stdin del hijo. `cerrar` = soltar el extremo (EOF) después. Ni el daemon ni (carril T) la
/// web lo cierran: su stdin abierto es la señal de que la app vive.
pub fn entregar(child: &mut Child, linea: &str, cerrar: bool) -> std::io::Result<()> {
    let resultado = match child.stdin.as_mut() {
        Some(stdin) => stdin.write_all(linea.as_bytes()).and_then(|_| stdin.flush()),
        None => Err(std::io::Error::new(std::io::ErrorKind::BrokenPipe, "el hijo no tiene stdin en pipe")),
    };
    if cerrar {
        drop(child.stdin.take());
    }
    resultado
}

/// Borra los secretos que dejaban en disco las versiones anteriores (un agente con Bash los podía leer).
pub fn borrar_restos(config_dir: &Path) {
    for nombre in ["daemon-token", "desktop-secret"] {
        let _ = std::fs::remove_file(config_dir.join(nombre));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::{Command, Stdio};

    #[test]
    fn apertura_estable_distinta_y_larga() {
        let a = apertura();
        assert!(std::ptr::eq(a, apertura()));
        let todos = [&a.daemon, &a.confirmar, &a.pase_agente, &a.escritorio, &a.motor];
        for s in todos {
            assert_eq!(s.len(), 64);
            assert!(s.chars().all(|c| c.is_ascii_hexdigit()));
        }
        for i in 0..todos.len() {
            for j in (i + 1)..todos.len() {
                assert_ne!(todos[i], todos[j]);
            }
        }
    }

    /// Red team 4 M4-3: el token del motor llega a la web por stdin y el preludio lo filtra del entorno de sus hijos.
    #[test]
    fn token_del_motor_solo_por_stdin() {
        assert!(NUNCA_POR_ENTORNO.contains(&"ARBRAIN_MOTOR_TOKEN"));
        assert!(PRELUDIO_WEB.contains("'ARBRAIN_MOTOR_TOKEN'"));
        #[cfg(unix)]
        assert_eq!(arbrain_motor::ENV_TOKEN_MOTOR, "ARBRAIN_MOTOR_TOKEN");
    }

    #[test]
    fn linea_es_json_de_una_linea_sin_vacios() {
        let l = linea(&[("A", "x\"y\nz"), ("B", ""), ("C", "c")]);
        assert!(l.ends_with('\n'));
        assert_eq!(l.matches('\n').count(), 1);
        let v: serde_json::Value = serde_json::from_str(l.trim_end()).unwrap();
        assert_eq!(v["A"], "x\"y\nz");
        assert!(v.get("B").is_none());
        assert_eq!(v["C"], "c");
    }

    #[test]
    fn restos_en_disco_se_borran() {
        let dir = std::env::temp_dir().join(format!("arbrain-restos-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("daemon-token"), "x").unwrap();
        std::fs::write(dir.join("desktop-secret"), "y").unwrap();
        std::fs::write(dir.join("puerto-web"), "4000").unwrap();
        borrar_restos(&dir);
        assert!(!dir.join("daemon-token").exists());
        assert!(!dir.join("desktop-secret").exists());
        assert!(dir.join("puerto-web").exists());
        std::fs::remove_dir_all(dir).unwrap();
    }

    /// El preludio de la web, con el Node del sistema si existe: el script ve los secretos en su `process.env` y
    /// `ps eww` del proceso (lo que vería otro proceso del usuario) no los muestra.
    #[test]
    fn preludio_web_entrega_por_stdin_y_no_por_entorno() {
        let Ok(node) = which_node() else {
            eprintln!("sin node en PATH: se salta");
            return;
        };
        let dir = std::env::temp_dir().join(format!("arbrain-preludio-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let script = dir.join("server.js");
        std::fs::write(
            &script,
            concat!(
                "const {execFileSync,execFile}=require('child_process');let ps='';try{ps=execFileSync('ps',['eww','-o','command=','-p',String(process.pid)],{encoding:'utf8'})}catch{}\n",
                "const envSync=process.platform==='win32'?'':execFileSync('env',{encoding:'utf8'});\n",
                "const fin=envAsync=>process.stdout.write(JSON.stringify({d:process.env.ARBRAIN_DESKTOP_SECRET,c:process.env.ARBRAIN_TOKEN_CONFIRMAR,k:process.env.ANTHROPIC_API_KEY||null,m:process.env.ARBRAIN_SECRETOS||null,ps,hijos:envSync+envAsync}));\n",
                "if(process.platform==='win32')fin('');else execFile('env',{env:{...process.env,OTRA:'1'}},(e,o)=>fin(String(o)))",
            ),
        )
        .unwrap();
        let d = aleatorio();
        let c = aleatorio();
        let mut hijo = Command::new(node)
            .arg("-e")
            .arg(PRELUDIO_WEB)
            .arg(&script)
            .env(ENV_SECRETOS, "stdin")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        entregar(&mut hijo, &linea(&[("ARBRAIN_DESKTOP_SECRET", &d), ("ARBRAIN_TOKEN_CONFIRMAR", &c), ("ANTHROPIC_API_KEY", "no-pasa")]), true).unwrap();
        let salida = hijo.wait_with_output().unwrap();
        let v: serde_json::Value = serde_json::from_slice(&salida.stdout).unwrap();
        assert_eq!(v["d"], d.as_str());
        assert_eq!(v["c"], c.as_str());
        assert!(v["k"].is_null(), "la web nunca recibe llaves BYOK");
        assert!(v["m"].is_null());
        let ps = v["ps"].as_str().unwrap_or("");
        if cfg!(unix) {
            assert!(ps.contains("ARBRAIN_SECRETOS=stdin"), "ps eww no mostró el entorno: {}", ps);
        }
        assert!(!ps.contains(&d) && !ps.contains(&c), "un secreto quedó a la vista de ps eww");
        // Los hijos de la web (execFileSync sin env y execFile con env explícito) no heredan ningún secreto.
        let hijos = v["hijos"].as_str().unwrap_or("");
        if cfg!(unix) {
            assert!(hijos.contains("PATH="), "los hijos no corrieron: {}", hijos);
            assert!(hijos.contains("OTRA=1"));
        }
        assert!(!hijos.contains(&d) && !hijos.contains(&c), "un hijo de la web heredó un secreto");
        std::fs::remove_dir_all(dir).unwrap();
    }

    /// Carril T: con `ARBRAIN_VIGILAR_STDIN=1` la web lee SOLO la primera línea (no espera EOF), arranca y, cuando el
    /// stdin se cierra (la app murió), sale sola aunque tenga trabajo pendiente. La variable no queda en su entorno.
    #[test]
    fn preludio_web_sale_cuando_la_app_suelta_su_stdin() {
        let Ok(node) = which_node() else {
            eprintln!("sin node en PATH: se salta");
            return;
        };
        let dir = std::env::temp_dir().join(format!("arbrain-vigia-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("server.js"),
            "setInterval(()=>{},1000);process.stdout.write(JSON.stringify({d:process.env.ARBRAIN_DESKTOP_SECRET,v:process.env.ARBRAIN_VIGILAR_STDIN||null})+'\\n')",
        )
        .unwrap();
        let d = aleatorio();
        let mut hijo = Command::new(node)
            .arg("-e")
            .arg(PRELUDIO_WEB)
            .arg("server.js")
            .current_dir(&dir)
            .env(ENV_SECRETOS, "stdin")
            .env("ARBRAIN_VIGILAR_STDIN", "1")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        entregar(&mut hijo, &linea(&[("ARBRAIN_DESKTOP_SECRET", &d)]), false).unwrap();
        let mut salida = std::io::BufReader::new(hijo.stdout.take().unwrap());
        let mut l = String::new();
        std::io::BufRead::read_line(&mut salida, &mut l).unwrap();
        let v: serde_json::Value = serde_json::from_str(l.trim()).unwrap();
        assert_eq!(v["d"], d.as_str(), "arrancó con su secreto sin esperar EOF");
        assert!(v["v"].is_null(), "la marca del vigía no queda en el entorno de la web");
        std::thread::sleep(std::time::Duration::from_millis(300));
        assert!(hijo.try_wait().unwrap().is_none(), "con el stdin abierto la web sigue viva");
        drop(hijo.stdin.take());
        let t0 = std::time::Instant::now();
        let estado = loop {
            if let Some(e) = hijo.try_wait().unwrap() {
                break e;
            }
            assert!(t0.elapsed() < std::time::Duration::from_secs(5), "la web no salió al cerrarse su stdin");
            std::thread::sleep(std::time::Duration::from_millis(50));
        };
        assert!(estado.success());
        std::fs::remove_dir_all(dir).unwrap();
    }

    /// Carril T (Unix): si el padre de la web muere y su stdin sigue abierto por otro lado (un nieto que lo heredó),
    /// el vigía del `ppid` la cierra igual: nunca queda huérfana con su puerto.
    #[cfg(unix)]
    #[test]
    fn preludio_web_sale_si_queda_huerfana() {
        use std::os::unix::process::CommandExt;
        let Ok(node) = which_node() else {
            eprintln!("sin node en PATH: se salta");
            return;
        };
        let dir = std::env::temp_dir().join(format!("arbrain-huerfana-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("server.js"), "require('fs').writeFileSync('pid',String(process.pid));setInterval(()=>{},1000)").unwrap();
        // sh es el «padre» (la app); el `sleep` que alimenta la tubería mantiene el stdin abierto después de matarlo.
        let mut sh = Command::new("sh")
            .arg("-c")
            .arg("{ printf '{}\\n'; sleep 30; } | exec \"$NODE\" -e \"$PRELUDIO\" server.js")
            .current_dir(&dir)
            .env("NODE", &node)
            .env("PRELUDIO", PRELUDIO_WEB)
            .env("ARBRAIN_VIGILAR_STDIN", "1")
            .stdin(Stdio::null())
            .process_group(0)
            .spawn()
            .unwrap();
        let grupo = sh.id() as i32;
        let t0 = std::time::Instant::now();
        let pid: i32 = loop {
            if let Some(p) = std::fs::read_to_string(dir.join("pid")).ok().and_then(|s| s.trim().parse().ok()) {
                break p;
            }
            assert!(t0.elapsed() < std::time::Duration::from_secs(10), "la web no arrancó");
            std::thread::sleep(std::time::Duration::from_millis(50));
        };
        unsafe { libc::kill(sh.id() as i32, libc::SIGKILL) };
        let _ = sh.wait();
        let t1 = std::time::Instant::now();
        while t1.elapsed() < std::time::Duration::from_secs(6) && unsafe { libc::kill(pid, 0) } == 0 {
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        let viva = unsafe { libc::kill(pid, 0) } == 0;
        unsafe { libc::kill(-grupo, libc::SIGKILL) };
        assert!(!viva, "la web huérfana ({pid}) siguió viva");
        std::fs::remove_dir_all(dir).unwrap();
    }

    fn which_node() -> Result<std::path::PathBuf, ()> {
        let path = std::env::var_os("PATH").ok_or(())?;
        std::env::split_paths(&path)
            .map(|d| d.join(if cfg!(windows) { "node.exe" } else { "node" }))
            .find(|p| p.is_file())
            .ok_or(())
    }
}
