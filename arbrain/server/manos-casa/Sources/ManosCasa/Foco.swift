import AppKit
import ManosNucleo

/// Un solo foco de teclado por sesión de macOS (lo tiene UNA app a la vez) y un solo portapapeles. Las manos trabajan
/// por dentro (AX, teclas por proceso) sin tocarlos; cuando una app exige ser la activa para recibir teclas o clics de
/// fondo (Catalyst, Chrome, Electron), el foco se PRESTA: solo en una pausa del teclado de Daniel, lo más corto posible y
/// devuelto al terminar. Si él teclea durante el préstamo, se reporta (sus teclas pudieron ir a esa app).
enum Foco {
    /// Espera una pausa del teclado de Daniel (máx `maxS`). true = se puede prestar el foco ahora.
    static func esperarPausa(maxS: Double = 2.0) -> Bool {
        let fin = CACurrentMediaTime() + maxS
        repeat {
            if PrestamoFoco.puedeTomar(tecladoInactivoS: Vigia.tecladoInactivoS()) { return true }
            usleep(100_000)
        } while CACurrentMediaTime() < fin
        return false
    }

    /// Activa la app SIN levantarla, corre `f` y devuelve el foco a quien lo tenía. nil si Daniel no hizo pausa.
    static func prestado<T>(pid: pid_t, ventana: CGWindowID, _ f: () throws -> T) rethrows -> (T, tecleoPersona: Bool)? {
        guard esperarPausa() else { return nil }
        let frente = NSWorkspace.shared.frontmostApplication?.processIdentifier
        let t0 = CACurrentMediaTime()
        if frente != pid { Cielo.activarSinLevantar(pid: pid, ventana: ventana, forzar: true); usleep(40_000) }
        defer { if let fr = frente, fr != pid { Cielo.devolverFoco(a: fr, desde: pid, ventana: ventana) } }
        let r = try f()
        return (r, Vigia.tecladoDesde(t0))
    }
}
