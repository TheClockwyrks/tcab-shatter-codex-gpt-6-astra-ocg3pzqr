# Shatter

A gravity-well rock shooter for the browser. Fly on momentum, break armored rocks
into smaller fragments, and survive escalating waves. The central star bends rocks
and gunfire, but your ship and guided torpedo hold their own course. A hunting
saucer keeps you moving.

This is the **Warhead** ruleset: larger rocks take multiple hits, and a homing
torpedo destroys any rock outright. You carry one charge, replenished in ten seconds.

## Run

Requires Node.js compatible with Vite 8 (Node 22.12+ recommended).

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. Everything is drawn and synthesized in the
browser; no assets, accounts, or backend services are required.

## Production

```sh
npm ci
npm run build
```

The complete static site is written to `dist/`. Serve that directory from any
static host, including a subdirectory. To preview it locally:

```sh
npm run preview
```

## Controls

| Input | Action |
| --- | --- |
| Up arrow / W | Thrust |
| Left and right arrows / A and D | Turn |
| Space | Fire; hold for repeated shots |
| F | Launch a homing torpedo |
| P / Escape | Pause or resume |
| M | Toggle sound |
| Up and down arrows / W and S | Select a menu item |
| Enter / Space | Confirm |
| Escape | Return from a menu |
| Backtick | Toggle the read-only debug overlay |

Menus also accept mouse and touch. Touch devices get the engine's on-screen flight
controls. There is no reverse thrust: turn against your drift to slow down.

Clear every fragment to advance. The star absorbs shots, returns swallowed rocks
at the field's edge, and lets your ship slide around its core. A torpedo acquires
the nearest target within its narrow forward cone; aim before launching.

## Checks and structure

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

Tests run the real engine over a native canvas and a counted clock. They cover
fixed-step flight, continuous wrapping collisions, armor, both fragment patterns,
guidance, waves, lives, saucer faculties, input, and the debug surface. Coverage and
test reports are written to `coverage/`.

`src/game.ts` declares the immutable state and the game interface. `physics.ts`
contains the render-free simulation, `runtime.ts` connects input and audio,
`debug.ts` implements the automation contract, and `render.ts` draws the field and
screens. The supplied bootstrap, constants, configuration, and engine are unchanged.

The [showcase](showcase/showcase.md) includes screenshots and engine recordings of
actual play. The [specification](specs/overview.md) documents the complete rules and
automation API.
