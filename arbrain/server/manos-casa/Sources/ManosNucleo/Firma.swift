import CoreGraphics
import Foundation

/// Firma visual barata de una zona (gris 64×64): para COMPROBAR que un scroll movió el contenido sin un modelo.
/// Falla real del 2 oct: `rueda` en x.com/i/bookmarks «no bajó» y nadie lo supo hasta que Daniel lo vio.
public enum Firma {
    public static func de(_ img: CGImage, zona: CGRect? = nil, lado: Int = 64) -> [UInt8] {
        var fuente = img
        if let z = zona?.intersection(CGRect(x: 0, y: 0, width: img.width, height: img.height)), z.width >= 8, z.height >= 8,
           let c = img.cropping(to: z.integral) { fuente = c }
        var px = [UInt8](repeating: 0, count: lado * lado)
        let ok = px.withUnsafeMutableBytes { b -> Bool in
            guard let ctx = CGContext(data: b.baseAddress, width: lado, height: lado, bitsPerComponent: 8, bytesPerRow: lado,
                                      space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return false }
            ctx.interpolationQuality = .medium
            ctx.draw(fuente, in: CGRect(x: 0, y: 0, width: lado, height: lado))
            return true
        }
        return ok ? px : []
    }

    /// Diferencia media absoluta en [0, 1]. 0 = idénticas.
    public static func diferencia(_ a: [UInt8], _ b: [UInt8]) -> Double {
        guard a.count == b.count, !a.isEmpty else { return 1 }
        var s = 0
        for i in 0..<a.count { s += abs(Int(a[i]) - Int(b[i])) }
        return Double(s) / Double(a.count) / 255
    }

    /// Franja vertical en gris (ancho `w`, alto `h`) de una zona: para medir CUÁNTO se desplazó el contenido.
    public static func franja(_ img: CGImage, zona: CGRect, w: Int = 48, h: Int = 320) -> [UInt8] {
        guard let c = img.cropping(to: zona.intersection(CGRect(x: 0, y: 0, width: img.width, height: img.height)).integral) else { return [] }
        var px = [UInt8](repeating: 0, count: w * h)
        let ok = px.withUnsafeMutableBytes { b -> Bool in
            guard let ctx = CGContext(data: b.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w,
                                      space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return false }
            ctx.interpolationQuality = .medium
            ctx.draw(c, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }
        return ok ? px : []
    }

    /// Desplazamiento vertical entre dos franjas (filas; positivo = el contenido subió, es decir, se bajó la página).
    /// Devuelve nil si no se movió: o el mejor desfase es ~0, o no explica la diferencia mucho mejor que quedarse
    /// quieto. Un video o un panel que cambia en su sitio NO cuenta como desplazamiento (falla de la noche del 2 oct:
    /// la firma global confundía el reloj de un video de X con un scroll).
    public static func desplazamiento(antes a: [UInt8], despues b: [UInt8], w: Int = 48, h: Int = 320) -> Int? {
        guard a.count == w * h, b.count == w * h else { return nil }
        func error(_ d: Int) -> Double {
            // El búfer va de arriba abajo: si el contenido subió d filas, la fila r de «después» es la r + d de «antes».
            var s = 0, n = 0
            for r in 0..<h {
                let ra = r + d
                guard ra >= 0, ra < h else { continue }
                for x in 0..<w { s += abs(Int(a[ra * w + x]) - Int(b[r * w + x])); n += 1 }
            }
            return n < w * h / 4 ? .infinity : Double(s) / Double(n)
        }
        let quieto = error(0)
        guard quieto > 1.5 else { return nil }   // idénticas: no se movió
        var mejor = (d: 0, e: quieto)
        for d in stride(from: -(h * 3 / 4), through: h * 3 / 4, by: 1) where d != 0 {
            let e = error(d); if e < mejor.e { mejor = (d, e) }
        }
        guard abs(mejor.d) >= 2, mejor.e < quieto * 0.55 else { return nil }
        return mejor.d
    }

    /// ¿Se movió el contenido? Exige superar el ruido propio de la zona (videos, cursores que parpadean) con margen.
    public static func cambio(antes: [UInt8], despues: [UInt8], ruido: Double) -> Bool {
        diferencia(antes, despues) > max(0.012, ruido * 2.5)
    }
}
