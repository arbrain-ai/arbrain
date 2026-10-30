// Apertura en frío de la app instalada = Chat, decidida ANTES de pintar (11 oct 2026, Daniel: «siempre que cierro y abro
// la aplicación veo como 45 pantallas antes de ver la vista del Chat»). iOS restaura la última URL (Calendario, una
// sección…); antes la redirección vivía en un useEffect de PWARegister, así que primero se pintaba e hidrataba esa
// sección entera y luego saltaba a /chat. Aquí corre en el <head>, antes del primer pixel. Misma regla que antes:
//  · una salida de hace <5 s (recarga nuestra, deploy o navegación completa) conserva la ruta;
//  · se respetan los deep links (?session= de un push, ?atajo= de un atajo);
//  · el panel del teléfono (/telefono) y el enlace de una vista (/artefacto) tampoco se tocan (14 oct 2026);
//  · el start_url viejo (/todotask/hoy) de las instalaciones antiguas también cae al chat.
//  · /bienvenida y /sin-sesion son a donde el servidor manda cuando el chat todavía no se puede (primer arranque sin
//    terminar, sesión vencida): no se tocan. Y si ya mandamos a /chat hace <5 s y el servidor nos regresó, se respeta su
//    destino. Sin esto la app instalada quedaba en blanco en un bucle /chat → /bienvenida → /chat (30 oct 2026, primer
//    teléfono real en el servidor de Daniel).
export const aperturaEnChatScript = `
(() => {
  try {
    var salida = Number(sessionStorage.getItem('arbrain:salida') || 0);
    if (salida && Date.now() - salida < 5000) return;
    var intento = Number(sessionStorage.getItem('arbrain:apertura') || 0);
    if (intento && Date.now() - intento < 5000) return;
    var standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (!standalone || location.pathname === '/chat') return;
    var q = new URLSearchParams(location.search);
    if (q.has('atajo') || q.has('session')) return;
    // El panel en el teléfono y el enlace propio de una vista (14 oct 2026) son destinos: un push de «ábrelo en mi teléfono» o
    // el ícono «Panel» abren ahí, nunca en el chat.
    if (location.pathname === '/telefono' || location.pathname === '/artefacto') return;
    var p = location.pathname;
    if (p === '/bienvenida' || p === '/sin-sesion' || p.indexOf('/bienvenida/') === 0 || p.indexOf('/sin-sesion/') === 0) return;
    sessionStorage.setItem('arbrain:apertura', String(Date.now()));
    document.documentElement.style.visibility = 'hidden';
    location.replace('/chat');
  } catch (e) { /* sin almacenamiento: se queda donde está */ }
})();
`
