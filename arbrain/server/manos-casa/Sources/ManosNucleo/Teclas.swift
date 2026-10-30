import Foundation

/// Códigos de tecla virtuales de macOS (Carbon `kVK_*`, distribución ANSI).
/// Las letras y signos se escriben como texto Unicode; esto es para teclas con nombre.
public enum Teclas {
    public static let codigos: [String: UInt16] = [
        "return": 36, "enter": 76, "tab": 48, "space": 49, "espacio": 49, "delete": 51, "borrar": 51,
        "forwarddelete": 117, "suprimir": 117, "escape": 53, "esc": 53,
        "left": 123, "izquierda": 123, "right": 124, "derecha": 124, "down": 125, "abajo": 125, "up": 126, "arriba": 126,
        "home": 115, "inicio": 115, "end": 119, "fin": 119, "pageup": 116, "pagedown": 121,
        "f1": 122, "f2": 120, "f3": 99, "f4": 118, "f5": 96, "f6": 97, "f7": 98, "f8": 100, "f9": 101, "f10": 109, "f11": 103, "f12": 111,
        "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9, "b": 11, "q": 12, "w": 13, "e": 14,
        "r": 15, "y": 16, "t": 17, "1": 18, "2": 19, "3": 20, "4": 21, "6": 22, "5": 23, "=": 24, "9": 25, "7": 26, "-": 27,
        "8": 28, "0": 29, "]": 30, "o": 31, "u": 32, "[": 33, "i": 34, "p": 35, "l": 37, "j": 38, "'": 39, "k": 40, ";": 41,
        "\\": 42, ",": 43, "/": 44, "n": 45, "m": 46, ".": 47, "`": 50,
    ]

    /// Bits de `CGEventFlags` (valores públicos y estables).
    public static let banderas: [String: UInt64] = [
        "shift": 0x20000, "ctrl": 0x40000, "control": 0x40000, "option": 0x80000, "alt": 0x80000,
        "cmd": 0x100000, "command": 0x100000, "fn": 0x800000,
    ]

    /// Bits de `kAXMenuItemCmdModifiersAttribute`: 0 = solo ⌘; shift 1, option 2, ctrl 4, 8 = sin ⌘.
    public static func modificadoresMenu(_ mods: [String]) -> Int {
        let m = Set(mods.map { $0.lowercased() })
        var v = 0
        if m.contains("shift") { v |= 1 }
        if m.contains("option") || m.contains("alt") { v |= 2 }
        if m.contains("ctrl") || m.contains("control") { v |= 4 }
        if !(m.contains("cmd") || m.contains("command")) { v |= 8 }
        return v
    }

    public static func codigo(_ tecla: String) -> UInt16? { codigos[tecla.lowercased()] }

    public static func flags(_ mods: [String]) -> UInt64 { mods.reduce(0) { $0 | (banderas[$1.lowercased()] ?? 0) } }
}

/// Etiquetas que, en modo `acotado` (crons), exigen confirmación humana.
public enum Peligro {
    public static let patron = try! NSRegularExpression(
        pattern: "\\b(enviar|send|borrar|eliminar|delete|remove|pagar|pay|comprar|buy|purchase|publicar|publish|post|transferir|transfer|confirmar pago|vaciar|empty trash|descartar|discard|no guardar|don.t save|salir|quit|cerrar sesi[oó]n|log out)\\b",
        options: [.caseInsensitive])
    public static func esPeligrosa(_ etiqueta: String?) -> Bool {
        guard let e = etiqueta, !e.isEmpty else { return false }
        return patron.firstMatch(in: e, range: NSRange(e.startIndex..., in: e)) != nil
    }
}
