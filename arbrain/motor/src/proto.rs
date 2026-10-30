//! Protocolo del motor. En el cable es EXACTAMENTE `sfterm-ptyd` PROTO 1:
//!
//! ```text
//! [u8 kind][u32 id LE][u32 len LE][payload de `len` bytes]
//! ```
//!
//! - `kind = CTL`  → JSON (`Req` del cliente / `Res` del motor), `id` = número de petición.
//! - `kind = DATA` → bytes crudos del PTY, `id` = terminal.
//!
//! Por qué el mismo cable: SFTerm ya sabe hablarlo (su `ptyd_bridge` con reconexión,
//! replay y reconciliación). Si el motor lo habla idéntico, SFTerm se vuelve una VISTA
//! del motor apuntando `[general] daemon_socket` a nuestro socket, sin tocar su código.
//!
//! Las operaciones nuevas (`info`, `screen`, `handoff`, `handoff_commit`) son ADITIVAS:
//! SFTerm nunca las manda, así que su deserializador jamás ve las respuestas nuevas.

use serde::{Deserialize, Serialize};
use std::io::{Read, Write};

/// Sube SOLO si el formato deja de ser compatible hacia atrás (igual que ptyd).
pub const PROTO: u32 = 1;

pub const KIND_CTL: u8 = 1;
pub const KIND_DATA: u8 = 2;

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum Req {
    Hello {
        proto: u32,
        client: String,
        /// Edición cliente (red team 4 M4-3): el token por apertura que la app le dio al motor por stdin. Aditivo:
        /// SFTerm nunca lo manda y, sin token configurado (Daniel), el motor no lo mira.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        token: Option<String>,
    },
    List,
    Spawn {
        cwd: Option<String>,
        cols: u16,
        rows: u16,
        #[serde(default)]
        scrollback: Option<usize>,
        #[serde(default)]
        shell_integration: Option<bool>,
        #[serde(default)]
        colorfgbg: Option<String>,
        #[serde(default)]
        command: Option<String>,
    },
    Attach {
        id: u32,
    },
    Detach {
        id: u32,
    },
    Write {
        id: u32,
        data: String,
    },
    Resize {
        id: u32,
        cols: u16,
        rows: u16,
    },
    /// Cerrar una terminal. Candado (1 oct 2026): las adoptadas de SFTerm solo las cierra
    /// SFTerm (cliente `sfterm*`, Daniel en su vista) o quien traiga `autoriza`, la cita de
    /// Daniel que la nombra. Sin `autoriza` el cable es idéntico al del ptyd.
    Kill {
        id: u32,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        autoriza: Option<String>,
    },
    FgPgid {
        id: u32,
    },
    FgPgids,
    Shutdown,
    // ── aditivas del motor ──
    /// Terminales con su origen y el proceso en primer plano (lo que necesita el
    /// lector multi-harness para encontrar la conversación en disco).
    Info,
    /// Texto de la pantalla (emulador VT sin cabeza dentro del motor): la vista
    /// «trabajos» lee sin GUI y sin gate de archivos.
    Screen {
        id: u32,
        lines: Option<usize>,
    },
    /// Relevo: un motor nuevo pide las PTYs vivas (estado + fds por SCM_RIGHTS).
    Handoff,
    /// El motor nuevo confirma que ya tiene todo: el viejo se retira SIN matar.
    HandoffCommit,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "res", rename_all = "snake_case")]
pub enum Res {
    Hello {
        proto: u32,
        pid: u32,
        terms: usize,
        /// `true` solo si el motor exige token y este cliente lo dio. Sin token configurado no viaja (el cable de
        /// Daniel y SFTerm queda idéntico). Un motor viejo sin token no lo manda: la app lo trata como ajeno.
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        auth: bool,
    },
    Spawned {
        id: u32,
        pid: u32,
    },
    List {
        terms: Vec<TermInfo>,
    },
    Attached {
        id: u32,
        bytes: usize,
        cols: u16,
        rows: u16,
    },
    Pgid {
        id: u32,
        pgid: i32,
    },
    Pgids {
        list: Vec<PgidEntry>,
    },
    Ok,
    Err {
        msg: String,
    },
    // ── aditivas ──
    Info {
        motor: MotorInfo,
        terms: Vec<TermDetail>,
    },
    Screen {
        id: u32,
        text: String,
        cols: u16,
        rows: u16,
    },
    Handoff {
        state: HandoffState,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PgidEntry {
    pub id: u32,
    pub pid: u32,
    pub pgid: i32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "evt", rename_all = "snake_case")]
pub enum Evt {
    Exit { id: u32, code: Option<i32> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TermInfo {
    pub id: u32,
    pub pid: u32,
    pub cwd: String,
    pub cols: u16,
    pub rows: u16,
    pub buffered: usize,
    pub born_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MotorInfo {
    pub pid: u32,
    pub sock: String,
    pub started_ms: u64,
    /// Cuántos relevos lleva este linaje de PTYs (0 = nació aquí).
    pub relevos: u32,
    /// Socket del ptyd de SFTerm que se está adoptando (None = sin federación).
    pub legacy: Option<String>,
    pub legacy_connected: bool,
    pub legacy_readonly: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcInfo {
    pub pid: u32,
    /// Nombre resuelto (desenvuelve `node …/codex` → "codex").
    pub name: String,
    pub argv: Vec<String>,
    pub cwd: Option<String>,
    pub start_s: u64,
    /// CLAUDE_CONFIG_DIR / CODEX_HOME del proceso: la cuenta decide dónde vive su sesión.
    pub config_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TermDetail {
    pub id: u32,
    pub pid: u32,
    pub cwd: String,
    pub cols: u16,
    pub rows: u16,
    pub born_ms: u64,
    /// "motor" = nació aquí · "sfterm-ptyd" = adoptada del daemon viejo.
    pub origin: String,
    pub readonly: bool,
    pub fg: Option<ProcInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HandoffTerm {
    pub id: u32,
    pub pid: u32,
    pub cwd: String,
    pub cols: u16,
    pub rows: u16,
    pub born_ms: u64,
    /// Replay (base64), recortado a `HANDOFF_RING_MAX` para que el marco sea sano.
    pub ring_b64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HandoffState {
    pub next_id: u32,
    pub relevos: u32,
    /// El primer fd que viaja es el LISTENER (cero huecos para los clientes).
    pub listener: bool,
    /// Orden de los fds que siguen: uno por terminal, en este orden.
    pub terms: Vec<HandoffTerm>,
}

// ---------- marcos ----------

pub fn frame_bytes(kind: u8, id: u32, payload: &[u8]) -> Vec<u8> {
    let mut f = Vec::with_capacity(payload.len() + 9);
    f.push(kind);
    f.extend_from_slice(&id.to_le_bytes());
    f.extend_from_slice(&(payload.len() as u32).to_le_bytes());
    f.extend_from_slice(payload);
    f
}

pub fn ctl_bytes<T: Serialize>(id: u32, msg: &T) -> Vec<u8> {
    frame_bytes(
        KIND_CTL,
        id,
        &serde_json::to_vec(msg).unwrap_or_else(|_| b"{}".to_vec()),
    )
}

pub fn write_ctl<T: Serialize>(w: &mut impl Write, id: u32, msg: &T) -> std::io::Result<()> {
    w.write_all(&ctl_bytes(id, msg))?;
    w.flush()
}

pub fn write_data(w: &mut impl Write, id: u32, bytes: &[u8]) -> std::io::Result<()> {
    w.write_all(&frame_bytes(KIND_DATA, id, bytes))?;
    w.flush()
}

pub struct Frame {
    pub kind: u8,
    pub id: u32,
    pub payload: Vec<u8>,
}

/// `Ok(None)` = el otro lado cerró limpio.
pub fn read_frame(r: &mut impl Read) -> std::io::Result<Option<Frame>> {
    let mut head = [0u8; 9];
    if let Err(e) = r.read_exact(&mut head) {
        if e.kind() == std::io::ErrorKind::UnexpectedEof {
            return Ok(None);
        }
        return Err(e);
    }
    let kind = head[0];
    let id = u32::from_le_bytes(head[1..5].try_into().unwrap());
    let len = u32::from_le_bytes(head[5..9].try_into().unwrap()) as usize;
    if len > 64 * 1024 * 1024 {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "marco absurdo (stream desincronizado)",
        ));
    }
    let mut payload = vec![0u8; len];
    r.read_exact(&mut payload)?;
    Ok(Some(Frame { kind, id, payload }))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// El contrato con SFTerm: sus peticiones (tal como las serializa `ptyd::proto`)
    /// se leen aquí, y nuestras respuestas de siempre tienen su misma forma.
    #[test]
    fn cable_compatible_con_ptyd() {
        let spawn = r#"{"op":"spawn","cwd":"/tmp","cols":80,"rows":24,"scrollback":null,"shell_integration":true,"colorfgbg":"15;0","command":null}"#;
        assert!(matches!(
            serde_json::from_str::<Req>(spawn).unwrap(),
            Req::Spawn { cols: 80, .. }
        ));
        assert!(matches!(
            serde_json::from_str::<Req>(r#"{"op":"fg_pgids"}"#).unwrap(),
            Req::FgPgids
        ));
        let res = serde_json::to_string(&Res::Attached {
            id: 3,
            bytes: 10,
            cols: 80,
            rows: 24,
        })
        .unwrap();
        assert_eq!(
            res,
            r#"{"res":"attached","id":3,"bytes":10,"cols":80,"rows":24}"#
        );
        let evt = serde_json::to_string(&Evt::Exit { id: 3, code: None }).unwrap();
        assert_eq!(evt, r#"{"evt":"exit","id":3,"code":null}"#);
    }

    /// Candado de cierre: sin `autoriza` el kill viaja idéntico al del ptyd (SFTerm no cambia).
    #[test]
    fn kill_sin_autoriza_es_el_cable_del_ptyd() {
        let k: Req = serde_json::from_str(r#"{"op":"kill","id":3}"#).unwrap();
        assert!(matches!(
            k,
            Req::Kill {
                id: 3,
                autoriza: None
            }
        ));
        assert_eq!(
            serde_json::to_string(&Req::Kill {
                id: 3,
                autoriza: None
            })
            .unwrap(),
            r#"{"op":"kill","id":3}"#
        );
        let a: Req =
            serde_json::from_str(r#"{"op":"kill","id":3,"autoriza":"Dueño: ciérrala"}"#).unwrap();
        assert!(matches!(a, Req::Kill { id: 3, autoriza: Some(ref x) } if x == "Dueño: ciérrala"));
    }

    #[test]
    fn marco_ida_y_vuelta() {
        let buf = frame_bytes(KIND_DATA, 7, b"hola\n{\"op\":\"kill\"}");
        let mut cur = std::io::Cursor::new(buf);
        let f = read_frame(&mut cur).unwrap().unwrap();
        assert_eq!((f.kind, f.id), (KIND_DATA, 7));
        assert!(read_frame(&mut cur).unwrap().is_none());
    }
}
