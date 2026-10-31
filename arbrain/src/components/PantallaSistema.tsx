'use client'

/**
 * Pantallas de sistema (error, «no existe», entrar sin sesión) con el material de la bienvenida (31 oct 2026, Daniel:
 * «Los botones planos y el uso de colores no me encanta, dale la misma lógica y diseño de UI a este»). Misma lógica que
 * `primer-arranque/components/bienvenida.module.css`: oscuro salvo «claro» elegido a mano y vigente, sin importar el
 * tramo de la hora; la acción principal es la tecla ámbar del enviar (`ps-tecla`: titanio, cara ámbar, canto y halo) y
 * la secundaria la misma tapa sin luz (`ps-discreta`).
 *
 * Los estilos van en un <style> propio y no en un CSS module: en `global-error` el layout raíz no existe y la hoja de
 * estilos puede no haber cargado. Por eso cada token de la app (--gold*, --l-*, --card, --brand-ink…) lleva su valor de
 * respaldo; no hay paleta nueva.
 */
import { useEffect, useState, type ComponentProps } from 'react'
import { CLAVE_TEMA, CLAVE_TEMA_HASTA, temaGuardadoVigente } from '@/shared/lib/tema-por-hora'

/** Oscuro por defecto; claro solo si la persona lo eligió a mano y sigue vigente (igual que la bienvenida). */
export function temaPantallaSistema(guardado: string | null, hasta: string | null, ahoraMs: number): 'claro' | 'oscuro' {
  return temaGuardadoVigente(guardado, hasta, ahoraMs) === 'light' ? 'claro' : 'oscuro'
}

export function PantallaSistema({ className, style, children, ...resto }: ComponentProps<'main'>) {
  // El primer pintado (servidor y cliente) es oscuro: así no hay salto para casi nadie; quien eligió claro lo ve al montar.
  const [claro, setClaro] = useState(false)
  useEffect(() => {
    try { setClaro(temaPantallaSistema(localStorage.getItem(CLAVE_TEMA), localStorage.getItem(CLAVE_TEMA_HASTA), Date.now()) === 'claro') } catch { /* sin storage: oscuro */ }
  }, [])
  return (
    <main {...resto} data-pantalla-sistema={claro ? 'claro' : 'oscuro'}
      className={[claro ? null : 'dark', className].filter(Boolean).join(' ') || undefined}
      style={{ colorScheme: claro ? 'light' : 'dark', ...style }}>
      <style dangerouslySetInnerHTML={{ __html: CSS_PANTALLA_SISTEMA }} />
      {children}
    </main>
  )
}

export const CSS_PANTALLA_SISTEMA = `
[data-pantalla-sistema] {
  --ps-luz-rgb: var(--gold-rgb, 255, 145, 1);
  --ps-luz-viva-rgb: var(--gold-bright-rgb, 255, 172, 61);
  --ps-brillo: var(--l-ambar-1-rgb, 255, 227, 189);
  --ps-marca-rgb: var(--brand-rgb, 140, 39, 241);
  --ps-anillo: linear-gradient(180deg, rgba(var(--ps-luz-viva-rgb), 0.95), rgba(var(--ps-luz-rgb), 0.38) 45%, rgba(var(--ps-luz-rgb), 0.5));
  --ps-curva-aterriza: cubic-bezier(0.34, 1.32, 0.64, 1);
  --ps-curva-anticipa: cubic-bezier(0.5, 0, 0.75, 0);
  --ps-curva-salida: cubic-bezier(0.16, 1, 0.3, 1);
  /* Oscuro (por defecto) */
  --ps-fondo: var(--background, #09090b); --ps-placa: var(--card, #16161c); --ps-borde: var(--border, #2a2a30);
  --ps-tinta: var(--foreground, #f7f8f8); --ps-tenue: var(--muted, #a1a1aa); --ps-marca: var(--brand-ink, #A968F7);
  --ps-hundido-fondo: rgba(0, 0, 0, 0.28);
  --ps-sombra-placa: 0 24px 60px -28px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.04);
  --placa-arriba: var(--l-gris-7, #2e2e36); --placa-abajo: var(--l-gris-6, #24242b);
  --canto-luz: rgba(255, 255, 255, 0.2); --canto-costado: rgba(255, 255, 255, 0.06); --canto-sombra: rgba(0, 0, 0, 0.55);
  --bisel: rgba(255, 255, 255, 0.09); --junta: rgba(0, 0, 0, 0.6); --hundido: rgba(0, 0, 0, 0.4);
  --cara: radial-gradient(90% 140% at 50% 0%, rgba(var(--ps-luz-viva-rgb), 0.42), rgba(var(--ps-luz-rgb), 0.16) 58%, rgba(var(--ps-luz-rgb), 0.08)),
          linear-gradient(180deg, var(--l-gris-5, #1c1c22), var(--l-gris-4, #16161c));
  --cara-hover: radial-gradient(90% 140% at 50% 0%, rgba(var(--ps-luz-viva-rgb), 0.54), rgba(var(--ps-luz-rgb), 0.2) 58%, rgba(var(--ps-luz-rgb), 0.1)),
                linear-gradient(180deg, var(--l-gris-5, #1c1c22), var(--l-gris-4, #16161c));
  --halo: 1;
  --tinta-viva: var(--l-ambar-1, #ffe3bd);
  --sombra-tinta: drop-shadow(0 0 6px rgba(var(--ps-luz-rgb), 0.55));
  /* Luz de marca detrás de la tarjeta (Luminorphism): un halo violeta suave, como en la bienvenida. */
  background: radial-gradient(48% 42% at 50% 44%, rgba(var(--ps-marca-rgb), 0.16), transparent 72%), var(--ps-fondo);
  color: var(--ps-tinta);
}
[data-pantalla-sistema='claro'] {
  --ps-fondo: var(--background, #f4f4f5); --ps-placa: var(--card, #ffffff); --ps-borde: var(--border, #e4e4e7);
  --ps-tinta: var(--foreground, #0f172a); --ps-tenue: var(--muted, #64748b); --ps-marca: var(--brand-ink, #8C27F1);
  --ps-hundido-fondo: rgba(15, 17, 21, 0.04);
  --ps-sombra-placa: 0 10px 30px rgba(15, 23, 42, 0.08);
  /* Claro: tapa blanca de titanio y cara ámbar con tinta oscura (el enviar del lenguaje unificado en claro). */
  --placa-arriba: var(--l-gris-16, #ffffff); --placa-abajo: var(--l-gris-14, #f4f4f5);
  --canto-luz: var(--l-gris-16, #ffffff); --canto-costado: rgba(15, 17, 21, 0.08); --canto-sombra: rgba(15, 17, 21, 0.22);
  --bisel: rgba(255, 255, 255, 0.9); --junta: rgba(15, 17, 21, 0.06); --hundido: rgba(0, 0, 0, 0.12);
  --cara: linear-gradient(180deg, var(--gold-bright, #ffac3d), var(--gold-dark, #cc7301));
  --cara-hover: linear-gradient(180deg, var(--l-ambar-2, #ffc980), var(--gold-dark, #cc7301));
  --halo: 0;
  --tinta-viva: var(--l-ambar-8, #2a1700);
  --sombra-tinta: none;
}

[data-pantalla-sistema] .ps-placa {
  background: var(--ps-placa); border: 1px solid var(--ps-borde); box-shadow: var(--ps-sombra-placa);
}
[data-pantalla-sistema] .ps-codigo {
  background: var(--ps-hundido-fondo); border: 1px solid var(--ps-borde); border-radius: 10px; padding: 8px 12px;
}

/* La tecla: tapa de titanio; ::before = cara encendida, ::after = canto luminoso (solo cambian de opacidad). */
[data-pantalla-sistema] .ps-tecla,
[data-pantalla-sistema] .ps-discreta {
  position: relative; isolation: isolate; box-sizing: border-box;
  display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;
  min-height: 2.75rem; padding: 0 1.5rem;
  font: inherit; font-size: 15px; font-weight: 600; letter-spacing: -0.005em; text-decoration: none;
  border: 1px solid transparent; border-radius: 12px; cursor: pointer; user-select: none;
  -webkit-tap-highlight-color: transparent; touch-action: manipulation;
  transition: transform 240ms var(--ps-curva-aterriza), color 240ms var(--ps-curva-salida);
  background:
    linear-gradient(180deg, var(--placa-arriba), var(--placa-abajo)) padding-box,
    radial-gradient(50% 1.5px at 30% 0, var(--canto-luz), transparent) border-box,
    linear-gradient(180deg, var(--canto-luz), var(--canto-costado) 30%, var(--canto-costado) 60%, var(--canto-sombra)) border-box,
    linear-gradient(var(--placa-abajo), var(--placa-abajo)) border-box;
  box-shadow: inset 0 1px 0 var(--bisel), 0 0 0 1px var(--junta), 0 1px 1px rgba(0, 0, 0, 0.18), 0 3px 6px -3px rgba(0, 0, 0, 0.3);
}
[data-pantalla-sistema] .ps-tecla { min-width: 160px; color: var(--tinta-viva); }
[data-pantalla-sistema] .ps-discreta { color: var(--ps-tinta); }
[data-pantalla-sistema] .ps-tecla svg { width: 16px; height: 16px; flex: none; filter: var(--sombra-tinta); }
[data-pantalla-sistema] .ps-tecla::before, [data-pantalla-sistema] .ps-tecla::after,
[data-pantalla-sistema] .ps-discreta::after {
  content: ''; position: absolute; inset: -1px; z-index: -1; border-radius: inherit; pointer-events: none;
  transition: opacity 240ms var(--ps-curva-salida);
}
[data-pantalla-sistema] .ps-tecla::before {
  background: var(--cara);
  box-shadow:
    inset 0 1px 0 rgba(var(--ps-brillo), 0.55),
    inset 0 -1px 0 var(--hundido),
    0 0 0 1px rgba(var(--ps-luz-rgb), 0.6),
    0 8px 22px -8px rgba(var(--ps-luz-rgb), 0.62),
    0 0 18px -6px rgba(var(--ps-luz-rgb), calc(0.5 * var(--halo)));
}
[data-pantalla-sistema] .ps-tecla::after, [data-pantalla-sistema] .ps-discreta::after {
  padding: 1px; background: var(--ps-anillo);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
}
[data-pantalla-sistema] .ps-discreta::after { opacity: 0; }

@media (hover: hover) {
  [data-pantalla-sistema] .ps-tecla:hover, [data-pantalla-sistema] .ps-discreta:hover { transform: translateY(-1px); }
  [data-pantalla-sistema] .ps-tecla:hover::before {
    background: var(--cara-hover);
    box-shadow:
      inset 0 1px 0 rgba(var(--ps-brillo), 0.7),
      inset 0 -1px 0 var(--hundido),
      0 0 0 1px rgba(var(--ps-luz-rgb), 0.75),
      0 10px 26px -8px rgba(var(--ps-luz-rgb), 0.78),
      0 0 24px -5px rgba(var(--ps-luz-rgb), calc(0.62 * var(--halo)));
  }
  [data-pantalla-sistema] .ps-discreta:hover::after { opacity: 0.45; }
}
[data-pantalla-sistema] .ps-tecla:active, [data-pantalla-sistema] .ps-discreta:active {
  transform: translateY(1px) scale(0.975); transition-duration: 110ms; transition-timing-function: var(--ps-curva-anticipa);
}
[data-pantalla-sistema] .ps-tecla:focus-visible, [data-pantalla-sistema] .ps-discreta:focus-visible { outline: 2px solid var(--ps-marca); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  [data-pantalla-sistema] .ps-tecla, [data-pantalla-sistema] .ps-discreta,
  [data-pantalla-sistema] .ps-tecla::before, [data-pantalla-sistema] .ps-tecla::after, [data-pantalla-sistema] .ps-discreta::after { transition: none !important; }
}
`
