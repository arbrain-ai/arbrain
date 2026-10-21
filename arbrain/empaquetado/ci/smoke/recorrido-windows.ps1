# Recorrido completo del instalador de Windows YA INSTALADO (smoke-instaladores.yml, 13 oct 2026).
#
#   pwsh -File recorrido-windows.ps1 [-Salida carpeta]
#
# Corre DESPUÉS de smoke-windows.ps1 (que instala con NSIS /S y prueba daemon, Next y localhost). Aquí:
#   1. lanza Arbrain.exe con perfil temporal;
#   2. recorrido.py --motor uia (UI Automation, como una persona): primer arranque entero con dos llaves FALSAS
#      (canarios) y capturas. El WebView2 de la app no acepta depurador remoto (Tauri fija sus argumentos);
#   3. cierra la ventana como una persona (WM_CLOSE) y mide si todo el árbol de procesos se va;
#   4. huella_secretos.py: ningún canario en texto plano en disco (perfil, instalación, AppData real, ProgramData);
#   5. el llavero (Administrador de credenciales) tiene las entradas, sin mostrar valores;
#   6. desinstala en silencio (uninstall.exe /S) y revisa restos (carpeta, registro, accesos directos, credenciales).
# Escribe recorrido-windows.json y tiempos.json; imprime «RECORRIDO-WINDOWS OK» o «RECORRIDO-WINDOWS FALLO: …».
# Solo en un runner o VM desechable: instala/desinstala y abre ventanas.
param([string]$Salida = (Join-Path (Get-Location) 'recorrido-salida'))
$ErrorActionPreference = 'Continue'
if (-not $IsWindows) { Write-Host 'recorrido-windows.ps1 solo corre en Windows (runner o VM).'; exit 2 }
New-Item -ItemType Directory -Force -Path $Salida | Out-Null
$Salida = (Resolve-Path $Salida).Path
$Aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:Tiempos = [ordered]@{}
$script:Fallos = @(); $script:Avisos = @()
$res = [ordered]@{}
function Di([string]$t) { Write-Host $t; Add-Content -Path (Join-Path $Salida 'reporte.txt') -Value $t -Encoding utf8 }
function Medir([string]$n, [scriptblock]$b) { $t = Get-Date; & $b; $script:Tiempos[$n] = [math]::Round(((Get-Date) - $t).TotalSeconds, 1) }
function Arbol([int]$raiz) {
  $todos = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name
  $set = New-Object System.Collections.Generic.HashSet[int]; [void]$set.Add($raiz)
  do { $antes = $set.Count; foreach ($p in $todos) { if ($set.Contains([int]$p.ParentProcessId)) { [void]$set.Add([int]$p.ProcessId) } } } while ($set.Count -ne $antes)
  return $todos | Where-Object { $set.Contains([int]$_.ProcessId) }
}
function Al([int]$n) { -join ((48..57) + (65..90) + (97..122) | Get-Random -Count $n | ForEach-Object { [char]$_ }) }

$realLocal = [Environment]::GetFolderPath('LocalApplicationData')
$realPerfil = [Environment]::GetFolderPath('UserProfile')
$exe = Get-ChildItem -Path "$realLocal\Arbrain", "$realLocal\Programs\Arbrain", "$env:ProgramFiles\Arbrain" -Filter 'Arbrain.exe' -File -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $exe) { Di 'RECORRIDO-WINDOWS FALLO: no encuentro Arbrain.exe instalado (¿corrió smoke-windows.ps1 antes?)'; exit 1 }
$dirApp = $exe.DirectoryName
Di "== Recorrido Windows: $($exe.FullName)"

# Perfil temporal como el de smoke-windows.ps1 (con AppData\Roaming y \Local: SHGetKnownFolderPath los necesita).
$homeAlumno = Join-Path ([System.IO.Path]::GetTempPath()) ("arbrain-recorrido-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$roaming = Join-Path $homeAlumno 'AppData\Roaming'; $local = Join-Path $homeAlumno 'AppData\Local'
New-Item -ItemType Directory -Force -Path $roaming, $local | Out-Null
$env:USERPROFILE = $homeAlumno; $env:HOME = $homeAlumno; $env:APPDATA = $roaming; $env:LOCALAPPDATA = $local
$desde = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() - 5

$app = $null
Medir 'lanzar_y_ventana' {
  $script:app = Start-Process -FilePath $exe.FullName -WorkingDirectory $dirApp -PassThru `
    -RedirectStandardOutput (Join-Path $Salida 'app.out.log') -RedirectStandardError (Join-Path $Salida 'app.err.log')
  $t0 = Get-Date
  while (((Get-Date) - $t0).TotalSeconds -lt 90) {
    $gp = Get-Process -Id $script:app.Id -ErrorAction SilentlyContinue
    if ($gp -and $gp.MainWindowHandle -ne 0) { break }
    Start-Sleep -Milliseconds 500
  }
}
$app = $script:app
$gp = Get-Process -Id $app.Id -ErrorAction SilentlyContinue
$res.ventana = if ($gp) { $gp.MainWindowTitle } else { $null }
Di "ventana: '$($res.ventana)' en $($script:Tiempos.lanzar_y_ventana) s"
if ($gp -and $gp.MainWindowHandle -ne 0) {
  Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int c);'
  [void][W.U]::ShowWindow($gp.MainWindowHandle, 3); [void][W.U]::SetForegroundWindow($gp.MainWindowHandle)
} else { $script:Fallos += 'la app no mostró ventana en 90 s' }

# Canarios: llaves falsas con formato válido. Solo las ve el proceso de Python (la app ya arrancó sin ellas).
$canA = 'sk-' + 'ant-api03-' + 'smoke' + (Al 40)
$canO = 'sk-' + 'or-v1-' + 'smoke' + (Al 48).ToLower()
Medir 'recorrido_primer_arranque' {
  $env:RECORRIDO_CANARIO_ANTHROPIC = $canA; $env:RECORRIDO_CANARIO_OPENROUTER = $canO
  & python -I (Join-Path $Aqui 'recorrido.py') --motor uia --salida $Salida 2>&1 | Tee-Object -FilePath (Join-Path $Salida 'recorrido.log')
  $script:codRecorrido = $LASTEXITCODE
  Remove-Item Env:RECORRIDO_CANARIO_ANTHROPIC, Env:RECORRIDO_CANARIO_OPENROUTER -ErrorAction SilentlyContinue
}
if ($script:codRecorrido -ne 0) { $script:Fallos += 'recorrido del primer arranque (ver recorrido.json)' }

# Cerrar como una persona: WM_CLOSE a la ventana principal. Todo el árbol (daemon, Next, WebView2) debe irse solo.
$arbolAntes = Arbol $app.Id
Di "procesos antes de cerrar: $(($arbolAntes | ForEach-Object { "$($_.Name)#$($_.ProcessId)" }) -join ' ')"
Medir 'cerrar_ventana' {
  $g = Get-Process -Id $app.Id -ErrorAction SilentlyContinue
  if ($g) { [void]$g.CloseMainWindow() }
  $t0 = Get-Date
  while (((Get-Date) - $t0).TotalSeconds -lt 25) {
    $vivos = $arbolAntes | Where-Object { Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
    if (-not $vivos) { break }
    Start-Sleep -Milliseconds 500
  }
}
$vivos = @($arbolAntes | Where-Object { Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue })
$res.procesos_tras_cerrar = @($vivos | ForEach-Object { "$($_.Name)#$($_.ProcessId)" })
if ($vivos.Count) {
  $nodo = $vivos | Where-Object { $_.Name -match 'arbrain-node' }
  $msg = "tras cerrar la ventana siguen vivos en 25 s: $($res.procesos_tras_cerrar -join ' ')"
  if ($nodo) { $script:Fallos += $msg } else { $script:Avisos += $msg }
  $vivos | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
} else { Di "cerrar la ventana: todo el árbol se fue en $($script:Tiempos.cerrar_ventana) s" }

# Logs de la app (daemon.log y compañía).
$logs = Join-Path $roaming 'ai.arbrain.app\logs'
if (Test-Path $logs) {
  New-Item -ItemType Directory -Force -Path (Join-Path $Salida 'logs-app') | Out-Null
  Get-ChildItem $logs -File | ForEach-Object { Copy-Item $_.FullName (Join-Path $Salida "logs-app\$($_.Name)") }
}
Get-ChildItem -Path $homeAlumno -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName.Substring($homeAlumno.Length) } |
  Set-Content (Join-Path $Salida 'archivos-perfil.txt') -Encoding utf8

# Ningún secreto en texto plano en disco.
Medir 'buscar_secretos' {
  $env:RECORRIDO_CANARIO_ANTHROPIC = $canA; $env:RECORRIDO_CANARIO_OPENROUTER = $canO
  & python -I (Join-Path $Aqui 'huella_secretos.py') --desde $desde --salida (Join-Path $Salida 'secretos.json') `
    $homeAlumno $dirApp ([System.IO.Path]::GetTempPath()) (Join-Path $realPerfil 'AppData') $env:ProgramData 2>&1 | ForEach-Object { Di "$_" }
  $script:codSecretos = $LASTEXITCODE
  Remove-Item Env:RECORRIDO_CANARIO_ANTHROPIC, Env:RECORRIDO_CANARIO_OPENROUTER -ErrorAction SilentlyContinue
}
if ($script:codSecretos -ne 0) { $script:Fallos += 'hay llaves en texto plano en disco (ver secretos.json)' }

# El llavero: entradas de Arbrain (solo los nombres; cmdkey no muestra valores).
$cred = @(cmdkey /list | Select-String -Pattern '(?i)Target:.*(arbrain|OPENROUTER_API_KEY|ANTHROPIC_API_KEY)' | ForEach-Object { $_.Line.Trim() })
$res.llavero_tras_recorrido = $cred
Di "Administrador de credenciales: $($cred -join ' | ')"

# Desinstalar en silencio.
$u = Join-Path $dirApp 'uninstall.exe'
Medir 'desinstalar' {
  if (Test-Path $u) {
    $p = Start-Process $u -ArgumentList '/S' -PassThru -Wait
    $script:codDesinstalar = $p.ExitCode
    $t0 = Get-Date
    while ((Test-Path $exe.FullName) -and ((Get-Date) - $t0).TotalSeconds -lt 120) { Start-Sleep -Seconds 1 }
  } else { $script:codDesinstalar = 'sin uninstall.exe' }
}
$restos = if (Test-Path $dirApp) { @(Get-ChildItem $dirApp -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 20 | ForEach-Object { $_.FullName }) } else { @() }
$reg = @(Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall' -ErrorAction SilentlyContinue |
  ForEach-Object { Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue } | Where-Object { $_.DisplayName -match '(?i)arbrain' } | ForEach-Object { $_.DisplayName })
$accesos = @(Get-ChildItem "$([Environment]::GetFolderPath('Programs'))", "$([Environment]::GetFolderPath('Desktop'))", "$env:ProgramData\Microsoft\Windows\Start Menu\Programs" -Recurse -Filter '*.lnk' -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match '(?i)arbrain' } | ForEach-Object { $_.FullName })
$credDespues = @(cmdkey /list | Select-String -Pattern '(?i)Target:.*(arbrain|OPENROUTER_API_KEY|ANTHROPIC_API_KEY)' | ForEach-Object { $_.Line.Trim() })
$res.desinstalar = [ordered]@{ codigo = $script:codDesinstalar; segundos = $script:Tiempos.desinstalar; exe_sigue = (Test-Path $exe.FullName);
  restos = $restos; registro = $reg; accesos_directos = $accesos; llavero_tras_desinstalar = $credDespues }
Di "desinstalar: código $($script:codDesinstalar) en $($script:Tiempos.desinstalar) s · exe sigue: $(Test-Path $exe.FullName) · restos: $($restos.Count) · registro: $($reg -join ',') · accesos: $($accesos.Count)"
if (Test-Path $exe.FullName) { $script:Fallos += 'la desinstalación dejó Arbrain.exe' }
if ($reg.Count) { $script:Fallos += "la desinstalación dejó la entrada de Programas: $($reg -join ', ')" }
if ($accesos.Count) { $script:Avisos += "accesos directos tras desinstalar: $($accesos -join ', ')" }
if ($credDespues.Count) { $script:Avisos += "el llavero conserva $($credDespues.Count) entrada(s) de Arbrain tras desinstalar (las llaves del alumno no se borran solas)" }

$res.tiempos = $script:Tiempos; $res.fallos = $script:Fallos; $res.avisos = $script:Avisos
$res | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $Salida 'recorrido-windows.json') -Encoding utf8
$script:Tiempos | ConvertTo-Json | Set-Content (Join-Path $Salida 'tiempos.json') -Encoding utf8
foreach ($a in $script:Avisos) { Di "aviso: $a" }
if ($script:Fallos.Count) { Di "RECORRIDO-WINDOWS FALLO: $($script:Fallos -join '; ')"; exit 1 }
Di 'RECORRIDO-WINDOWS OK'
exit 0
