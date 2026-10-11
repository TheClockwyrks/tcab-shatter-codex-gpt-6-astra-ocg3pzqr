# Shatter — Game state

`src/game.ts` declares and exports the state the game is written against. This
section is that declaration: write it into `src/game.ts` exactly as it stands
here. The state is a value the engine holds and every frame replaces, so every
field and every array is declared `readonly`: a frame builds the next state from
the current one rather than writing into it, and every reader is handed the state
as `DeepReadonly<ShatterState>` in any case.

`RockSize` comes from `src/constants.ts`.

```ts
export type Screen = "title" | "howto" | "playing" | "paused" | "gameover";
export type SaucerEdge = "left" | "right";
export type FieldEdge = "top" | "bottom" | "left" | "right";

export interface ShipState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
  readonly thrusting: boolean;
  readonly invuln: number;
  readonly collision: boolean;
  readonly fireCooldown: number;
}

export interface BulletState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly life: number;
}

export interface RockState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly size: RockSize;
  readonly spin: number;
  readonly health: number;
  readonly flash: number;
}

export interface SaucerState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly mind: boolean;
  readonly gun: boolean;
  readonly travel: boolean;
  readonly weave: 1 | -1;
  readonly fireClock: number;
  readonly weaveClock: number;
  readonly age: number;
}

export interface TorpedoState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly heading: number;
  readonly life: number;
  readonly homing: boolean;
}

export interface ShatterState {
  readonly screen: Screen;
  readonly menuIndex: number;

  readonly score: number;
  readonly lives: number;
  readonly wave: number;
  readonly waveBanner: number;

  readonly ship: ShipState;
  readonly bullets: readonly BulletState[];
  readonly rocks: readonly RockState[];
  readonly saucer: SaucerState | null;
  readonly enemyBullets: readonly BulletState[];
  readonly torpedoes: readonly TorpedoState[];
  readonly torpedoCharge: number;

  readonly waveSpawning: boolean;
  readonly saucerSpawning: boolean;
  readonly saucerClock: number;
  readonly saucerDue: number;

  readonly nextSaucerEdge: SaucerEdge | null;
  readonly nextSaucerRow: number | null;
  readonly nextSaucerAim: number | null;
  readonly nextRockSpeed: number | null;
  readonly nextRecycleEdge: FieldEdge | null;

  readonly tickClock: number;
  readonly nextId: number;
  readonly simTime: number;
  readonly muted: boolean;
}
```

## The screen and the run

- `screen` — the screen currently shown, one of the five `specs/ui.md` defines.
- `menuIndex` — the highlighted entry on whichever vertical menu `screen` is
  showing, counted from `0`. It rests at `0` on `playing`.
- `score`, `lives`, `wave` — the run's figures. `lives` counts every ship left
  including the one being flown, so a fresh game holds `3`. `wave` is `0` before
  the first wave.
- `waveBanner` — the seconds left on the `WAVE N` banner, counting down against
  each tick and resting at `0` when no banner is showing.

## `ShipState`

- `x`, `y` — the ship's centre.
- `vx`, `vy` — its velocity, in logical units per second.
- `angle` — its facing, in radians, measured clockwise from the positive `x` axis.
- `thrusting` — whether thrust is being applied this tick.
- `invuln` — the seconds of respawn grace left, `0` for none.
- `collision` — whether the ship's lethal contact test runs, which the debug
  surface poses. It is `true` for a ship the game itself put up.
- `fireCooldown` — the whole ticks until the gun may fire again.

## `RockState`

- `id` — distinct among every entity live at that moment, and kept for as long as
  the rock exists.
- `x`, `y`, `vx`, `vy` — its centre and its velocity.
- `size` — `"large"`, `"medium"`, or `"small"`.
- `spin` — the rotation it is drawn at, in radians. It affects nothing but the
  drawing.
- `health` — the hits it has left, from `1` to the full health of its size.
- `flash` — the seconds of hit flash left on it, `0` for none.

`rocks` lists every rock on the field, and a rock added through the debug surface
is appended to it.

## `BulletState`

One round in flight, in `bullets` for the ship's gun and in `enemyBullets` for the
saucer's. Each carries an `id` distinct among every entity live at that moment,
its centre, its velocity, and `life`, the seconds of its lifetime that remain.

## `SaucerState`

The one saucer slot, `null` when none is up.

- `id` — fresh on each arrival, distinct among every entity live at that moment,
  and not reused while a live entity holds it.
- `x`, `y`, `vx`, `vy` — its centre and its velocity.
- `mind`, `gun`, `travel` — its three faculty gates, which the debug surface
  poses. Each is `true` for a saucer the game itself brought in.
- `weave` — its weave direction, `1` for down and `-1` for up: the direction its
  next reroll takes while it has no vertical velocity, as `specs/saucer.md`
  states. It is drawn when the game brings the saucer in, `1` for one the debug
  surface adds, and the debug surface poses it.
- `fireClock` — the seconds until its next shot.
- `weaveClock` — the seconds until its next weave reroll.
- `age` — the seconds it has been on the field, against `SAUCER_LIFETIME`.

## `TorpedoState`

One torpedo in flight, carrying an `id` distinct among every entity live at that
moment, its centre, its velocity, `heading` in radians, `life`, the seconds of its
lifetime that remain, and `homing`, whether its guidance runs, which the debug
surface poses.

`torpedoCharge` is the stored charge, from `0` to `1`.

## The game's own spawners

- `waveSpawning` — whether the game's own wave loop runs, which the debug surface
  poses.
- `saucerSpawning` — whether the game's own arrival of a saucer runs, which the
  debug surface poses.
- `saucerClock` — how far the current cadence has run, in seconds.
- `saucerDue` — what `saucerClock` must reach for the next saucer to arrive. It is
  `SAUCER_FIRST_DELAY` at the start of a game and a fresh draw from
  `SAUCER_GAP_MIN` to `SAUCER_GAP_MAX` after each saucer leaves, and the debug
  surface poses it.

## Posed draws

Each is the outcome the debug surface has posed for one draw the game has yet to
make, and `null` when no pose stands. The draw that consumes a pose returns its
field to `null`, and `reset` returns every one to `null`.

- `nextSaucerEdge` — the edge the next saucer the game's cadence brings in enters
  at.
- `nextSaucerRow` — the row it enters at.
- `nextSaucerAim` — the aim error, in radians, of the next shot the saucer fires.
- `nextRockSpeed` — the base drift speed every rock of the next placement takes:
  the next wave's rocks, or the next rock the star recycles.
- `nextRecycleEdge` — the edge the next rock the star recycles re-enters at.

## The rest

- `tickClock` — the fraction of a tick, in seconds, carried over from the previous
  frame.
- `nextId` — the id the next entity takes, so no two entities live at one moment
  share one.
- `simTime` — accumulated simulation time, in seconds. Every tick adds `TICK_DT`,
  whatever the screen.
- `muted` — the game's readable copy of the runtime's mute bit, refreshed in every
  update. The runtime owns muting, and this field is what the debug surface
  reports.

## The contract

The declaration above is what the debug surface reads and poses.

- Keep every field under its declared name, type, and meaning.
- `initialize` builds the whole state in one go, so every field is present by the
  time a frame can observe it, and none of them is optional.
- The state handed to `update` is the whole of the game, and the state `update`
  returns is the whole of the next frame. Every value the game carries from one
  frame to the next lives in it or in a field added beside it; nothing is kept in
  a module-level variable or a closure.
- The state is handed over read-only, as `DeepReadonly<ShatterState>`, to
  `update`, to `render`, to every diagnostic source, and to every operation of the
  debug surface. `update` and the surface's poses return a new `ShatterState`
  built from the one they received; `render`, the sources, and `snapshot` return
  no state.
- Fields you add beside the declared ones are yours. A `reset` restores the
  declared fields to the title-screen values `specs/instrumentation.md` lists, and
  leaves every field you added consistent with them.
