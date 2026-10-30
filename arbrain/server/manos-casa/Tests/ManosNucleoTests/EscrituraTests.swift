import CoreGraphics
import XCTest
@testable import ManosNucleo

final class ConsultaInvisiblesTests: XCTestCase {
    func testConsultaIgnoraMarcasInvisiblesDeWhatsApp() {
        let n = Nodo(ref: "e73", rol: "AXTextArea", etiqueta: "\u{200E}Escribir mensaje")
        XCTAssertTrue(Arbol.texto([n], consulta: "escribir mensaje").contains("e73"))
        XCTAssertTrue(Arbol.texto([n], consulta: "\u{2068}Escribir\u{2069}").contains("e73"))
        XCTAssertEqual(Arbol.comparable("\u{202A}Contacto\u{202C} Prueba"), "contacto prueba")
    }
}

final class EscrituraTests: XCTestCase {
    func testEntroCuentaOcurrencias() {
        XCTAssertTrue(Escritura.entro(antes: "", despues: "hola", texto: "hola"))
        XCTAssertTrue(Escritura.entro(antes: "hola", despues: "holahola", texto: "hola"), "lo mismo dos veces cuenta")
        XCTAssertFalse(Escritura.entro(antes: "hola", despues: "hola", texto: "hola"), "no cambió: no entró")
        XCTAssertFalse(Escritura.entro(antes: "", despues: "", texto: "prueba"))
    }

    func testNormalizaLoQueReescribenLasApps() {
        XCTAssertTrue(Escritura.entro(antes: "", despues: "Prueba de Levy \u{201C}ok\u{201D}", texto: "Prueba de Levy \"ok\""))
        XCTAssertTrue(Escritura.entro(antes: "", despues: "a\u{00A0}b", texto: "a b"))
        XCTAssertTrue(Escritura.entro(antes: "x", despues: "x" + "e\u{301}", texto: "é"), "NFC")
    }

    func testAutocorreccionPequenaAunEntra() {
        XCTAssertTrue(Escritura.entro(antes: "", despues: "Prueba de levy 💜", texto: "prueba de levy 💜"))
        XCTAssertFalse(Escritura.entro(antes: "", despues: "otra cosa distinta", texto: "prueba"))
    }

    func testFirmaDetectaDesplazamiento() {
        func img(_ franja: Int) -> CGImage {
            let w = 100, h = 100
            let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w, space: CGColorSpaceCreateDeviceGray(), bitmapInfo: 0)!
            ctx.setFillColor(gray: 1, alpha: 1); ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
            ctx.setFillColor(gray: 0, alpha: 1)
            for k in stride(from: franja, to: h, by: 20) { ctx.fill(CGRect(x: 0, y: k, width: w, height: 8)) }
            return ctx.makeImage()!
        }
        // Desplazamiento real: un patrón irregular que sube 40 px se mide; un recuadro que cambia en su sitio, no.
        func pagina(_ arriba: Int, recuadro: CGFloat = 0) -> CGImage {
            let w = 100, h = 400
            let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w, space: CGColorSpaceCreateDeviceGray(), bitmapInfo: 0)!
            ctx.setFillColor(gray: 1, alpha: 1); ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
            var semilla: UInt64 = 7
            for k in 0..<60 {
                semilla = semilla &* 6364136223846793005 &+ 1442695040888963407
                let alto = 4 + Int(semilla >> 60), yDoc = k * 22 + Int((semilla >> 50) & 7)
                ctx.setFillColor(gray: CGFloat((semilla >> 40) & 0xff) / 400, alpha: 1)
                // y del documento hacia abajo; en CG la y crece hacia arriba.
                ctx.fill(CGRect(x: Int((semilla >> 30) & 31), y: h - (yDoc - arriba) - alto, width: 40 + Int((semilla >> 20) & 31), height: alto))
            }
            if recuadro > 0 { ctx.setFillColor(gray: recuadro, alpha: 1); ctx.fill(CGRect(x: 10, y: 150, width: 80, height: 100)) }
            return ctx.makeImage()!
        }
        let zona = CGRect(x: 0, y: 0, width: 100, height: 400)
        let p0 = Firma.franja(pagina(0), zona: zona), p40 = Firma.franja(pagina(40), zona: zona)
        let d = Firma.desplazamiento(antes: p0, despues: p40)
        XCTAssertNotNil(d); XCTAssertEqual(Double(d ?? 0), 32, accuracy: 3, "40 px de 400 → 32 de 320 filas")
        XCTAssertNil(Firma.desplazamiento(antes: Firma.franja(pagina(0, recuadro: 0.2), zona: zona), despues: Firma.franja(pagina(0, recuadro: 0.8), zona: zona)), "un video que cambia en su sitio no es scroll")
        let a = Firma.de(img(0)), b = Firma.de(img(0)), c = Firma.de(img(10))
        XCTAssertEqual(Firma.diferencia(a, b), 0)
        XCTAssertFalse(Firma.cambio(antes: a, despues: b, ruido: 0))
        XCTAssertTrue(Firma.cambio(antes: a, despues: c, ruido: 0))
    }
}
