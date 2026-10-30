// Windows: sin ventana de consola detrás de la app en release (subsistema GUI). Sin efecto en macOS y Linux.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // El motor viaja DENTRO del .app (misma decisión que el `--ptyd` de SFTerm): un
    // segundo binario obligaría a empaquetar un externalBin y a mantener dos artefactos
    // en sincronía. Con el flag no inicia Tauri ni AppKit (no aparece en el Dock), y un
    // bundle reemplazado en disco no molesta al motor que ya lo tiene mapeado.
    // Solo en Unix: en Windows no hay motor (ver src/motor.rs).
    #[cfg(unix)]
    if std::env::args().any(|a| a == "--motor") {
        let cfg = arbrain_motor::config_from_env();
        if std::env::args().any(|a| a == "--relevo") {
            if let Err(e) = arbrain_motor::server::run_relevo(cfg) {
                eprintln!("relevo: {e}");
                std::process::exit(1);
            }
            return;
        }
        arbrain_motor::server::run(cfg);
        return;
    }
    mission_control_desktop_lib::run()
}
