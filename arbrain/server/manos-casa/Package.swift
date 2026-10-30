// swift-tools-version: 6.0
// Manos de la casa: computer use propio de Arbrain sobre macOS.
// Spec: docs/builds/manos-casa-2026-10-02/spec.md
import PackageDescription

let package = Package(
    name: "manos-casa",
    platforms: [.macOS(.v15)],
    targets: [
        // Lógica pura (árbol, diff, teclas, protocolo): se prueba sin permisos.
        .target(
            name: "ManosNucleo",
            path: "Sources/ManosNucleo",
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        // La app: servidor por socket, AX, acciones, cursor fantasma y doctor.
        .executableTarget(
            name: "ManosCasa",
            dependencies: ["ManosNucleo"],
            path: "Sources/ManosCasa",
            swiftSettings: [.swiftLanguageMode(.v5)],
            linkerSettings: [
                .linkedFramework("ApplicationServices"),
                .linkedFramework("AppKit"),
                .linkedFramework("ScreenCaptureKit"),
                .linkedFramework("Vision"),
            ]
        ),
        .testTarget(
            name: "ManosNucleoTests",
            dependencies: ["ManosNucleo"],
            path: "Tests/ManosNucleoTests",
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
    ]
)
