# Seguridad de Arbrain

## Reportar una vulnerabilidad

No abras un issue público. Usa el reporte privado de GitHub:
**Security › Report a vulnerability** en este repositorio
(<https://github.com/arbrain-ai/arbrain/security/advisories/new>). Respondemos en 72 horas y te avisamos cuando
haya arreglo publicado. Si la falla deja ver llaves, correos o datos de alguien, no los copies en el reporte: describe
cómo se llega a ellos.

## Qué versiones reciben arreglos

Solo la última versión publicada (`VERSION` en `main`). Para actualizar: abre Claude Code en `~/Arbrain` y di
«actualiza Arbrain».

## Cómo verificar lo que bajas

Cada versión es una etiqueta `vX.Y.Z` **firmada** con la llave SSH de publicación del autor. Las llaves permitidas
están en [`.github/firmas-permitidas`](firmas-permitidas) y sus huellas son:

| Llave | Huella |
|---|---|
| publicación | `SHA256:4P8nBVDwu6QSpWvwbNtSqauB2uznLzx7ubE0tR6lNbg` |
| reserva (fuera de línea, solo para rotar) | `SHA256:aUWS32K1l0qkStFPnCSMFmWu9QMQGCiZ6SwENG22Jy8` |

Compara esas huellas con las publicadas en arbrain.ai: si no coinciden, no instales y avisa.

```bash
cd ~/Arbrain
git fetch dani --tags
git -c gpg.format=ssh -c gpg.ssh.allowedSignersFile="$HOME/.config/arbrain/firmas-permitidas" verify-tag vX.Y.Z
```

La instalación guarda una copia de las llaves en `~/.config/arbrain/firmas-permitidas` (fuera del repo) y la
actualización (`.claude/skills/actualizar-arbrain/verificar.py`) verifica cada versión nueva contra **esa** copia:
quien lograra escribir en este repositorio no podría publicar una versión que tu Arbrain acepte sin la llave del
autor. Una etiqueta movida, renombrada o anterior a la tuya también se rechaza.

Cada versión trae además, en su release, el código fuente empaquetado, su SBOM (CycloneDX) y una atestación de
procedencia de GitHub Actions (Sigstore):

```bash
gh attestation verify arbrain-vX.Y.Z.tar.gz --repo arbrain-ai/arbrain
```

## Cómo se protege este repositorio

- `main` no admite borrado ni reescritura de historia (sin excepción) y los cambios de terceros entran solo por PR
  revisado, con firma y con el chequeo `capas` verde.
- Las etiquetas `v*` no se pueden mover ni borrar; solo el administrador las crea. Los releases son inmutables.
- Secret scanning con push protection, Dependabot (alertas y arreglos de seguridad), CodeQL y OpenSSF Scorecard.
- GitHub Actions: solo acciones de GitHub y una lista cerrada, fijadas por SHA, con `GITHUB_TOKEN` de solo lectura
  por defecto y aprobación obligatoria para workflows de forks externos.
