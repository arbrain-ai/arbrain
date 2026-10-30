import XCTest
@testable import ManosNucleo

/// Cada quien su cursor (3 oct 2026): el ratón real de Daniel solo con permiso, y el permiso se vuelve a medir aquí.
final class CursorPropioTests: XCTestCase {
    func testSinPermisoNuncaSeMueveElRatonReal() {
        XCTAssertFalse(CursorPropio.permite(permiso: nil, inactividadS: 10_000))
        XCTAssertFalse(CursorPropio.permite(permiso: "quiero verte", inactividadS: 10_000), "«quiero verte» no es un permiso de hid")
    }

    func testInactivoExigeElUmbralMedidoAhora() {
        XCTAssertFalse(CursorPropio.permite(permiso: "inactivo", inactividadS: 3, umbralS: 60), "La persona tocó el ratón hace 3 s")
        XCTAssertTrue(CursorPropio.permite(permiso: "inactivo", inactividadS: 61, umbralS: 60))
    }

    func testPedidoExplicitoPasaAunqueLaPersonaEsteActiva() {
        XCTAssertTrue(CursorPropio.permite(permiso: "explicito", inactividadS: 0))
    }

    func testLosEventosDeLaManoNoCuentanComoDeLaPersona() {
        // La mano publicó hace 0.1 s y el sistema dice «último evento hace 0.1 s»: es nuestro; manda el monitor (90 s).
        XCTAssertEqual(CursorPropio.inactividad(sistemaS: 0.1, desdePropioS: 0.1, desdePersonaS: 90), 90)
        // La mano publicó hace 30 s pero hubo un evento hace 2 s: es de Daniel.
        XCTAssertEqual(CursorPropio.inactividad(sistemaS: 2, desdePropioS: 30, desdePersonaS: 90), 2)
        // Sin eventos de la mano: el menor de los dos (el más prudente).
        XCTAssertEqual(CursorPropio.inactividad(sistemaS: 5, desdePropioS: nil, desdePersonaS: 40), 5)
    }

    func testElMotivoDiceQueFalta() {
        XCTAssertTrue(CursorPropio.motivo(permiso: nil, inactividadS: 1, umbralS: 60).contains("cursor_de_daniel"))
        XCTAssertTrue(CursorPropio.motivo(permiso: "inactivo", inactividadS: 4, umbralS: 60).contains("hace 4 s"))
    }
}

/// Falla real del 3 oct, 10:38 (Claude Desktop): «cursor real MOVIDO» en un clic por defecto.
final class MovioCursorTests: XCTestCase {
    func testLaPersonaMoviendoSuRatonNoEsCulpaDeLasManos() {
        let m = MovioCursor.clasificar(desplazamientoPt: 240, hidPropios: 0, personaToco: true)
        XCTAssertEqual(m, .persona)
        XCTAssertFalse(m.culpaDeLasManos)
    }
    func testMovimientoSinEventoSeReporta() {
        let m = MovioCursor.clasificar(desplazamientoPt: 12, hidPropios: 0, personaToco: false)
        XCTAssertEqual(m, .sinEvento)
        XCTAssertTrue(m.culpaDeLasManos)
    }
    func testHidPropioSiempreSeReportaAunqueLaPersonaSeMueva() {
        XCTAssertEqual(MovioCursor.clasificar(desplazamientoPt: 0, hidPropios: 3, personaToco: true), .manosHid)
    }
    func testQuieto() {
        XCTAssertEqual(MovioCursor.clasificar(desplazamientoPt: 0.2, hidPropios: 0, personaToco: false), .nadie)
    }
    func testFondoNoAlcanzoSoloEnControles() {
        XCTAssertTrue(FondoAlcanzo.noAlcanzo(rol: "AXButton", eventosAX: 0))
        XCTAssertFalse(FondoAlcanzo.noAlcanzo(rol: "AXButton", eventosAX: 2))
        XCTAssertFalse(FondoAlcanzo.noAlcanzo(rol: "AXGroup", eventosAX: 0), "un AXGroup web o un lienzo no se puede saber")
        XCTAssertFalse(FondoAlcanzo.noAlcanzo(rol: nil, eventosAX: 0))
    }
    func testPrestamoDeFocoSoloEnPausa() {
        XCTAssertFalse(PrestamoFoco.puedeTomar(tecladoInactivoS: 0.3))
        XCTAssertTrue(PrestamoFoco.puedeTomar(tecladoInactivoS: 2))
    }
}
