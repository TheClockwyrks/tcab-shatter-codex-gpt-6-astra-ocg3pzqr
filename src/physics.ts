import * as C from "./constants";
import {
  type Body,
  type Draft,
  type State,
  draft,
  wrap,
  separation,
  distance,
  angleDelta,
  star,
  countdown,
  random,
  ship,
  saucer,
} from "./model";
import type { ShatterState, RockState, Point } from "./game";

export interface Controls {
  readonly turn: number;
  readonly thrust: boolean;
  readonly fire: boolean;
  readonly torpedo: boolean;
}
export interface TickResult {
  readonly state: ShatterState;
  readonly cues: readonly C.CueName[];
}
interface Motion {
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
}
const still = (b: Pick<Body, "x" | "y">): Motion => ({ ...b, dx: 0, dy: 0 });

/** Earliest circle contact on the torus, including paths spanning multiple wraps. */
export function swept(a: Motion, b: Motion, radius: number): number | null {
  const x = b.x - a.x,
    y = b.y - a.y,
    dx = b.dx - a.dx,
    dy = b.dy - a.dy;
  let hit = Infinity;
  const minX = Math.ceil((-radius - Math.max(x, x + dx)) / C.FIELD_W),
    maxX = Math.floor((radius - Math.min(x, x + dx)) / C.FIELD_W);
  const minY = Math.ceil((-radius - Math.max(y, y + dy)) / C.FIELD_H),
    maxY = Math.floor((radius - Math.min(y, y + dy)) / C.FIELD_H);
  for (let ix = minX; ix <= maxX; ix++)
    for (let iy = minY; iy <= maxY; iy++) {
      const px = x + ix * C.FIELD_W,
        py = y + iy * C.FIELD_H,
        c = px * px + py * py - radius * radius;
      if (c <= 0) return 0;
      const aa = dx * dx + dy * dy,
        bb = 2 * (px * dx + py * dy),
        disc = bb * bb - 4 * aa * c;
      if (aa === 0 || disc < 0) continue;
      const t = (-bb - Math.sqrt(disc)) / (2 * aa);
      if (t >= 0 && t <= 1) hit = Math.min(hit, t);
    }
  return Number.isFinite(hit) ? hit : null;
}
export function gravity(b: Pick<Body, "x" | "y">): Point {
  const dx = C.STAR_X - b.x,
    dy = C.STAR_Y - b.y,
    d = Math.hypot(dx, dy);
  if (d === 0) return { x: 0, y: 0 };
  const magnitude = C.MU / Math.max(d, C.SOFTEN) ** 2;
  return { x: (dx / d) * magnitude, y: (dy / d) * magnitude };
}
function move<T extends { x: number; y: number; vx: number; vy: number }>(
  b: T,
  pulled = false,
): Motion {
  if (pulled) {
    const a = gravity(b);
    b.vx += a.x * C.TICK_DT;
    b.vy += a.y * C.TICK_DT;
  }
  const path = { x: b.x, y: b.y, dx: b.vx * C.TICK_DT, dy: b.vy * C.TICK_DT };
  b.x = wrap(b.x + path.dx, C.FIELD_W);
  b.y = wrap(b.y + path.dy, C.FIELD_H);
  return path;
}
function spawnWave(s: Draft): void {
  for (let i = 0; i < C.WAVE_BASE_ROCKS + s.wave; i++) {
    let p: Point;
    do {
      p = { x: random(0, C.FIELD_W), y: random(0, C.FIELD_H) };
    } while (
      distance(p, s.ship) < C.WAVE_MIN_SHIP_DIST ||
      distance(p, star) < C.WAVE_MIN_STAR_DIST
    );
    const speed =
        (s.nextRockSpeed ??
          random(C.ROCK_SPEED_MIN.large, C.ROCK_SPEED_MAX.large)) *
        (1 + Math.min(C.WAVE_SPEED_CAP, C.WAVE_SPEED_STEP * (s.wave - 1))),
      a = random(0, Math.PI * 2);
    s.rocks.push({
      id: s.nextId++,
      ...p,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      size: "large",
      spin: a,
      health: C.ROCK_HEALTH.large,
      flash: 0,
    });
  }
  s.nextRockSpeed = null;
}
function recycle(s: Draft, r: Draft["rocks"][number]): void {
  const edges = ["top", "bottom", "left", "right"] as const;
  const edge = s.nextRecycleEdge ?? edges[Math.floor(random(0, edges.length))];
  const speed =
    s.nextRockSpeed ??
    random(C.ROCK_SPEED_MIN[r.size], C.ROCK_SPEED_MAX[r.size]);
  s.nextRecycleEdge = null;
  s.nextRockSpeed = null;
  r.x =
    edge === "left" ? 0 : edge === "right" ? C.FIELD_W : random(0, C.FIELD_W);
  r.y =
    edge === "top" ? 0 : edge === "bottom" ? C.FIELD_H : random(0, C.FIELD_H);
  const base =
    edge === "left"
      ? 0
      : edge === "right"
        ? Math.PI
        : edge === "top"
          ? Math.PI / 2
          : -Math.PI / 2;
  const a = base + random(-Math.PI / 3, Math.PI / 3);
  r.vx = Math.cos(a) * speed;
  r.vy = Math.sin(a) * speed;
  r.x = wrap(r.x, C.FIELD_W);
  r.y = wrap(r.y, C.FIELD_H);
}
function burst(s: Draft, p: Point, color: string, count: number): void {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + random(-0.2, 0.2),
      speed = random(35, 160);
    s.particles.push({
      ...p,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: random(0.25, 0.7),
      color,
    });
  }
}
function award(s: Draft, points: number, cues: Set<C.CueName>): void {
  const extra =
    Math.floor((s.score + points) / C.EXTRA_LIFE_STEP) -
    Math.floor(s.score / C.EXTRA_LIFE_STEP);
  s.score += points;
  if (extra) {
    s.lives += extra;
    s.extraLifeBanner = 1.5;
    cues.add(C.CUES.extraLife);
  }
}
function depart(s: Draft): void {
  s.saucer = null;
  s.saucerClock = 0;
  s.saucerDue = random(C.SAUCER_GAP_MIN, C.SAUCER_GAP_MAX);
}
function destroyRock(
  s: Draft,
  r: RockState,
  weapon: Body,
  heavy: boolean,
  cues: Set<C.CueName>,
): void {
  s.rocks = s.rocks.filter((v) => v.id !== r.id);
  award(
    s,
    r.size === "large"
      ? C.SCORE_LARGE
      : r.size === "medium"
        ? C.SCORE_MEDIUM
        : C.SCORE_SMALL,
    cues,
  );
  cues.add(C.CUES.shatter);
  burst(s, r, heavy ? "#ff886f" : "#e8bc7e", r.size === "small" ? 9 : 17);
  const child = C.ROCK_CHILD[r.size];
  if (!child) return;
  const speed = Math.hypot(weapon.vx, weapon.vy) || 1;
  const k = heavy ? C.TORPEDO_SCATTER : C.SPLIT_KICK;
  const dx = ((heavy ? weapon.vx : -weapon.vy) / speed) * k,
    dy = ((heavy ? weapon.vy : weapon.vx) / speed) * k;
  for (const sign of [1, -1])
    s.rocks.push({
      id: s.nextId++,
      x: r.x,
      y: r.y,
      vx: r.vx + sign * dx,
      vy: r.vy + sign * dy,
      size: child,
      spin: r.spin + sign * 0.4,
      health: C.ROCK_HEALTH[child],
      flash: 0,
    });
}
function steerTorpedoes(s: Draft): void {
  for (const t of s.torpedoes) {
    if (!t.homing) continue;
    let nearest = Infinity,
      aim = 0;
    for (const body of [...s.rocks, ...(s.saucer ? [s.saucer] : [])]) {
      const d = separation(t, body),
        a = angleDelta(Math.atan2(d.y, d.x) - t.heading),
        dist = Math.hypot(d.x, d.y);
      if (Math.abs(a) <= C.TORPEDO_CONE + 1e-12 && dist < nearest) {
        nearest = dist;
        aim = a;
      }
    }
    if (nearest < Infinity)
      t.heading += Math.max(
        -C.TORPEDO_TURN * C.TICK_DT,
        Math.min(C.TORPEDO_TURN * C.TICK_DT, aim),
      );
    t.vx = C.TORPEDO_SPEED * Math.cos(t.heading);
    t.vy = C.TORPEDO_SPEED * Math.sin(t.heading);
  }
}
function updateSaucer(s: Draft, cues: Set<C.CueName>): boolean {
  if (!s.saucer) {
    s.saucerClock += C.TICK_DT;
    if (s.saucerSpawning && s.saucerClock + 1e-10 >= s.saucerDue) {
      const edge = s.nextSaucerEdge ?? (Math.random() < 0.5 ? "left" : "right"),
        row = s.nextSaucerRow ?? random(C.SAUCER_R, C.FIELD_H - C.SAUCER_R);
      s.saucer = {
        ...saucer(s.nextId++, 0, row),
        vx: edge === "left" ? C.SAUCER_SPEED : -C.SAUCER_SPEED,
        weave: Math.random() < 0.5 ? 1 : -1,
      };
      s.nextSaucerEdge = null;
      s.nextSaucerRow = null;
      cues.add(C.CUES.saucer);
      return true;
    }
    return false;
  }
  const u = s.saucer;
  u.age += C.TICK_DT;
  if (u.age + 1e-10 >= C.SAUCER_LIFETIME) {
    depart(s);
    return false;
  }
  u.weaveClock = countdown(u.weaveClock);
  u.fireClock = countdown(u.fireClock);
  if (u.weaveClock === 0) {
    if (u.mind)
      u.vy = (u.vy === 0 ? u.weave : -Math.sign(u.vy)) * C.SAUCER_WEAVE_SPEED;
    u.weaveClock = C.SAUCER_WEAVE_INTERVAL;
  }
  if (u.mind && u.travel) {
    // Deflect early enough that the complete swept segment clears the solid core.
    const dx = C.STAR_X - u.x,
      dy = u.y - C.STAR_Y;
    if (dx * u.vx > 0 && Math.abs(dx) < 120 && Math.abs(dy) < 75)
      u.vy = (dy === 0 ? u.weave : Math.sign(dy)) * C.SAUCER_WEAVE_SPEED;
    const predicted = {
      x: u.x,
      y: u.y,
      dx: u.vx * C.TICK_DT,
      dy: u.vy * C.TICK_DT,
    };
    if (swept(predicted, still(star), C.CORE_R + C.SAUCER_R + 1) !== null) {
      const d = Math.hypot(u.x - C.STAR_X, u.y - C.STAR_Y) || 1,
        nx = (u.x - C.STAR_X) / d,
        ny = (u.y - C.STAR_Y) / d;
      const inward = Math.min(0, u.vx * nx + u.vy * ny);
      u.vx -= inward * nx;
      u.vy -= inward * ny;
      if (d < C.CORE_R + C.SAUCER_R) {
        u.x = C.STAR_X + nx * (C.CORE_R + C.SAUCER_R);
        u.y = C.STAR_Y + ny * (C.CORE_R + C.SAUCER_R);
      }
    }
  }
  if (u.fireClock === 0) {
    if (u.gun) {
      const d = separation(u, s.ship),
        a =
          Math.atan2(d.y, d.x) +
          (s.nextSaucerAim ?? random(-C.SAUCER_AIM_ERROR, C.SAUCER_AIM_ERROR));
      s.nextSaucerAim = null;
      s.enemyBullets.push({
        id: s.nextId++,
        x: u.x,
        y: u.y,
        vx: u.vx + Math.cos(a) * C.SAUCER_BULLET_SPEED,
        vy: u.vy + Math.sin(a) * C.SAUCER_BULLET_SPEED,
        life: C.SAUCER_BULLET_LIFE,
      });
    }
    u.fireClock = C.SAUCER_FIRE_INTERVAL;
  }
  return false;
}
interface Impact {
  readonly time: number;
  readonly kind:
    | "coreRock"
    | "coreShot"
    | "shotRock"
    | "shotSaucer"
    | "shipRock"
    | "shipSaucer"
    | "shipEnemy"
    | "shipCore";
  readonly a: number;
  readonly b: number;
}

/** One tick is a value transition. All temporary mutation is confined to its private draft. */
export function tick(state: State, control: Controls): TickResult {
  const s = draft(state),
    cues = new Set<C.CueName>();
  s.simTime += C.TICK_DT;
  if (s.screen !== "playing") return { state: s, cues: [] };
  s.fieldTime += C.TICK_DT;
  const hadBanner = s.waveBanner > 0;
  s.waveBanner = countdown(s.waveBanner);
  s.extraLifeBanner = countdown(s.extraLifeBanner);
  s.torpedoCharge = Math.min(
    1,
    s.torpedoCharge + C.TICK_DT / C.TORPEDO_RECHARGE,
  );
  if (s.torpedoCharge > 1 - 1e-10) s.torpedoCharge = 1;
  s.particles = s.particles
    .map((p) => ({
      ...p,
      x: wrap(p.x + p.vx * C.TICK_DT, C.FIELD_W),
      y: wrap(p.y + p.vy * C.TICK_DT, C.FIELD_H),
      life: countdown(p.life),
    }))
    .filter((p) => p.life > 0);
  const h = s.ship;
  h.invuln = countdown(h.invuln);
  h.fireCooldown = Math.max(0, h.fireCooldown - 1);
  h.angle += control.turn * C.SHIP_TURN * C.TICK_DT;
  h.thrusting = control.thrust;
  if (h.thrusting) {
    h.vx += Math.cos(h.angle) * C.SHIP_THRUST * C.TICK_DT;
    h.vy += Math.sin(h.angle) * C.SHIP_THRUST * C.TICK_DT;
  }
  const drag = Math.pow(0.5, C.TICK_DT / C.SHIP_DRAG_HALFLIFE);
  h.vx *= drag;
  h.vy *= drag;
  const speed = Math.hypot(h.vx, h.vy);
  if (speed > C.SHIP_MAX) {
    h.vx *= C.SHIP_MAX / speed;
    h.vy *= C.SHIP_MAX / speed;
  }
  const arrived = updateSaucer(s, cues);
  const nose = {
    x: wrap(h.x + Math.cos(h.angle) * C.SHIP_R, C.FIELD_W),
    y: wrap(h.y + Math.sin(h.angle) * C.SHIP_R, C.FIELD_H),
  };
  if (
    control.fire &&
    h.fireCooldown === 0 &&
    s.bullets.length < C.MAX_BULLETS
  ) {
    s.bullets.push({
      id: s.nextId++,
      ...nose,
      vx: h.vx + Math.cos(h.angle) * C.MUZZLE_SPEED,
      vy: h.vy + Math.sin(h.angle) * C.MUZZLE_SPEED,
      life: C.BULLET_LIFE,
    });
    h.fireCooldown = C.FIRE_INTERVAL_TICKS;
    cues.add(C.CUES.fire);
  }
  if (control.torpedo && s.torpedoCharge === 1 && s.torpedoes.length === 0) {
    s.torpedoes.push({
      id: s.nextId++,
      ...nose,
      vx: Math.cos(h.angle) * C.TORPEDO_SPEED,
      vy: Math.sin(h.angle) * C.TORPEDO_SPEED,
      heading: h.angle,
      homing: true,
      life: C.TORPEDO_LIFE,
    });
    s.torpedoCharge = 0;
  }
  steerTorpedoes(s);
  const paths = new Map<number, Motion>();
  const shipPath = move(h);
  for (const r of s.rocks) {
    r.flash = countdown(r.flash);
    r.spin += (r.id % 2 === 0 ? 1 : -1) * 0.18 * C.TICK_DT;
    paths.set(r.id, move(r, true));
  }
  const shots = [...s.bullets, ...s.enemyBullets, ...s.torpedoes];
  for (const b of shots) {
    const p = move(b, !("heading" in b));
    paths.set(b.id, p);
    b.life = countdown(b.life);
    const trail = s.trails[b.id] ?? [];
    s.trails[b.id] = [...trail, { x: p.x, y: p.y }].slice(-C.TRAIL_TICKS);
  }
  if (s.saucer)
    paths.set(
      s.saucer.id,
      s.saucer.travel && !arrived ? move(s.saucer) : still(s.saucer),
    );
  const impacts: Impact[] = [];
  const contact = (
    kind: Impact["kind"],
    a: number,
    b: number,
    pa: Motion,
    pb: Motion,
    r: number,
  ) => {
    const time = swept(pa, pb, r);
    if (time !== null) impacts.push({ kind, a, b, time });
  };
  const path = (b: Body & { readonly id: number }) =>
    paths.get(b.id) ?? still(b);
  for (const r of s.rocks) {
    contact(
      "coreRock",
      r.id,
      0,
      path(r),
      still(star),
      C.ROCK_RADIUS[r.size] + C.CORE_R,
    );
    contact(
      "shipRock",
      0,
      r.id,
      shipPath,
      path(r),
      C.SHIP_R + C.ROCK_RADIUS[r.size],
    );
  }
  for (const b of shots)
    contact(
      "coreShot",
      b.id,
      0,
      path(b),
      still(star),
      C.CORE_R + ("heading" in b ? C.TORPEDO_R : C.BULLET_R),
    );
  for (const b of [...s.bullets, ...s.torpedoes]) {
    const radius = "heading" in b ? C.TORPEDO_R : C.BULLET_R;
    for (const r of s.rocks)
      contact(
        "shotRock",
        b.id,
        r.id,
        path(b),
        path(r),
        radius + C.ROCK_RADIUS[r.size],
      );
    if (s.saucer)
      contact(
        "shotSaucer",
        b.id,
        s.saucer.id,
        path(b),
        path(s.saucer),
        radius + C.SAUCER_R,
      );
  }
  for (const b of s.enemyBullets)
    contact(
      "shipEnemy",
      0,
      b.id,
      shipPath,
      path(b),
      C.SHIP_R + C.SAUCER_BULLET_R,
    );
  if (s.saucer)
    contact(
      "shipSaucer",
      0,
      s.saucer.id,
      shipPath,
      path(s.saucer),
      C.SHIP_R + C.SAUCER_R,
    );
  contact("shipCore", 0, 0, shipPath, still(star), C.SHIP_R + C.CORE_R);
  impacts.sort((a, b) => a.time - b.time);
  const removed = new Set<number>(),
    recycled = new Set<number>();
  let killed = false,
    rockDestroyed = false;
  const removeShot = (id: number) => {
    removed.add(id);
  };
  for (const e of impacts) {
    if (
      removed.has(e.a) ||
      removed.has(e.b) ||
      recycled.has(e.a) ||
      recycled.has(e.b)
    )
      continue;
    const r = s.rocks.find((r) => r.id === (e.kind === "coreRock" ? e.a : e.b));
    const weapon = shots.find((b) => b.id === e.a);
    if (e.kind === "coreRock" && r) {
      recycle(s, r);
      recycled.add(r.id);
    }
    if (e.kind === "coreShot") removeShot(e.a);
    if (e.kind === "shotRock" && r && weapon) {
      removeShot(e.a);
      const heavy = "heading" in weapon;
      if (heavy || r.health === 1) {
        destroyRock(s, r, weapon, heavy, cues);
        removed.add(r.id);
        rockDestroyed = true;
      } else {
        r.health--;
        r.flash = C.HIT_FLASH_TIME;
        burst(s, r, "#e8bc7e", 4);
      }
    }
    if (e.kind === "shotSaucer" && s.saucer && weapon) {
      removeShot(e.a);
      removed.add(s.saucer.id);
      burst(s, s.saucer, "#ff886f", 20);
      depart(s);
      award(s, C.SCORE_SAUCER, cues);
    }
    if (e.kind === "shipCore" && !killed) {
      const x = shipPath.x + shipPath.dx * e.time,
        y = shipPath.y + shipPath.dy * e.time,
        d = separation(star, { x, y }),
        len = Math.hypot(d.x, d.y),
        nx = len > 0 ? d.x / len : 0,
        ny = len > 0 ? d.y / len : 1;
      h.x = wrap(C.STAR_X + nx * (C.CORE_R + C.SHIP_R), C.FIELD_W);
      h.y = wrap(C.STAR_Y + ny * (C.CORE_R + C.SHIP_R), C.FIELD_H);
      const into = Math.min(0, h.vx * nx + h.vy * ny);
      h.vx -= into * nx;
      h.vy -= into * ny;
    }
    const lethal =
      e.kind === "shipRock" ||
      e.kind === "shipSaucer" ||
      e.kind === "shipEnemy";
    if (lethal && !killed && h.collision && h.invuln === 0) {
      killed = true;
      s.lives--;
      cues.add(C.CUES.death);
      burst(s, h, "#8ce7ef", 24);
      if (e.kind === "shipEnemy") removeShot(e.b);
      if (s.lives > 0) {
        s.ship = { ...ship(), invuln: C.INVULN_TIME };
        s.torpedoCharge = 1;
      } else {
        s.screen = "gameover";
        s.menuIndex = 0;
      }
    }
  }
  s.bullets = s.bullets.filter((b) => !removed.has(b.id) && b.life > 0);
  s.enemyBullets = s.enemyBullets.filter(
    (b) => !removed.has(b.id) && b.life > 0,
  );
  s.torpedoes = s.torpedoes.filter((t) => !removed.has(t.id) && t.life > 0);
  const live = new Set(
    [...s.bullets, ...s.enemyBullets, ...s.torpedoes].map((b) => b.id),
  );
  s.trails = Object.fromEntries(
    Object.entries(s.trails).filter(([id]) => live.has(Number(id))),
  );
  if (s.screen === "playing" && s.waveSpawning) {
    if (hadBanner && s.waveBanner === 0) spawnWave(s);
    else if (rockDestroyed && s.rocks.length === 0 && s.waveBanner === 0) {
      s.wave++;
      s.waveBanner = C.WAVE_BANNER_TIME;
    }
  }
  return { state: s, cues: [...cues] };
}
