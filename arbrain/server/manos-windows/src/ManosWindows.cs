// ManosWindows: las manos de Arbrain en Windows (adaptador `windows`, arbrain/server/src/manos/adaptadores/windows.ts).
//
// Mismo papel que ArbrainManos.app en macOS: lee el árbol de accesibilidad y actúa por referencia SIN mover el cursor
// ni robar el foco. Habla JSON por líneas por stdin/stdout: {id, op, ...} → {id, ok, r | error, ms}.
//
// Cómo actúa, en orden (lo primero que funcione, sin tocar el ratón ni el teclado de la persona):
//   1. Patrones UIA (Invoke, Toggle, SelectionItem, ExpandCollapse, Value, RangeValue, Scroll, LegacyIAccessible).
//   2. Mensajes a la ventana (EM_REPLACESEL, WM_CHAR, WM_KEYDOWN, WM_COMMAND del menú, WM_VSCROLL, WM_CLOSE).
//   3. Solo con `primer_plano` o `via: hid` (permiso que pone la capa TS): la ventana al frente y SendInput.
//
// UIA3 (COM) con el interop que GenerarInterop.cs saca del typelib de Windows: cero descargas, cero SDK.
// C# 5 a propósito: lo compila el csc.exe que trae .NET Framework 4.x en todo Windows 10/11.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Interop.UIAutomationClient;

static class W32 {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr p, EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool f);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, string l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, StringBuilder l);
  [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr h, uint m, IntPtr w, IntPtr l, uint flags, uint ms, out IntPtr res);
  [DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint tid, ref GUITHREADINFO gi);
  [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO li);
  [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint c, uint t);
  [DllImport("user32.dll")] public static extern IntPtr GetMenu(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetMenuItemCount(IntPtr m);
  [DllImport("user32.dll")] public static extern IntPtr GetSubMenu(IntPtr m, int pos);
  [DllImport("user32.dll")] public static extern uint GetMenuItemID(IntPtr m, int pos);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetMenuString(IntPtr m, uint id, StringBuilder s, int n, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr h, int id);
  [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetScrollInfo(IntPtr h, int bar, ref SCROLLINFO si);
  [StructLayout(LayoutKind.Sequential)] public struct SCROLLINFO { public uint cbSize, fMask; public int nMin, nMax; public uint nPage; public int nPos, nTrackPos; }
  [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] public static extern bool ScreenToClient(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] public static extern uint SendInput(uint n, INPUT[] i, int size);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint f);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint f);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint f);
  [DllImport("shell32.dll", CharSet = CharSet.Unicode)] public static extern bool ShellExecuteEx(ref SHELLEXECUTEINFO i);
  [DllImport("kernel32.dll")] public static extern uint GetProcessId(IntPtr h);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll")] public static extern uint GetTickCount();

  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [StructLayout(LayoutKind.Sequential)] public struct GUITHREADINFO { public int cbSize, flags; public IntPtr hwndActive, hwndFocus, hwndCapture, hwndMenuOwner, hwndMoveSize, hwndCaret; public RECT rcCaret; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct SHELLEXECUTEINFO {
    public int cbSize; public uint fMask; public IntPtr hwnd; public string lpVerb; public string lpFile; public string lpParameters; public string lpDirectory;
    public int nShow; public IntPtr hInstApp; public IntPtr lpIDList; public string lpClass; public IntPtr hkeyClass; public uint dwHotKey; public IntPtr hIcon; public IntPtr hProcess;
  }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] public struct INPUTU { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public INPUTU u; }

  public const uint WM_CLOSE = 0x10, WM_SETTEXT = 0x0C, WM_GETTEXT = 0x0D, WM_GETTEXTLENGTH = 0x0E, WM_KEYDOWN = 0x100, WM_KEYUP = 0x101, WM_CHAR = 0x102;
  public const uint WM_SYSKEYDOWN = 0x104, WM_SYSKEYUP = 0x105, WM_COMMAND = 0x111, WM_VSCROLL = 0x115, WM_HSCROLL = 0x114, WM_MOUSEWHEEL = 0x20A;
  public const uint WM_LBUTTONDOWN = 0x201, WM_LBUTTONUP = 0x202, WM_UNDO = 0x304, WM_CUT = 0x300, WM_COPY = 0x301, WM_PASTE = 0x302;
  public const uint EM_SETSEL = 0xB1, EM_REPLACESEL = 0xC2, DM_GETDEFID = 0x400, BM_CLICK = 0xF5;
  public const int GWL_STYLE = -16, GWL_EXSTYLE = -20;
  public const int WS_EX_TOOLWINDOW = 0x80, WS_EX_NOACTIVATE = 0x08000000, WS_EX_TOPMOST = 0x8;

  public static string Texto(IntPtr h) { var s = new StringBuilder(512); GetWindowText(h, s, 512); return s.ToString(); }
  public static string Clase(IntPtr h) { var s = new StringBuilder(256); GetClassName(h, s, 256); return s.ToString(); }
  public static uint Pid(IntPtr h) { uint p; GetWindowThreadProcessId(h, out p); return p; }
}

/** El Halo: cursor de Levy. Ventana que no se activa ni recibe clics, justo encima de la ventana de trabajo (no siempre-encima). */
class Halo : Form {
  static Halo yo;
  static readonly object cerrojo = new object();
  public static bool Encendido = Environment.GetEnvironmentVariable("MANOS_HALO") != "0";
  Point desde, hacia; DateTime t0; int durMs; IntPtr sobre; DateTime ultimo = DateTime.Now;
  System.Windows.Forms.Timer reloj;

  public static void Arrancar() {
    if (!Encendido) return;
    var t = new Thread(delegate () {
      var h = new Halo();
      lock (cerrojo) yo = h;
      Application.Run(h);
    });
    t.IsBackground = true; t.SetApartmentState(ApartmentState.STA); t.Start();
  }

  Halo() {
    FormBorderStyle = FormBorderStyle.None; ShowInTaskbar = false; StartPosition = FormStartPosition.Manual;
    Size = new Size(30, 30); BackColor = Color.FromArgb(124, 58, 237); TransparencyKey = Color.Magenta; Opacity = 0.85;
    var p = new System.Drawing.Drawing2D.GraphicsPath(); p.AddEllipse(0, 0, 30, 30); Region = new Region(p);
    Location = new Point(-100, -100);
    reloj = new System.Windows.Forms.Timer(); reloj.Interval = 16; reloj.Tick += Paso; reloj.Start();
  }
  protected override bool ShowWithoutActivation { get { return true; } }
  protected override CreateParams CreateParams {
    get { var c = base.CreateParams; c.ExStyle |= 0x80000 /*LAYERED*/ | 0x20 /*TRANSPARENT*/ | W32.WS_EX_TOOLWINDOW | W32.WS_EX_NOACTIVATE; return c; }
  }

  /** Encola un destino; la acción nunca espera a la animación. */
  public static void Ir(int x, int y, IntPtr ventana) {
    Halo h; lock (cerrojo) h = yo;
    if (h == null || !h.IsHandleCreated) return;
    try {
      h.BeginInvoke((MethodInvoker)delegate {
        h.desde = h.Visible && h.Left > -50 ? new Point(h.Left + 15, h.Top + 15) : new Point(x - 80, y - 60);
        h.hacia = new Point(x, y); h.t0 = DateTime.Now; h.sobre = ventana; h.ultimo = DateTime.Now;
        double d = Math.Sqrt(Math.Pow(h.hacia.X - h.desde.X, 2) + Math.Pow(h.hacia.Y - h.desde.Y, 2));
        h.durMs = (int)Math.Max(250, Math.Min(600, 150 + 90 * Math.Log(1 + d / 15, 2)));
        if (!h.Visible) h.Show();
      });
    } catch { }
  }
  public static void Esconder() {
    Halo h; lock (cerrojo) h = yo;
    if (h == null || !h.IsHandleCreated) return;
    try { h.BeginInvoke((MethodInvoker)delegate { h.Hide(); }); } catch { }
  }

  void Paso(object s, EventArgs e) {
    if (!Visible) return;
    if ((DateTime.Now - ultimo).TotalSeconds > 4) { Hide(); return; }
    double t = Math.Min(1, (DateTime.Now - t0).TotalMilliseconds / Math.Max(1, durMs));
    double k = t < 0.5 ? 4 * t * t * t : 1 - Math.Pow(-2 * t + 2, 3) / 2;
    // Arco leve: el punto de control se separa de la recta un 12 % de la distancia.
    double mx = (desde.X + hacia.X) / 2.0 - (hacia.Y - desde.Y) * 0.12, my = (desde.Y + hacia.Y) / 2.0 + (hacia.X - desde.X) * 0.12;
    double x = (1 - k) * (1 - k) * desde.X + 2 * (1 - k) * k * mx + k * k * hacia.X;
    double y = (1 - k) * (1 - k) * desde.Y + 2 * (1 - k) * k * my + k * k * hacia.Y;
    // Justo encima de la ventana de trabajo: si la persona la tapa con la suya, el Halo queda debajo de su trabajo.
    IntPtr arriba = sobre != IntPtr.Zero ? W32.GetWindow(sobre, 3 /*GW_HWNDPREV*/) : IntPtr.Zero;
    if (arriba == Handle) arriba = W32.GetWindow(Handle, 3);
    W32.SetWindowPos(Handle, arriba == IntPtr.Zero ? IntPtr.Zero : arriba, (int)x - 15, (int)y - 15, 30, 30, 0x10 /*NOACTIVATE*/ | 0x40 /*SHOWWINDOW*/);
  }
}

class Manos {
  const string VERSION = "0.1.0";
  static CUIAutomation8 u;
  static readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue, RecursionLimit = 200 };

  // ---------- Ids de UIA ----------
  const int P_RUNTIME = 30000, P_RECT = 30001, P_PID = 30002, P_TIPO = 30003, P_NOMBRE = 30005, P_ATAJO = 30006, P_FOCO = 30008, P_HABIL = 30010, P_AUTOID = 30011, P_CLASE = 30012, P_AYUDA = 30013;
  const int P_PASSWORD = 30019, P_HWND = 30020, P_FUERA = 30022, P_EXPANDIBLE = 30028, P_INVOCABLE = 30031, P_RANGO = 30033, P_SCROLL = 30034, P_SCROLLITEM = 30035;
  const int P_SELITEM = 30036, P_TEXTO = 30040, P_TOGGLE = 30041, P_VALORABLE = 30043, P_VENTANA = 30044, P_VALOR = 30045, P_SOLOLECTURA = 30046, P_RANGOVALOR = 30047;
  const int P_SCROLLV = 30055, P_SCROLLH = 30053, P_ESTADO_EXP = 30070, P_MODAL = 30077, P_SELECCIONADO = 30079, P_TOGGLE_ESTADO = 30086, P_LEGACY = 30090, P_DEFECTO = 30100;
  const int PAT_INVOKE = 10000, PAT_VALOR = 10002, PAT_RANGO = 10003, PAT_SCROLL = 10004, PAT_EXPAND = 10005, PAT_VENTANA = 10009, PAT_SELITEM = 10010, PAT_TOGGLE = 10015, PAT_SCROLLITEM = 10017, PAT_LEGACY = 10018;

  static readonly Dictionary<int, string> ROLES = new Dictionary<int, string> {
    {50000,"AXButton"},{50001,"AXGroup"},{50002,"AXCheckBox"},{50003,"AXComboBox"},{50004,"AXTextField"},{50005,"AXLink"},{50006,"AXImage"},
    {50007,"AXRow"},{50008,"AXList"},{50009,"AXMenu"},{50010,"AXMenuBar"},{50011,"AXMenuItem"},{50012,"AXProgressIndicator"},{50013,"AXRadioButton"},
    {50014,"AXScrollBar"},{50015,"AXSlider"},{50016,"AXIncrementor"},{50017,"AXGroup"},{50018,"AXTabGroup"},{50019,"AXRadioButton"},{50020,"AXStaticText"},
    {50021,"AXToolbar"},{50022,"AXHelpTag"},{50023,"AXOutline"},{50024,"AXRow"},{50025,"AXGroup"},{50026,"AXGroup"},{50027,"AXValueIndicator"},
    {50028,"AXTable"},{50029,"AXRow"},{50030,"AXTextArea"},{50031,"AXMenuButton"},{50032,"AXWindow"},{50033,"AXGroup"},{50034,"AXGroup"},
    {50035,"AXButton"},{50036,"AXTable"},{50037,"AXGroup"},{50038,"AXSplitter"},{50039,"AXGroup"},{50040,"AXToolbar"},
  };
  /** Contenedores sin nombre que solo agregan ruido: no se imprimen y sus hijos suben un nivel. */
  static readonly HashSet<int> ESTRUCTURA = new HashSet<int> { 50025, 50026, 50033, 50037, 50039 };

  // ---------- Estado por ventana ----------
  class Nodo { public IUIAutomationElement el; public string rol, subrol, etiqueta, valor, autoid, clase; public int tipo, prof; public W32.RECT marco; public bool habil; public IntPtr hwnd; public List<string> acciones; }
  class EstadoVentana { public Dictionary<string, string> refPorId = new Dictionary<string, string>(); public Dictionary<string, Nodo> nodos = new Dictionary<string, Nodo>(); public int sig = 1; public Dictionary<string, string> lineas = new Dictionary<string, string>(); }
  static readonly Dictionary<long, EstadoVentana> estados = new Dictionary<long, EstadoVentana>();

  [STAThread]
  static void Main(string[] a) {
    // El trabajo de UIA va en un hilo MTA (las llamadas entre procesos no se bloquean con la cola de mensajes).
    var t = new Thread(Bucle); t.SetApartmentState(ApartmentState.MTA); t.Start(); t.Join();
  }

  static void Bucle() {
    try { W32.SetProcessDPIAware(); } catch { }
    u = new CUIAutomation8();
    Halo.Arrancar();
    var entrada = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
    var salida = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)); salida.AutoFlush = true;
    string linea;
    while ((linea = entrada.ReadLine()) != null) {
      if (linea.Trim().Length == 0) continue;
      var sw = Stopwatch.StartNew();
      object id = null; Dictionary<string, object> resp;
      try {
        var p = json.Deserialize<Dictionary<string, object>>(linea);
        id = p.ContainsKey("id") ? p["id"] : null;
        object r = Despachar(S(p, "op"), p);
        resp = new Dictionary<string, object> { { "id", id }, { "ok", true }, { "r", r } };
      } catch (Exception e) {
        var x = e is System.Reflection.TargetInvocationException && e.InnerException != null ? e.InnerException : e;
        resp = new Dictionary<string, object> { { "id", id }, { "ok", false }, { "error", x.Message } };
      }
      resp["ms"] = Math.Round(sw.Elapsed.TotalMilliseconds, 1);
      salida.WriteLine(json.Serialize(resp));
    }
    Environment.Exit(0);
  }

  static object Despachar(string op, Dictionary<string, object> p) {
    switch (op) {
      case "salud": return Salud();
      case "apps": return Apps();
      case "ventanas": return Ventanas(p);
      case "abrir": return Abrir(S(p, "app"), S(p, "argumentos"));
      case "observar": return Observar(p);
      case "actuar": return Actuar(p);
      case "verificar": return Verificar(p);
      case "contexto": return Contexto(p);
      case "pagina": return Pagina(p);
      case "medios": return Medios(p);
      case "mostrar": Mostrar(p); return new Dictionary<string, object> { { "ok", true } };
      case "abrir_url": return AbrirUrl(p);
      case "cursor": { W32.POINT c; W32.GetCursorPos(out c); return new Dictionary<string, object> { { "x", c.X }, { "y", c.Y } }; }
      case "inactividad": { var li = new W32.LASTINPUTINFO(); li.cbSize = (uint)Marshal.SizeOf(li); W32.GetLastInputInfo(ref li); return new Dictionary<string, object> { { "segundos", (W32.GetTickCount() - li.dwTime) / 1000.0 } }; }
      case "frente": { var h = W32.GetForegroundWindow(); return new Dictionary<string, object> { { "ventana", (long)h }, { "titulo", W32.Texto(h) }, { "pid", (long)W32.Pid(h) } }; }
      case "captura": return Captura(p);
      case "soltar": Halo.Esconder(); return new Dictionary<string, object>();
      default: throw new Exception("op desconocida: " + op);
    }
  }

  // ---------- Utilidades de pedido ----------
  static string S(Dictionary<string, object> p, string k) { object v; return p.TryGetValue(k, out v) && v != null ? Convert.ToString(v) : null; }
  static long L(Dictionary<string, object> p, string k) { object v; if (!p.TryGetValue(k, out v) || v == null) return 0; try { return Convert.ToInt64(v); } catch { return 0; } }
  static bool B(Dictionary<string, object> p, string k) { object v; return p.TryGetValue(k, out v) && v is bool && (bool)v; }

  static Dictionary<string, object> Salud() {
    bool elevado = new System.Security.Principal.WindowsPrincipal(System.Security.Principal.WindowsIdentity.GetCurrent()).IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator);
    var raiz = u.GetRootElement();
    return new Dictionary<string, object> {
      { "ok", raiz != null }, { "version", VERSION }, { "uia", "UIA3" }, { "sesion", Process.GetCurrentProcess().SessionId },
      { "escritorio_interactivo", Environment.UserInteractive }, { "elevado", elevado }, { "windows", VersionWindows() },
    };
  }

  static string VersionWindows() {
    const string k = @"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion";
    return Convert.ToString(Microsoft.Win32.Registry.GetValue(k, "ProductName", "Windows")) + " " + Convert.ToString(Microsoft.Win32.Registry.GetValue(k, "DisplayVersion", "")) + " (build " + Convert.ToString(Microsoft.Win32.Registry.GetValue(k, "CurrentBuild", "?")) + ")";
  }

  // ---------- Apps y ventanas ----------
  /** Ventanas de nivel superior que una persona llamaría «ventana» (visibles, con título o marco, no de herramienta). */
  static List<IntPtr> VentanasTop() {
    var l = new List<IntPtr>();
    W32.EnumWindows(delegate (IntPtr h, IntPtr x) {
      if (!W32.IsWindowVisible(h)) return true;
      int ex = W32.GetWindowLong(h, W32.GWL_EXSTYLE);
      if ((ex & W32.WS_EX_TOOLWINDOW) != 0) return true;
      if (W32.GetWindow(h, 4 /*GW_OWNER*/) != IntPtr.Zero && W32.Texto(h).Length == 0) return true;
      string c = W32.Clase(h);
      if (c == "Progman" || c == "Shell_TrayWnd" || c == "Shell_SecondaryTrayWnd" || c == "WorkerW") return true;
      W32.RECT r; W32.GetWindowRect(h, out r);
      if (r.Right - r.Left < 2 || r.Bottom - r.Top < 2) return true;
      l.Add(h); return true;
    }, IntPtr.Zero);
    return l;
  }

  /** Pid real de la app: las apps UWP viven dentro de ApplicationFrameHost; su contenido es de otro proceso. */
  static uint PidReal(IntPtr h) {
    uint pid = W32.Pid(h);
    if (W32.Clase(h) != "ApplicationFrameWindow") return pid;
    uint real = pid;
    W32.EnumChildWindows(h, delegate (IntPtr c, IntPtr x) { if (W32.Clase(c) == "Windows.UI.Core.CoreWindow") { real = W32.Pid(c); return false; } return true; }, IntPtr.Zero);
    return real;
  }

  static readonly Dictionary<uint, string[]> nombres = new Dictionary<uint, string[]>();
  /** [bundle, nombre]: bundle = ejecutable en minúsculas (notepad, msedge); nombre = el que ve la persona. */
  static string[] NombreDe(uint pid) {
    string[] n; if (nombres.TryGetValue(pid, out n)) return n;
    string exe = "pid" + pid, visible = null;
    try {
      var pr = Process.GetProcessById((int)pid); exe = pr.ProcessName.ToLowerInvariant();
      try { visible = pr.MainModule.FileVersionInfo.FileDescription; } catch { }
    } catch { }
    if (string.IsNullOrEmpty(visible)) visible = exe;
    n = new[] { exe, visible.Trim() }; nombres[pid] = n; return n;
  }

  static List<object> Apps() {
    var fg = PidReal(W32.GetForegroundWindow());
    var vistos = new HashSet<uint>(); var l = new List<object>();
    foreach (var h in VentanasTop()) {
      uint pid = PidReal(h); if (!vistos.Add(pid)) continue;
      var n = NombreDe(pid);
      l.Add(new Dictionary<string, object> { { "nombre", n[1] }, { "bundle", n[0] }, { "pid", (long)pid }, { "activa", pid == fg } });
    }
    return l;
  }

  static Dictionary<string, object> AVentana(IntPtr h, int z) {
    W32.RECT r; W32.GetWindowRect(h, out r); uint pid = PidReal(h);
    return new Dictionary<string, object> {
      { "id", (long)h }, { "pid", (long)pid }, { "app", NombreDe(pid)[1] }, { "titulo", W32.Texto(h) },
      { "marco", new Dictionary<string, object> { { "x", r.Left }, { "y", r.Top }, { "w", r.Right - r.Left }, { "h", r.Bottom - r.Top } } },
      { "en_pantalla", W32.IsWindowVisible(h) && !W32.IsIconic(h) }, { "z", z },
    };
  }

  static List<object> Ventanas(Dictionary<string, object> p) {
    long pid = L(p, "pid"); string app = S(p, "app");
    if (pid == 0 && !string.IsNullOrEmpty(app)) pid = PidDeApp(app, false);
    var top = VentanasTop(); var l = new List<object>();
    for (int i = 0; i < top.Count; i++) if (pid == 0 || PidReal(top[i]) == pid) l.Add(AVentana(top[i], top.Count - i));
    return l;
  }

  static readonly Dictionary<string, string[]> ALIAS = new Dictionary<string, string[]> {
    { "calc", new[] { "calc.exe", "calculator|calculadora|win32calc|calculatorapp" } },
    { "notepad", new[] { "notepad.exe", "notepad|bloc de notas|bloc" } },
    { "explorer", new[] { "explorer.exe", "explorer|explorador|explorador de archivos|file explorer" } },
    { "msedge", new[] { "msedge.exe", "edge|msedge|microsoft edge" } },
    { "chrome", new[] { "chrome.exe", "chrome|google chrome" } },
    { "mspaint", new[] { "mspaint.exe", "paint|mspaint" } },
  };
  static string[] Alias(string app) {
    string q = app.Trim().ToLowerInvariant();
    foreach (var kv in ALIAS) if (kv.Key == q || Regex.IsMatch(q, "^(" + kv.Value[1] + ")$")) return new[] { kv.Key, kv.Value[0], kv.Value[1] };
    return null;
  }

  static long PidDeApp(string app, bool lanzar) {
    string q = app.Trim().ToLowerInvariant(); var al = Alias(app);
    foreach (var h in VentanasTop()) {
      uint pid = PidReal(h); var n = NombreDe(pid);
      if (n[0] == q || n[1].ToLowerInvariant() == q || n[0] + ".exe" == q) return pid;
      if (al != null && (Regex.IsMatch(n[0], "^(" + al[2] + ")$") || n[0] == al[0] || Regex.IsMatch(n[1].ToLowerInvariant(), "^(" + al[2] + ")$"))) return pid;
    }
    throw new Exception("La app «" + app + "» no está abierta. Ábrela con apps({abrir}).");
  }

  /** Abre en segundo plano: SW_SHOWNOACTIVATE. No se corrige el foco después (regla del 8 oct): se evita robarlo de origen. */
  static Dictionary<string, object> Abrir(string app, string argumentos) {
    if (string.IsNullOrEmpty(app)) throw new Exception("abrir necesita app");
    var al = Alias(app);
    if (al != null && argumentos == null) {
      try {
        long ya = PidDeApp(app, false);
        return new Dictionary<string, object> { { "pid", ya }, { "ya_abierta", true }, { "ventanas", Ventanas(new Dictionary<string, object> { { "pid", ya } }) } };
      } catch { }
    }
    var antes = new HashSet<IntPtr>(VentanasTop()); var fg = W32.GetForegroundWindow();
    var info = new W32.SHELLEXECUTEINFO();
    info.cbSize = Marshal.SizeOf(info); info.fMask = 0x40 /*NOCLOSEPROCESS*/ | 0x400 /*FLAG_NO_UI*/; info.lpVerb = "open";
    info.lpFile = al != null ? al[1] : app; info.lpParameters = argumentos; info.nShow = 4 /*SW_SHOWNOACTIVATE*/;
    if (!W32.ShellExecuteEx(ref info)) throw new Exception("No pude abrir «" + app + "» (error " + Marshal.GetLastWin32Error() + ")");
    uint pidLanzado = info.hProcess != IntPtr.Zero ? W32.GetProcessId(info.hProcess) : 0;
    if (info.hProcess != IntPtr.Zero) W32.CloseHandle(info.hProcess);
    // La ventana nueva: la del proceso lanzado; si ese proceso solo era un lanzador (calc.exe → win32calc o la
    // Calculadora UWP), cualquier ventana nueva que aparezca tras un momento.
    var t0 = DateTime.Now; var fin = t0.AddSeconds(15); IntPtr nueva = IntPtr.Zero;
    while (DateTime.Now < fin && nueva == IntPtr.Zero) {
      IntPtr otra = IntPtr.Zero;
      foreach (var h in VentanasTop()) {
        if (antes.Contains(h)) continue;
        if (pidLanzado != 0 && (PidReal(h) == pidLanzado || W32.Pid(h) == pidLanzado)) { nueva = h; break; }
        if (otra == IntPtr.Zero) otra = h;
      }
      if (nueva == IntPtr.Zero && otra != IntPtr.Zero && (pidLanzado == 0 || (DateTime.Now - t0).TotalMilliseconds > 1200)) nueva = otra;
      if (nueva == IntPtr.Zero) Thread.Sleep(80);
    }
    if (nueva == IntPtr.Zero) throw new Exception("«" + app + "» no mostró ventana en 15 s");
    uint pid = PidReal(nueva);
    // Que la ventana termine de armarse antes de leerla.
    Thread.Sleep(300);
    var ahora = W32.GetForegroundWindow();
    return new Dictionary<string, object> {
      { "pid", (long)pid }, { "ventanas", Ventanas(new Dictionary<string, object> { { "pid", (long)pid } }) },
      { "foco_intacto", ahora == fg }, { "frente", W32.Texto(ahora) },
    };
  }

  static IntPtr Resolver(Dictionary<string, object> p) {
    long v = L(p, "ventana");
    if (v != 0) { if (!W32.IsWindow((IntPtr)v)) throw new Exception("La ventana " + v + " ya no existe: vuelve a listar ventanas."); return (IntPtr)v; }
    long pid = L(p, "pid"); string app = S(p, "app");
    if (pid == 0 && !string.IsNullOrEmpty(app)) pid = PidDeApp(app, false);
    if (pid == 0) throw new Exception("Falta app, pid o ventana.");
    // La de más arriba en z de esa app (EnumWindows va de arriba hacia abajo).
    foreach (var h in VentanasTop()) if (PidReal(h) == pid) return h;
    throw new Exception("La app (pid " + pid + ") no tiene ventanas visibles.");
  }

  // ---------- Observar ----------
  static IUIAutomationCacheRequest Cache() {
    var c = u.CreateCacheRequest();
    foreach (var id in new[] { P_RUNTIME, P_RECT, P_TIPO, P_NOMBRE, P_HABIL, P_AUTOID, P_CLASE, P_AYUDA, P_PASSWORD, P_HWND, P_FUERA, P_EXPANDIBLE, P_INVOCABLE, P_RANGO, P_SCROLL, P_SELITEM, P_TOGGLE, P_VALORABLE, P_VALOR, P_RANGOVALOR, P_SELECCIONADO, P_TOGGLE_ESTADO, P_LEGACY, P_ATAJO })
      c.AddProperty(id);
    c.TreeScope = TreeScope.TreeScope_Subtree;
    c.TreeFilter = u.ControlViewCondition;
    return c;
  }

  static object CV(IUIAutomationElement e, int id) { try { var v = e.GetCachedPropertyValue(id); return v is string || v is int || v is bool || v is double || v is IntPtr || v is Array ? v : null; } catch { return null; } }
  static bool CB(IUIAutomationElement e, int id) { var v = CV(e, id); return v is bool ? (bool)v : v is int && (int)v != 0; }
  static string CS(IUIAutomationElement e, int id) { var v = CV(e, id) as string; return v; }
  static string IdDe(IUIAutomationElement e) {
    try { var a = e.GetRuntimeId() as Array; if (a == null) return null; var sb = new StringBuilder(); foreach (var x in a) sb.Append(x).Append('.'); return sb.ToString(); } catch { return null; }
  }

  static Nodo NodoDe(IUIAutomationElement e, int prof) {
    var n = new Nodo { el = e, prof = prof };
    try { n.tipo = e.CachedControlType; } catch { n.tipo = 0; }
    string rol; n.rol = ROLES.TryGetValue(n.tipo, out rol) ? rol : "AXUnknown";
    n.etiqueta = CS(e, P_NOMBRE); n.autoid = CS(e, P_AUTOID); n.clase = CS(e, P_CLASE);
    n.valor = CB(e, P_VALORABLE) ? CS(e, P_VALOR) : null;
    if (n.tipo == 50020 && string.IsNullOrEmpty(n.valor)) { n.valor = n.etiqueta; n.etiqueta = null; } // texto: el contenido es el valor (como AXStaticText)
    if (CB(e, P_RANGO)) { var rv = CV(e, P_RANGOVALOR); if (rv != null) n.valor = Convert.ToString(rv, System.Globalization.CultureInfo.InvariantCulture); }
    if (CB(e, P_TOGGLE)) { var ts = CV(e, P_TOGGLE_ESTADO); if (ts is int) n.valor = (int)ts == 1 ? "1" : "0"; }
    n.habil = CB(e, P_HABIL);
    try { var rr = e.CachedBoundingRectangle; n.marco = new W32.RECT { Left = rr.left, Top = rr.top, Right = rr.right, Bottom = rr.bottom }; } catch { }
    var hw = CV(e, P_HWND); n.hwnd = hw is IntPtr ? (IntPtr)hw : hw is int ? (IntPtr)(int)hw : IntPtr.Zero;
    n.acciones = new List<string>();
    if (CB(e, P_INVOCABLE)) n.acciones.Add("presionar");
    if (CB(e, P_TOGGLE)) n.acciones.Add("alternar");
    if (CB(e, P_SELITEM)) n.acciones.Add("seleccionar");
    if (CB(e, P_EXPANDIBLE)) n.acciones.Add("expandir");
    if (CB(e, P_VALORABLE) && !CB(e, P_SOLOLECTURA)) n.acciones.Add("valor");
    if (CB(e, P_SCROLL)) n.acciones.Add("scroll");
    // Subroles que el freno entiende igual que en macOS.
    if (CB(e, P_PASSWORD)) n.subrol = "AXSecureTextField";
    else if (n.tipo == 50000 && n.autoid == "Close") n.subrol = "AXCloseButton";
    else if (n.tipo == 50000 && n.autoid != null && n.autoid.StartsWith("Minimize")) n.subrol = "AXMinimizeButton";
    else if (n.tipo == 50000 && n.autoid != null && n.autoid.StartsWith("Maximize")) n.subrol = "AXZoomButton";
    else if ((n.tipo == 50004 || n.tipo == 50003) && Regex.IsMatch((n.etiqueta ?? "") + " " + (n.autoid ?? ""), "search|buscar|búsqueda", RegexOptions.IgnoreCase)) n.subrol = "AXSearchField";
    return n;
  }

  static string Linea(Nodo n, string r) {
    var sb = new StringBuilder();
    sb.Append(' ', 2 * Math.Max(0, n.prof)).Append('[').Append(r).Append("] ").Append(n.rol);
    if (!string.IsNullOrEmpty(n.etiqueta)) sb.Append(" «").Append(Recortar(n.etiqueta, 80)).Append('»');
    if (!string.IsNullOrEmpty(n.valor)) sb.Append(" = ").Append(Recortar(n.valor.Replace("\r", "").Replace("\n", "⏎"), 80));
    if (!n.habil) sb.Append(" (inactivo)");
    return sb.ToString();
  }
  static string Recortar(string s, int n) { return s.Length <= n ? s : s.Substring(0, n) + "…"; }

  static Dictionary<string, object> Observar(Dictionary<string, object> p) {
    IntPtr h = Resolver(p);
    int max = (int)Math.Max(1, L(p, "max_elementos") > 0 ? L(p, "max_elementos") : 600);
    string consulta = S(p, "consulta");
    var raiz = u.ElementFromHandleBuildCache(h, Cache());
    EstadoVentana est; if (!estados.TryGetValue((long)h, out est)) estados[(long)h] = est = new EstadoVentana();
    var lista = new List<Nodo>(); int total = 0;
    Recorrer(raiz, 0, lista, ref total, max * 4, true);
    // Chromium enciende su árbol web cuando llega el primer cliente de accesibilidad: hasta ~2 s para que aparezca.
    if (EsNavegador(PidReal(h))) {
      for (int i = 0; i < 10 && !TieneWeb(lista); i++) {
        Thread.Sleep(200); raiz = u.ElementFromHandleBuildCache(h, Cache()); lista = new List<Nodo>(); total = 0; Recorrer(raiz, 0, lista, ref total, max * 4, true);
      }
    }
    // Refs estables por identidad (RuntimeId): sobreviven entre observaciones de la misma ventana.
    var nuevos = new Dictionary<string, Nodo>(); var lineasNuevas = new Dictionary<string, string>(); var ordenados = new List<KeyValuePair<string, Nodo>>();
    foreach (var n in lista) {
      string rid = IdDe(n.el) ?? ("x" + est.sig);
      string r; if (!est.refPorId.TryGetValue(rid, out r)) { r = "e" + est.sig++; est.refPorId[rid] = r; }
      if (nuevos.ContainsKey(r)) continue;
      nuevos[r] = n; lineasNuevas[r] = Linea(n, r); ordenados.Add(new KeyValuePair<string, Nodo>(r, n));
    }
    // Cambios desde la lectura anterior (solo_cambios).
    var cambios = new StringBuilder();
    foreach (var kv in ordenados) { string antes; if (!est.lineas.TryGetValue(kv.Key, out antes)) cambios.Append("+ ").Append(lineasNuevas[kv.Key].TrimStart()).Append('\n'); else if (antes != lineasNuevas[kv.Key]) cambios.Append("~ ").Append(lineasNuevas[kv.Key].TrimStart()).Append('\n'); }
    foreach (var kv in est.lineas) if (!lineasNuevas.ContainsKey(kv.Key)) cambios.Append("- ").Append(kv.Value.TrimStart()).Append('\n');
    est.nodos = nuevos; est.lineas = lineasNuevas;
    // Filtro por consulta: coincidencias y sus ancestros.
    var visibles = new List<KeyValuePair<string, Nodo>>();
    if (!string.IsNullOrEmpty(consulta)) {
      string q = consulta.ToLowerInvariant(); var pila = new List<KeyValuePair<string, Nodo>>(); var incluidos = new HashSet<string>();
      foreach (var kv in ordenados) {
        while (pila.Count > 0 && pila[pila.Count - 1].Value.prof >= kv.Value.prof) pila.RemoveAt(pila.Count - 1);
        if (lineasNuevas[kv.Key].ToLowerInvariant().Contains(q)) { foreach (var a in pila) if (incluidos.Add(a.Key)) visibles.Add(a); if (incluidos.Add(kv.Key)) visibles.Add(kv); }
        pila.Add(kv);
      }
    } else visibles = ordenados;
    bool truncado = visibles.Count > max;
    if (truncado) visibles = visibles.GetRange(0, max);
    var elementos = new List<object>(); var texto = new StringBuilder();
    foreach (var kv in visibles) {
      var n = kv.Value; texto.Append(lineasNuevas[kv.Key]).Append('\n');
      var e = new Dictionary<string, object> { { "ref", kv.Key }, { "rol", n.rol }, { "profundidad", n.prof } };
      if (!string.IsNullOrEmpty(n.etiqueta)) e["etiqueta"] = n.etiqueta;
      if (!string.IsNullOrEmpty(n.valor)) e["valor"] = Recortar(n.valor, 4000);
      if (n.acciones.Count > 0) e["acciones"] = n.acciones;
      if (n.marco.Right > n.marco.Left) e["marco"] = new Dictionary<string, object> { { "x", n.marco.Left }, { "y", n.marco.Top }, { "w", n.marco.Right - n.marco.Left }, { "h", n.marco.Bottom - n.marco.Top } };
      elementos.Add(e);
    }
    uint pid = PidReal(h);
    var r2 = new Dictionary<string, object> {
      { "app", NombreDe(pid)[1] }, { "bundle", NombreDe(pid)[0] }, { "pid", (long)pid }, { "ventana", (long)h }, { "titulo", W32.Texto(h) },
      { "elementos", elementos }, { "texto", texto.ToString().TrimEnd('\n') }, { "total_elementos", ordenados.Count }, { "cambios", cambios.ToString().TrimEnd('\n') },
    };
    var avisos = new List<string>();
    if (truncado) avisos.Add("árbol truncado a " + max + " elementos: usa consulta o sube max_elementos");
    if (total > max * 4) avisos.Add("recorrido cortado en " + (max * 4) + " nodos");
    if (B(p, "ocr")) avisos.Add("OCR local aún no existe en Windows: usa captura");
    if (avisos.Count > 0) r2["aviso"] = string.Join(" · ", avisos);
    if (EsNavegador(pid)) { var u2 = UrlDe(raiz); if (u2 != null) r2["url"] = u2; }
    if (B(p, "captura")) { string ruta = S(p, "captura_ruta") ?? Path.Combine(Path.GetTempPath(), "manos-windows-" + DateTime.Now.Ticks + ".png"); CapturarVentana(h, ruta); r2["captura"] = ruta; }
    return r2;
  }

  /** ¿Ya hay contenido de la página (algo dentro del documento web de Chromium)? */
  static bool TieneWeb(List<Nodo> l) {
    for (int i = 0; i < l.Count; i++) if (l[i].tipo == 50030 && l[i].clase != null && l[i].clase.StartsWith("Chrome_RenderWidgetHost")) return i + 1 < l.Count && l[i + 1].prof > l[i].prof;
    return false;
  }

  static void Recorrer(IUIAutomationElement e, int prof, List<Nodo> l, ref int total, int tope, bool raiz) {
    if (total >= tope) return;
    total++;
    int sub = prof;
    if (!raiz) {
      var n = NodoDe(e, prof);
      bool ruido = ESTRUCTURA.Contains(n.tipo) && string.IsNullOrEmpty(n.etiqueta) && string.IsNullOrEmpty(n.valor) && n.acciones.Count == 0;
      bool fuera = CB(e, P_FUERA) && n.tipo != 50011 && n.tipo != 50007; // fuera de pantalla: se omite (los ítems de menú y de lista sí cuentan)
      if (!ruido && !fuera) { l.Add(n); sub = prof + 1; }
      if (fuera && n.tipo != 50008 && n.tipo != 50028 && n.tipo != 50036) return;
    }
    IUIAutomationElementArray hijos = null;
    try { hijos = e.GetCachedChildren(); } catch { }
    if (hijos == null) return;
    for (int i = 0; i < hijos.Length; i++) Recorrer(hijos.GetElement(i), sub, l, ref total, tope, false);
  }

  static Nodo NodoPorRef(IntPtr h, string r) {
    EstadoVentana est; Nodo n;
    if (!estados.TryGetValue((long)h, out est) || !est.nodos.TryGetValue(r, out n)) throw new Exception("Ref " + r + " desconocido o vencido para esa ventana: vuelve a observar.");
    return n;
  }

  // ---------- Actuar ----------
  static string Huella(IntPtr h) {
    try {
      var raiz = u.ElementFromHandleBuildCache(h, Cache()); var l = new List<Nodo>(); int t = 0;
      Recorrer(raiz, 0, l, ref t, 3000, true);
      var sb = new StringBuilder(W32.Texto(h)); foreach (var n in l) sb.Append('|').Append(n.rol).Append(n.etiqueta).Append(n.valor).Append(n.habil);
      sb.Append("|v").Append(VentanasTop().Count);
      return sb.ToString();
    } catch (Exception e) { return "error:" + e.Message; }
  }

  /** Corre un patrón con tope: Invoke de un botón que abre un diálogo modal no vuelve hasta que el diálogo se cierra. */
  static bool ConTope(Action a, int ms, out string error) {
    string err = null; var t = new Thread(delegate () { try { a(); } catch (Exception e) { err = e.Message; } });
    t.IsBackground = true; t.SetApartmentState(ApartmentState.MTA); t.Start();
    bool termino = t.Join(ms); error = err; return termino;
  }

  static Dictionary<string, object> Res(bool ok, string efecto, string detalle) { return new Dictionary<string, object> { { "ok", ok }, { "efecto", efecto }, { "detalle", detalle } }; }

  static Dictionary<string, object> Actuar(Dictionary<string, object> p) {
    IntPtr h = Resolver(p);
    string accion = S(p, "accion"), r = S(p, "ref");
    Nodo n = r != null ? NodoPorRef(h, r) : null;
    bool frente = B(p, "primer_plano"), hid = S(p, "via") == "hid" && S(p, "permiso_hid") != null;
    if (n != null && n.marco.Right > n.marco.Left) Halo.Ir((n.marco.Left + n.marco.Right) / 2, (n.marco.Top + n.marco.Bottom) / 2, h);
    else { W32.RECT wr; W32.GetWindowRect(h, out wr); Halo.Ir((wr.Left + wr.Right) / 2, wr.Top + 40, h); }
    bool asentar = !(p.ContainsKey("asentar") && p["asentar"] is bool && !(bool)p["asentar"]);
    IntPtr frenteAntes = W32.GetForegroundWindow();
    string antes = asentar && (accion == "click" || accion == "tecla") ? Huella(h) : null;
    Dictionary<string, object> res;
    switch (accion) {
      case "click": res = Click(h, n, frente, hid, p); break;
      case "escribir": res = Escribir(h, n, S(p, "texto"), B(p, "visible"), frente); break;
      case "tecla": res = Tecla(h, n, S(p, "tecla"), Mods(p), frente); break;
      case "scroll": res = Scroll(h, n, S(p, "direccion") ?? "abajo", (int)Math.Max(1, L(p, "cantidad") > 0 ? L(p, "cantidad") : 3)); break;
      case "valor": res = Valor(h, n, S(p, "valor")); break;
      default: throw new Exception("Acción desconocida: " + accion);
    }
    if (antes != null && (bool)res["ok"] && (string)res["efecto"] == "sin_verificar") {
      // Asentar: hasta 1.2 s esperando que la ventana cambie. Si cambió, el efecto se leyó.
      var fin = DateTime.Now.AddMilliseconds(1200);
      while (DateTime.Now < fin) {
        Thread.Sleep(60);
        string ahora = W32.IsWindow(h) ? Huella(h) : "cerrada";
        if (ahora != antes) { res["efecto"] = "confirmado"; res["detalle"] = res["detalle"] + " · la ventana cambió"; break; }
      }
    }
    // Honestidad sobre el foco: no se corrige después (regla del 8 oct), pero se dice. La app pudo activarse sola.
    IntPtr frenteDespues = W32.GetForegroundWindow();
    if (!frente && !hid && frenteDespues != frenteAntes) { res["foco_cambio"] = W32.Texto(frenteDespues); res["detalle"] = res["detalle"] + " · ojo: el frente pasó a «" + W32.Texto(frenteDespues) + "»"; }
    return res;
  }

  static List<string> Mods(Dictionary<string, object> p) {
    var l = new List<string>(); object v;
    if (p.TryGetValue("modificadores", out v) && v is IEnumerable && !(v is string)) foreach (var x in (IEnumerable)v) {
      string m = Convert.ToString(x).ToLowerInvariant();
      // En Windows la tecla de comando es Ctrl: ⌘S de una receta de macOS es Ctrl+S aquí.
      if (m == "cmd" || m == "command" || m == "control") m = "ctrl";
      if (m == "option" || m == "alt") m = "alt";
      if (!l.Contains(m)) l.Add(m);
    }
    return l;
  }

  static Dictionary<string, object> Click(IntPtr h, Nodo n, bool frente, bool hid, Dictionary<string, object> p) {
    if (n == null) throw new Exception("click necesita ref (el contrato no expone coordenadas).");
    var e = n.el; string err;
    if (hid) return ClicReal(h, n, true);
    if (frente) return ClicReal(h, n, false);
    // Botón Win32 (Button, WinForms): el clic es la notificación BN_CLICKED a su padre. Invoke de UIA manda BM_CLICK,
    // que simula el botón del ratón y ACTIVA la ventana (le quitaba el frente a la persona: corrida 1 del 17 oct).
    if (n.hwnd != IntPtr.Zero && n.tipo == 50000 && Regex.IsMatch(W32.Clase(n.hwnd), "^(Button|WindowsForms10\\.BUTTON\\..*)$", RegexOptions.IgnoreCase)) {
      IntPtr padre = W32.GetParent(n.hwnd); int idc = W32.GetDlgCtrlID(n.hwnd);
      if (padre != IntPtr.Zero && W32.IsWindowEnabled(n.hwnd)) {
        W32.PostMessage(padre, W32.WM_COMMAND, (IntPtr)(idc & 0xFFFF) /* HIWORD 0 = BN_CLICKED */, n.hwnd);
        return Res(true, "sin_verificar", "BN_CLICKED al padre (sin activar la ventana)");
      }
    }
    // Botón de un TaskDialog («¿Desea reemplazarlo?»): DirectUI sin HWND propio. TDM_CLICK_BUTTON es el clic que el
    // propio diálogo ofrece; el Invoke de DirectUI activaba la ventana (corrida 4).
    IntPtr raizDlg = W32.GetAncestor(h, 2);
    if (n.hwnd == IntPtr.Zero && n.tipo == 50000 && W32.Clase(raizDlg) == "#32770" && n.autoid != null) {
      var mb = Regex.Match(n.autoid, "^CommandButton_(\\d+)$");
      if (mb.Success) { W32.PostMessage(raizDlg, 0x400 + 102 /*TDM_CLICK_BUTTON*/, (IntPtr)int.Parse(mb.Groups[1].Value), IntPtr.Zero); return Res(true, "sin_verificar", "TDM_CLICK_BUTTON " + mb.Groups[1].Value + " (sin activar el diálogo)"); }
    }
    if (n.acciones.Contains("presionar")) {
      bool termino = ConTope(delegate { ((IUIAutomationInvokePattern)e.GetCurrentPattern(PAT_INVOKE)).Invoke(); }, 1500, out err);
      if (err == null) return Res(true, "sin_verificar", (termino ? "Invoke" : "Invoke (abrió algo modal: sigue abierto)") + (n.autoid != null ? " [" + n.autoid + "]" : ""));
    }
    if (n.acciones.Contains("alternar")) {
      int antes = ToggleDe(e);
      ConTope(delegate { ((IUIAutomationTogglePattern)e.GetCurrentPattern(PAT_TOGGLE)).Toggle(); }, 1500, out err);
      if (err == null) return Res(true, ToggleDe(e) != antes ? "confirmado" : "sin_verificar", "Toggle");
    }
    if (n.acciones.Contains("seleccionar")) {
      ConTope(delegate { ((IUIAutomationSelectionItemPattern)e.GetCurrentPattern(PAT_SELITEM)).Select(); }, 1500, out err);
      if (err == null) { bool sel = false; try { sel = ((IUIAutomationSelectionItemPattern)e.GetCurrentPattern(PAT_SELITEM)).CurrentIsSelected != 0; } catch { } return Res(true, sel ? "confirmado" : "sin_verificar", "Select"); }
    }
    if (n.acciones.Contains("expandir")) {
      ConTope(delegate {
        var x = (IUIAutomationExpandCollapsePattern)e.GetCurrentPattern(PAT_EXPAND);
        if (x.CurrentExpandCollapseState == ExpandCollapseState.ExpandCollapseState_Expanded) x.Collapse(); else x.Expand();
      }, 1500, out err);
      if (err == null) return Res(true, "sin_verificar", "ExpandCollapse");
    }
    try {
      var leg = e.GetCurrentPattern(PAT_LEGACY) as IUIAutomationLegacyIAccessiblePattern;
      if (leg != null && !string.IsNullOrEmpty(leg.CurrentDefaultAction)) {
        ConTope(delegate { leg.DoDefaultAction(); }, 1500, out err);
        if (err == null) return Res(true, "sin_verificar", "DoDefaultAction «" + leg.CurrentDefaultAction + "»");
      }
    } catch { }
    // Último recurso de fondo: el clic como mensaje a la ventana que está debajo del punto. El ratón no se mueve.
    int cx = (n.marco.Left + n.marco.Right) / 2, cy = (n.marco.Top + n.marco.Bottom) / 2;
    var pt = new W32.POINT { X = cx, Y = cy }; IntPtr destino = n.hwnd != IntPtr.Zero ? n.hwnd : W32.WindowFromPoint(pt);
    if (destino == IntPtr.Zero || W32.GetAncestor(destino, 2 /*GA_ROOT*/) != W32.GetAncestor(h, 2)) return Res(false, "fallo", "El elemento no expone una acción y no hay ventana propia bajo su centro. Prueba primer_plano o via hid con permiso.");
    W32.ScreenToClient(destino, ref pt);
    IntPtr lp = (IntPtr)((pt.Y << 16) | (pt.X & 0xFFFF));
    W32.PostMessage(destino, W32.WM_LBUTTONDOWN, (IntPtr)1, lp); W32.PostMessage(destino, W32.WM_LBUTTONUP, IntPtr.Zero, lp);
    return Res(true, "sin_verificar", "clic por mensaje a la ventana (sin mover el ratón)");
  }

  static int ToggleDe(IUIAutomationElement e) { try { return (int)((IUIAutomationTogglePattern)e.GetCurrentPattern(PAT_TOGGLE)).CurrentToggleState; } catch { return -1; } }

  /** Clic con la ventana al frente: primer_plano (ratón vuelve a su lugar) o hid (el ratón real viaja; se detiene si la persona lo mueve). */
  static Dictionary<string, object> ClicReal(IntPtr h, Nodo n, bool hid) {
    int cx = (n.marco.Left + n.marco.Right) / 2, cy = (n.marco.Top + n.marco.Bottom) / 2;
    W32.POINT orig; W32.GetCursorPos(out orig);
    Traer(h);
    if (hid) {
      for (int i = 1; i <= 20; i++) {
        W32.POINT ahora; W32.GetCursorPos(out ahora);
        int ex = orig.X + (cx - orig.X) * (i - 1) / 20, ey = orig.Y + (cy - orig.Y) * (i - 1) / 20;
        if (i > 1 && (Math.Abs(ahora.X - ex) > 25 || Math.Abs(ahora.Y - ey) > 25)) return Res(false, "fallo", "La persona movió el ratón: la mano se detuvo.");
        W32.SetCursorPos(orig.X + (cx - orig.X) * i / 20, orig.Y + (cy - orig.Y) * i / 20); Thread.Sleep(12);
      }
    } else W32.SetCursorPos(cx, cy);
    var ins = new W32.INPUT[2];
    ins[0].type = 0; ins[0].u.mi.dwFlags = 0x2; ins[1].type = 0; ins[1].u.mi.dwFlags = 0x4;
    W32.SendInput(2, ins, Marshal.SizeOf(typeof(W32.INPUT)));
    if (!hid) { Thread.Sleep(30); W32.SetCursorPos(orig.X, orig.Y); }
    return Res(true, "sin_verificar", hid ? "clic con el ratón real (permiso hid)" : "clic al frente (primer_plano); el ratón volvió a su lugar");
  }

  static void Traer(IntPtr h) {
    if (W32.IsIconic(h)) W32.ShowWindow(h, 9 /*RESTORE*/);
    uint yo = W32.GetCurrentThreadId(), suyo = W32.GetWindowThreadProcessId(W32.GetForegroundWindow(), out _sinUso);
    W32.AttachThreadInput(yo, suyo, true); W32.BringWindowToTop(h); W32.SetForegroundWindow(h); W32.AttachThreadInput(yo, suyo, false);
    Thread.Sleep(80);
  }
  static uint _sinUso;

  /** Control con el foco DENTRO de esa ventana (aunque la ventana no esté al frente): GetGUIThreadInfo de su hilo. */
  static IntPtr FocoDe(IntPtr h) {
    var gi = new W32.GUITHREADINFO(); gi.cbSize = Marshal.SizeOf(gi);
    uint tid = W32.GetWindowThreadProcessId(h, out _sinUso);
    if (W32.GetGUIThreadInfo(tid, ref gi) && gi.hwndFocus != IntPtr.Zero) return gi.hwndFocus;
    return IntPtr.Zero;
  }

  static string TextoHwnd(IntPtr h) {
    IntPtr len; W32.SendMessageTimeout(h, W32.WM_GETTEXTLENGTH, IntPtr.Zero, IntPtr.Zero, 2, 1000, out len);
    var sb = new StringBuilder((int)len + 2); W32.SendMessage(h, W32.WM_GETTEXT, (IntPtr)(sb.Capacity), sb); return sb.ToString();
  }
  static string ValorDe(IUIAutomationElement e) { try { return ((IUIAutomationValuePattern)e.GetCurrentPattern(PAT_VALOR)).CurrentValue; } catch { return null; } }

  static readonly Random azar = new Random();
  static readonly Regex CLASE_EDIT = new Regex("^(Edit|RichEdit\\d*\\w*|RICHEDIT\\d*\\w*|TextBox|WindowsForms10\\.EDIT.*|WindowsForms10\\.RichEdit.*)$", RegexOptions.IgnoreCase);

  static Dictionary<string, object> Escribir(IntPtr h, Nodo n, string texto, bool visible, bool frente) {
    if (texto == null) throw new Exception("escribir necesita texto.");
    IntPtr campo = n != null ? n.hwnd : FocoDe(h);
    string clase = campo != IntPtr.Zero ? W32.Clase(campo) : "";
    // 1. Control de edición Win32: se inserta en el cursor del campo por mensaje. Sin foco, sin teclas, deshacer funciona.
    if (campo != IntPtr.Zero && CLASE_EDIT.IsMatch(clase)) {
      string antes = TextoHwnd(campo);
      if (visible) { foreach (char c in texto.Replace("\r\n", "\n").Replace("\n", "\r")) { W32.SendMessage(campo, W32.WM_CHAR, (IntPtr)c, (IntPtr)1); Thread.Sleep(30 + azar.Next(50)); } }
      else W32.SendMessage(campo, W32.EM_REPLACESEL, (IntPtr)1, texto.Replace("\r\n", "\n").Replace("\n", "\r\n"));
      string despues = TextoHwnd(campo);
      bool entro = despues.Replace("\r\n", "\n").Contains(texto.Replace("\r\n", "\n")) && despues != antes;
      return Res(entro, entro ? "confirmado" : "fallo", (visible ? "letra por letra (WM_CHAR)" : "insertado en el cursor del campo (EM_REPLACESEL)") + (entro ? "" : ": el valor no cambió"));
    }
    // 2. Patrón Value (WPF, UWP, Chromium): se agrega al valor actual.
    if (n != null && n.acciones.Contains("valor")) {
      string antes = ValorDe(n.el) ?? "";
      string err; ConTope(delegate { ((IUIAutomationValuePattern)n.el.GetCurrentPattern(PAT_VALOR)).SetValue(antes + texto); }, 2000, out err);
      string despues = ValorDe(n.el) ?? "";
      if (err == null && despues.Contains(texto)) return Res(true, "confirmado", "valor por accesibilidad (ValuePattern)");
    }
    // 3. Caracteres por mensaje al control (apps que leen WM_CHAR aunque no estén al frente).
    IntPtr dest = campo != IntPtr.Zero ? campo : h;
    if (!frente) {
      string antes = n != null ? (ValorDe(n.el) ?? "") : "";
      foreach (char c in texto) { W32.PostMessage(dest, W32.WM_CHAR, (IntPtr)c, (IntPtr)1); if (visible) Thread.Sleep(30 + azar.Next(50)); }
      Thread.Sleep(150);
      string despues = n != null ? (ValorDe(n.el) ?? "") : null;
      if (despues != null && despues != antes && despues.Contains(texto)) return Res(true, "confirmado", "caracteres por mensaje (WM_CHAR)");
      if (despues == null) return Res(true, "sin_verificar", "caracteres por mensaje (WM_CHAR); no hay lectura del campo");
      return Res(false, "fallo", "El campo no aceptó el texto por accesibilidad ni por mensajes. Con permiso: primer_plano.");
    }
    // 4. primer_plano: la ventana al frente y teclas Unicode reales. Último recurso.
    Traer(h);
    if (n != null) try { n.el.SetFocus(); } catch { }
    foreach (char c in texto) {
      var ins = new W32.INPUT[2];
      ins[0].type = 1; ins[0].u.ki.wScan = c; ins[0].u.ki.dwFlags = 0x4; ins[1].type = 1; ins[1].u.ki.wScan = c; ins[1].u.ki.dwFlags = 0x4 | 0x2;
      W32.SendInput(2, ins, Marshal.SizeOf(typeof(W32.INPUT))); if (visible) Thread.Sleep(30 + azar.Next(50));
    }
    string fin = n != null ? ValorDe(n.el) : null;
    return Res(true, fin != null && fin.Contains(texto) ? "confirmado" : "sin_verificar", "teclas reales con la ventana al frente (primer_plano)");
  }

  static readonly Dictionary<string, int> VK = new Dictionary<string, int> {
    {"return",0x0D},{"enter",0x0D},{"tab",0x09},{"escape",0x1B},{"esc",0x1B},{"space",0x20},{"espacio",0x20},{"delete",0x08},{"borrar",0x08},{"backspace",0x08},
    {"forwarddelete",0x2E},{"suprimir",0x2E},{"supr",0x2E},{"up",0x26},{"down",0x28},{"left",0x25},{"right",0x27},{"arriba",0x26},{"abajo",0x28},{"izquierda",0x25},{"derecha",0x27},
    {"home",0x24},{"end",0x23},{"pageup",0x21},{"pagedown",0x22},{"insert",0x2D},
  };
  static int VkDe(string t) {
    int v; if (VK.TryGetValue(t, out v)) return v;
    if (t.Length == 1 && char.IsLetterOrDigit(t[0])) return char.ToUpperInvariant(t[0]);
    var m = Regex.Match(t, "^f(\\d{1,2})$"); if (m.Success) return 0x6F + int.Parse(m.Groups[1].Value);
    throw new Exception("Tecla desconocida: " + t);
  }

  static Dictionary<string, object> Tecla(IntPtr h, Nodo n, string tecla, List<string> mods, bool frente) {
    if (string.IsNullOrEmpty(tecla)) throw new Exception("tecla necesita tecla.");
    string t = tecla.ToLowerInvariant(); int vk = VkDe(t);
    bool ctrl = mods.Contains("ctrl"), alt = mods.Contains("alt"), shift = mods.Contains("shift");
    IntPtr top = W32.GetAncestor(h, 2);
    IntPtr campo = n != null && n.hwnd != IntPtr.Zero ? n.hwnd : FocoDe(h);
    // Cerrar la ventana (el freno ya decidió que es propia): Alt+F4 y ⌘W/Ctrl+W cierran la ventana entera, como el botón.
    if ((alt && vk == 0x73) || (ctrl && t == "w")) { W32.PostMessage(top, W32.WM_CLOSE, IntPtr.Zero, IntPtr.Zero); return Res(true, "sin_verificar", "WM_CLOSE a la ventana"); }
    // Atajos con Ctrl: primero el menú de la app (el menú dice qué hace el atajo), luego los de edición del campo.
    if (ctrl || alt) {
      var m = AtajoDelMenu(top, ctrl, alt, shift, t);
      if (m != null) { W32.PostMessage(top, W32.WM_COMMAND, (IntPtr)m.Item1, IntPtr.Zero); return Res(true, "sin_verificar", "menú «" + m.Item2 + "» (WM_COMMAND)"); }
      if (ctrl && !alt && campo != IntPtr.Zero && CLASE_EDIT.IsMatch(W32.Clase(campo))) {
        if (t == "a") { W32.SendMessage(campo, W32.EM_SETSEL, IntPtr.Zero, (IntPtr)(-1)); return Res(true, "confirmado", "seleccionar todo (EM_SETSEL)"); }
        if (t == "z") { W32.SendMessage(campo, W32.WM_UNDO, IntPtr.Zero, IntPtr.Zero); return Res(true, "sin_verificar", "deshacer (WM_UNDO)"); }
        if (t == "c") { W32.SendMessage(campo, W32.WM_COPY, IntPtr.Zero, IntPtr.Zero); return Res(true, "sin_verificar", "copiar (WM_COPY)"); }
        if (t == "x") { W32.SendMessage(campo, W32.WM_CUT, IntPtr.Zero, IntPtr.Zero); return Res(true, "sin_verificar", "cortar (WM_CUT)"); }
        if (t == "v") { W32.SendMessage(campo, W32.WM_PASTE, IntPtr.Zero, IntPtr.Zero); return Res(true, "sin_verificar", "pegar (WM_PASTE)"); }
      }
      if (!frente) return Res(false, "fallo", "El atajo " + string.Join("+", mods) + "+" + t + " no tiene vía en segundo plano en esta app (no está en su menú). Con permiso: primer_plano.");
      Traer(h); TeclasReales(vk, ctrl, alt, shift); return Res(true, "sin_verificar", "atajo con teclas reales al frente (primer_plano)");
    }
    // Enter o Espacio sobre un botón: presionar ese botón por accesibilidad.
    if (n != null && (vk == 0x0D || vk == 0x20) && n.acciones.Contains("presionar")) {
      string err; bool termino = ConTope(delegate { ((IUIAutomationInvokePattern)n.el.GetCurrentPattern(PAT_INVOKE)).Invoke(); }, 1500, out err);
      if (err == null) return Res(true, "sin_verificar", "Invoke (" + t + " sobre botón)" + (termino ? "" : ": abrió algo modal"));
    }
    if (frente) { Traer(h); TeclasReales(vk, false, false, shift); return Res(true, "sin_verificar", "tecla real al frente (primer_plano)"); }
    IntPtr dest = campo != IntPtr.Zero ? campo : h;
    uint sc = W32.MapVirtualKey((uint)vk, 0);
    W32.PostMessage(dest, W32.WM_KEYDOWN, (IntPtr)vk, (IntPtr)(1 | (sc << 16)));
    if (vk == 0x0D) W32.PostMessage(dest, W32.WM_CHAR, (IntPtr)0x0D, (IntPtr)(1 | (sc << 16)));
    W32.PostMessage(dest, W32.WM_KEYUP, (IntPtr)vk, (IntPtr)(1 | (sc << 16) | (1u << 30) | (1u << 31)));
    return Res(true, "sin_verificar", "tecla por mensaje al control con foco de esa ventana");
  }

  static void TeclasReales(int vk, bool ctrl, bool alt, bool shift) {
    var l = new List<W32.INPUT>();
    Action<int, bool> k = delegate (int v, bool arriba) { var i = new W32.INPUT(); i.type = 1; i.u.ki.wVk = (ushort)v; i.u.ki.dwFlags = arriba ? 2u : 0u; l.Add(i); };
    if (ctrl) k(0x11, false); if (alt) k(0x12, false); if (shift) k(0x10, false);
    k(vk, false); k(vk, true);
    if (shift) k(0x10, true); if (alt) k(0x12, true); if (ctrl) k(0x11, true);
    W32.SendInput((uint)l.Count, l.ToArray(), Marshal.SizeOf(typeof(W32.INPUT)));
  }

  /** Busca en el menú Win32 de la ventana un comando cuyo atajo sea el pedido («Guardar\tCtrl+G»). */
  static Tuple<uint, string> AtajoDelMenu(IntPtr top, bool ctrl, bool alt, bool shift, string t) {
    IntPtr menu = W32.GetMenu(top); if (menu == IntPtr.Zero) return null;
    return BuscarMenu(menu, ctrl, alt, shift, t, 0);
  }
  static Tuple<uint, string> BuscarMenu(IntPtr m, bool ctrl, bool alt, bool shift, string t, int prof) {
    int n = W32.GetMenuItemCount(m);
    for (int i = 0; i < n && prof < 4; i++) {
      IntPtr sub = W32.GetSubMenu(m, i);
      if (sub != IntPtr.Zero) { var r = BuscarMenu(sub, ctrl, alt, shift, t, prof + 1); if (r != null) return r; continue; }
      var sb = new StringBuilder(256); W32.GetMenuString(m, (uint)i, sb, 256, 0x400 /*BYPOSITION*/);
      string s = sb.ToString(); int tab = s.IndexOf('\t'); if (tab < 0) continue;
      string atajo = s.Substring(tab + 1).ToLowerInvariant().Replace(" ", "");
      var partes = atajo.Split('+');
      bool c = partes.Contains("ctrl") || partes.Contains("strg"), a = partes.Contains("alt"), sh = partes.Contains("shift") || partes.Contains("mayús") || partes.Contains("mayus");
      string tecla = partes[partes.Length - 1];
      if (c == ctrl && a == alt && sh == shift && (tecla == t || (t == "forwarddelete" && (tecla == "del" || tecla == "supr")))) return Tuple.Create(W32.GetMenuItemID(m, i), s.Substring(0, tab).Replace("&", ""));
    }
    return null;
  }

  static IUIAutomationScrollPattern Desplazable(IUIAutomationElement e, bool vertical) {
    try {
      var sp = e.GetCurrentPattern(PAT_SCROLL) as IUIAutomationScrollPattern;
      if (sp != null && (vertical ? sp.CurrentVerticallyScrollable : sp.CurrentHorizontallyScrollable) != 0) return sp;
    } catch { }
    return null;
  }

  static readonly Regex CLASE_DESPLAZABLE = new Regex("^(ListBox|ComboLBox|SysListView32|SysTreeView32|Edit|RichEdit\\w*|WindowsForms10\\.(LISTBOX|EDIT|RichEdit\\w*|SysListView32|SysTreeView32)\\..*)$", RegexOptions.IgnoreCase);

  static int PosScroll(IntPtr h, bool vertical) {
    var si = new W32.SCROLLINFO(); si.cbSize = (uint)Marshal.SizeOf(si); si.fMask = 0x4 /*SIF_POS*/;
    return W32.GetScrollInfo(h, vertical ? 1 : 0, ref si) ? si.nPos : int.MinValue;
  }

  static Dictionary<string, object> Scroll(IntPtr h, Nodo n, string dir, int cantidad) {
    bool vertical = dir == "arriba" || dir == "abajo";
    // Control Win32 con barra propia: WM_VSCROLL directo. El ScrollPattern de su proxy UIA ACTIVA la ventana (corrida 3).
    if (n != null && n.hwnd != IntPtr.Zero && CLASE_DESPLAZABLE.IsMatch(W32.Clase(n.hwnd))) {
      int antes = PosScroll(n.hwnd, vertical);
      uint m0 = vertical ? W32.WM_VSCROLL : W32.WM_HSCROLL; int c0 = dir == "abajo" || dir == "derecha" ? 1 : 0;
      for (int i = 0; i < cantidad; i++) W32.SendMessage(n.hwnd, m0, (IntPtr)c0, IntPtr.Zero);
      W32.SendMessage(n.hwnd, m0, (IntPtr)8 /*SB_ENDSCROLL*/, IntPtr.Zero);
      int despues = PosScroll(n.hwnd, vertical);
      if (antes != int.MinValue) {
        var r0 = Res(true, despues != antes ? "confirmado" : "sin_verificar", "WM_" + (vertical ? "V" : "H") + "SCROLL ×" + cantidad + ": posición " + antes + " → " + despues + " (sin activar la ventana)");
        r0["antes"] = antes; r0["despues"] = despues; return r0;
      }
    }
    // El elemento, su ancestro desplazable más cercano o, si no, el primer desplazable dentro de él.
    IUIAutomationElement e = n != null ? n.el : u.ElementFromHandle(h);
    IUIAutomationScrollPattern sp = null; var walker = u.ControlViewWalker;
    for (var x = e; x != null && sp == null; ) { sp = Desplazable(x, vertical); if (sp == null) { try { x = walker.GetParentElement(x); } catch { x = null; } } }
    if (sp == null) {
      try {
        var todos = e.FindAll(TreeScope.TreeScope_Descendants, u.CreatePropertyCondition(P_SCROLL, true));
        for (int i = 0; i < todos.Length && sp == null; i++) sp = Desplazable(todos.GetElement(i), vertical);
      } catch { }
    }
    if (sp != null) {
      double antes = vertical ? sp.CurrentVerticalScrollPercent : sp.CurrentHorizontalScrollPercent;
      var amt = dir == "abajo" || dir == "derecha" ? ScrollAmount.ScrollAmount_SmallIncrement : ScrollAmount.ScrollAmount_SmallDecrement;
      for (int i = 0; i < cantidad; i++) { if (vertical) sp.Scroll(ScrollAmount.ScrollAmount_NoAmount, amt); else sp.Scroll(amt, ScrollAmount.ScrollAmount_NoAmount); }
      double despues = vertical ? sp.CurrentVerticalScrollPercent : sp.CurrentHorizontalScrollPercent;
      var r = Res(true, despues != antes ? "confirmado" : "sin_verificar", "ScrollPattern " + Math.Round(antes, 1) + "% → " + Math.Round(despues, 1) + "%");
      r["antes"] = antes; r["despues"] = despues; return r;
    }
    // Sin patrón: WM_VSCROLL / WM_HSCROLL al control (no mueve nada de la persona).
    IntPtr dest = n != null && n.hwnd != IntPtr.Zero ? n.hwnd : FocoDe(h); if (dest == IntPtr.Zero) dest = h;
    uint msg = dir == "arriba" || dir == "abajo" ? W32.WM_VSCROLL : W32.WM_HSCROLL; int code = dir == "abajo" || dir == "derecha" ? 1 : 0;
    for (int i = 0; i < cantidad; i++) W32.SendMessage(dest, msg, (IntPtr)code, IntPtr.Zero);
    return Res(true, "sin_verificar", "WM_" + (msg == W32.WM_VSCROLL ? "V" : "H") + "SCROLL ×" + cantidad);
  }

  static Dictionary<string, object> Valor(IntPtr h, Nodo n, string valor) {
    if (n == null || valor == null) throw new Exception("valor necesita ref y valor.");
    var e = n.el; string err;
    if (n.acciones.Contains("valor") || n.tipo == 50004 || n.tipo == 50003) {
      try {
        var vp = e.GetCurrentPattern(PAT_VALOR) as IUIAutomationValuePattern;
        if (vp != null) {
          ConTope(delegate { vp.SetValue(valor); }, 2000, out err);
          string leido = ValorDe(e);
          if (err == null && leido == valor) return Res(true, "confirmado", "ValuePattern");
        }
      } catch { }
    }
    var rv = e.GetCurrentPattern(PAT_RANGO) as IUIAutomationRangeValuePattern;
    if (rv != null) {
      double d; if (!double.TryParse(valor, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out d)) throw new Exception("valor numérico inválido: " + valor);
      rv.SetValue(d); return Res(true, Math.Abs(rv.CurrentValue - d) < 1e-6 ? "confirmado" : "sin_verificar", "RangeValuePattern");
    }
    // Lista desplegable: abrir, elegir el ítem por nombre, cerrar.
    var ec = e.GetCurrentPattern(PAT_EXPAND) as IUIAutomationExpandCollapsePattern;
    if (ec != null) {
      ConTope(delegate { ec.Expand(); }, 1500, out err); Thread.Sleep(150);
      var item = e.FindFirst(TreeScope.TreeScope_Descendants, u.CreatePropertyCondition(P_NOMBRE, valor));
      if (item != null) {
        var si = item.GetCurrentPattern(PAT_SELITEM) as IUIAutomationSelectionItemPattern; if (si != null) si.Select();
        try { ec.Collapse(); } catch { }
        return Res(true, "sin_verificar", "eligió «" + valor + "» de la lista");
      }
      try { ec.Collapse(); } catch { }
    }
    // Control Win32 sin patrón: WM_SETTEXT.
    if (n.hwnd != IntPtr.Zero) { W32.SendMessage(n.hwnd, W32.WM_SETTEXT, IntPtr.Zero, valor); return Res(TextoHwnd(n.hwnd) == valor, TextoHwnd(n.hwnd) == valor ? "confirmado" : "fallo", "WM_SETTEXT"); }
    return Res(false, "fallo", "El elemento no acepta un valor puesto.");
  }

  // ---------- Verificar ----------
  static Dictionary<string, object> Verificar(Dictionary<string, object> p) {
    IntPtr h = Resolver(p);
    var raiz = u.ElementFromHandleBuildCache(h, Cache()); var l = new List<Nodo>(); int t = 0;
    Recorrer(raiz, 0, l, ref t, 5000, true);
    object esp; p.TryGetValue("espera", out esp);
    var detalles = new List<string>(); bool todo = true;
    foreach (var x in (IEnumerable)(esp ?? new object[0])) {
      var e = x as Dictionary<string, object>; if (e == null) continue;
      string rol = S(e, "rol"), etq = S(e, "etiqueta_contiene"), val = S(e, "valor");
      var cand = l.Where(n => (rol == null || n.rol == rol) && (etq == null || ((n.etiqueta ?? "") + " " + (n.valor ?? "")).IndexOf(etq, StringComparison.OrdinalIgnoreCase) >= 0)).ToList();
      bool ok = cand.Count > 0;
      if (ok && val != null) ok = cand.Any(n => (n.valor ?? n.etiqueta ?? "").Trim() == val.Trim());
      if (ok && e.ContainsKey("habilitado")) ok = cand.Any(n => n.habil == B(e, "habilitado"));
      if (ok && e.ContainsKey("seleccionado")) ok = cand.Any(n => { bool s = false; try { s = CB(n.el, P_SELECCIONADO) || CV(n.el, P_TOGGLE_ESTADO) as int? == 1; } catch { } return s == B(e, "seleccionado"); });
      detalles.Add((ok ? "✓ " : "✗ ") + (rol ?? "*") + (etq != null ? " «" + etq + "»" : "") + (val != null ? " = " + val : "") + (ok ? "" : cand.Count == 0 ? " (no existe)" : " (valor: " + (cand[0].valor ?? cand[0].etiqueta) + ")"));
      todo &= ok;
    }
    return new Dictionary<string, object> { { "cumple", todo }, { "detalle", string.Join(" · ", detalles) } };
  }

  // ---------- Contexto para el freno ----------
  static Dictionary<string, object> Contexto(Dictionary<string, object> p) {
    IntPtr h = Resolver(p); string r = S(p, "ref");
    IUIAutomationElement e = null; string subrol = null; List<string> acciones = null;
    if (r != null) { var n = NodoPorRef(h, r); e = n.el; subrol = n.subrol; acciones = n.acciones; }
    else { IntPtr f = FocoDe(h); if (f != IntPtr.Zero) try { e = u.ElementFromHandle(f); } catch { } }
    uint pid = PidReal(h); var nom = NombreDe(pid);
    var c = new Dictionary<string, object> { { "bundle", nom[0] }, { "app", nom[1] }, { "plataforma", "windows" }, { "ventana", new Dictionary<string, object> { { "titulo", W32.Texto(h) } } } };
    if (e != null) {
      int tipo = 0; try { tipo = e.CurrentControlType; } catch { }
      string rol; if (!ROLES.TryGetValue(tipo, out rol)) rol = "AXUnknown";
      string nombre = null, ayuda = null, autoid = null; bool pass = false;
      try { nombre = e.CurrentName; ayuda = e.CurrentHelpText; autoid = e.CurrentAutomationId; pass = e.CurrentIsPassword != 0; } catch { }
      if (pass) subrol = "AXSecureTextField";
      if (subrol == null && (tipo == 50004 || tipo == 50003) && Regex.IsMatch((nombre ?? "") + " " + (autoid ?? ""), "search|buscar|búsqueda", RegexOptions.IgnoreCase)) subrol = "AXSearchField";
      var el = new Dictionary<string, object> { { "rol", tipo == 50020 ? "AXStaticText" : rol } };
      if (subrol != null) el["subrol"] = subrol;
      if (!string.IsNullOrEmpty(nombre)) el["titulo"] = nombre;
      if (!string.IsNullOrEmpty(ayuda)) el["descripcion"] = ayuda;
      if (!string.IsNullOrEmpty(autoid) && !Regex.IsMatch(autoid, "^\\d+$")) el["identificador"] = autoid;
      var v = ValorDe(e); if (v != null) el["valor_largo"] = v.Length;
      if (acciones != null) el["acciones"] = acciones;
      c["elemento"] = el;
      // Ancestros hasta la ventana, y si estamos en un diálogo o en una página web.
      var anc = new List<string>(); var dentro = new List<string>(); var w = u.ControlViewWalker; var x = e;
      for (int i = 0; i < 30; i++) {
        try { x = w.GetParentElement(x); } catch { x = null; }
        if (x == null) break;
        int tp = 0; string nm = null, cl = null; try { tp = x.CurrentControlType; nm = x.CurrentName; cl = x.CurrentClassName; } catch { }
        string rr; if (!ROLES.TryGetValue(tp, out rr)) rr = "AXGroup";
        if (tp == 50030 && cl != null && cl.StartsWith("Chrome_RenderWidgetHost")) { rr = "AXWebArea"; if (!dentro.Contains("web")) dentro.Add("web"); }
        anc.Add(string.IsNullOrEmpty(nm) ? rr : rr + " «" + Recortar(nm, 60) + "»");
        if (tp == 50032 && EsDialogo(x)) { if (!dentro.Contains("dialogo")) dentro.Add("dialogo"); }
        if (x.CurrentNativeWindowHandle == h) break;
      }
      c["ancestros"] = anc; c["dentro_de"] = dentro;
    }
    // Diálogo: texto, botón por defecto y cancelar (lo que un Enter presionaría).
    var dlg = Dialogo(h);
    if (dlg != null) { c["dialogo"] = dlg; var dd = c.ContainsKey("dentro_de") ? (List<string>)c["dentro_de"] : new List<string>(); if (!dd.Contains("dialogo")) dd.Add("dialogo"); c["dentro_de"] = dd; }
    if (EsNavegador(pid)) { try { var url = UrlDe(u.ElementFromHandle(h)); if (url != null) { c["url"] = url; var dd = c.ContainsKey("dentro_de") ? (List<string>)c["dentro_de"] : new List<string>(); if (e != null && ((List<string>)c["ancestros"]).Any(a => a.StartsWith("AXWebArea")) && !dd.Contains("web")) dd.Add("web"); c["dentro_de"] = dd; } } catch { } }
    return c;
  }

  static bool EsDialogo(IUIAutomationElement w) {
    try {
      if (w.CurrentClassName == "#32770") return true;
      var wp = w.GetCurrentPattern(PAT_VENTANA) as IUIAutomationWindowPattern; return wp != null && wp.CurrentIsModal != 0;
    } catch { return false; }
  }

  static Dictionary<string, object> Dialogo(IntPtr h) {
    var top = W32.GetAncestor(h, 2);
    if (W32.Clase(top) != "#32770") {
      IUIAutomationElement w = null; try { w = u.ElementFromHandle(top); } catch { }
      if (w == null || !EsDialogo(w)) return null;
    }
    var d = new Dictionary<string, object> { { "tipo", "dialogo" } };
    var textos = new List<string>();
    try {
      var raiz = u.ElementFromHandleBuildCache(top, Cache()); var l = new List<Nodo>(); int t = 0; Recorrer(raiz, 0, l, ref t, 400, true);
      foreach (var n in l) if (n.tipo == 50020 && !string.IsNullOrEmpty(n.valor)) textos.Add(n.valor);
      foreach (var n in l) if (n.tipo == 50000 && n.etiqueta != null && Regex.IsMatch(n.etiqueta, "^(cancel|cancelar|no)$", RegexOptions.IgnoreCase)) { d["boton_cancelar"] = n.etiqueta; break; }
    } catch { }
    d["texto"] = Recortar(string.Join(" ", textos), 400);
    // Botón por defecto de un diálogo clásico: DM_GETDEFID.
    IntPtr res; W32.SendMessageTimeout(top, W32.DM_GETDEFID, IntPtr.Zero, IntPtr.Zero, 2, 500, out res);
    if (((long)res >> 16) == 0x534B /*DC_HASDEFID*/) {
      var b = W32.GetDlgItem(top, (int)((long)res & 0xFFFF)); if (b != IntPtr.Zero) d["boton_defecto"] = W32.Texto(b).Replace("&", "");
    }
    return d;
  }

  // ---------- Navegador ----------
  static readonly HashSet<string> NAVEGADORES = new HashSet<string> { "chrome", "msedge", "brave", "vivaldi", "opera", "firefox", "chromium" };
  static bool EsNavegador(uint pid) { return NAVEGADORES.Contains(NombreDe(pid)[0]); }

  /** La barra de direcciones de Chrome/Edge/Brave es un Edit del árbol: su valor es la URL. */
  static string UrlDe(IUIAutomationElement raiz) {
    try {
      var cond = u.CreateAndCondition(u.CreatePropertyCondition(P_TIPO, 50004), u.CreatePropertyCondition(P_VALORABLE, true));
      var todos = raiz.FindAll(TreeScope.TreeScope_Descendants, cond);
      for (int i = 0; i < todos.Length && i < 40; i++) {
        var e = todos.GetElement(i); string nm = e.CurrentName ?? "";
        if (!Regex.IsMatch(nm, "address|direcci|search bar|barra de", RegexOptions.IgnoreCase)) continue;
        string v = ValorDe(e); if (string.IsNullOrEmpty(v)) continue;
        if (!Regex.IsMatch(v, "^[a-z][a-z0-9+.-]*://", RegexOptions.IgnoreCase)) v = "https://" + v;
        return v;
      }
    } catch { }
    return null;
  }

  static Dictionary<string, object> Pagina(Dictionary<string, object> p) {
    IntPtr h = Resolver(p); string titulo = W32.Texto(h);
    var t = Regex.Replace(titulo, "(\\s*[-–—]\\s*(Profile|Perfil|Personal|Work|Trabajo)[^-–—]*)?\\s*[-–—]\\s*(Google Chrome|Microsoft​? Edge|Brave|Vivaldi|Opera|Chromium)(\\s*[-–—].*)?$", "");
    t = Regex.Replace(t, "\\s*y \\d+ páginas? más|\\s*and \\d+ more pages?", "");
    return new Dictionary<string, object> { { "ventana", (long)h }, { "titulo_pagina", t }, { "url", UrlDe(u.ElementFromHandle(h)) } };
  }

  /** Abre una URL en una ventana NUEVA del navegador, sin activarla. */
  static Dictionary<string, object> AbrirUrl(Dictionary<string, object> p) {
    string nav = (S(p, "navegador") ?? "auto").ToLowerInvariant(), url = S(p, "url");
    if (url == null || !Regex.IsMatch(url, "^https?://", RegexOptions.IgnoreCase)) throw new Exception("Solo http(s)");
    string args = "--new-window --no-first-run --no-default-browser-check --force-renderer-accessibility \"" + url.Replace("\"", "%22") + "\"";
    // Sin navegador pedido: Chrome (donde vive la extensión de Arbrain) y, si no está instalado, Edge (viene con Windows).
    if (nav == "auto") { try { return Abrir("chrome.exe", args); } catch { return Abrir("msedge.exe", args); } }
    return Abrir(nav == "chrome" ? "chrome.exe" : nav == "brave" ? "brave.exe" : "msedge.exe", args);
  }

  /** Silencia y pausa el reproductor de la página por sus botones accesibles (YouTube, Vimeo: «Silenciar (m)», «Pausa (k)»). */
  static Dictionary<string, object> Medios(Dictionary<string, object> p) {
    IntPtr h = Resolver(p); var sw = Stopwatch.StartNew(); var acciones = new List<string>();
    bool silenciado = false, pausado = false, reproductor = false;
    var fin = DateTime.Now.AddMilliseconds(L(p, "tope_ms") > 0 ? L(p, "tope_ms") : 6000);
    while (DateTime.Now < fin && !(silenciado && pausado)) {
      var botones = u.ElementFromHandle(h).FindAll(TreeScope.TreeScope_Descendants, u.CreatePropertyCondition(P_TIPO, 50000));
      for (int i = 0; i < botones.Length; i++) {
        var b = botones.GetElement(i); string nm = b.CurrentName ?? "";
        if (Regex.IsMatch(nm, "^(silenciar|mute)\\b", RegexOptions.IgnoreCase)) { reproductor = true; try { ((IUIAutomationInvokePattern)b.GetCurrentPattern(PAT_INVOKE)).Invoke(); acciones.Add("silenciar"); } catch { } }
        else if (Regex.IsMatch(nm, "^(activar (el )?sonido|unmute)\\b", RegexOptions.IgnoreCase)) { reproductor = true; silenciado = true; }
        else if (Regex.IsMatch(nm, "^(pausa|pausar|pause)\\b", RegexOptions.IgnoreCase)) { reproductor = true; try { ((IUIAutomationInvokePattern)b.GetCurrentPattern(PAT_INVOKE)).Invoke(); acciones.Add("pausar"); } catch { } }
        else if (Regex.IsMatch(nm, "^(reproducir|play)\\b(?!.*todo)", RegexOptions.IgnoreCase)) { reproductor = true; pausado = true; }
      }
      if (!(silenciado && pausado)) Thread.Sleep(200);
    }
    return new Dictionary<string, object> { { "silenciado", silenciado }, { "pausado", pausado }, { "reproductor", reproductor }, { "acciones", acciones }, { "ms", sw.ElapsedMilliseconds } };
  }

  static void Mostrar(Dictionary<string, object> p) { Traer(Resolver(p)); }

  // ---------- Capturas ----------
  static void CapturarVentana(IntPtr h, string ruta) {
    W32.RECT r; W32.GetWindowRect(h, out r);
    int w = Math.Max(1, r.Right - r.Left), hh = Math.Max(1, r.Bottom - r.Top);
    using (var bmp = new Bitmap(w, hh, PixelFormat.Format32bppArgb)) {
      using (var g = Graphics.FromImage(bmp)) { IntPtr dc = g.GetHdc(); bool ok = W32.PrintWindow(h, dc, 2 /*PW_RENDERFULLCONTENT*/); g.ReleaseHdc(dc); if (!ok) g.CopyFromScreen(r.Left, r.Top, 0, 0, bmp.Size); }
      bmp.Save(ruta, ImageFormat.Png);
    }
  }

  static Dictionary<string, object> Captura(Dictionary<string, object> p) {
    string ruta = S(p, "ruta") ?? Path.Combine(Path.GetTempPath(), "manos-windows-" + DateTime.Now.Ticks + ".png");
    if (L(p, "ventana") != 0) CapturarVentana((IntPtr)L(p, "ventana"), ruta);
    else {
      var b = Screen.PrimaryScreen.Bounds;
      using (var bmp = new Bitmap(b.Width, b.Height)) { using (var g = Graphics.FromImage(bmp)) g.CopyFromScreen(b.Left, b.Top, 0, 0, bmp.Size); bmp.Save(ruta, ImageFormat.Png); }
    }
    return new Dictionary<string, object> { { "ruta", ruta } };
  }
}
