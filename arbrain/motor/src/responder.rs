//! El motor contesta las consultas de terminal cuando NINGUNA vista está conectada.
//!
//! Un TUI pregunta cosas a su terminal y espera respuesta: posición del cursor
//! (`CSI 6n`), identidad (`CSI c`, DA1), estado (`CSI 5n`) y colores (`OSC 10/11 ;?`).
//! Con una GUI enganchada (SFTerm, xterm.js) la GUI responde. Un subagente lanzado
//! desde el chat del teléfono NO tiene GUI: sin esto Codex (crossterm) aborta con
//! «cursor position could not be read» y otros TUIs se quedan esperando.
//! Regla: solo se responde con cero clientes enganchados, para no duplicar respuestas.

#[derive(Default)]
pub struct Responder {
    tail: Vec<u8>,
}

const MAX_TAIL: usize = 24;

impl Responder {
    /// Recibe la salida del PTY y devuelve lo que hay que escribirle de vuelta.
    /// `cursor` = (fila, columna) 0-based después de procesar `bytes`.
    pub fn scan(&mut self, bytes: &[u8], cursor: (u16, u16)) -> Vec<u8> {
        let mut buf = std::mem::take(&mut self.tail);
        buf.extend_from_slice(bytes);
        let mut out = Vec::new();
        let mut i = 0;
        while i < buf.len() {
            if buf[i] != 0x1b {
                i += 1;
                continue;
            }
            let rest = &buf[i..];
            if let Some((reply, len)) = query(rest, cursor) {
                out.extend_from_slice(&reply);
                i += len;
                continue;
            }
            if is_prefix_of_query(rest) {
                // secuencia partida entre dos lecturas: se guarda la cola
                self.tail = rest[rest.len().saturating_sub(MAX_TAIL)..].to_vec();
                return out;
            }
            i += 1;
        }
        out
    }
}

fn query(rest: &[u8], cursor: (u16, u16)) -> Option<(Vec<u8>, usize)> {
    let cpr = || format!("\x1b[{};{}R", cursor.0 + 1, cursor.1 + 1).into_bytes();
    if rest.starts_with(b"\x1b[6n") {
        return Some((cpr(), 4));
    }
    if rest.starts_with(b"\x1b[?6n") {
        return Some((cpr(), 5));
    }
    if rest.starts_with(b"\x1b[5n") {
        return Some((b"\x1b[0n".to_vec(), 4));
    }
    if rest.starts_with(b"\x1b[c") {
        return Some((b"\x1b[?62;22c".to_vec(), 3));
    }
    if rest.starts_with(b"\x1b[0c") {
        return Some((b"\x1b[?62;22c".to_vec(), 4));
    }
    let (n, which, st) = osc_color_query(rest)?;
    let rgb = if which == 10 {
        "rgb:e6e6/e6e6/e6e6"
    } else {
        "rgb:1414/1414/1414"
    };
    Some((format!("\x1b]{which};{rgb}{st}").into_bytes(), n))
}

fn osc_color_query(s: &[u8]) -> Option<(usize, u8, &'static str)> {
    for which in [10u8, 11u8] {
        let pre = format!("\x1b]{which};?");
        if s.starts_with(pre.as_bytes()) {
            let r = &s[pre.len()..];
            if r.first() == Some(&0x07) {
                return Some((pre.len() + 1, which, "\x07"));
            }
            if r.starts_with(b"\x1b\\") {
                return Some((pre.len() + 2, which, "\x1b\\"));
            }
        }
    }
    None
}

fn is_prefix_of_query(s: &[u8]) -> bool {
    const Q: [&[u8]; 8] = [
        b"\x1b[6n",
        b"\x1b[?6n",
        b"\x1b[5n",
        b"\x1b[c",
        b"\x1b[0c",
        b"\x1b]10;?\x1b\\",
        b"\x1b]11;?\x1b\\",
        b"\x1b]11;?\x07",
    ];
    Q.iter().any(|q| q.len() > s.len() && q.starts_with(s))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn contesta_cursor_da1_y_color() {
        let mut r = Responder::default();
        assert_eq!(r.scan(b"hola\x1b[6n", (2, 4)), b"\x1b[3;5R");
        assert_eq!(r.scan(b"\x1b[c", (0, 0)), b"\x1b[?62;22c");
        assert_eq!(
            r.scan(b"\x1b]11;?\x1b\\", (0, 0)),
            b"\x1b]11;rgb:1414/1414/1414\x1b\\"
        );
        assert!(r.scan(b"\x1b[31mrojo\x1b[0m", (0, 0)).is_empty());
    }
    #[test]
    fn secuencia_partida_entre_lecturas() {
        let mut r = Responder::default();
        assert!(r.scan(b"texto\x1b[", (0, 0)).is_empty());
        assert_eq!(r.scan(b"6n", (0, 9)), b"\x1b[1;10R");
    }
}
