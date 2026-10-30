# «Ventana de la persona»: su trabajo, al frente. Las manos nunca deben escribir aquí ni quitarle el frente.
# Todo lo que entre a su campo queda en <dir>\persona.txt (la prueba exige que quede vacío).
param([string]$Dir = 'C:\manos-e2e')
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
New-Item -ItemType Directory -Force $Dir | Out-Null
Set-Content -Path "$Dir\persona.txt" -Value '' -NoNewline
$f = New-Object Windows.Forms.Form
$f.Text = 'Ventana de la persona'; $f.Width = 360; $f.Height = 200; $f.StartPosition = 'Manual'; $f.Left = 640; $f.Top = 520
$t = New-Object Windows.Forms.TextBox; $t.Multiline = $true; $t.Dock = 'Fill'; $t.AccessibleName = 'Notas de la persona'
$t.Add_TextChanged({ Set-Content -Path "$Dir\persona.txt" -Value $t.Text -NoNewline })
$f.Controls.Add($t)
# Windows de escritorio trae ForegroundLockTimeout = 200000 ms (una app de fondo no puede quitarle el frente a la
# persona). Algunas imágenes de servidor lo traen en 0. Lo registra y, si está en 0, pone el valor de escritorio:
# lo hace esta ventana porque solo el proceso al frente puede cambiarlo.
Add-Type -Namespace W -Name SPI -MemberDefinition '[DllImport("user32.dll")] public static extern bool SystemParametersInfo(uint a, uint b, ref uint c, uint d); [DllImport("user32.dll")] public static extern bool SystemParametersInfo(uint a, uint b, System.IntPtr c, uint d); [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte sc, uint f, System.UIntPtr x); [DllImport("user32.dll")] public static extern bool LockSetForegroundWindow(uint u);'
$f.Add_Shown({
  $f.Activate(); $t.Focus()
  # La persona toca su teclado (Mayús, sin escribir nada): en un escritorio real el último input es de la persona y con eso
  # Windows impide que otra app le quite el frente. Una sesión de CI nunca tuvo input y ahí cualquiera se activa.
  [W.SPI]::keybd_event(0x10, 0, 0, [System.UIntPtr]::Zero); [W.SPI]::keybd_event(0x10, 0, 2, [System.UIntPtr]::Zero)
  # El input inyectado no cuenta como humano para el bloqueo de foreground (corrida 3): la ventana al frente lo pide
  # explícitamente, que es el estado de un escritorio con la persona trabajando. Se anota en el entorno de la prueba.
  $lock = [W.SPI]::LockSetForegroundWindow(1)
  [uint32]$v = 0; [void][W.SPI]::SystemParametersInfo(0x2000, 0, [ref]$v, 0)
  $ajuste = 'sin cambio'
  if ($v -eq 0) { $ok = [W.SPI]::SystemParametersInfo(0x2001, 0, [System.IntPtr]200000, 2); [uint32]$v2 = 0; [void][W.SPI]::SystemParametersInfo(0x2000, 0, [ref]$v2, 0); $ajuste = "puesto a $v2 (ok=$ok)" }
  Set-Content -Path "$Dir\foreground-lock.txt" -Value "ForegroundLockTimeout inicial=$v; $ajuste; LockSetForegroundWindow=$lock" -NoNewline
})
[Windows.Forms.Application]::Run($f)
