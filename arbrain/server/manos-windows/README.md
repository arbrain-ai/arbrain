# ManosWindows

Las manos de Arbrain en Windows: el adaptador `windows` de `src/manos/adaptadores/windows.ts` habla con este helper
por JSON en líneas (el mismo protocolo de ArbrainManos en macOS).

- `src/ManosWindows.cs`: UIA3 por COM, acciones de fondo (`BN_CLICKED`, `EM_REPLACESEL`, `WM_COMMAND` del menú,
  `WM_VSCROLL`, `TDM_CLICK_BUTTON`, patrones UIA), PrintWindow y el Halo. Está en C# 5 a propósito: lo compila el
  `csc.exe` de .NET Framework 4.x que trae Windows 10/11.
- `src/GenerarInterop.cs`: saca `Interop.UIAutomationClient.dll` del typelib de `UIAutomationCore.dll`.
- `pruebas/`: ventanas de prueba, workflow E2E y `sincronizar.sh` (copia al repo privado `manos-windows-pruebas`).

Compilar: no hace falta. `asegurarBinario()` lo compila la primera vez en `%LOCALAPPDATA%\Arbrain\manos-windows\<huella>`;
`MANOS_WINDOWS_EXE` apunta a uno ya compilado y firmado.

Paridad, corridas y decisiones: `docs/builds/manos-windows-2026-10-17/`.
