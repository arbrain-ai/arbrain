import XCTest
@testable import ManosNucleo

/// Ciclo de vida atado al uso (1 nov 2026, opción 2): sin pedidos, ArbrainManos deja de escuchar y, si se pidió, sale.
final class ReposoTests: XCTestCase {
    func testDuermeTrasDosMinutosSinUso() {
        let p = PoliticaReposo()
        XCTAssertEqual(p.paso(quietoS: 30, dormido: false, grabando: false), .nada)
        XCTAssertEqual(p.paso(quietoS: 121, dormido: false, grabando: false), .dormir)
        XCTAssertEqual(p.paso(quietoS: 500, dormido: true, grabando: false), .nada, "ya dormida: no repite")
    }

    func testUnaGrabacionEnCursoNuncaSeCorta() {
        let p = PoliticaReposo(reposoS: 10, salirS: 20)
        XCTAssertEqual(p.paso(quietoS: 9_999, dormido: false, grabando: true), .nada)
    }

    func testLaCopiaDelAlumnoSaleSola() {
        let p = PoliticaReposo(entorno: ["MANOS_SALIR_INACTIVA_S": "300"])
        XCTAssertEqual(p.reposoS, 120)
        XCTAssertEqual(p.paso(quietoS: 200, dormido: false, grabando: false), .dormir)
        XCTAssertEqual(p.paso(quietoS: 301, dormido: true, grabando: false), .salir)
    }

    func testCeroApagaElReposoYLaSalida() {
        let p = PoliticaReposo(entorno: ["MANOS_REPOSO_S": "0", "MANOS_SALIR_INACTIVA_S": "0"])
        XCTAssertNil(p.salirS)
        XCTAssertEqual(p.paso(quietoS: 1_000_000, dormido: false, grabando: false), .nada)
    }
}
