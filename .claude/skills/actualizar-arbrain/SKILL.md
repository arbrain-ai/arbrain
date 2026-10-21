---
name: actualizar-arbrain
description: >
  Traer la versión nueva de Arbrain a esta copia sin perder nada del dueño: respaldo, CHANGELOG explicado, main en
  avance rápido, merge a su rama mi-arbrain, semilla nueva, reinicio del modo servidor y funciones nuevas. Usar ante
  «jala los últimos cambios», «jala los últimos cambios de Dani», «actualiza Arbrain», «hay versión nueva?» o
  «qué trae la nueva versión».
---

# Actualizar Arbrain

Procedimiento completo, en orden. La capa del dueño (CAPAS.json › alumno) nunca viene en el repo del autor, así que
una actualización solo puede chocar con archivos del autor que el dueño editó.

Objetivo: traer la versión nueva de Arbrain a la copia del dueño, sin perder nada suyo. Háblame en español simple y explícame cada paso
en una línea antes de hacerlo.

REGLAS QUE NO SE ROMPEN
- Nada mío se pierde: prohibido git reset --hard, git push --force, git clean, git rebase, git stash drop,
  git checkout -- <archivo> sobre algo que yo cambié, y resolver un conflicto quedándote con una versión completa sin
  enseñarme qué se pierde.
- Nunca subas nada al remoto «dani». Si tengo un remoto «origin» (mi respaldo), solo empujas mi-arbrain y solo si
  te lo pido.
- No leas ni muestres llaves, tokens, contraseñas, .env, llaves.json, acceso.json ni el llavero.

PASO 1 · Ubícate (solo lectura)
- La carpeta es ~/Arbrain salvo que te diga otra. Comprueba: git -C ~/Arbrain remote -v debe tener «dani» apuntando
  a el repositorio del autor (el que diga README.md o la URL que ya tenga; si GitHub avisa que se movió,
  actualiza la URL con git remote set-url dani <nueva> y dímelo). git branch --show-current debe decir mi-arbrain.
- Si no hay remoto «dani» o la carpeta no existe: no he instalado por GitHub. Dime que use el prompt de instalación y
  detente.
- Si estoy en main: git switch mi-arbrain. Si main tiene commits que no están en dani/main (git log dani/main..main),
  los hice yo por error: pásalos a mi-arbrain con git switch mi-arbrain && git merge main, explícamelo y sigue.

PASO 2 · Guarda lo mío
- git status --short. Si hay cambios: muéstrame la lista agrupada por carpeta, revisa que no haya .env, llaves ni
  bases de datos (si hay, no los agregues y avísame), y haz
  git add -A && git commit -m "Mis cambios antes de actualizar (<fecha>)"
- Rama de respaldo: git branch respaldo/antes-de-actualizar-<AAAA-MM-DD-HHMM>

PASO 3 · Qué trae el autor
- git fetch dani --tags
- Mi versión: cat VERSION. La nueva: git show dani/main:VERSION.
- Si git log --oneline main..dani/main está vacío: dime «Ya tienes lo último (versión X)» y salta al PASO 7.
- Lee git show dani/main:CHANGELOG.md y resúmeme en 5 líneas lo nuevo desde mi versión y lo que tengo que hacer yo.
- Revisa que el autor no toque mi capa: git diff --name-only main dani/main y compáralo con CAPAS.json › alumno (las
  rutas dentro de arbrain/cerebro/semilla/ no cuentan: son la semilla). Si alguna ruta mía aparece: DETENTE y dime
  que lo avise en el grupo; no sigas.

PASO 4 · Actualiza la copia del autor
- git switch main && git merge --ff-only dani/main && git switch mi-arbrain

PASO 5 · Pasa los cambios a lo mío
- git merge --no-ff main -m "Actualización del autor a la versión <nueva> (<fecha>)"
- Si no hay conflictos: sigue al PASO 6.
- Si hay conflictos (solo pueden estar en archivos del autor que yo edité): para cada archivo dime en dos líneas qué
  cambió el autor y qué había cambiado yo. Regla: se queda la estructura nueva del autor y se vuelven a poner mis líneas en
  su lugar. Si se contradicen, pregúntame cuál quiero. Si una skill mía y una nueva del autor se llaman igual, renombra
  la mía a <nombre>-mia. Al terminar: git add <archivos> && git commit --no-edit
- Si algo sale mal a la mitad: git merge --abort y dime que todo quedó como antes.

PASO 6 · Lo que cambia fuera del texto
- Semilla: python3 arbrain/cerebro/sembrar.py (solo agrega lo que me falte, nunca encima de lo mío). Si sembró algo,
  git add -A && git commit -m "Semilla de la versión <nueva>".
- Arbrain en modo servidor: si CAPAS.json › funciones.modo_servidor existe y lo tengo corriendo
  (cd ~/Arbrain/arbrain && npm run servidor -- estado), reinícialo para que use el código nuevo:
  npm run servidor -- detener && npm run servidor. Al arrancar instala y recompila solo lo que cambió. Si nunca lo
  había usado y ahora existe, ofréceme el PASO 8 del prompt de instalación.
- Ganchos: si cambió .claude/settings.json o .claude/hooks/
  (git diff --name-only respaldo/antes-de-actualizar-<fecha> HEAD -- .claude/settings.json .claude/hooks), avísame:
  Claude Code me va a pedir confirmarlos.
- Funciones nuevas: compara CAPAS.json › funciones con lo que tenía antes
  (git show respaldo/antes-de-actualizar-<fecha>:CAPAS.json). Si calendario o dictado_groq pasaron a true, guíame
  con los pasos 10 (calendario) y 11 (voz con Groq) del prompt de instalación.

PASO 7 · Verifica y reporta
- git status --short vacío; git log --oneline -3.
- Dime que abra una sesión nueva de Claude Code en ~/Arbrain para que cargue lo nuevo.
- Si tengo remoto «origin», pregúntame si respaldo: git push origin mi-arbrain.
- Resumen final en 4 líneas: de qué versión a cuál, qué trae, qué conflictos resolvimos y el nombre de la rama de
  respaldo («si algo no te gusta, volvemos con: git switch respaldo/...»).
