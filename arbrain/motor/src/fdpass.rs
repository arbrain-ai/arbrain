//! Paso de descriptores por `SCM_RIGHTS` (el relevo del motor).
//!
//! Un proceso no se puede "mudar", pero el master de su PTY sí: se duplica en el
//! proceso que lo recibe. Mientras alguien tenga un master abierto, el shell y su
//! `claude` no reciben SIGHUP ni se enteran. Mismo mecanismo que usan HAProxy/nginx
//! para recargar sin cortar y Herdr para actualizar sin matar terminales.

use std::io;
use std::os::fd::RawFd;

/// macOS acepta más, pero un lote chico es portable y sobra para el piso.
pub const FDS_POR_LOTE: usize = 64;

fn cmsg_space(n: usize) -> usize {
    unsafe { libc::CMSG_SPACE((n * std::mem::size_of::<RawFd>()) as u32) as usize }
}

/// Manda `fds` en lotes; cada lote viaja con 1 byte de carga (el número de fds).
pub fn send_fds(sock: RawFd, fds: &[RawFd]) -> io::Result<()> {
    for lote in fds.chunks(FDS_POR_LOTE) {
        let mut byte = [lote.len() as u8];
        let mut iov = libc::iovec {
            iov_base: byte.as_mut_ptr() as *mut _,
            iov_len: 1,
        };
        let mut buf = vec![0u8; cmsg_space(lote.len())];
        let mut msg: libc::msghdr = unsafe { std::mem::zeroed() };
        msg.msg_iov = &mut iov;
        msg.msg_iovlen = 1;
        msg.msg_control = buf.as_mut_ptr() as *mut _;
        msg.msg_controllen = buf.len() as _;
        unsafe {
            let c = libc::CMSG_FIRSTHDR(&msg);
            (*c).cmsg_level = libc::SOL_SOCKET;
            (*c).cmsg_type = libc::SCM_RIGHTS;
            (*c).cmsg_len = libc::CMSG_LEN(std::mem::size_of_val(lote) as u32) as _;
            std::ptr::copy_nonoverlapping(
                lote.as_ptr(),
                libc::CMSG_DATA(c) as *mut RawFd,
                lote.len(),
            );
        }
        let n = unsafe { libc::sendmsg(sock, &msg, 0) };
        if n < 0 {
            return Err(io::Error::last_os_error());
        }
    }
    Ok(())
}

/// Recibe exactamente `total` fds (en los lotes que haya mandado `send_fds`).
pub fn recv_fds(sock: RawFd, total: usize) -> io::Result<Vec<RawFd>> {
    let mut out = Vec::with_capacity(total);
    while out.len() < total {
        let want = (total - out.len()).min(FDS_POR_LOTE);
        let mut byte = [0u8; 1];
        let mut iov = libc::iovec {
            iov_base: byte.as_mut_ptr() as *mut _,
            iov_len: 1,
        };
        let mut buf = vec![0u8; cmsg_space(want)];
        let mut msg: libc::msghdr = unsafe { std::mem::zeroed() };
        msg.msg_iov = &mut iov;
        msg.msg_iovlen = 1;
        msg.msg_control = buf.as_mut_ptr() as *mut _;
        msg.msg_controllen = buf.len() as _;
        let n = unsafe { libc::recvmsg(sock, &mut msg, 0) };
        if n < 0 {
            return Err(io::Error::last_os_error());
        }
        if n == 0 {
            return Err(io::Error::new(
                io::ErrorKind::UnexpectedEof,
                "el motor viejo cerró a medio relevo",
            ));
        }
        if msg.msg_flags & libc::MSG_CTRUNC != 0 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "fds truncados en el relevo",
            ));
        }
        unsafe {
            let mut c = libc::CMSG_FIRSTHDR(&msg);
            while !c.is_null() {
                if (*c).cmsg_level == libc::SOL_SOCKET && (*c).cmsg_type == libc::SCM_RIGHTS {
                    let data = libc::CMSG_DATA(c) as *const RawFd;
                    let len = ((*c).cmsg_len as usize - libc::CMSG_LEN(0) as usize)
                        / std::mem::size_of::<RawFd>();
                    for i in 0..len {
                        out.push(*data.add(i));
                    }
                }
                c = libc::CMSG_NXTHDR(&msg, c);
            }
        }
        if byte[0] as usize != want {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "lote de fds inesperado",
            ));
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::os::fd::{AsRawFd, FromRawFd};
    use std::os::unix::net::UnixStream;

    #[test]
    fn un_pipe_cruza_el_socket() {
        let (a, b) = UnixStream::pair().unwrap();
        let mut p = [0 as RawFd; 2];
        assert_eq!(unsafe { libc::pipe(p.as_mut_ptr()) }, 0);
        send_fds(a.as_raw_fd(), &[p[1]]).unwrap();
        let got = recv_fds(b.as_raw_fd(), 1).unwrap();
        unsafe { libc::close(p[1]) };
        let mut w = unsafe { std::fs::File::from_raw_fd(got[0]) };
        w.write_all(b"vivo").unwrap();
        drop(w);
        let mut r = unsafe { std::fs::File::from_raw_fd(p[0]) };
        let mut s = String::new();
        r.read_to_string(&mut s).unwrap();
        assert_eq!(s, "vivo");
    }
}
