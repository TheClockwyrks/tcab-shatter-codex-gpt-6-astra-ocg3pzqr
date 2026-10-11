import { afterEach, describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import { game, BACKGROUND, type ShatterState } from "./game";
import * as C from "./constants";
import { gravity, swept } from "./physics";
import { type State } from "./model";

const engines: ReturnType<
  typeof createEngine<ShatterState, typeof import("./debug").debug>
>[] = [];
afterEach(() => {
  for (const engine of engines.splice(0)) engine.destroy();
});
async function setup(step = C.TICK_DT * 1000) {
  const target = new EventTarget();
  const canvas = createCanvas(320, 180);
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.FIELD_W,
    height: C.FIELD_H,
    background: BACKGROUND,
    layout: C.LAYOUT,
    game,
    clock: new ConstantClock(step),
    surface: {
      cssWidth: () => 320,
      cssHeight: () => 180,
      dpr: () => 1,
      events: () => target,
    },
  });
  engines.push(engine);
  await engine.initialize();
  const key = (code: string, down = true) =>
    target.dispatchEvent(
      Object.assign(new Event(down ? "keydown" : "keyup"), {
        code,
        repeat: false,
      }),
    );
  const press = async (code: string) => {
    key(code);
    await engine.advance(1);
    key(code, false);
  };
  const pose = (f: (s: State) => ShatterState) => engine.apply(f);
  const d = engine.debug;
  const arena = () => {
    pose((s) => d.setScreen(s, "playing"));
    pose((s) => d.setWaveSpawning(s, false));
    pose((s) => d.setSaucerSpawning(s, false));
    pose((s) => d.setShipCollision(s, false));
  };
  const pointer = (
    type: "down" | "up" | "move",
    x: number,
    y: number,
    id = 1,
    device = "mouse",
  ) =>
    target.dispatchEvent(
      Object.assign(new Event(`pointer${type}`), {
        clientX: x / 4,
        clientY: y / 4,
        pointerId: id,
        pointerType: device,
        isPrimary: true,
        button: 0,
        buttons: type === "up" ? 0 : 1,
      }),
    );
  return { engine, d, key, press, pose, arena, pointer };
}

describe("engine, input and menus", () => {
  it("starts complete, registers diagnostics and keeps state immutable", async () => {
    const { engine, d } = await setup();
    const before = JSON.stringify(engine.state);
    expect(d.snapshot(engine.state)).toMatchObject({
      version: C.SHATTER_DEBUG_VERSION,
      screen: "title",
      lives: C.START_LIVES,
      wave: 0,
      torpedoReady: true,
    });
    await engine.advance(2);
    expect(engine.state.simTime).toBeCloseTo(2 * C.TICK_DT);
    expect(JSON.parse(before).simTime).toBe(0);
    expect(engine.diagnostics().length).toBeGreaterThanOrEqual(15);
  });
  it("navigates howto, preserves its selection and starts a clean run", async () => {
    const { engine, press } = await setup();
    await press("ArrowUp");
    expect(engine.state.menuIndex).toBe(1);
    await press("Enter");
    expect(engine.state.screen).toBe("howto");
    await press("Escape");
    expect(engine.state.menuIndex).toBe(1);
    await press("ArrowDown");
    await press("Enter");
    expect(engine.state).toMatchObject({
      screen: "playing",
      wave: 1,
      score: 0,
      lives: 3,
    });
    await engine.advance(180);
    expect(engine.state.rocks).toHaveLength(4);
  });
  it("pauses once for Escape and freezes every play timer", async () => {
    const { engine, press, arena, pose, d } = await setup();
    arena();
    pose((s) => d.addRock(s, "large", 100, 100));
    await press("Escape");
    const frozen = engine.state;
    await engine.advance(12);
    expect(engine.state.rocks).toEqual(frozen.rocks);
    expect(engine.state.saucerClock).toBe(frozen.saucerClock);
    expect(engine.state.fieldTime).toBe(frozen.fieldTime);
    expect(engine.state.simTime).toBeGreaterThan(frozen.simTime);
    await press("Escape");
    expect(engine.state.screen).toBe("playing");
  });
  it("resumes before reading other menu edges and restarts cleanly", async () => {
    const { engine, key, press, arena, pose, d } = await setup();
    arena();
    await press("KeyP");
    key("ArrowDown");
    key("Enter");
    await press("Escape");
    key("ArrowDown", false);
    key("Enter", false);
    expect(engine.state.screen).toBe("playing");
    await press("KeyP");
    await press("ArrowDown");
    pose((s) => d.setScore(s, 200));
    await press("Enter");
    expect(engine.state.score).toBe(0);
    expect(engine.state.wave).toBe(1);
  });
  it("pointer selects and confirms only matching press/release regions", async () => {
    const { engine, pointer, d } = await setup();
    const a = d.menuItemRect(engine.state, 0)!,
      b = d.menuItemRect(engine.state, 1)!;
    pointer("down", a.x + 10, a.y + 10);
    pointer("up", b.x + 10, b.y + 10);
    await engine.advance(1);
    expect(engine.state.screen).toBe("title");
    expect(engine.state.menuIndex).toBe(1);
    pointer("down", b.x + 10, b.y + 10);
    pointer("up", b.x + 10, b.y + 10);
    await engine.advance(1);
    expect(engine.state.screen).toBe("howto");
  });
  it("touch wins over a movement edge, but keyboard confirmation wins over touch", async () => {
    const { engine, pointer, key, d } = await setup();
    const a = d.menuItemRect(engine.state, 0)!,
      b = d.menuItemRect(engine.state, 1)!;
    key("ArrowDown");
    pointer("move", a.x + 5, a.y + 5, 2, "touch");
    await engine.advance(1);
    key("ArrowDown", false);
    expect(engine.state.menuIndex).toBe(0);
    key("Enter");
    pointer("down", b.x + 5, b.y + 5, 2, "touch");
    pointer("up", b.x + 5, b.y + 5, 2, "touch");
    await engine.advance(1);
    expect(engine.state.screen).toBe("playing");
  });
  it("toggles mute on any screen and reset preserves it", async () => {
    const { engine, press, pose, d } = await setup();
    await press("KeyM");
    expect(engine.state.muted).toBe(true);
    pose(d.reset);
    expect(engine.state.muted).toBe(true);
    await press("KeyM");
    expect(engine.state.muted).toBe(false);
  });
  it("returns to title from pause and game over, and can play again", async () => {
    const { engine, press, arena, pose, d } = await setup();
    arena();
    await press("KeyP");
    await press("ArrowUp");
    await press("Enter");
    expect(engine.state.screen).toBe("title");
    pose((s) => d.setScreen(s, "gameover"));
    await press("Escape");
    expect(engine.state.menuIndex).toBe(0);
    pose((s) => d.setScreen(s, "gameover"));
    await press("Enter");
    expect(engine.state.screen).toBe("playing");
  });
});

describe("ship and fixed timestep", () => {
  it("accumulates fractional ticks on every screen", async () => {
    const { engine } = await setup(C.TICK_DT * 500);
    await engine.advance(1);
    expect(engine.state.simTime).toBe(0);
    expect(engine.state.tickClock).toBeCloseTo(C.TICK_DT / 2);
    await engine.advance(1);
    expect(engine.state.simTime).toBe(C.TICK_DT);
  });
  it("matches at different frame rates", async () => {
    const a = await setup(),
      b = await setup(C.TICK_DT * 4000);
    a.arena();
    b.arena();
    a.key("ArrowUp");
    b.key("ArrowUp");
    a.key("ArrowRight");
    b.key("ArrowRight");
    await a.engine.advance(120);
    await b.engine.advance(30);
    expect(a.engine.state.ship).toEqual(b.engine.state.ship);
  });
  it("turns then thrusts and applies drag; rotation carries momentum", async () => {
    const { engine, arena, key, pose, d } = await setup();
    arena();
    pose((s) => d.setShipAngle(s, 0));
    key("ArrowRight");
    key("ArrowUp");
    await engine.advance(1);
    const angle = C.SHIP_TURN * C.TICK_DT,
      drag = 0.5 ** (C.TICK_DT / C.SHIP_DRAG_HALFLIFE);
    expect(engine.state.ship.angle).toBeCloseTo(angle);
    expect(engine.state.ship.vx).toBeCloseTo(
      Math.cos(angle) * C.SHIP_THRUST * C.TICK_DT * drag,
    );
    key("ArrowUp", false);
    const vx = engine.state.ship.vx;
    await engine.advance(1);
    expect(engine.state.ship.vx).toBeCloseTo(vx * drag);
  });
  it("caps speed, wraps position, and never applies gravity to the ship", async () => {
    const { engine, arena, pose, d } = await setup();
    arena();
    pose((s) => d.setShipPosition(s, 1279, 100));
    pose((s) => d.setShipVelocity(s, 10000, 0));
    await engine.advance(1);
    expect(engine.state.ship.x).toBeCloseTo(
      1279 + C.SHIP_MAX * C.TICK_DT - C.FIELD_W,
    );
    expect(engine.state.ship.vy).toBe(0);
    expect(d.snapshot(engine.state).ship.speed).toBeCloseTo(C.SHIP_MAX);
  });
  it("slides off the core without costing a life even with contact disabled", async () => {
    const { engine, arena, pose, d } = await setup();
    arena();
    pose((s) =>
      d.setShipPosition(s, C.STAR_X + C.CORE_R + C.SHIP_R + 1, C.STAR_Y),
    );
    pose((s) => d.setShipVelocity(s, -500, 60));
    await engine.advance(1);
    expect(engine.state.lives).toBe(C.START_LIVES);
    expect(
      Math.hypot(
        engine.state.ship.x - C.STAR_X,
        engine.state.ship.y - C.STAR_Y,
      ),
    ).toBeCloseTo(C.CORE_R + C.SHIP_R);
    expect(engine.state.ship.vx).toBeGreaterThan(-1);
    expect(engine.state.ship.vy).toBeGreaterThan(50);
  });
});

describe("ballistics, armor and continuous impacts", () => {
  it("uses direct softened inverse-square gravity", () => {
    expect(gravity({ x: 840, y: 360 })).toEqual({ x: -112.5, y: 0 });
    expect(gravity({ x: 700, y: 360 }).x).toBeCloseTo(-C.MU / C.SOFTEN ** 2);
    expect(gravity({ x: C.STAR_X, y: C.STAR_Y })).toEqual({ x: 0, y: 0 });
    expect(gravity({ x: 0, y: 0 }).x).toBeGreaterThan(0);
  });
  it("detects swept, seam and multiple-wrap impacts", () => {
    expect(
      swept(
        { x: 1200, y: 100, dx: 4000, dy: 0 },
        { x: 100, y: 100, dx: 0, dy: 0 },
        10,
      ),
    ).toBeCloseTo(170 / 4000);
    expect(
      swept({ x: 0, y: 0, dx: 100, dy: 0 }, { x: 50, y: 30, dx: 0, dy: 0 }, 10),
    ).toBeNull();
  });
  it("holds the fire gate, cap and inherited muzzle velocity", async () => {
    const { engine, arena, pose, d, key } = await setup();
    arena();
    pose((s) => d.setShipPosition(s, 100, 100));
    pose((s) => d.setShipAngle(s, 0));
    pose((s) => d.setShipVelocity(s, 50, 0));
    key("Space");
    await engine.advance(1);
    expect(engine.state.bullets).toHaveLength(1);
    expect(engine.state.bullets[0].vx).toBeGreaterThan(C.MUZZLE_SPEED);
    await engine.advance(C.FIRE_INTERVAL_TICKS - 1);
    expect(engine.state.bullets).toHaveLength(1);
    await engine.advance(1);
    expect(engine.state.bullets).toHaveLength(2);
    await engine.advance(50);
    expect(engine.state.bullets).toHaveLength(C.MAX_BULLETS);
    key("Space", false);
    await engine.advance(190);
    expect(engine.state.bullets).toHaveLength(0);
  });
  it("captures a press on a fractional frame until a tick is available", async () => {
    const { engine, arena, key, pose, d } = await setup(C.TICK_DT * 500);
    arena();
    pose((s) => d.setShipPosition(s, 100, 100));
    key("Space");
    key("Space", false);
    await engine.advance(1);
    expect(engine.state.bullets).toHaveLength(0);
    await engine.advance(1);
    expect(engine.state.bullets).toHaveLength(1);
  });
  it("chips armor without scoring and splits on the final hit", async () => {
    const { engine, arena, pose, d } = await setup();
    arena();
    pose((s) => d.addRock(s, "large", 200, 100));
    const id = engine.state.rocks[0].id;
    for (let i = 0; i < 3; i++) {
      const r = engine.state.rocks.find((r) => r.id === id)!;
      pose((s) => d.addBullet(s, r.x, r.y, 500, 0));
      await engine.advance(1);
      if (i < 2) {
        expect(engine.state.score).toBe(0);
        expect(engine.state.rocks[0].health).toBe(2 - i);
        expect(engine.state.rocks[0].flash).toBe(C.HIT_FLASH_TIME);
      }
    }
    expect(engine.state.score).toBe(C.SCORE_LARGE);
    expect(engine.state.rocks.map((r) => r.size)).toEqual(["medium", "medium"]);
    expect(
      engine.state.rocks.every((r) => r.health === C.ROCK_HEALTH.medium),
    ).toBe(true);
    expect(engine.state.rocks[0].vy - engine.state.rocks[1].vy).toBeCloseTo(
      C.SPLIT_KICK * 2,
      1,
    );
  });
  it("sweeps a very fast bullet into a rock through a wrap seam", async () => {
    const { engine, arena, pose, d } = await setup();
    arena();
    pose((s) => d.addRock(s, "small", 25, 100));
    pose((s) => d.addBullet(s, 1200, 100, 30000, 0));
    await engine.advance(1);
    expect(engine.state.rocks).toHaveLength(0);
    expect(engine.state.score).toBe(C.SCORE_SMALL);
  });
  it("absorbs all projectile types at the core", async () => {
    const { engine, arena, pose, d } = await setup();
    arena();
    pose((s) => d.addBullet(s, 640, 300, 0, 8000));
    pose((s) => d.addEnemyBullet(s, 640, 300, 0, 8000));
    pose((s) => d.addTorpedo(s, 640, 330, Math.PI / 2));
    await engine.advance(1);
    expect(engine.state.bullets).toHaveLength(0);
    expect(engine.state.enemyBullets).toHaveLength(0);
    expect(engine.state.torpedoes).toHaveLength(0);
    expect(engine.state.score).toBe(0);
  });
  it("recycles a rock with its id and damaged health intact, consuming posed draws", async () => {
    const { engine, arena, pose, d } = await setup();
    arena();
    pose((s) => d.addRock(s, "large", C.STAR_X, C.STAR_Y));
    const id = engine.state.rocks[0].id;
    pose((s) => d.setRockHealth(s, id, 1));
    pose((s) => d.setNextRecycleEdge(s, "left"));
    pose((s) => d.setNextRockSpeed(s, 77));
    await engine.advance(1);
    expect(engine.state.rocks[0]).toMatchObject({ id, health: 1, x: 0 });
    expect(
      Math.hypot(engine.state.rocks[0].vx, engine.state.rocks[0].vy),
    ).toBeCloseTo(77);
    expect(engine.state.nextRockSpeed).toBeNull();
    expect(engine.state.nextRecycleEdge).toBeNull();
    expect(engine.state.score).toBe(0);
  });
  it("never lets saucer bullets damage rocks", async () => {
    const { engine, arena, pose, d } = await setup();
    arena();
    pose((s) => d.addRock(s, "small", 100, 100));
    pose((s) => d.addEnemyBullet(s, 100, 100, 0, 0));
    await engine.advance(1);
    expect(engine.state.rocks).toHaveLength(1);
    expect(engine.state.enemyBullets).toHaveLength(1);
  });
});

describe("torpedo", () => {
  it("launches on a press without inherited drift and recharges linearly", async () => {
    const { engine, arena, pose, d, key } = await setup();
    arena();
    pose((s) => d.setShipPosition(s, 100, 100));
    pose((s) => d.setShipAngle(s, 0));
    pose((s) => d.setShipVelocity(s, 0, 100));
    key("KeyF");
    await engine.advance(1);
    expect(engine.state.torpedoes[0].vx).toBe(C.TORPEDO_SPEED);
    expect(engine.state.torpedoes[0].vy).toBe(0);
    expect(engine.state.torpedoCharge).toBe(0);
    engine.setClock(new ConstantClock(1000 / 30));
    await engine.advance(75);
    expect(engine.state.torpedoCharge).toBeCloseTo(0.25);
    await engine.advance(225);
    expect(engine.state.torpedoCharge).toBe(1);
    expect(engine.state.torpedoes).toHaveLength(0);
  });
  it("acquires the nearest forward target across a seam with a bounded turn", async () => {
    const { engine, arena, pose, d } = await setup();
    arena();
    pose((s) => d.addRock(s, "small", 100, 125));
    pose((s) => d.addRock(s, "small", 1000, 100));
    pose((s) => d.addTorpedo(s, 1250, 100, 0));
    await engine.advance(1);
    expect(engine.state.torpedoes[0].heading).toBeCloseTo(
      C.TORPEDO_TURN * C.TICK_DT,
    );
    expect(
      Math.hypot(engine.state.torpedoes[0].vx, engine.state.torpedoes[0].vy),
    ).toBeCloseTo(C.TORPEDO_SPEED);
  });
  it("holds heading with guidance disabled and destroys armored rocks outright", async () => {
    const { engine, arena, pose, d } = await setup();
    arena();
    pose((s) => d.addRock(s, "large", 200, 100));
    pose((s) => d.addTorpedo(s, 200, 100, 0));
    const id = engine.state.torpedoes[0].id;
    pose((s) => d.setTorpedoHoming(s, id, false));
    await engine.advance(1);
    expect(engine.state.score).toBe(C.SCORE_LARGE);
    expect(engine.state.torpedoes).toHaveLength(0);
    expect(engine.state.rocks).toHaveLength(2);
    expect(engine.state.rocks[0].vx - engine.state.rocks[1].vx).toBeCloseTo(
      C.TORPEDO_SCATTER * 2,
    );
    expect(engine.state.rocks[0].vy).toBeCloseTo(engine.state.rocks[1].vy);
  });
  it("rejects launch while another is in flight even with full charge", async () => {
    const { engine, arena, pose, d, press } = await setup();
    arena();
    pose((s) => d.addTorpedo(s, 100, 100, 0));
    await press("KeyF");
    expect(engine.state.torpedoes).toHaveLength(1);
    expect(engine.state.torpedoCharge).toBe(1);
  });
});

describe("progression and saucer", () => {
  it("only a destruction clears a wave; banner spawns with the posed speed multiplier", async () => {
    const { engine, arena, pose, d } = await setup();
    arena();
    pose((s) => d.setWaveSpawning(s, true));
    await engine.advance(1);
    expect(engine.state.wave).toBe(0);
    pose((s) => d.setWave(s, 5));
    pose((s) => d.addRock(s, "small", 100, 100));
    pose((s) => d.addBullet(s, 100, 100, 0, 0));
    await engine.advance(1);
    expect(engine.state.wave).toBe(6);
    expect(engine.state.waveBanner).toBe(C.WAVE_BANNER_TIME);
    pose((s) => d.setNextRockSpeed(s, 100));
    engine.setClock(new ConstantClock(1000 / 30));
    await engine.advance(45);
    expect(engine.state.rocks).toHaveLength(9);
    for (const r of engine.state.rocks)
      expect(Math.hypot(r.vx, r.vy)).toBeCloseTo(120);
    expect(engine.state.nextRockSpeed).toBeNull();
  });
  it("a posed banner expires over a closed wave gate without spawning", async () => {
    const { engine, arena, pose, d } = await setup();
    arena();
    pose((s) => d.setWaveBanner(s, C.TICK_DT));
    await engine.advance(1);
    expect(engine.state.waveBanner).toBe(0);
    expect(engine.state.rocks).toHaveLength(0);
  });
  it("grants extra ships only for play, once per threshold crossing", async () => {
    const { engine, arena, pose, d } = await setup();
    arena();
    pose((s) => d.setScore(s, C.EXTRA_LIFE_STEP - C.SCORE_SMALL));
    expect(engine.state.lives).toBe(C.START_LIVES);
    pose((s) => d.addRock(s, "small", 100, 100));
    pose((s) => d.addBullet(s, 100, 100, 0, 0));
    await engine.advance(1);
    expect(engine.state.lives).toBe(C.START_LIVES + 1);
    expect(engine.state.extraLifeBanner).toBeGreaterThanOrEqual(0.5);
  });
  it("respawns with grace and full charge, then ends on the last life", async () => {
    const { engine, arena, pose, d } = await setup();
    arena();
    pose((s) => d.setShipCollision(s, true));
    pose((s) => d.setTorpedoCharge(s, 0.2));
    pose((s) => d.addRock(s, "small", s.ship.x, s.ship.y));
    await engine.advance(1);
    expect(engine.state.ship.invuln).toBe(C.INVULN_TIME);
    expect(engine.state.torpedoCharge).toBe(1);
    expect(engine.state.lives).toBe(2);
    await engine.advance(1);
    expect(engine.state.lives).toBe(2);
    pose((s) => d.setLives(s, 1));
    pose((s) => d.setShipInvuln(s, 0));
    await engine.advance(1);
    expect(engine.state.screen).toBe("gameover");
    expect(engine.state.lives).toBe(0);
  });
  it("enemy bullets are removed when lethal but pass through grace", async () => {
    const { engine, arena, pose, d } = await setup();
    arena();
    pose((s) => d.setShipCollision(s, true));
    pose((s) => d.setShipInvuln(s, 1));
    pose((s) => d.addEnemyBullet(s, s.ship.x, s.ship.y, 0, 0));
    await engine.advance(1);
    expect(engine.state.enemyBullets).toHaveLength(1);
    pose((s) => d.setShipInvuln(s, 0));
    await engine.advance(1);
    expect(engine.state.enemyBullets).toHaveLength(0);
    expect(engine.state.lives).toBe(2);
  });
  it("consumes entry draws at the first arrival and plays the arrival cue", async () => {
    const { engine, arena, pose, d } = await setup();
    arena();
    pose((s) => d.setSaucerSpawning(s, true));
    pose((s) => d.setSaucerDue(s, C.TICK_DT));
    pose((s) => d.setNextSaucerEdge(s, "right"));
    pose((s) => d.setNextSaucerRow(s, 120));
    const cues: string[] = [];
    engine.events.on("cue:played", (e) => cues.push(e.cue));
    await engine.advance(1);
    expect(engine.state.saucer).toMatchObject({
      x: 0,
      y: 120,
      vx: -C.SAUCER_SPEED,
      vy: 0,
    });
    expect(engine.state.nextSaucerEdge).toBeNull();
    expect(cues).toContain(C.CUES.saucer);
  });
  it("gates saucer faculties independently and consumes one aimed-shot draw", async () => {
    const { engine, arena, pose, d } = await setup();
    arena();
    pose((s) => d.addSaucer(s, 100, 100));
    pose((s) => d.setSaucerTravel(s, false));
    pose((s) => d.setSaucerWeave(s, -1));
    pose((s) => d.setNextSaucerAim(s, 0));
    engine.setClock(new ConstantClock(1000 / 30));
    await engine.advance(30);
    expect(engine.state.saucer).toMatchObject({
      x: 100,
      y: 100,
      vy: -C.SAUCER_WEAVE_SPEED,
    });
    await engine.advance(18);
    expect(engine.state.enemyBullets).toHaveLength(1);
    expect(engine.state.nextSaucerAim).toBeNull();
    pose((s) => d.setSaucerMind(s, false));
    pose((s) => d.setSaucerGun(s, false));
    const vy = engine.state.saucer!.vy;
    await engine.advance(60);
    expect(engine.state.saucer!.vy).toBe(vy);
    expect(engine.state.enemyBullets).toHaveLength(0);
  });
  it("the saucer avoids the core on a star-row crossing", async () => {
    const { engine, arena, pose, d } = await setup();
    arena();
    pose((s) => d.addSaucer(s, 450, C.STAR_Y));
    pose((s) => d.setSaucerGun(s, false));
    for (let i = 0; i < 200; i++) {
      await engine.advance(1);
      const u = engine.state.saucer!;
      expect(Math.hypot(u.x - C.STAR_X, u.y - C.STAR_Y)).toBeGreaterThanOrEqual(
        C.CORE_R + C.SAUCER_R - 1e-8,
      );
    }
  });
  it("a saucer departs after its lifetime and resets its cadence", async () => {
    const { engine, arena, pose, d } = await setup();
    arena();
    pose((s) => d.addSaucer(s, 100, 100));
    pose((s) => d.setSaucerGun(s, false));
    engine.setClock(new ConstantClock(1000));
    await engine.advance(12);
    expect(engine.state.saucer).toBeNull();
    expect(engine.state.saucerDue).toBeGreaterThanOrEqual(C.SAUCER_GAP_MIN);
    expect(engine.state.saucerDue).toBeLessThanOrEqual(C.SAUCER_GAP_MAX);
  });
  it.each(["bullet", "torpedo"] as const)(
    "destroys a saucer with a %s",
    async (weapon) => {
      const { engine, arena, pose, d } = await setup();
      arena();
      pose((s) => d.addSaucer(s, 100, 100));
      pose((s) => d.setSaucerTravel(s, false));
      pose((s) =>
        weapon === "bullet"
          ? d.addBullet(s, 100, 100, 0, 0)
          : d.addTorpedo(s, 100, 100, 0),
      );
      await engine.advance(1);
      expect(engine.state.saucer).toBeNull();
      expect(engine.state.score).toBe(C.SCORE_SAUCER);
    },
  );
});

describe("debug contract", () => {
  it("poses all rosters, preserves identity and produces derived snapshots without ticking", async () => {
    const { engine, pose, d } = await setup();
    pose((s) => d.setShipPosition(s, 30, 40));
    pose((s) => d.setShipVelocity(s, 3, 4));
    pose((s) => d.setShipAngle(s, 1));
    pose((s) => d.setFireCooldown(s, 12));
    pose((s) => d.addRock(s, "medium", 100, 100));
    const rock = engine.state.rocks[0].id;
    pose((s) => d.setRockVelocity(s, rock, 12, 34));
    pose((s) => d.setRockHealth(s, rock, 1));
    pose((s) => d.addBullet(s, 200, 100, 30, 40));
    pose((s) => d.addEnemyBullet(s, 300, 100, 30, 40));
    pose((s) => d.addTorpedo(s, 400, 100, 0));
    const torpedo = engine.state.torpedoes[0].id;
    pose((s) => d.setTorpedoHeading(s, torpedo, Math.PI / 2));
    pose((s) => d.setTorpedoHoming(s, torpedo, false));
    pose((s) => d.setTorpedoCharge(s, 0.5));
    const before = d.snapshot(engine.state);
    pose(d.reconcile);
    pose(d.reconcile);
    expect(d.snapshot(engine.state)).toEqual(before);
    expect(before.ship.speed).toBe(5);
    expect(before.rocks[0].radius).toBe(C.ROCK_RADIUS.medium);
    expect(before.torpedoReady).toBe(false);
    expect(before.torpedoes[0].vy).toBeCloseTo(C.TORPEDO_SPEED);
    pose((s) => d.removeRock(s, rock));
    pose((s) => d.removeBullet(s, s.bullets[0].id));
    pose((s) => d.removeEnemyBullet(s, s.enemyBullets[0].id));
    pose((s) => d.removeTorpedo(s, torpedo));
    expect(engine.state.rocks).toHaveLength(0);
  });
  it("clears all rosters and resets every pending draw", async () => {
    const { engine, pose, d } = await setup();
    pose((s) => d.addRock(s, "small", 1, 1));
    pose((s) => d.addBullet(s, 2, 2, 0, 0));
    pose((s) => d.addEnemyBullet(s, 3, 3, 0, 0));
    pose((s) => d.addTorpedo(s, 4, 4, 0));
    pose((s) => d.addSaucer(s, 5, 5));
    pose((s) => d.setSaucerVelocity(s, 10, 20));
    pose((s) => d.setNextRockSpeed(s, 80));
    pose((s) => d.setNextRecycleEdge(s, "bottom"));
    pose((s) => d.setNextSaucerRow(s, 500));
    pose((s) => d.setNextSaucerEdge(s, "left"));
    pose((s) => d.setNextSaucerAim(s, 0.1));
    pose(d.clearRocks);
    pose(d.clearBullets);
    pose(d.clearEnemyBullets);
    pose(d.clearTorpedoes);
    pose(d.removeSaucer);
    pose(d.removeSaucer);
    pose(d.reset);
    expect(engine.state.nextRockSpeed).toBeNull();
    expect(engine.state.nextSaucerRow).toBeNull();
    expect(engine.state.nextSaucerAim).toBeNull();
    expect(engine.state.simTime).toBe(0);
    expect(engine.state.ship).toMatchObject({
      x: C.SAFE_X,
      y: C.SAFE_Y,
      collision: true,
    });
  });
  it("fails loudly for nonfinite values, illegal names and missing entities", async () => {
    const { engine, d } = await setup();
    expect(() => d.setShipPosition(engine.state, NaN, 0)).toThrow();
    expect(() => d.setScore(engine.state, Infinity)).toThrow();
    expect(() => d.setScreen(engine.state, "invalid" as "title")).toThrow();
    expect(() => d.addRock(engine.state, "invalid" as "small", 0, 0)).toThrow();
    expect(() => d.removeBullet(engine.state, 999)).toThrow();
    expect(() => d.setSaucerMind(engine.state, false)).toThrow();
    expect(() => d.setTorpedoHoming(engine.state, 123, false)).toThrow();
    expect(d.menuItemRect(engine.state, 20)).toBeNull();
  });
});

describe("audio and presentation state", () => {
  it("holds thrust audio through a burn and stops it on release and pause", async () => {
    const { engine, arena, key, press } = await setup();
    arena();
    const looped: string[] = [],
      stopped: string[] = [];
    engine.events.on("cue:looped", (e) => looped.push(e.cue));
    engine.events.on("cue:stopped", (e) => stopped.push(e.cue));
    key("ArrowUp");
    await engine.advance(10);
    expect(looped).toEqual([C.CUES.thrust]);
    key("ArrowUp", false);
    await engine.advance(1);
    expect(stopped).toEqual([C.CUES.thrust]);
    key("ArrowUp");
    await engine.advance(1);
    await press("KeyP");
    expect(stopped).toEqual([C.CUES.thrust, C.CUES.thrust]);
    const time = engine.state.fieldTime;
    await engine.advance(5);
    expect(engine.state.fieldTime).toBe(time);
  });
  it("coalesces simultaneous shatters into one cue while announcing an extra life", async () => {
    const { engine, arena, pose, d } = await setup();
    arena();
    const cues: string[] = [];
    engine.events.on("cue:played", (e) => cues.push(e.cue));
    pose((s) => d.setScore(s, C.EXTRA_LIFE_STEP - C.SCORE_SMALL));
    for (const x of [100, 300]) {
      pose((s) => d.addRock(s, "small", x, 100));
      pose((s) => d.addBullet(s, x, 100, 0, 0));
    }
    await engine.advance(1);
    expect(cues.filter((c) => c === C.CUES.shatter)).toHaveLength(1);
    expect(cues.filter((c) => c === C.CUES.extraLife)).toHaveLength(1);
    expect(engine.state.score).toBe(C.EXTRA_LIFE_STEP + C.SCORE_SMALL);
    expect(engine.state.lives).toBe(C.START_LIVES + 1);
  });
  it("retains exactly the recent path samples across a wrapping shot", async () => {
    const { engine, arena, pose, d } = await setup();
    arena();
    pose((s) => d.addBullet(s, 1270, 100, 500, 0));
    const id = engine.state.bullets[0].id;
    await engine.advance(C.TRAIL_TICKS + 4);
    expect(engine.state.trails[id]).toHaveLength(C.TRAIL_TICKS);
    expect(engine.state.bullets[0].x).toBeLessThan(100);
    pose(d.clearBullets);
    await engine.advance(1);
    expect(engine.state.trails).toEqual({});
  });
});
