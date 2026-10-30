# «Arbrain · prueba de freno»: un chat de juguete. «Enviar» escribe <dir>\enviado.txt (la prueba lo vigila) y una
# lista larga para el scroll. Se abre sin activarse: no le quita el frente a la ventana de la persona.
param([string]$Dir = 'C:\manos-e2e')
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
New-Item -ItemType Directory -Force $Dir | Out-Null
Remove-Item "$Dir\enviado.txt" -ErrorAction SilentlyContinue
$f = New-Object Windows.Forms.Form
$f.Text = 'Arbrain · prueba de freno'; $f.Width = 420; $f.Height = 480; $f.StartPosition = 'Manual'; $f.Left = 560; $f.Top = 10
$l = New-Object Windows.Forms.ListBox; $l.AccessibleName = 'Lista de prueba'; $l.Left = 10; $l.Top = 10; $l.Width = 380; $l.Height = 300
1..300 | ForEach-Object { [void]$l.Items.Add("Elemento $_") }
$t = New-Object Windows.Forms.TextBox; $t.AccessibleName = 'Escribe un mensaje'; $t.Left = 10; $t.Top = 330; $t.Width = 280
$b = New-Object Windows.Forms.Button; $b.Text = 'Enviar'; $b.Left = 300; $b.Top = 328; $b.Width = 90
$e = New-Object Windows.Forms.Label; $e.Left = 10; $e.Top = 370; $e.Width = 380; $e.Text = 'Sin enviar'; $e.AccessibleName = 'Estado'
$b.Add_Click({ Set-Content -Path "$Dir\enviado.txt" -Value $t.Text -NoNewline; $e.Text = "Enviado: $($t.Text)" })
$f.Controls.AddRange(@($l, $t, $b, $e))
$f.ShowInTaskbar = $true
[Windows.Forms.Application]::Run($f)
