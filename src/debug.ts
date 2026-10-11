import * as C from "./constants";
import type { FieldEdge, SaucerEdge, Screen, ShatterState } from "./game";
import { initial, menuRect, saucer, type State } from "./model";

function finite(...values: number[]): void {
  if (values.some((n) => !Number.isFinite(n)))
    throw new Error("Expected finite numbers");
}
function member<T extends string | number>(
  value: T,
  choices: readonly T[],
): void {
  if (!choices.includes(value)) throw new Error(`Invalid value: ${value}`);
}
function found<T extends { readonly id: number }>(
  items: readonly T[],
  id: number,
): T {
  finite(id);
  const item = items.find((r) => r.id === id);
  if (!item) throw new Error(`No entity ${id}`);
  return item;
}
function requireSaucer(s: State) {
  if (!s.saucer) throw new Error("No saucer");
  return s.saucer;
}
function scalar<K extends keyof ShatterState>(key: K) {
  return (s: State, n: NonNullable<ShatterState[K]>): ShatterState => {
    if (typeof s[key] === "boolean") {
      if (typeof n !== "boolean") throw new Error("Expected a boolean");
    } else if (!Number.isFinite(n)) throw new Error("Expected a finite number");
    return { ...s, [key]: n };
  };
}
function shipScalar<K extends keyof ShatterState["ship"]>(key: K) {
  return (s: State, n: ShatterState["ship"][K]): ShatterState => {
    if (typeof s.ship[key] === "boolean") {
      if (typeof n !== "boolean") throw new Error("Expected a boolean");
    } else if (!Number.isFinite(n)) throw new Error("Expected a finite number");
    return { ...s, ship: { ...s.ship, [key]: n } };
  };
}
function saucerGate(key: "mind" | "gun" | "travel") {
  return (s: State, enabled: boolean): ShatterState => ({
    ...s,
    saucer: { ...requireSaucer(s), [key]: enabled },
  });
}
function addBullet(
  s: State,
  x: number,
  y: number,
  vx: number,
  vy: number,
  enemy: boolean,
): ShatterState {
  finite(x, y, vx, vy);
  const key = enemy ? "enemyBullets" : "bullets";
  return {
    ...s,
    nextId: s.nextId + 1,
    [key]: [
      ...s[key],
      {
        id: s.nextId,
        x,
        y,
        vx,
        vy,
        life: enemy ? C.SAUCER_BULLET_LIFE : C.BULLET_LIFE,
      },
    ],
  };
}
function remove(key: "bullets" | "enemyBullets" | "rocks" | "torpedoes") {
  return (s: State, id: number): ShatterState => {
    found<{ readonly id: number }>(s[key], id);
    return { ...s, [key]: s[key].filter((e) => e.id !== id) };
  };
}
export const debug = {
  version: C.SHATTER_DEBUG_VERSION,
  reset: (s: State): ShatterState => initial(s.muted),
  reconcile: (s: State): ShatterState => ({ ...s }),
  snapshot: (s: State) => ({
    version: C.SHATTER_DEBUG_VERSION,
    screen: s.screen,
    menuIndex: s.menuIndex,
    score: s.score,
    lives: s.lives,
    wave: s.wave,
    waveBanner: s.waveBanner,
    muted: s.muted,
    waveSpawning: s.waveSpawning,
    saucerSpawning: s.saucerSpawning,
    saucerClock: s.saucerClock,
    saucerDue: s.saucerDue,
    nextSaucerEdge: s.nextSaucerEdge,
    nextSaucerRow: s.nextSaucerRow,
    nextSaucerAim: s.nextSaucerAim,
    nextRockSpeed: s.nextRockSpeed,
    nextRecycleEdge: s.nextRecycleEdge,
    ship: { ...s.ship, speed: Math.hypot(s.ship.vx, s.ship.vy) },
    bullets: s.bullets.map((b) => ({ ...b })),
    rocks: s.rocks.map((r) => ({
      id: r.id,
      x: r.x,
      y: r.y,
      vx: r.vx,
      vy: r.vy,
      size: r.size,
      radius: C.ROCK_RADIUS[r.size],
      health: r.health,
    })),
    saucer: s.saucer ? { ...s.saucer } : null,
    enemyBullets: s.enemyBullets.map((b) => ({ ...b })),
    torpedoes: s.torpedoes.map((t) => ({ ...t })),
    torpedoCharge: s.torpedoCharge,
    torpedoReady: s.torpedoCharge === 1,
    simTime: s.simTime,
  }),
  menuItemRect: menuRect,
  setScreen: (s: State, screen: Screen): ShatterState => {
    member(screen, ["title", "howto", "playing", "paused", "gameover"]);
    return { ...s, screen };
  },
  setMenuIndex: scalar("menuIndex"),
  setScore: scalar("score"),
  setLives: scalar("lives"),
  setWave: scalar("wave"),
  setWaveBanner: scalar("waveBanner"),
  setWaveSpawning: scalar("waveSpawning"),
  setSaucerSpawning: scalar("saucerSpawning"),
  setSaucerDue: scalar("saucerDue"),
  setShipPosition: (s: State, x: number, y: number): ShatterState => {
    finite(x, y);
    return { ...s, ship: { ...s.ship, x, y } };
  },
  setShipVelocity: (s: State, vx: number, vy: number): ShatterState => {
    finite(vx, vy);
    return { ...s, ship: { ...s.ship, vx, vy } };
  },
  setShipAngle: shipScalar("angle"),
  setShipInvuln: shipScalar("invuln"),
  setFireCooldown: shipScalar("fireCooldown"),
  setShipCollision: shipScalar("collision"),
  addBullet: (s: State, x: number, y: number, vx: number, vy: number) =>
    addBullet(s, x, y, vx, vy, false),
  addEnemyBullet: (s: State, x: number, y: number, vx: number, vy: number) =>
    addBullet(s, x, y, vx, vy, true),
  removeBullet: remove("bullets"),
  removeEnemyBullet: remove("enemyBullets"),
  clearBullets: (s: State): ShatterState => ({ ...s, bullets: [] }),
  clearEnemyBullets: (s: State): ShatterState => ({ ...s, enemyBullets: [] }),
  addRock: (s: State, size: C.RockSize, x: number, y: number): ShatterState => {
    finite(x, y);
    member(size, ["large", "medium", "small"]);
    return {
      ...s,
      nextId: s.nextId + 1,
      rocks: [
        ...s.rocks,
        {
          id: s.nextId,
          x,
          y,
          vx: 0,
          vy: 0,
          size,
          spin: 0,
          health: C.ROCK_HEALTH[size],
          flash: 0,
        },
      ],
    };
  },
  setRockVelocity: (
    s: State,
    id: number,
    vx: number,
    vy: number,
  ): ShatterState => {
    finite(vx, vy);
    found(s.rocks, id);
    return {
      ...s,
      rocks: s.rocks.map((r) => (r.id === id ? { ...r, vx, vy } : r)),
    };
  },
  setRockHealth: (s: State, id: number, health: number): ShatterState => {
    finite(health);
    found(s.rocks, id);
    return {
      ...s,
      rocks: s.rocks.map((r) => (r.id === id ? { ...r, health } : r)),
    };
  },
  removeRock: remove("rocks"),
  clearRocks: (s: State): ShatterState => ({ ...s, rocks: [] }),
  addSaucer: (s: State, x: number, y: number): ShatterState => {
    finite(x, y);
    return { ...s, nextId: s.nextId + 1, saucer: saucer(s.nextId, x, y) };
  },
  setSaucerVelocity: (s: State, vx: number, vy: number): ShatterState => {
    finite(vx, vy);
    return { ...s, saucer: { ...requireSaucer(s), vx, vy } };
  },
  setSaucerWeave: (s: State, weave: 1 | -1): ShatterState => {
    member(weave, [1, -1]);
    return { ...s, saucer: { ...requireSaucer(s), weave } };
  },
  removeSaucer: (s: State): ShatterState => ({ ...s, saucer: null }),
  setSaucerMind: saucerGate("mind"),
  setSaucerGun: saucerGate("gun"),
  setSaucerTravel: saucerGate("travel"),
  setNextSaucerEdge: (s: State, edge: SaucerEdge): ShatterState => {
    member(edge, ["left", "right"]);
    return { ...s, nextSaucerEdge: edge };
  },
  setNextSaucerRow: scalar("nextSaucerRow"),
  setNextSaucerAim: scalar("nextSaucerAim"),
  setNextRockSpeed: scalar("nextRockSpeed"),
  setNextRecycleEdge: (s: State, edge: FieldEdge): ShatterState => {
    member(edge, ["top", "bottom", "left", "right"]);
    return { ...s, nextRecycleEdge: edge };
  },
  setTorpedoCharge: scalar("torpedoCharge"),
  addTorpedo: (
    s: State,
    x: number,
    y: number,
    heading: number,
  ): ShatterState => {
    finite(x, y, heading);
    return {
      ...s,
      nextId: s.nextId + 1,
      torpedoes: [
        ...s.torpedoes,
        {
          id: s.nextId,
          x,
          y,
          heading,
          vx: C.TORPEDO_SPEED * Math.cos(heading),
          vy: C.TORPEDO_SPEED * Math.sin(heading),
          life: C.TORPEDO_LIFE,
          homing: true,
        },
      ],
    };
  },
  setTorpedoHeading: (s: State, id: number, heading: number): ShatterState => {
    finite(heading);
    const t = found(s.torpedoes, id);
    const speed = Math.hypot(t.vx, t.vy);
    return {
      ...s,
      torpedoes: s.torpedoes.map((t) =>
        t.id === id
          ? {
              ...t,
              heading,
              vx: speed * Math.cos(heading),
              vy: speed * Math.sin(heading),
            }
          : t,
      ),
    };
  },
  setTorpedoHoming: (s: State, id: number, homing: boolean): ShatterState => {
    found(s.torpedoes, id);
    return {
      ...s,
      torpedoes: s.torpedoes.map((t) => (t.id === id ? { ...t, homing } : t)),
    };
  },
  removeTorpedo: remove("torpedoes"),
  clearTorpedoes: (s: State): ShatterState => ({ ...s, torpedoes: [] }),
};
