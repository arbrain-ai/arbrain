# Preparar tu computadora

Para que Levy instale y use herramientas (`gog`, Python, git) necesitas una terminal y un instalador de
programas. Este manual se hace una sola vez y tarda de 10 a 20 minutos.

> **Privacidad:** nada de lo que instales aquí manda tus datos a nadie. Son programas que corren en tu
> computadora.

**Para Levy:** revisa primero qué ya está instalado (sección «Verificación») y salta lo que ya exista. Si estás en
la app Arbrain, cada comando que instala algo le pide un clic al dueño: explícale qué hace antes de que lo apruebe.

## Mac

1. **Abre la Terminal:** `Cmd + Espacio`, escribe «Terminal» y Enter.
2. **Homebrew** (el instalador de programas para Mac). Ve a <https://brew.sh>, copia el comando de la portada y
   pégalo en la Terminal. Te pedirá la contraseña de tu Mac: la escribes tú, en la Terminal (no se ve mientras
   escribes; es normal). Al terminar, Homebrew muestra dos o tres comandos en «Next steps»: córrelos tal cual para
   que `brew` quede en tu PATH.
3. **Herramientas base:**

   ```bash
   brew install git python
   ```

4. Cierra la Terminal y ábrela otra vez.

## Windows

1. **Abre PowerShell:** tecla Windows, escribe «PowerShell» y Enter. (No hace falta «como administrador» salvo que
   un paso lo pida.)
2. **winget** ya viene en Windows 10 y 11 recientes. Comprueba con `winget --version`. Si no existe, instala
   «Instalador de aplicación» (App Installer) desde Microsoft Store.
3. **Herramientas base:**

   ```powershell
   winget install --id Git.Git -e
   winget install --id Python.Python.3.12 -e
   ```

4. Cierra PowerShell y ábrelo otra vez (si no, no encuentra los programas nuevos).
5. **Importante en Windows:** muchas piezas del cerebro (ganchos de memoria, el freno, los hábitos) usan Python.
   Sin Python, esas piezas no corren. Comprueba con `python --version`.
6. Si un comando dice «la ejecución de scripts está deshabilitada en este sistema», corre una vez:

   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
   ```

## Linux (Ubuntu o Debian)

```bash
sudo apt update && sudo apt install -y git python3 curl
```

Para guardar llaves en el llavero de Linux también conviene `libsecret-tools` (trae el comando `secret-tool`):

```bash
sudo apt install -y libsecret-tools
```

## Dónde guardar llaves en cada sistema (para todos los manuales)

| Sistema | Llavero | Cómo se guarda una llave sin que se vea |
|---|---|---|
| Mac | Llavero de macOS (Keychain) | `security add-generic-password -a "$USER" -s <nombre> -w` (te pide la llave sin mostrarla) |
| Windows | Administrador de credenciales, o variable de entorno de usuario | ver el manual de cada servicio |
| Linux | Secret Service (GNOME Keyring o KWallet) | `secret-tool store --label=<nombre> servicio <nombre>` (te la pide sin mostrarla) |

`gog` usa el llavero de tu sistema por su cuenta: no tienes que hacer nada extra.

## Verificación

Mac o Linux:

```bash
git --version && python3 --version && (brew --version 2>/dev/null | head -1 || true)
```

Windows (PowerShell):

```powershell
git --version; python --version; winget --version
```

Cada línea debe mostrar un número de versión. Levy: dile al dueño qué salió, línea por línea.

## Si falla

- **«command not found» o «no se reconoce»** justo después de instalar: cierra y abre la terminal. En Mac, corre
  los comandos de «Next steps» que mostró Homebrew.
- **Windows abre la Microsoft Store al escribir `python`:** es un alias de Windows. Instala con winget (arriba) y
  desactiva el alias en Configuración › Aplicaciones › Configuración avanzada de aplicaciones › Alias de ejecución
  de aplicaciones (apaga `python.exe` y `python3.exe`).
- **La app Arbrain no encuentra un programa que la terminal sí encuentra (Mac):** las apps de Mac no leen tu PATH
  de la terminal. Levy usa la ruta completa: `/opt/homebrew/bin/<programa>` en Mac con chip Apple, o
  `/usr/local/bin/<programa>` en Mac con Intel (`which <programa>` en la Terminal te dice cuál).
