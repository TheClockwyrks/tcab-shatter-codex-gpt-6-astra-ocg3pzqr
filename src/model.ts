import * as C from "./constants";
import type { ShatterState, ShipState, SaucerState } from "./game";
import type { DeepReadonly, DeepWritable } from "ts-essentials";

export type State = DeepReadonly<ShatterState>;
export type Draft = DeepWritable<ShatterState>;
export const wrap = (n: number, size: number): number =>
  ((n % size) + size) % size;
export const delta = (n: number, size: number): number =>
  wrap(n + size / 2, size) - size / 2;
export const angleDelta = (n: number): number => delta(n, Math.PI * 2);
export interface Body {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
}
export const separation = (
  a: Pick<Body, "x" | "y">,
  b: Pick<Body, "x" | "y">,
) => ({ x: delta(b.x - a.x, C.FIELD_W), y: delta(b.y - a.y, C.FIELD_H) });
export function distance(
  a: Pick<Body, "x" | "y">,
  b: Pick<Body, "x" | "y">,
): number {
  const d = separation(a, b);
  return Math.hypot(d.x, d.y);
}
export const random = (min: number, max: number): number =>
  min + Math.random() * (max - min);
export const star = { x: C.STAR_X, y: C.STAR_Y, vx: 0, vy: 0 };
export function ship(): ShipState {
  return {
    x: C.SAFE_X,
    y: C.SAFE_Y,
    vx: 0,
    vy: 0,
    angle: C.FACE_UP,
    thrusting: false,
    invuln: 0,
    collision: true,
    fireCooldown: 0,
  };
}
export function saucer(id: number, x: number, y: number): SaucerState {
  return {
    id,
    x,
    y,
    vx: C.SAUCER_SPEED,
    vy: 0,
    mind: true,
    gun: true,
    travel: true,
    weave: 1,
    fireClock: C.SAUCER_FIRE_INTERVAL,
    weaveClock: C.SAUCER_WEAVE_INTERVAL,
    age: 0,
  };
}
export function initial(muted = false): ShatterState {
  return {
    screen: "title",
    menuIndex: 0,
    score: 0,
    lives: C.START_LIVES,
    wave: 0,
    waveBanner: 0,
    ship: ship(),
    bullets: [],
    rocks: [],
    saucer: null,
    enemyBullets: [],
    torpedoes: [],
    torpedoCharge: 1,
    waveSpawning: true,
    saucerSpawning: true,
    saucerClock: 0,
    saucerDue: C.SAUCER_FIRST_DELAY,
    nextSaucerEdge: null,
    nextSaucerRow: null,
    nextSaucerAim: null,
    nextRockSpeed: null,
    nextRecycleEdge: null,
    tickClock: 0,
    nextId: 1,
    simTime: 0,
    muted,
    trails: {},
    particles: [],
    extraLifeBanner: 0,
    fieldTime: 0,
    pointerStarts: {},
    pendingFire: false,
    pendingTorpedo: false,
  };
}
/** Copy only value data; no reference to the engine's immutable state is mutated. */
export function draft(s: State): Draft {
  return {
    ...s,
    ship: { ...s.ship },
    rocks: s.rocks.map((r) => ({ ...r })),
    bullets: s.bullets.map((b) => ({ ...b })),
    enemyBullets: s.enemyBullets.map((b) => ({ ...b })),
    torpedoes: s.torpedoes.map((t) => ({ ...t })),
    saucer: s.saucer ? { ...s.saucer } : null,
    trails: Object.fromEntries(
      Object.entries(s.trails).map(([id, p]) => [id, p.map((v) => ({ ...v }))]),
    ),
    particles: s.particles.map((p) => ({ ...p })),
    pointerStarts: { ...s.pointerStarts },
  };
}
export const countdown = (n: number): number =>
  Math.max(0, n - C.TICK_DT < 1e-10 ? 0 : n - C.TICK_DT);
export function newGame(s: State): ShatterState {
  return {
    ...initial(s.muted),
    screen: "playing",
    wave: 1,
    waveBanner: C.WAVE_BANNER_TIME,
    simTime: s.simTime,
    tickClock: s.tickClock,
  };
}
export function menuItems(s: State): readonly string[] {
  return s.screen === "title"
    ? C.TITLE_ITEMS
    : s.screen === "paused"
      ? C.PAUSE_ITEMS
      : s.screen === "gameover"
        ? C.GAMEOVER_ITEMS
        : [];
}
export function menuRect(s: State, index: number) {
  if (!Number.isFinite(index)) throw new Error("Invalid menu index");
  if (!Number.isInteger(index) || index < 0 || index >= menuItems(s).length)
    return null;
  return {
    x: s.screen === "title" ? 100 : 460,
    y: (s.screen === "title" ? 420 : 370) + index * 62,
    w: s.screen === "title" ? 320 : 360,
    h: 50,
  };
}
