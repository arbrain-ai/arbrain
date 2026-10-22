fn main() {
    // Ícono y metadatos del .exe (Explorador, barra de tareas, accesos directos).
    #[cfg(windows)]
    embed_resource::compile("windows/arbrain.rc", embed_resource::NONE)
        .manifest_optional()
        .unwrap();
}
