import Foundation

/// Edición del alumno (Arbrain 0.1.2, red team 3 M-10). La copia de ArbrainManos que viaja dentro de la app del alumno
/// lleva `ArbrainEdicion = cliente` en su Info.plist (la arma `arbrain/scripts/empaquetar-manos-mac.mjs`); también se
/// puede forzar con `MANOS_EDICION=cliente` al lanzarla. Una variable nunca la saca de la edición cliente: solo la
/// endurece. La instalación original no cambia (sin la llave del plist todo sigue como antes).
///
/// En la edición cliente:
///   - el socket nunca es el de la instalación original: `MANOS_CASA_SOCKET` (la carpeta de datos de la app) o, sin
///     ella, `~/.config/arbrain-cliente/manos.sock`;
///   - cada conexión se presenta con el token del archivo `MANOS_CASA_TOKEN_ARCHIVO` (por defecto `<socket>.token`,
///     0600, en la carpeta de datos que el sandbox del Bash de los agentes no deja leer). Sin token válido la conexión
///     se cierra sin ejecutar nada; sin archivo, ninguna conexión entra (falla del lado seguro);
///   - `via: hid` (el ratón y el teclado reales) no existe: `permiso_hid` como parámetro ya no autoriza nada.
enum Edicion {
    static let cliente: Bool = {
        let plist = (Bundle.main.object(forInfoDictionaryKey: "ArbrainEdicion") as? String)?.lowercased()
        let env = ProcessInfo.processInfo.environment["MANOS_EDICION"]?.lowercased()
        return plist == "cliente" || env == "cliente"
    }()

    static var rutaToken: String {
        ProcessInfo.processInfo.environment["MANOS_CASA_TOKEN_ARCHIVO"].flatMap { $0.isEmpty ? nil : $0 } ?? Servidor.ruta + ".token"
    }

    /// El token vigente (se relee en cada conexión: si la app de Arbrain lo regenera, la siguiente conexión lo usa).
    static func tokenVigente() -> String? {
        guard let d = FileManager.default.contents(atPath: rutaToken), let s = String(data: d, encoding: .utf8) else { return nil }
        let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.count >= 32 ? t : nil
    }

    /// ¿La primera línea de la conexión trae el token correcto? Fuera de la edición cliente siempre sí.
    static func tokenValido(_ dado: Any?) -> Bool {
        guard cliente else { return true }
        guard let dado = dado as? String, let vigente = tokenVigente() else { return false }
        let a = Array(dado.utf8), b = Array(vigente.utf8)
        guard a.count == b.count else { return false }
        var dif: UInt8 = 0
        for i in 0..<a.count { dif |= a[i] ^ b[i] }
        return dif == 0
    }

    static let mensajeSinHid = "En la edición cliente las manos nunca usan el ratón ni el teclado reales (via: hid no existe). Usa la vía de fondo, o pide «quiero verte» para traer la ventana al frente."
}
