import Foundation

/// Candados por ventana: dos agentes no operan la misma ventana a la vez.
///
/// Una sesión (un agente, una conexión) que actúa sobre una ventana la toma
/// durante `duracion` desde su última acción. Otra sesión que quiera actuar ahí
/// espera o recibe un error claro con quién la tiene y desde cuándo. Leer
/// (`observar`) no toma candado: mirar no pisa a nadie.
///
/// La llave es (pid, ventana?). Sin ventana, el candado cubre la app entera:
/// choca con cualquier ventana de esa app tomada por otra sesión.
public final class Candados {
    public struct Llave: Hashable, CustomStringConvertible {
        public let pid: Int32
        public let ventana: UInt32?
        public init(pid: Int32, ventana: UInt32?) { self.pid = pid; self.ventana = ventana }
        public var description: String { ventana.map { "pid \(pid) · ventana \($0)" } ?? "pid \(pid) (app completa)" }
        func choca(_ otra: Llave) -> Bool { pid == otra.pid && (ventana == nil || otra.ventana == nil || ventana == otra.ventana) }
    }

    public struct Toma: Equatable {
        public let sesion: String
        public let desde: UInt64
        public var hasta: UInt64
        public var quien: String?
    }

    private let candado = NSLock()
    private var tomas: [Llave: Toma] = [:]
    public let duracionNs: UInt64

    public init(duracionMs: Int = 15_000) { duracionNs = UInt64(duracionMs) * 1_000_000 }

    /// Intenta tomar (o renovar) la llave para `sesion`. Devuelve nil si puede operar,
    /// o la toma ajena vigente que lo impide.
    public func tomar(_ llave: Llave, sesion: String, quien: String? = nil, ahora: UInt64 = DispatchTime.now().uptimeNanoseconds) -> (Llave, Toma)? {
        candado.lock(); defer { candado.unlock() }
        for (k, t) in tomas where t.hasta <= ahora { tomas[k] = nil }
        if let ajena = tomas.first(where: { $0.key.choca(llave) && $0.value.sesion != sesion }) { return (ajena.key, ajena.value) }
        let previa = tomas[llave]
        tomas[llave] = Toma(sesion: sesion, desde: previa?.desde ?? ahora, hasta: ahora + duracionNs, quien: quien ?? previa?.quien)
        return nil
    }

    /// Alarga la toma propia al terminar una acción (la duración cuenta desde la última acción, no la primera).
    public func renovar(_ llave: Llave, sesion: String, ahora: UInt64 = DispatchTime.now().uptimeNanoseconds) {
        candado.lock(); defer { candado.unlock() }
        if var t = tomas[llave], t.sesion == sesion { t.hasta = ahora + duracionNs; tomas[llave] = t }
    }

    public func soltar(sesion: String, llave: Llave? = nil) {
        candado.lock(); defer { candado.unlock() }
        for (k, t) in tomas where t.sesion == sesion && (llave == nil || k == llave) { tomas[k] = nil }
    }

    public func vigentes(ahora: UInt64 = DispatchTime.now().uptimeNanoseconds) -> [(Llave, Toma)] {
        candado.lock(); defer { candado.unlock() }
        return tomas.filter { $0.value.hasta > ahora }.map { ($0.key, $0.value) }
    }
}
