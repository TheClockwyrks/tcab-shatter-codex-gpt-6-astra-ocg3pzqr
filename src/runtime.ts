import type { InitApi, UpdateApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import type { ShatterState, ShatterDebugApi } from "./game";
import { debug } from "./debug";
import { initial, menuItems, menuRect, newGame, type State } from "./model";
import { tick } from "./physics";

export function initialize(
  api: InitApi<ShatterState>,
): [ShatterState, ShatterDebugApi] {
  for (const name of C.ACTIONS) api.input.register(name, C.BINDINGS[name]);
  api.audio.define(C.CUES.fire, {
    wave: "triangle",
    freq: 880,
    freqTo: 180,
    gain: 0.12,
    durationMs: 90,
  });
  api.audio.define(C.CUES.shatter, {
    wave: "sawtooth",
    freq: 140,
    freqTo: 32,
    gain: 0.15,
    durationMs: 220,
  });
  api.audio.define(C.CUES.thrust, {
    wave: "sawtooth",
    freq: 48,
    gain: 0.045,
    durationMs: 100,
  });
  api.audio.define(C.CUES.saucer, {
    wave: "sine",
    freq: 240,
    freqTo: 680,
    gain: 0.12,
    durationMs: 400,
  });
  api.audio.define(C.CUES.death, {
    wave: "square",
    freq: 180,
    freqTo: 20,
    gain: 0.13,
    durationMs: 500,
  });
  api.audio.define(C.CUES.extraLife, {
    wave: "triangle",
    freq: 520,
    freqTo: 1040,
    gain: 0.16,
    durationMs: 500,
  });
  const sources: Record<string, (s: State) => string | number | boolean> = {
    screen: (s) => s.screen,
    score: (s) => s.score,
    lives: (s) => s.lives,
    wave: (s) => s.wave,
    "ship position": (s) => `${s.ship.x.toFixed(1)}, ${s.ship.y.toFixed(1)}`,
    "ship velocity": (s) => `${s.ship.vx.toFixed(1)}, ${s.ship.vy.toFixed(1)}`,
    "ship speed": (s) => Math.hypot(s.ship.vx, s.ship.vy),
    "ship facing": (s) => s.ship.angle,
    "ship grace": (s) => s.ship.invuln,
    bullets: (s) => s.bullets.length,
    rocks: (s) => s.rocks.length,
    saucer: (s) =>
      s.saucer
        ? `${s.saucer.x.toFixed(1)}, ${s.saucer.y.toFixed(1)}`
        : "absent",
    "torpedo charge": (s) => s.torpedoCharge,
    torpedoes: (s) => s.torpedoes.length,
    "simulation time": (s) => s.simTime,
  };
  for (const [name, source] of Object.entries(sources))
    api.diagnostics.register(name, source);
  return [initial(), debug];
}
function confirm(s: State): ShatterState {
  if (s.screen === "title")
    return s.menuIndex === 0
      ? newGame(s)
      : { ...s, screen: "howto", pointerStarts: {} };
  if (s.screen === "paused") {
    if (s.menuIndex === 0)
      return { ...s, screen: "playing", menuIndex: 0, pointerStarts: {} };
    if (s.menuIndex === 1) return newGame(s);
    return { ...s, screen: "title", menuIndex: 0, pointerStarts: {} };
  }
  if (s.screen === "gameover")
    return s.menuIndex === 0
      ? newGame(s)
      : { ...s, screen: "title", menuIndex: 0, pointerStarts: {} };
  return { ...s };
}
export function update(state: State, api: UpdateApi, dt: number): ShatterState {
  const edges = Object.fromEntries(
    C.ACTIONS.map((name) => [name, api.input.pressed(name)]),
  ) as Record<C.ActionName, boolean>;
  const samples = api.input.pointerSamples();
  if (edges.mute) api.audio.setMuted(!api.audio.muted());
  let s: ShatterState = { ...state, muted: api.audio.muted() };
  const before = s.screen;
  let handled = false;
  if (before === "playing" && edges.pause) {
    s = {
      ...s,
      screen: "paused",
      menuIndex: 0,
      pendingFire: false,
      pendingTorpedo: false,
      pointerStarts: {},
    };
    handled = true;
  } else if (before === "paused" && (edges.pause || edges.back)) {
    s = { ...s, screen: "playing", menuIndex: 0, pointerStarts: {} };
    handled = true;
  } else if (before === "howto" && (edges.back || edges.confirm)) {
    s = { ...s, screen: "title", pointerStarts: {} };
    handled = true;
  } else if (before === "gameover" && edges.back) {
    s = { ...s, screen: "title", menuIndex: 0, pointerStarts: {} };
    handled = true;
  }
  if (!handled && menuItems(s).length) {
    const items = menuItems(s),
      n = items.length;
    if (edges.up) s = { ...s, menuIndex: (s.menuIndex + n - 1) % n };
    if (edges.down) s = { ...s, menuIndex: (s.menuIndex + 1) % n };
    if (edges.confirm) {
      s = confirm(s);
      handled = true;
    }
    if (!handled) {
      const starts = { ...s.pointerStarts };
      for (const sample of samples) {
        if (sample.type !== "move" && sample.button !== "primary") continue;
        const index = items.findIndex((_, i) => {
          const r = menuRect(s, i);
          return (
            r &&
            sample.x >= r.x &&
            sample.x <= r.x + r.w &&
            sample.y >= r.y &&
            sample.y <= r.y + r.h
          );
        });
        if (index >= 0) s = { ...s, menuIndex: index };
        if (sample.type === "down") starts[sample.id] = index;
        if (sample.type === "up") {
          const selected = starts[sample.id];
          delete starts[sample.id];
          if (index >= 0 && selected === index) {
            s = confirm(s);
            handled = true;
            break;
          }
        }
      }
      if (!handled) s = { ...s, pointerStarts: starts };
    }
  }
  const playingBefore = before === "playing" && !handled;
  s = {
    ...s,
    pendingFire: s.pendingFire || (playingBefore && edges.a),
    pendingTorpedo: s.pendingTorpedo || (playingBefore && edges.b),
  };
  const controls = {
    turn: api.input.value("right") - api.input.value("left"),
    thrust: api.input.value("up") > 0,
    fire: playingBefore && api.input.value("a") > 0,
    torpedo: false,
  };
  let clock = s.tickClock + dt;
  while (clock + 1e-12 >= C.TICK_DT) {
    const result = tick(s, {
      ...controls,
      fire: controls.fire || s.pendingFire,
      torpedo: s.pendingTorpedo,
    });
    s = { ...result.state, pendingFire: false, pendingTorpedo: false };
    for (const cue of result.cues) api.audio.play(cue);
    if (s.screen === "playing" && s.ship.thrusting)
      api.audio.loop(C.CUES.thrust);
    else api.audio.stop(C.CUES.thrust);
    clock -= C.TICK_DT;
  }
  if (s.screen !== "playing" || !controls.thrust) api.audio.stop(C.CUES.thrust);
  return { ...s, tickClock: Math.max(0, clock) };
}
