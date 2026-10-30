# Motor de Arbrain (Rust)

Dueño de las PTYs inmortales (compatible con sfterm-ptyd PROTO 1). Crate `arbrain-motor` (lib + bin).

## Verificación

Desde `arbrain/motor/`:

- Types: `cargo check --locked --all-targets`
- Formato: `cargo fmt --check`
- Lint: `cargo clippy --locked --all-targets -- -D warnings`
- Test: `cargo test --locked --all-targets` (~20 s; `tests/motor.rs` levanta el binario real)

Estado 10 oct 2026: check, `fmt --check`, clippy `-D warnings` y test verdes (10 de 10, sin ignorados).

## Tombstone: adopción del ptyd de SFTerm (retirada 10 oct 2026)

- **Qué era:** `src/legacy.rs` (arrancada desde `serve` en `server.rs`) se conectaba al socket `~/.config/sfterm/ptyd.sock`, adoptaba las terminales vivas del ptyd de SFTerm con su mismo id y PID (`Backend::Adopted`, `insert_adopted`) y reintentaba cada 3 s. Variables `ARBRAIN_MOTOR_LEGACY` / `ARBRAIN_MOTOR_LEGACY_READONLY`, modo `--ptyd`, candado `puede_cerrar_adoptada` y el test `adopta_el_ptyd_de_sfterm_sin_tocarlo`.
- **Por qué se fue:** SFTerm se retiró el 5 oct 2026 y su socket ya no existe; era código dormido que solo reintentaba en vacío.
- **Cable:** `MotorInfo.legacy*` y `origin`/`readonly` de `TermDetail` siguen en el protocolo (el cliente TS los lee) con valores fijos (`None`/`false`/`"motor"`); `Req::Kill.autoriza` se acepta e ignora.
- **Recuperarla:** `git show d9cca3bb:arbrain/motor/src/legacy.rs` (y el resto del árbol de `arbrain/motor` en ese commit). Entra al motor instalado en su próximo build.
