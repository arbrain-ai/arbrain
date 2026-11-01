import Foundation

/// Ciclo de vida atado al uso (1 nov 2026, opción 2 firmada por Daniel; idea de Cloudroom, que apaga su driver a los
/// 2 min sin uso). ArbrainManos deja de escuchar y capturar cuando nadie la usa:
///   - reposo: tras `reposoS` sin pedidos apaga el monitor global de ratón y teclado, la vigía de la flecha y el Halo.
///     El siguiente pedido la despierta (se vuelve a medir la inactividad desde el sistema, no se pierde nada).
///   - salida: con `salirS` (la edición del alumno lo pone), además sale del todo; el adaptador la vuelve a abrir.
/// Una grabación en curso (b-roll) nunca se interrumpe.
public struct PoliticaReposo: Equatable {
    public static let reposoPorDefectoS = 120.0
    public let reposoS: Double
    public let salirS: Double?

    public init(reposoS: Double = PoliticaReposo.reposoPorDefectoS, salirS: Double? = nil) {
        self.reposoS = reposoS
        self.salirS = salirS
    }

    /// Lee `MANOS_REPOSO_S` (0 = nunca reposa) y `MANOS_SALIR_INACTIVA_S` (0 o ausente = nunca sale).
    public init(entorno: [String: String]) {
        let r = entorno["MANOS_REPOSO_S"].flatMap(Double.init) ?? PoliticaReposo.reposoPorDefectoS
        let s = entorno["MANOS_SALIR_INACTIVA_S"].flatMap(Double.init)
        self.init(reposoS: r, salirS: (s ?? 0) > 0 ? s : nil)
    }

    public enum Paso: Equatable { case nada, dormir, salir }

    /// Qué toca tras `quietoS` segundos sin pedidos.
    public func paso(quietoS: Double, dormido: Bool, grabando: Bool) -> Paso {
        if grabando { return .nada }
        if let s = salirS, quietoS > s { return .salir }
        if reposoS > 0, !dormido, quietoS > reposoS { return .dormir }
        return .nada
    }
}
