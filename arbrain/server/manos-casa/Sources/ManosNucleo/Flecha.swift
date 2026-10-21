import CoreGraphics
import Foundation

/// Una sola flecha en modo «quiero verte» (nodo A3, 3 oct 2026).
///
/// Problema: con la mano real (HID) se veían dos flechas, la del sistema y el Halo encima, separadas ~5 pt en
/// movimiento (el WindowServer aplica el evento unos cuadros después de que el Halo ya se dibujó en el punto nuevo).
/// Solución: mientras la mano de Arbrain tiene el ratón, la flecha del sistema se oculta (CGDisplayHideCursor, con
/// la propiedad de conexión que lo permite a una app de fondo) y el Halo ES el cursor. Se devuelve en cuanto:
///   1. Daniel mueve o aprieta el ratón (un evento que no es nuestro),
///   2. la mano se interrumpe o falla,
///   3. el Halo se desvanece por reposo,
///   4. pasan `topeS` sin actividad de la mano (vigía, por si algo se quedó colgado),
///   5. el proceso termina (el WindowServer restaura el cursor de una conexión que muere).
/// Esta política es pura (se prueba sin pantalla); `CursorSistema` en ManosCasa ejecuta sus decisiones.
public struct PoliticaFlecha: Sendable {
    public enum Accion: Equatable, Sendable { case ninguna, ocultar, mostrar }
    /// Marca que llevan TODOS los eventos que publica la mano (campo eventSourceUserData): así se distingue a Daniel.
    public static let marca: Int64 = 0x4152_4252   // "ARBR"
    public var topeS = 50.0
    public private(set) var oculta = false
    public private(set) var ultimaActividad = -Double.infinity
    /// Daniel tomó el ratón: no se vuelve a ocultar hasta que la mano arranque un gesto nuevo.
    public private(set) var cedida = false
    public init(topeS: Double = 50) { self.topeS = topeS }

    /// La mano real arranca (`nuevo`) o continúa un gesto. Si Daniel tomó el ratón a mitad de un gesto, los cuadros
    /// que siguen NO vuelven a ocultar la flecha: solo un gesto nuevo (la siguiente acción) la oculta otra vez.
    public mutating func gesto(_ t: Double, nuevo: Bool = true) -> Accion {
        ultimaActividad = t
        if cedida && !nuevo { return .ninguna }
        cedida = false
        if oculta { return .ninguna }
        oculta = true; return .ocultar
    }

    /// Llega un evento de ratón del sistema. `propio`: lleva nuestra marca o cae donde la mano lo publicó.
    public mutating func eventoRaton(_ t: Double, propio: Bool) -> Accion {
        if propio { ultimaActividad = t; return .ninguna }
        cedida = true
        return soltar()
    }

    /// La mano se interrumpió, falló o el Halo se desvaneció.
    public mutating func liberar() -> Accion { soltar() }

    /// Vigía periódico.
    public mutating func tic(_ t: Double) -> Accion {
        guard oculta, t - ultimaActividad > topeS else { return .ninguna }
        return soltar()
    }

    private mutating func soltar() -> Accion {
        guard oculta else { return .ninguna }
        oculta = false; return .mostrar
    }

    /// ¿Es nuestro este evento? Por la marca o, si el campo no sobrevivió, por caer a ≤ 2 pt de algo publicado.
    public static func esPropio(userData: Int64, punto: CGPoint, publicados: [CGPoint]) -> Bool {
        if userData == marca { return true }
        return publicados.contains { hypot($0.x - punto.x, $0.y - punto.y) <= 2 }
    }
}
