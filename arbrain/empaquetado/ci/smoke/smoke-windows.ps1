# Smoke del instalador de Windows (carril F, empaquetado alumno, 11 oct 2026).
#
#   pwsh -File smoke-windows.ps1 -Artefacto <Arbrain_x64-setup.exe | Arbrain_x64.msi> [-Salida carpeta] [-OcultarNode]
#
# Instala en silencio (NSIS /S o msiexec /qn), lanza la app con perfil temporal (USERPROFILE/HOME) y SIN Node en el PATH
# (con -OcultarNode, en el runner desechable, además renombra los node.exe del sistema), espera a que levante su Next y
# su daemon, descubre sus puertos (archivo de estado del contrato si existe; si no, los sockets en escucha del árbol de
# procesos de la app) y comprueba daemon y Next según el contrato: v2 (secretos en memoria) = daemon GET /vivo 200 y
# /health 401 sin token, Next /api/version 200 y / sin la entrada → /sin-sesion 200 (o 401/403); v1 (secretos en
# archivo) = /health 200 con token y página inicial 200. Comprueba que nada escucha fuera de localhost y captura. Imprime «SMOKE OK» o «SMOKE FALLO: <motivo>» y sale 0 o 1.
#
# Nota: Tauri resuelve app_data_dir con SHGetKnownFolderPath (dirs-sys, sin KF_FLAG_CREATE), y Windows expande
# «%USERPROFILE%\AppData\Roaming» con el entorno del proceso. Un USERPROFILE temporal VACÍO hace fallar esa llamada y la
# app muere con «unknown path» (run 38258158079, 12 oct). Por eso el perfil temporal se crea con AppData\Roaming y
# AppData\Local (como un perfil real) y APPDATA/LOCALAPPDATA apuntan ahí: datos de la app, daemon y Next quedan aislados.
param(
  [Parameter(Mandatory = $true)][string]$Artefacto,
  [string]$Salida = (Join-Path (Get-Location) 'smoke-salida'),
  [int]$Espera = 180,
  [switch]$OcultarNode,
  [string]$DaemonToken = $env:SMOKE_DAEMON_TOKEN,
  [switch]$Aceptar401
)
$ErrorActionPreference = 'Continue'
# Solo en Windows desechable (runner de CI o VM): instala, renombra node.exe y toma capturas de pantalla.
if (-not $IsWindows -and $PSVersionTable.PSEdition -eq 'Core') { Write-Host 'smoke-windows.ps1 solo corre en Windows (runner o VM).'; exit 2 }
New-Item -ItemType Directory -Force -Path $Salida | Out-Null
$Salida = (Resolve-Path $Salida).Path
$Reporte = Join-Path $Salida 'reporte.txt'
Set-Content -Path $Reporte -Value '' -Encoding utf8
$script:Ocultos = @()
$script:ProcApp = $null

function Di([string]$t) { Write-Host $t; Add-Content -Path $Reporte -Value $t -Encoding utf8 }

function Captura([string]$nombre) {
  try {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    $b = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
    $ruta = Join-Path $Salida "captura-$nombre.png"
    $bmp.Save($ruta, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    Di "captura: $ruta ($($b.Width)x$($b.Height))"
  } catch { Di "aviso: no se pudo capturar la pantalla: $($_.Exception.Message)" }
}

function Arbol([int]$raiz) {
  $todos = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name
  $set = New-Object System.Collections.Generic.HashSet[int]
  [void]$set.Add($raiz)
  do {
    $antes = $set.Count
    foreach ($p in $todos) { if ($set.Contains([int]$p.ParentProcessId)) { [void]$set.Add([int]$p.ProcessId) } }
  } while ($set.Count -ne $antes)
  return $todos | Where-Object { $set.Contains([int]$_.ProcessId) }
}

function Escuchas([int]$raiz) {
  $pids = (Arbol $raiz).ProcessId
  if (-not $pids) { return @() }
  Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $pids -contains $_.OwningProcess } |
    Select-Object LocalAddress, LocalPort, OwningProcess -Unique
}

function Http([string]$url, [string]$token, [switch]$Seguir, [string]$Archivo, [string]$Galletas) {
  $a = @('-s', '-m', '10', '-w', "`n%{http_code} %{url_effective}")
  if ($token) { $a += @('-H', "Authorization: Bearer $token") }
  if ($Seguir) { $a += '-L' }
  if ($Archivo) { $a += @('-o', $Archivo) }
  if ($Galletas) { $a += @('-c', $Galletas, '-b', $Galletas) }
  $out = & curl.exe @a $url 2>$null
  $txt = ($out -join "`n")
  $ultima = ($txt -split "`n")[-1]
  $partes = $ultima -split ' ', 2
  return [pscustomobject]@{ Codigo = $partes[0]; Final = $partes[1]; Cuerpo = ($txt.Substring(0, [Math]::Max(0, $txt.Length - $ultima.Length)).Trim()) }
}

function Limpiar {
  if ($script:ProcApp) {
    foreach ($p in (Arbol $script:ProcApp.Id)) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
  }
  foreach ($n in $script:Ocultos) { Rename-Item -Path "$n.oculto-smoke" -NewName (Split-Path $n -Leaf) -ErrorAction SilentlyContinue }
}

# Logs de la app (<app_data_dir>\logs: daemon.log), para diagnosticar sin volver a correr. Solo .log.
function RecogerLogs {
  foreach ($b in @($env:APPDATA, $env:LOCALAPPDATA)) {
    $d = Join-Path $b 'ai.arbrain.app\logs'
    if (Test-Path $d) {
      $dest = Join-Path $Salida 'logs-app'
      New-Item -ItemType Directory -Force -Path $dest | Out-Null
      Get-ChildItem -Path $d -Filter '*.log' -File -ErrorAction SilentlyContinue | ForEach-Object {
        Copy-Item $_.FullName (Join-Path $dest $_.Name) -ErrorAction SilentlyContinue; Di "log de la app: logs-app\$($_.Name)"
      }
    }
  }
}

# Diagnóstico: el daemon instalado lanzado a mano con el Node embebido y el contrato mínimo (sin llaves), 15 s.
# Su stdout/stderr dice por qué no arranca aunque el daemon.log de la app esté vacío.
function ProbarDaemonAMano {
  $dir = $exe.DirectoryName
  $js = Join-Path $dir 'daemon\dist\index.js'
  $node = Join-Path $dir 'arbrain-node.exe'
  if (-not (Test-Path $js)) { Di "diagnóstico: no existe $js"; return }
  $datos = Join-Path $homeAlumno 'daemon-a-mano'
  New-Item -ItemType Directory -Force -Path $datos | Out-Null
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $node; $psi.Arguments = "`"$js`""; $psi.WorkingDirectory = $datos
  $psi.UseShellExecute = $false; $psi.RedirectStandardInput = $true; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
  $e = $psi.Environment
  $e['ARBRAIN_EDICION'] = 'cliente'; $e['ARBRAIN_DATA_DIR'] = $datos; $e['MC_SERVER_PORT'] = '51999'
  $e['MISSION_CONTROL_ORIGIN'] = 'http://127.0.0.1:51998'; $e['ARBRAIN_SECRETOS'] = 'stdin'; $e['NODE_ENV'] = 'production'
  $e['ARBRAIN_VIGILAR_STDIN'] = '1'
  $pr = [System.Diagnostics.Process]::Start($psi)
  $pr.StandardInput.WriteLine('{"OPENCLAW_GATEWAY_TOKEN":"' + ('a' * 64) + '"}'); $pr.StandardInput.Flush()
  $o = $pr.StandardOutput.ReadToEndAsync(); $r = $pr.StandardError.ReadToEndAsync()
  $salio = $pr.WaitForExit(15000)
  $v = Http 'http://127.0.0.1:51999/vivo' ''
  if (-not $salio) {
    Di "diagnóstico: el daemon a mano sigue vivo a los 15 s (/vivo $($v.Codigo))"
    try { $pr.StandardInput.Close() } catch {}
    if (-not $pr.WaitForExit(5000)) { $pr.Kill() }
  } else { Di "diagnóstico: el daemon a mano salió con código $($pr.ExitCode)" }
  [void]$pr.WaitForExit(3000)
  Set-Content -Path (Join-Path $Salida 'daemon-a-mano.log') -Value ("--- stdout`n" + $o.Result + "`n--- stderr`n" + $r.Result) -Encoding utf8
  Di 'diagnóstico: últimas líneas del daemon a mano (stdout y stderr):'
  (($o.Result + "`n" + $r.Result) -split "`n" | Where-Object { $_.Trim() } | Select-Object -Last 30) | ForEach-Object { Di "  | $_" }
}

function Fallo([string]$motivo) {
  Captura 'fallo'
  RecogerLogs
  Di ''
  Di "SMOKE FALLO: $motivo"
  Limpiar
  exit 1
}

$Artefacto = (Resolve-Path $Artefacto).Path
Di "== Smoke Windows: $(Split-Path $Artefacto -Leaf) ($([System.Environment]::OSVersion.VersionString), $env:PROCESSOR_ARCHITECTURE)"

# 1. Instalar en silencio.
$antes = Get-Date
if ($Artefacto -like '*.msi') {
  $log = Join-Path $Salida 'msi-install.log'
  $p = Start-Process msiexec.exe -ArgumentList @('/i', "`"$Artefacto`"", '/qn', '/norestart', '/l*v', "`"$log`"") -Wait -PassThru
  if ($p.ExitCode -ne 0) { Fallo "msiexec salió con $($p.ExitCode) (ver msi-install.log)" }
} else {
  $p = Start-Process $Artefacto -ArgumentList '/S' -Wait -PassThru
  if ($p.ExitCode -ne 0) { Fallo "el instalador NSIS salió con $($p.ExitCode)" }
}
Di "instalado en $([int]((Get-Date) - $antes).TotalSeconds) s"

# 2. Encontrar el ejecutable instalado (NSIS por usuario: %LOCALAPPDATA%\<producto>; MSI: Program Files\<producto>).
# El binario principal es Arbrain.exe (tauri.windows.conf.json: mainBinaryName). Junto a él viaja el sidecar de Node
# (bundle.externalBin → arbrain-node.exe): por orden alfabético sale primero, y lanzarlo abre un REPL de Node y no la app
# (run 38253469743, 12 oct). Por eso se busca Arbrain.exe por nombre y se excluye siempre el sidecar.
$raices = @("$env:LOCALAPPDATA\Arbrain", "$env:LOCALAPPDATA\Programs\Arbrain", "$env:ProgramFiles\Arbrain", "${env:ProgramFiles(x86)}\Arbrain")
$noApp = '(?i)uninstall|unins|updater|^arbrain-node'
$exe = $null
foreach ($r in $raices) {
  if (Test-Path $r) {
    $exe = Get-ChildItem -Path $r -Filter 'Arbrain.exe' -File -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $exe) {
      $exe = Get-ChildItem -Path $r -Filter '*.exe' -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notmatch $noApp } | Select-Object -First 1
    }
    if ($exe) { break }
  }
}
if (-not $exe) {
  $exe = Get-ChildItem -Path $env:LOCALAPPDATA, $env:ProgramFiles -Recurse -Depth 3 -Filter '*.exe' -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -gt $antes.AddMinutes(-1) -and $_.Name -notmatch $noApp } | Select-Object -First 1
}
if (-not $exe) { Fallo 'no encuentro el ejecutable instalado' }
Di "ejecutable: $($exe.FullName)"
Get-ChildItem -Path $exe.DirectoryName -Filter '*.exe' -File -ErrorAction SilentlyContinue | ForEach-Object { Di "  exe instalado: $($_.Name)" }
Get-ChildItem -Path $exe.DirectoryName -Recurse -File -ErrorAction SilentlyContinue |
  Measure-Object -Property Length -Sum | ForEach-Object { Di ("instalación: {0} archivos, {1:N0} MB" -f $_.Count, ($_.Sum / 1MB)) }

# 3. Sin Node: renombrar los node.exe del sistema (solo -OcultarNode) y quitar del PATH las carpetas que lo tengan.
$dirs = $env:PATH -split ';' | Where-Object { $_ }
if ($OcultarNode) {
  foreach ($d in $dirs + @("$env:ProgramFiles\nodejs")) {
    $n = Join-Path $d 'node.exe'
    if (Test-Path $n) {
      try { Rename-Item -Path $n -NewName 'node.exe.oculto-smoke' -ErrorAction Stop; $script:Ocultos += $n; Di "node del sistema oculto: $n" }
      catch { Di "aviso: no pude ocultar $n ($($_.Exception.Message))" }
    }
  }
}
$env:PATH = ($dirs | Where-Object { -not (Test-Path (Join-Path $_ 'node.exe')) }) -join ';'
if (Get-Command node -ErrorAction SilentlyContinue) { Fallo "sigue habiendo node en el PATH: $((Get-Command node).Source)" }
Di 'Node fuera del PATH: ok'

# 4. Perfil temporal para Node (os.homedir usa USERPROFILE).
$homeAlumno = Join-Path ([System.IO.Path]::GetTempPath()) ("arbrain-alumno-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$roaming = Join-Path $homeAlumno 'AppData\Roaming'; $local = Join-Path $homeAlumno 'AppData\Local'
New-Item -ItemType Directory -Force -Path $homeAlumno, $roaming, $local | Out-Null
$env:USERPROFILE = $homeAlumno; $env:HOME = $homeAlumno; $env:APPDATA = $roaming; $env:LOCALAPPDATA = $local
Di "USERPROFILE/HOME temporal: $homeAlumno (APPDATA y LOCALAPPDATA dentro)"

# 5. Lanzar.
$script:ProcApp = Start-Process -FilePath $exe.FullName -WorkingDirectory $exe.DirectoryName -PassThru `
  -RedirectStandardOutput (Join-Path $Salida 'app.out.log') -RedirectStandardError (Join-Path $Salida 'app.err.log')
Di "app lanzada (pid $($script:ProcApp.Id))"

# 6. Descubrir puertos: archivo de estado del contrato si existe, si no los sockets del árbol de procesos.
function LeerEstado {
  $bases = @($env:APPDATA, $env:LOCALAPPDATA, $homeAlumno, (Join-Path $homeAlumno '.config'))
  foreach ($b in $bases) {
    if (-not (Test-Path $b)) { continue }
    $archivos = Get-ChildItem -Path $b -Recurse -Depth 3 -File -Include 'daemon*.json', 'estado*.json' -ErrorAction SilentlyContinue |
      Where-Object { $_.LastWriteTime -gt $antes }
    foreach ($f in $archivos) {
      try { $j = Get-Content $f.FullName -Raw | ConvertFrom-Json } catch { continue }
      $plano = @{}
      function Recorrer($x, $pre) {
        if ($x -is [System.Management.Automation.PSCustomObject]) { foreach ($pr in $x.PSObject.Properties) { Recorrer $pr.Value "$pre$($pr.Name.ToLower())." } }
        else { $plano[$pre.TrimEnd('.')] = $x }
      }
      Recorrer $j ''
      $puerto = $plano.GetEnumerator() | Where-Object { $_.Key -match '(daemon|claudeclaw|servidor).*(port|puerto)|^(port|puerto)$' -and "$($_.Value)" -match '^\d+$' } | Select-Object -First 1
      $url = $plano.GetEnumerator() | Where-Object { $_.Key -match '(daemon|claudeclaw).*url|^url$' -and $_.Value -is [string] } | Select-Object -First 1
      $tok = $plano.GetEnumerator() | Where-Object { $_.Key -match 'token' -and $_.Value -is [string] } | Select-Object -First 1
      $p = if ($puerto) { [int]$puerto.Value } elseif ($url -and $url.Value -match ':(\d+)') { [int]$Matches[1] } else { $null }
      if ($p) { return [pscustomobject]@{ Archivo = $f.FullName; Puerto = $p; Token = $(if ($tok) { $tok.Value } else { '' }) } }
    }
  }
  return $null
}

$daemon = $null; $web = $null; $daemon401 = $null; $estado = $null; $webSinInicio = $null; $daemonRaro = $null; $daemonDesc = $null; $webDesc = $null
$secreto = $env:SMOKE_DESKTOP_SECRET
$t0 = Get-Date
while (((Get-Date) - $t0).TotalSeconds -lt $Espera) {
  if ($script:ProcApp.HasExited -and -not (Arbol $script:ProcApp.Id | Select-Object -Skip 1)) {
    Fallo "la app terminó sola a los $([int]((Get-Date) - $t0).TotalSeconds) s con código $($script:ProcApp.ExitCode)"
  }
  # v1: token por instalación en app_config_dir\daemon-token. En v2 no existe (por apertura, en memoria).
  if (-not $DaemonToken) {
    $ft = Get-ChildItem -Path $env:APPDATA, $env:LOCALAPPDATA, $homeAlumno -Recurse -Depth 3 -File -Filter 'daemon-token' -ErrorAction SilentlyContinue |
      Where-Object { $_.LastWriteTime -gt $antes } | Select-Object -First 1
    if ($ft) { $DaemonToken = (Get-Content $ft.FullName -Raw).Trim(); Di "token del daemon: leído de $($ft.FullName) ($($DaemonToken.Length) caracteres)" }
  }
  if (-not $estado) {
    $estado = LeerEstado
    if ($estado) { Di "archivo de estado: $($estado.Archivo) (puerto $($estado.Puerto))"; if (-not $DaemonToken) { $DaemonToken = $estado.Token } }
  }
  $puertos = @((Escuchas $script:ProcApp.Id).LocalPort) + @($(if ($estado) { $estado.Puerto })) | Where-Object { $_ } | Sort-Object -Unique
  foreach ($pt in $puertos) {
    if ($pt -eq $daemon -or $pt -eq $web) { continue }
    # Daemon. Contrato v2: GET /vivo = 200 sin credencial y /health sin token = 401 (los tokens viven en memoria de la
    # app y van por stdin: no hay archivo que leer). v1: /health 200 con el token del archivo daemon-token.
    $v = Http "http://127.0.0.1:$pt/vivo" ''
    $h = Http "http://127.0.0.1:$pt/health" $DaemonToken
    if ($v.Codigo -eq '200' -and $v.Cuerpo -match '"ok":\s*true') {
      if ($h.Codigo -eq '200' -and $h.Cuerpo -match '"ok"') { $daemon = $pt; $daemonDesc = '/vivo 200, /health 200 con token'; Di "daemon en :$pt → /vivo $($v.Cuerpo) · /health 200 $($h.Cuerpo)" }
      elseif ($h.Codigo -eq '401' -and -not $DaemonToken) { $daemon = $pt; $daemonDesc = '/vivo 200, /health 401 sin token (contrato ≥ v2)'; Di "daemon en :$pt → /vivo 200 $($v.Cuerpo) · /health sin token 401 (protegido; contrato ≥ v2)" }
      else { $daemonRaro = "$pt (/vivo 200 pero /health $($h.Codigo))" }
      continue
    }
    if ($h.Codigo -eq '200' -and $h.Cuerpo -match '"ok"') { $daemon = $pt; $daemon401 = $null; $daemonDesc = '/health 200 (contrato v1)'; Di "daemon en :$pt → /health 200 $($h.Cuerpo)"; continue }
    if ($h.Codigo -eq '401' -and $h.Cuerpo -match '(?i)unauthorized') { $daemon401 = $pt; continue }
    $html = Join-Path $Salida 'inicio.html'
    # Next: /api/version da 200 sin sesión. v1: la página inicial se pide como la app (/api/desktop/sesion con el secreto
    # del archivo desktop-secret) = 200 con HTML. v2 (secreto en memoria): sin la entrada, / lleva a /sin-sesion (200 con
    # HTML) o niega con 401/403: servidor arriba y puerta cerrada.
    if ((Http "http://127.0.0.1:$pt/api/version" '').Codigo -ne '200') { continue }
    if (-not $secreto) {
      $fs = Get-ChildItem -Path $env:APPDATA, $env:LOCALAPPDATA, $homeAlumno -Recurse -Depth 3 -File -Filter 'desktop-secret' -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -gt $antes } | Select-Object -First 1
      if ($fs) { $secreto = (Get-Content $fs.FullName -Raw).Trim() }
    }
    $url = if ($secreto) { "http://127.0.0.1:$pt/api/desktop/sesion?t=$secreto&a=/" } else { "http://127.0.0.1:$pt/" }
    $w = Http $url '' -Seguir -Archivo $html -Galletas (Join-Path $Salida 'galletas.txt')
    $conHtml = (Test-Path $html) -and ((Get-Content $html -Raw) -match '(?i)<html')
    if ($secreto -and $w.Codigo -eq '200' -and $conHtml) {
      $web = $pt; $webDesc = 'página inicial 200 con la entrada de la app'; Di "Next en :$pt → página inicial 200 (final $($w.Final); con la entrada de la app)"
    } elseif (-not $secreto -and (($w.Codigo -eq '200' -and $conHtml) -or $w.Codigo -in @('401', '403'))) {
      $web = $pt; $webDesc = "/api/version 200, / sin la entrada de la app → $($w.Codigo) $($w.Final)"
      Di "Next en :$pt → /api/version 200 · / sin la entrada de la app → $($w.Codigo) en $($w.Final) (contrato ≥ v2)"
    } else { $webSinInicio = "$pt ($($w.Codigo) en $($w.Final); $(if ($secreto) { 'con secreto' } else { 'sin desktop-secret' }))" }
  }
  if ($daemon -and $web) { break }
  Start-Sleep -Seconds 2
}

$arbol = Arbol $script:ProcApp.Id
Di "procesos de la app: $(($arbol | ForEach-Object { "$($_.Name)#$($_.ProcessId)" }) -join ' ')"
$esc = Escuchas $script:ProcApp.Id
Di 'sockets en escucha de la app:'
foreach ($e in $esc) { Di "  $($e.LocalAddress):$($e.LocalPort) (pid $($e.OwningProcess))" }
$fuera = $esc | Where-Object { $_.LocalAddress -notin @('127.0.0.1', '::1') }
if ($fuera) { Fallo "la app escucha fuera de localhost: $(($fuera | ForEach-Object { "$($_.LocalAddress):$($_.LocalPort)" }) -join ' ')" }

# Ventana al frente y captura.
try {
  Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int c);'
  foreach ($p in $arbol) {
    $gp = Get-Process -Id $p.ProcessId -ErrorAction SilentlyContinue
    if ($gp -and $gp.MainWindowHandle -ne 0) { [void][W.U]::ShowWindow($gp.MainWindowHandle, 3); [void][W.U]::SetForegroundWindow($gp.MainWindowHandle); Di "ventana: '$($gp.MainWindowTitle)' (pid $($gp.Id))" }
  }
} catch { Di "aviso: no pude traer la ventana al frente: $($_.Exception.Message)" }
Start-Sleep -Seconds 5
Captura 'ventana'

if (-not $web) {
  if ($webSinInicio) { Fallo "Next contesta en :$webSinInicio pero la página inicial no dio 200" }
  Fallo "Next no contestó en ningún puerto de la app en $Espera s"
}
if (-not $daemon) {
  if ($daemon401) {
    $msg = "daemon en :$daemon401 da /health 401 y no responde /vivo (contrato v2) ni hay token (v1: daemon-token o SMOKE_DAEMON_TOKEN)"
    if ($Aceptar401 -or $env:SMOKE_ACEPTAR_401 -eq '1') { Di "aviso: $msg"; $daemon = "$daemon401 (401)" } else { Fallo $msg }
  } elseif ($daemonRaro) {
    Fallo "daemon en :$daemonRaro"
  } else {
    ProbarDaemonAMano
    Fallo "ningún proceso de la app responde /vivo ni /health en $Espera s (¿el daemon no viaja con la app o no arrancó?)"
  }
}

Di ''
Di "SMOKE OK (windows: daemon :$daemon $(if ($daemonDesc) { $daemonDesc } else { '/health 401 aceptado' }); Next :$web $webDesc; sin node en PATH)"
Limpiar
exit 0
