import ApplicationServices
import Foundation

/// Eventos dirigidos a UN proceso (`CGEvent.postToPid`): nunca pasan por el flujo
/// HID, así que ni el cursor real se mueve ni el teclado de Daniel se mezcla.
/// Es la reserva: el camino principal es AX (presionar, insertar texto, menús).
enum Teclado {
    /// Texto Unicode en trozos (una tecla virtual 0 con su cadena). Banderas en
    /// nulo para no heredar un Shift físico (mina de Cua en Chrome).
    static func escribir(pid: pid_t, _ texto: String) {
        let fuente = CGEventSource(stateID: .privateState)
        var trozo: [UniChar] = []
        func enviar() {
            guard !trozo.isEmpty else { return }
            for abajo in [true, false] {
                guard let ev = CGEvent(keyboardEventSource: fuente, virtualKey: 0, keyDown: abajo) else { continue }
                ev.flags = []
                ev.keyboardSetUnicodeString(stringLength: trozo.count, unicodeString: trozo)
                ev.postToPid(pid)
            }
            trozo.removeAll()
            usleep(4000)
        }
        for u in texto.utf16 {
            trozo.append(u)
            if trozo.count >= 16 { enviar() }
        }
        enviar()
    }

    static func tecla(pid: pid_t, codigo: UInt16, flags: UInt64) {
        let fuente = CGEventSource(stateID: .privateState)
        for abajo in [true, false] {
            guard let ev = CGEvent(keyboardEventSource: fuente, virtualKey: CGKeyCode(codigo), keyDown: abajo) else { continue }
            ev.flags = CGEventFlags(rawValue: flags)
            ev.postToPid(pid)
            if abajo { usleep(8000) }
        }
    }
}

enum Puntero {
    /// Clic por proceso en coordenadas globales (puntos, origen arriba-izquierda,
    /// negativas en monitores a la izquierda/arriba). No toca el cursor real.
    /// Las apps de canvas y algunas web lo ignoran: es reserva, detrás de interruptor.
    static func clic(pid: pid_t, en p: CGPoint) {
        let fuente = CGEventSource(stateID: .privateState)
        let pasos: [(CGEventType, useconds_t)] = [(.mouseMoved, 12_000), (.leftMouseDown, 28_000), (.leftMouseUp, 0)]
        for (tipo, pausa) in pasos {
            guard let ev = CGEvent(mouseEventSource: fuente, mouseType: tipo, mouseCursorPosition: p, mouseButton: .left) else { continue }
            ev.setIntegerValueField(.mouseEventClickState, value: 1)
            ev.postToPid(pid)
            if pausa > 0 { usleep(pausa) }
        }
    }

    static func rueda(pid: pid_t, en p: CGPoint?, dy: Int, dx: Int) {
        guard let ev = CGEvent(scrollWheelEvent2Source: CGEventSource(stateID: .privateState), units: .line, wheelCount: 2, wheel1: Int32(dy), wheel2: Int32(dx), wheel3: 0) else { return }
        if let p { ev.location = p }
        ev.postToPid(pid)
    }
}
