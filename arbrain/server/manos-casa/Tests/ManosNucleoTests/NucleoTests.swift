import XCTest
@testable import ManosNucleo

final class NucleoTests: XCTestCase {
    let arbol: [Nodo] = [
        Nodo(ref: "e1", rol: "AXWindow", etiqueta: "Escritorio y Dock", profundidad: 0),
        Nodo(ref: "e2", rol: "AXButton", etiqueta: "General", profundidad: 1),
        Nodo(ref: "e3", rol: "AXCheckBox", subrol: "AXSwitch", etiqueta: "Ocultar y mostrar el Dock automáticamente", valor: "1", profundidad: 1),
        Nodo(ref: "e4", rol: "AXStaticText", etiqueta: "69104", profundidad: 2),
    ]

    func testLineaCortaYEnEspanol() {
        XCTAssertEqual(arbol[2].linea, "  [e3] interruptor «Ocultar y mostrar el Dock automáticamente» = 1")
        XCTAssertEqual(arbol[1].rolCorto, "boton")
    }

    func testContenedorMudoNoSeImprime() {
        XCTAssertFalse(Arbol.visible(Nodo(ref: "e9", rol: "AXGroup")))
        XCTAssertTrue(Arbol.visible(Nodo(ref: "e9", rol: "AXGroup", etiqueta: "Dock")))
    }

    func testConsultaConservaAncestros() {
        let t = Arbol.texto(arbol, consulta: "dock automá")
        XCTAssertEqual(t.split(separator: "\n").count, 2) // ventana + interruptor
        XCTAssertTrue(t.contains("[e3]"))
        XCTAssertFalse(t.contains("[e2]"))
    }

    func testDiffPorRef() {
        var despues = arbol
        despues[2].valor = "0"
        despues.removeLast()
        despues.append(Nodo(ref: "e7", rol: "AXSheet", etiqueta: "¿Guardar?", profundidad: 1))
        let d = Arbol.diff(antes: arbol, despues: despues)
        XCTAssertEqual(d.cambiados.map(\.ref), ["e3"])
        XCTAssertEqual(d.nuevos.map(\.ref), ["e7"])
        XCTAssertEqual(d.idos.map(\.ref), ["e4"])
        XCTAssertTrue(Arbol.diff(antes: arbol, despues: arbol).vacio)
    }

    func testTeclasYMenus() {
        XCTAssertEqual(Teclas.codigo("Return"), 36)
        XCTAssertEqual(Teclas.codigo("w"), 13)
        XCTAssertEqual(Teclas.flags(["cmd", "shift"]), 0x120000)
        XCTAssertEqual(Teclas.modificadoresMenu(["cmd"]), 0)
        XCTAssertEqual(Teclas.modificadoresMenu(["cmd", "shift"]), 1)
        XCTAssertEqual(Teclas.modificadoresMenu(["ctrl"]), 12)
    }

    func testPeligro() {
        XCTAssertTrue(Peligro.esPeligrosa("Enviar mensaje"))
        XCTAssertTrue(Peligro.esPeligrosa("Delete"))
        XCTAssertFalse(Peligro.esPeligrosa("Escritorio y Dock"))
        XCTAssertFalse(Peligro.esPeligrosa(nil))
    }

    func testPeligroAmpliado() {
        XCTAssertTrue(Peligro.esPeligrosa("Vaciar papelera"))
        XCTAssertTrue(Peligro.esPeligrosa("No guardar"))
        XCTAssertTrue(Peligro.esPeligrosa("Salir de Google Chrome"))
    }

    func testCandadoOtraSesionEspera() {
        let c = Candados(duracionMs: 1000)
        let v = Candados.Llave(pid: 10, ventana: 5)
        XCTAssertNil(c.tomar(v, sesion: "a", ahora: 0))
        XCTAssertNil(c.tomar(v, sesion: "a", ahora: 100), "la misma sesión renueva")
        XCTAssertEqual(c.tomar(v, sesion: "b", ahora: 200)?.1.sesion, "a", "otra sesión choca")
        XCTAssertEqual(c.tomar(Candados.Llave(pid: 10, ventana: nil), sesion: "b", ahora: 200)?.1.sesion, "a", "la app completa choca con su ventana")
        XCTAssertNil(c.tomar(Candados.Llave(pid: 10, ventana: 6), sesion: "b", ahora: 200), "otra ventana de la misma app sí se puede")
        XCTAssertNil(c.tomar(Candados.Llave(pid: 11, ventana: 5), sesion: "b", ahora: 200), "otra app no choca")
        XCTAssertNil(c.tomar(v, sesion: "b", ahora: 100 + 1_000_000_001), "vence sola")
    }

    func testCandadoSoltar() {
        let c = Candados(duracionMs: 60_000)
        let v = Candados.Llave(pid: 1, ventana: 2)
        XCTAssertNil(c.tomar(v, sesion: "a", ahora: 0))
        c.soltar(sesion: "a")
        XCTAssertNil(c.tomar(v, sesion: "b", ahora: 1))
    }

    func testTrayectoriaFitts() {
        XCTAssertEqual(Trayectoria.duracionMs(distancia: 3), 0, "la misma zona no se recorre")
        let cerca = Trayectoria.duracionMs(distancia: 40), lejos = Trayectoria.duracionMs(distancia: 1500)
        XCTAssertGreaterThanOrEqual(cerca, 250); XCTAssertLessThanOrEqual(lejos, 600)
        XCTAssertLessThan(cerca, lejos, "la duración crece con la distancia")
    }

    func testTrayectoriaCurvaYExtremos() {
        let a = (x: 0.0, y: 0.0), b = (x: 300.0, y: 0.0)
        let ini = Trayectoria.punto(desde: a, hasta: b, t: 0, arco: 1), fin = Trayectoria.punto(desde: a, hasta: b, t: 1, arco: 1)
        XCTAssertEqual(ini.x, 0, accuracy: 0.001); XCTAssertEqual(fin.x, 300, accuracy: 0.001); XCTAssertEqual(fin.y, 0, accuracy: 0.001)
        let medio = Trayectoria.punto(desde: a, hasta: b, t: 0.5, arco: 1)
        XCTAssertGreaterThan(abs(medio.y), 5, "la mano no va en línea recta")
        XCTAssertLessThan(abs(medio.y), 40, "pero el arco es leve")
        // Acelera y frena: el primer 10 % del tiempo recorre mucho menos que el 10 % del camino.
        XCTAssertLessThan(Trayectoria.punto(desde: a, hasta: b, t: 0.1, arco: 0).x, 15)
    }

    func testPausaLetra() {
        XCTAssertEqual(Trayectoria.pausaLetraMs("a", azar: 0), 30)
        XCTAssertEqual(Trayectoria.pausaLetraMs("a", azar: 1), 80)
        XCTAssertGreaterThan(Trayectoria.pausaLetraMs(" ", azar: 0), 30)
    }
}
