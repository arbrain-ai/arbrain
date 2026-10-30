import Foundation

/// ¿El texto ENTRÓ? Lectura de vuelta del valor del campo (falla real del 2 oct: WhatsApp quedó `sin_verificar`
/// y se siguió como si nada). Pura: se prueba sin permisos.
public enum Escritura {
    /// Normaliza lo que las apps reescriben solas: comillas tipográficas, espacios duros, saltos \r\n, guiones largos
    /// automáticos, el objeto de adjunto (U+FFFC) y la forma Unicode (NFC).
    public static func normalizar(_ s: String) -> String {
        var x = s.precomposedStringWithCanonicalMapping
        for (a, b) in [("\u{00A0}", " "), ("\u{202F}", " "), ("\u{2019}", "'"), ("\u{2018}", "'"), ("\u{201C}", "\""), ("\u{201D}", "\""),
                       ("\r\n", "\n"), ("\r", "\n"), ("\u{2014}", "--"), ("\u{2013}", "-"), ("\u{FFFC}", ""), ("\u{200B}", "")] {
            x = x.replacingOccurrences(of: a, with: b)
        }
        return x
    }

    static func ocurrencias(_ aguja: String, en pajar: String) -> Int {
        guard !aguja.isEmpty else { return 0 }
        var n = 0, desde = pajar.startIndex
        while let r = pajar.range(of: aguja, range: desde..<pajar.endIndex) { n += 1; desde = r.upperBound }
        return n
    }

    /// Entró si el texto aparece UNA vez más que antes (sirve aunque se escriba lo mismo dos veces seguidas).
    /// Si el campo tenía un marcador de posición que la app reporta como valor, también vale «antes» = marcador.
    public static func entro(antes: String, despues: String, texto: String) -> Bool {
        let a = normalizar(antes), d = normalizar(despues), t = normalizar(texto).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return false }
        if ocurrencias(t, en: d) > ocurrencias(t, en: a) { return true }
        // Autocorrección o emoji convertido: el valor creció en ~lo escrito y termina parecido.
        let crecio = d.count - a.count
        return crecio >= max(1, t.count - 2) && crecio <= t.count + 2 && d.hasSuffix(String(t.suffix(min(4, t.count))))
    }
}
