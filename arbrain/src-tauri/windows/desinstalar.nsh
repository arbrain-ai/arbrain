; Ganchos del instalador NSIS de Arbrain (Windows). Tauri los inserta con bundle.windows.nsis.installerHooks.
;
; Humo de instaladores, 13 oct 2026 (hallazgo 3): Next escribe su caché en tiempo de ejecución DENTRO de la carpeta
; de instalación (next\standalone\.next\server\route-cache\…). El desinstalador de Tauri solo borra lo que instaló, así
; que esos archivos y sus carpetas quedaban al desinstalar. Se borran antes de que Tauri retire las carpetas.
; Solo carpetas de caché bajo $INSTDIR\next: nada de datos de la persona (viven en %APPDATA% / %LOCALAPPDATA%).
; Las llaves del Administrador de credenciales se quedan a propósito (son de la persona; ver la guía del alumno).
!macro NSIS_HOOK_PREUNINSTALL
  RMDir /r "$INSTDIR\next\standalone\.next\server\route-cache"
  RMDir /r "$INSTDIR\next\standalone\.next\cache"
!macroend
