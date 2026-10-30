// Genera Interop.UIAutomationClient.dll desde el typelib que trae Windows en UIAutomationCore.dll.
// Así las manos usan UIA3 (COM, el mismo motor que Inspect y Narrador) sin bajar nada ni pedir el SDK.
// Uso: GenerarInterop.exe <carpeta-destino>
using System;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;

class GenerarInterop {
  [DllImport("oleaut32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void LoadTypeLibEx(string archivo, int tipo, [MarshalAs(UnmanagedType.Interface)] out object tl);

  class Sumidero : ITypeLibImporterNotifySink {
    public void ReportEvent(ImporterEventKind k, int c, string m) { }
    public Assembly ResolveRef(object tl) { return null; }
  }

  static int Main(string[] a) {
    string destino = a.Length > 0 ? a[0] : ".";
    Directory.SetCurrentDirectory(destino);
    object tl;
    LoadTypeLibEx(Environment.ExpandEnvironmentVariables(@"%WINDIR%\System32\UIAutomationCore.dll"), 0, out tl);
    var ab = new TypeLibConverter().ConvertTypeLibToAssembly(tl, "Interop.UIAutomationClient.dll", TypeLibImporterFlags.SafeArrayAsSystemArray, new Sumidero(), null, null, "Interop.UIAutomationClient", null);
    ab.Save("Interop.UIAutomationClient.dll");
    Console.WriteLine(Path.Combine(destino, "Interop.UIAutomationClient.dll"));
    return 0;
  }
}
