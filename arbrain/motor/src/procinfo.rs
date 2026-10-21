//! ¿Qué corre en primer plano en una terminal? Lo necesita el lector multi-harness:
//! el nombre dice el harness, argv trae la verdad dura (`--resume <id>`,
//! `--session-id <id>`), cwd + arranque ubican la conversación en disco y
//! CLAUDE_CONFIG_DIR / CODEX_HOME dicen en qué cuenta vive.
//! Gemelo de `sfterm/src-tauri/src/metrics.rs::resolve_fg_name`.

use crate::proto::ProcInfo;

const WRAPPERS: [&str; 10] = [
    "env",
    "nohup",
    "nice",
    "stdbuf",
    "command",
    "arch",
    "setsid",
    "time",
    "caffeinate",
    "script",
];
const INTERPRETES: [&str; 12] = [
    "node", "nodejs", "bun", "deno", "python", "python3", "ruby", "npx", "bunx", "uvx", "pnpm",
    "yarn",
];

fn base(s: &str) -> String {
    std::path::Path::new(s)
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_else(|| s.to_string())
}

/// El programa real de una línea de comando (atraviesa `env FOO=1`, `node script`…).
pub fn programa_de(cmd: &[String]) -> Option<String> {
    let mut i = 0;
    for _ in 0..12 {
        let tok = cmd.get(i)?;
        let b = base(tok);
        if b.is_empty() {
            return None;
        }
        if (tok.contains('=') && !tok.starts_with('-') && !tok.starts_with('/'))
            || tok.starts_with('-')
        {
            i += 1;
            continue;
        }
        let low = b.to_lowercase();
        if WRAPPERS.contains(&low.as_str()) || INTERPRETES.contains(&low.as_str()) {
            if cmd.get(i + 1).is_none() {
                return Some(b);
            }
            i += 1;
            continue;
        }
        return Some(b);
    }
    None
}

/// Información del líder del grupo en primer plano (`pgid`). None si ya no existe.
pub fn fg_info(pgid: i32) -> Option<ProcInfo> {
    if pgid <= 0 {
        return None;
    }
    let pid = sysinfo::Pid::from_u32(pgid as u32);
    let mut sys = sysinfo::System::new();
    sys.refresh_processes_specifics(
        sysinfo::ProcessesToUpdate::Some(&[pid]),
        true,
        sysinfo::ProcessRefreshKind::everything(),
    );
    let p = sys.process(pid)?;
    let argv: Vec<String> = p
        .cmd()
        .iter()
        .map(|c| c.to_string_lossy().to_string())
        .collect();
    let name = programa_de(&argv).unwrap_or_else(|| p.name().to_string_lossy().to_string());
    let config_dir = p.environ().iter().find_map(|kv| {
        let kv = kv.to_string_lossy();
        kv.strip_prefix("CLAUDE_CONFIG_DIR=")
            .or_else(|| kv.strip_prefix("CODEX_HOME="))
            .map(str::to_string)
    });
    Some(ProcInfo {
        pid: pgid as u32,
        name,
        // argv recortado: basta para `--resume`/`--session-id`; un prompt largo no viaja entero
        argv: argv
            .into_iter()
            .take(24)
            .map(|a| a.chars().take(300).collect())
            .collect(),
        cwd: p.cwd().map(|c| c.to_string_lossy().to_string()),
        start_s: p.start_time(),
        config_dir,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn v(s: &[&str]) -> Vec<String> {
        s.iter().map(|x| x.to_string()).collect()
    }
    #[test]
    fn desenvuelve_interpretes_y_wrappers() {
        assert_eq!(
            programa_de(&v(&["node", "/opt/homebrew/bin/codex", "--yolo"])).as_deref(),
            Some("codex")
        );
        assert_eq!(
            programa_de(&v(&["env", "FOO=1", "claude", "--resume", "x"])).as_deref(),
            Some("claude")
        );
        assert_eq!(
            programa_de(&v(&["/bin/zsh", "-l", "-i"])).as_deref(),
            Some("zsh")
        );
        assert_eq!(programa_de(&v(&["node"])).as_deref(), Some("node"));
    }
}
