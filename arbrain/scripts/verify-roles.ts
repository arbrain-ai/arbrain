/**
 * GATE: la leyenda no puede prometer distinciones que el ojo no puede hacer.
 *   npx tsx scripts/verify-roles.ts
 */
import { THEMES, type Role } from '../src/features/canvas/theme/tokens'
import { auditRoles, channelsBetween } from '../src/features/canvas/audit/roles'

const EN_LEYENDA: Role[] = ['module', 'form', 'callout', 'deliverable', 'trigger', 'risk', 'agent']

let fallos = 0
for (const [nombre, theme] of Object.entries(THEMES)) {
  const clashes = auditRoles(theme, EN_LEYENDA)
  console.log(`\ntema ${nombre}: ${EN_LEYENDA.length} roles en leyenda, ${clashes.length} par(es) indistinguibles`)
  for (const c of clashes) {
    fallos++
    console.log(`  [FAIL] "${c.a}" y "${c.b}" difieren en ${c.canales} canal(es): ${c.detalle}`)
  }
  if (clashes.length === 0) {
    // Se imprime el par MAS PARECIDO aunque pase: saber cual es el margen mas
    // delgado vale mas que un verde sin numero.
    let peor = { a: EN_LEYENDA[0], b: EN_LEYENDA[1], n: 99, detalle: '' }
    for (let i = 0; i < EN_LEYENDA.length; i++) for (let j = i + 1; j < EN_LEYENDA.length; j++) {
      const r = channelsBetween(theme, EN_LEYENDA[i], EN_LEYENDA[j])
      if (r.n < peor.n) peor = { a: EN_LEYENDA[i], b: EN_LEYENDA[j], n: r.n, detalle: r.detalle }
    }
    console.log(`  par mas parecido: "${peor.a}" vs "${peor.b}" — ${peor.n} canales (${peor.detalle})`)
  }
}

if (fallos > 0) { console.error(`\nFALLO — ${fallos} par(es) que la leyenda promete y el ojo no distingue`); process.exit(1) }
console.log('\nROLES OK — cada categoria de la leyenda se distingue por al menos 2 canales')
