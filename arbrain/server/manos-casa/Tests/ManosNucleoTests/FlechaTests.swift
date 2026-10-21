import CoreGraphics
import XCTest
@testable import ManosNucleo

/// Una sola flecha cuando la mano real (`via: hid`, último recurso) trabaja: la del sistema se oculta mientras la mano trabaja y SIEMPRE vuelve.
final class FlechaTests: XCTestCase {
    func testOcultaUnaVezPorSesionDeMano() {
        var p = PoliticaFlecha()
        XCTAssertEqual(p.gesto(0), .ocultar)
        XCTAssertEqual(p.gesto(0.01, nuevo: false), .ninguna, "un cuadro más del mismo gesto no vuelve a ocultar (contador de CG)")
        XCTAssertEqual(p.gesto(2), .ninguna)
        XCTAssertTrue(p.oculta)
    }

    func testLaPersonaTomaElRatonYLaFlechaVuelveYNoSeVuelveAOcultarEnElMismoGesto() {
        var p = PoliticaFlecha()
        _ = p.gesto(0)
        XCTAssertEqual(p.eventoRaton(0.1, propio: true), .ninguna, "nuestros propios eventos no cuentan")
        XCTAssertEqual(p.eventoRaton(0.2, propio: false), .mostrar)
        XCTAssertFalse(p.oculta)
        XCTAssertEqual(p.gesto(0.21, nuevo: false), .ninguna, "los cuadros que quedan del gesto interrumpido no pelean con la persona")
        XCTAssertFalse(p.oculta)
        XCTAssertEqual(p.gesto(5, nuevo: true), .ocultar, "la siguiente acción de la mano sí la oculta")
    }

    func testLiberarYTopeDevuelvenLaFlecha() {
        var p = PoliticaFlecha(topeS: 50)
        XCTAssertEqual(p.liberar(), .ninguna, "nunca muestra de más (el contador de CG quedaría descuadrado)")
        _ = p.gesto(10)
        XCTAssertEqual(p.tic(40), .ninguna)
        XCTAssertEqual(p.tic(60.5), .mostrar)
        XCTAssertEqual(p.tic(61), .ninguna)
        _ = p.gesto(70)
        XCTAssertEqual(p.liberar(), .mostrar)
    }

    func testOcultarYMostrarSiempreEmparejados() {
        // Secuencias al azar de eventos: el número de .ocultar y .mostrar nunca se separa en más de 1 y al final, tras
        // liberar, quedan iguales (la flecha nunca queda perdida).
        var r = Azar(99)
        for _ in 0..<200 {
            var p = PoliticaFlecha(topeS: 5)
            var cuenta = 0, t = 0.0
            for _ in 0..<60 {
                t += r.uniforme() * 3
                let a: PoliticaFlecha.Accion
                switch Int(r.uniforme() * 5) {
                case 0: a = p.gesto(t, nuevo: true)
                case 1: a = p.gesto(t, nuevo: false)
                case 2: a = p.eventoRaton(t, propio: r.uniforme() < 0.5)
                case 3: a = p.tic(t)
                default: a = p.liberar()
                }
                cuenta += a == .ocultar ? 1 : a == .mostrar ? -1 : 0
                XCTAssert(cuenta == 0 || cuenta == 1)
                XCTAssertEqual(cuenta == 1, p.oculta)
            }
            if p.liberar() == .mostrar { cuenta -= 1 }
            XCTAssertEqual(cuenta, 0)
        }
    }

    func testDistingueEventosPropios() {
        let pub = [CGPoint(x: 100, y: 100), CGPoint(x: 110, y: 104)]
        XCTAssertTrue(PoliticaFlecha.esPropio(userData: PoliticaFlecha.marca, punto: CGPoint(x: 900, y: 900), publicados: []))
        XCTAssertTrue(PoliticaFlecha.esPropio(userData: 0, punto: CGPoint(x: 110.5, y: 105), publicados: pub))
        XCTAssertFalse(PoliticaFlecha.esPropio(userData: 0, punto: CGPoint(x: 140, y: 104), publicados: pub))
    }
}
