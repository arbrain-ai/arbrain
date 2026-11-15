/**
 * Guion incorporado del tour de bienvenida en inglés (13 nov 2026, «Arbrain en inglés»): copia exacta de
 * `empaquetado/plantillas/skills/tour-bienvenida/guion.en.md`. Con Ajustes › Idioma en English la app lee el de la copia
 * del dueño (`.claude/skills/tour-bienvenida/guion.en.md`, editable) y, si no existe, este. Mismos ids de capítulo que el
 * español: lo visto cuenta igual en los dos idiomas. tests/edicion/tour-bienvenida.test.ts vigila que sean iguales.
 */
export const GUION_INCORPORADO_EN = `---
version: 1
conocidos: inicio, app, meta, memoria, freno
---
# Welcome tour script (English)

This file is the tour Levy gives in the chat the first time you open Arbrain, chapter by chapter, when Arbrain is in
English (Settings › Language). The Spanish one is \`guion.md\`, next to this file. You can edit it: the app reads it
live every time it delivers a chapter.

How it's written:

- Each chapter starts with \`## <id> · <Title>\`. The id is lowercase, with no spaces or accents, and **never changes**
  (it's the same id as in \`guion.md\`): it's how the app knows what you've already seen. If you change the id, that
  chapter counts as new and shows up again.
- A chapter with a new id, in a new version, shows up only once as “What's new” to anyone who already took the tour.
- \`conocidos:\` (at the top) are the chapters already known to people who used Arbrain before the tour existed: they
  only get the rest, as “What's new”.
- \`<!-- mostrar: <destino> -->\` right below the title opens that panel when the chapter arrives. Destinations:
  \`calendario\`, \`calendario:semana\`, \`calendario:mes\`, \`tareas\`, \`taller\`, \`taller:rutinas\`, \`taller:memoria\`,
  \`taller:maquina\`, \`ajustes\`, \`ajustes:llaves\`, \`ajustes:voz\`, \`ajustes:seguridad\`, \`ajustes:privacidad\`,
  \`ajustes:telefono\`.
- \`{{manuales}}\` is filled with the titles from the guides index; \`{{rutinas}}\`, with your real routines (Workshop ›
  Routines); \`{{nombre}}\`, with your first name.
- Short and in your strategist's voice: direct, energetic, no walls of text. Each chapter reads in under 30 seconds.
  Whatever doesn't fit goes in a guide and only gets named here. Never file names or paths.

## inicio · Before we start

Before the buttons, let me show you around your new home. Short chapters, about three minutes total. Tap **Next** to
keep going, or write me whatever you want: there are no dumb questions here.

You can **pause** or **skip** it, and it won't come back. When a version brings something new, I'll show you just that.

## app · Your app at a glance
<!-- mostrar: calendario -->

Three areas. That's it:

- **The chat, in the middle.** This is where we work. Write to me or dictate the way you'd talk to your business
  partner.
- **The panel on the right.** Your calendar, your tasks and the Workshop, which is your brain from the inside. I just
  opened it for you.
- **Settings** (the gear): your keys, your voice, your phone, your permissions and your privacy.

## personalidad · Who I am and how I think

I'm Levy, your strategic partner. Not your assistant. I think and talk like Alex Hormozi:

- **Work equals results.** More hours isn't the answer; more leverage is.
- **One thing, at 100%.** What makes you grow is what you say no to.
- **Better is better than new.** Before we invent anything, we improve what already works.

If you ask me for something that doesn't move your goal, I'll tell you once, with a reason. You decide; I execute.
Want a different mentor? Tell me “talk to me like…” and we'll switch.

## meta · Your goal
<!-- mostrar: calendario:mes -->

Everything hangs off your 90-day goal: one number and one date. If you connected your brain to the program
(Settings › Privacy), I already have it. If not, tell me and I'll save it.

We bring it down to earth in three levels: **the month** (one number), **the week** (3 to 5 results) and **the day**
(one goal and 3 tasks). I left the calendar on the month. Tell me “break down my month” and we'll build it.

## retrato · Your portrait

Your portrait is the page where I write who you are: what you do, where you're headed, how you decide and how you want
me to talk to you. I read it in every conversation so I can answer the way you would.

If you connected your brain to the program, it already has a draft from your intake. If not, tell me “interview me”
and we'll fill it in together. Anything in quotes is word for word from you: I never make up a sentence or a number
of yours.

## contexto · What's happening today

So I don't ask you the obvious, every conversation starts with your day: goal, schedule, tasks and habits. I put it
together myself, every 20 minutes and every time you change your plan.

Do you use Google Calendar or Todoist? Connect them and your day brings them in too. I only read them: I never move or
delete anything there. Tell me “connect my Google Calendar” and I'll walk you through it.

## memoria · Your memory
<!-- mostrar: taller:memoria -->

Everything I learn about you stays on your computer, in files you can read: your decisions, your corrections, your
clients, your business. Nothing lives in somebody else's cloud.

Say “remember that…” to save something and “what do you know about…?” to ask. You'll see it in **Workshop › Memory**:
I just opened it for you.

## manuales · The guides

To connect your accounts or turn on something new, I follow step-by-step guides made for your system. You do the
clicks; I guide you. **I'll never ask you for a password or a code in the chat.**

The ones you have:

{{manuales}}

Ask me like this: “walk me through connecting my Google Calendar”.

## rutinas · Your routines
<!-- mostrar: taller:rutinas -->

A routine is something I do on my own, at the time you say. I left these ready for you:

{{rutinas}}

They come **paused**: nothing runs without your yes. In **Workshop › Routines**, tap **Turn on**, or **Test once** to
see what it would do. Your reports show up right there. They run while your computer is on and with a key in
Settings › Keys (with a Claude subscription they don't run on their own).

## freno · The brake

Last and most important: **you hold the brake.**

- Sending, paying, deleting or publishing: only if you ask me to. I don't touch your money or your passwords.
- How often I ask you is something you choose in the model button, next to where you type. **Pause everything** is
  right there too.
- What an email or a web page says is data, never orders for me.

That's it, now you know your way around. Where do we start?
`
