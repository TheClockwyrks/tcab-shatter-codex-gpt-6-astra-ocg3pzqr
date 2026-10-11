import type { RenderApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import type { Point, RockState, ShipState } from "./game";
import { type State, menuItems, menuRect, separation } from "./model";

type Context = CanvasRenderingContext2D;
const INK = "#e9eee9",
  MUTED = "#8695a6",
  CYAN = "#8ce7ef",
  GOLD = "#e8bc7e",
  RED = "#ff886f";
function text(
  ctx: Context,
  value: string,
  x: number,
  y: number,
  size = 14,
  color = MUTED,
  align: CanvasTextAlign = "left",
  weight = 400,
): void {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${size <= 16 ? "monospace" : "Arial, sans-serif"}`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(value, x, y);
}
function line(
  ctx: Context,
  points: readonly Point[],
  color: string,
  width = 1,
): void {
  ctx.beginPath();
  points.forEach((p, i) =>
    i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y),
  );
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}
function circle(
  ctx: Context,
  x: number,
  y: number,
  r: number,
  color: string,
  fill = false,
): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
function background(ctx: Context): void {
  const haze = ctx.createRadialGradient(820, 340, 10, 820, 340, 800);
  haze.addColorStop(0, "#112031");
  haze.addColorStop(0.6, "#0b1422");
  haze.addColorStop(1, "#080e19");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
  for (let i = 0; i < 180; i++) {
    const x = ((i * 7919 + 107) % 12800) / 10,
      y = ((i * 3571 + 251) % 7200) / 10;
    ctx.fillStyle =
      i % 9 === 0 ? "#7790a3" : i % 3 === 0 ? "#354658" : "#253445";
    const r = i % 9 === 0 ? 1.6 : 0.8;
    ctx.fillRect(x, y, r, r);
    if (i % 31 === 0) {
      line(
        ctx,
        [
          { x: x - 3, y },
          { x: x + 4, y },
        ],
        "#394b5c",
      );
      line(
        ctx,
        [
          { x, y: y - 3 },
          { x, y: y + 4 },
        ],
        "#394b5c",
      );
    }
  }
  // Restrained cartographic marks make the field feel like an instrument panel.
  ctx.strokeStyle = "#243141";
  ctx.lineWidth = 1;
  for (const x of [28, C.FIELD_W - 28])
    for (const y of [28, C.FIELD_H - 28]) {
      const dx = x < C.FIELD_W / 2 ? 1 : -1,
        dy = y < C.FIELD_H / 2 ? 1 : -1;
      line(
        ctx,
        [
          { x: x + 16 * dx, y },
          { x, y },
          { x, y: y + 16 * dy },
        ],
        "#344454",
      );
    }
}
function drawStar(ctx: Context, time: number): void {
  const reach = C.HALO_R * 1.5;
  const halo = ctx.createRadialGradient(
    C.STAR_X,
    C.STAR_Y,
    C.CORE_R * 0.3,
    C.STAR_X,
    C.STAR_Y,
    reach,
  );
  halo.addColorStop(0, "#ffe7b6");
  halo.addColorStop(0.14, "#ffd791");
  halo.addColorStop(0.2, "#eebd6f99");
  halo.addColorStop(0.36, "#dc9c4430");
  halo.addColorStop(0.68, "#d28c3010");
  halo.addColorStop(1, "#c5862900");
  circle(ctx, C.STAR_X, C.STAR_Y, reach, "transparent", true);
  ctx.fillStyle = halo;
  ctx.fill();
  ctx.save();
  ctx.translate(C.STAR_X, C.STAR_Y);
  ctx.rotate(time * 0.08);
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.ellipse(0, 0, 53 + i * 19, 35 + i * 17, i * 0.65, 0.25 + i, 2.7 + i);
    ctx.strokeStyle = `rgba(232,188,126,${0.17 - i * 0.025})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
  const core = ctx.createRadialGradient(
    C.STAR_X - 8,
    C.STAR_Y - 9,
    0,
    C.STAR_X,
    C.STAR_Y,
    C.CORE_R,
  );
  core.addColorStop(0, "#fffce8");
  core.addColorStop(0.72, "#ffe6b5");
  core.addColorStop(1, "#e7ad63");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(C.STAR_X, C.STAR_Y, C.CORE_R, 0, Math.PI * 2);
  ctx.fill();
  circle(ctx, C.STAR_X, C.STAR_Y, C.CORE_R + 5, "#edc37c60");
}
function wrapped(ctx: Context, p: Point, r: number, draw: () => void): void {
  const xs = [0],
    ys = [0];
  if (p.x < r) xs.push(C.FIELD_W);
  if (p.x > C.FIELD_W - r) xs.push(-C.FIELD_W);
  if (p.y < r) ys.push(C.FIELD_H);
  if (p.y > C.FIELD_H - r) ys.push(-C.FIELD_H);
  for (const x of xs)
    for (const y of ys) {
      ctx.save();
      ctx.translate(p.x + x, p.y + y);
      draw();
      ctx.restore();
    }
}
function rockShape(
  ctx: Context,
  r: Pick<RockState, "id" | "size" | "health" | "flash" | "spin">,
  scale = 1,
): void {
  const radius = C.ROCK_RADIUS[r.size] * scale,
    damage = C.ROCK_HEALTH[r.size] - r.health;
  ctx.save();
  ctx.rotate(r.spin);
  ctx.beginPath();
  const points: Point[] = [];
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2,
      rad =
        radius * (0.8 + 0.2 * (Math.sin(r.id * 8.3 + i * 19.7) * 0.5 + 0.5));
    points.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad });
  }
  points.forEach((p, i) =>
    i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y),
  );
  ctx.closePath();
  ctx.fillStyle = r.flash > 0 ? "#e8bc7e" : "#242a30";
  ctx.fill();
  ctx.strokeStyle =
    r.flash > 0 ? "#fff5d4" : damage > 0 ? "#edb773" : "#a89b83";
  ctx.lineWidth = 1.6;
  ctx.stroke();
  line(
    ctx,
    [points[1], { x: radius * 0.18, y: -radius * 0.28 }, points[4]],
    "#8e806447",
  );
  line(
    ctx,
    [points[7], { x: -radius * 0.15, y: radius * 0.16 }, points[10]],
    "#8e806435",
  );
  if (r.size !== "small") {
    circle(ctx, -radius * 0.25, -radius * 0.05, radius * 0.15, "#b09b6940");
    for (let i = 0; i < damage; i++) {
      const a = i * 2.4;
      ctx.save();
      ctx.rotate(a);
      line(
        ctx,
        [
          { x: -radius * 0.65, y: -radius * 0.4 },
          { x: -radius * 0.15, y: -radius * 0.12 },
          { x: radius * 0.1, y: radius * 0.28 },
          { x: radius * 0.7, y: radius * 0.5 },
        ],
        GOLD,
        1.6,
      );
      ctx.restore();
    }
  }
  ctx.restore();
}
function shipShape(
  ctx: Context,
  ship: Pick<ShipState, "angle" | "thrusting" | "invuln">,
  time: number,
  scale = 1,
): void {
  ctx.save();
  ctx.rotate(ship.angle);
  ctx.scale(scale, scale);
  if (ship.invuln > 0) {
    ctx.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(time * 12));
    circle(ctx, 0, 0, 23, "#8ce7ef70");
  }
  if (ship.thrusting) {
    const length = 22 + Math.sin(time * 85) * 7;
    ctx.beginPath();
    ctx.moveTo(-13, -6);
    ctx.lineTo(-13 - length, 0);
    ctx.lineTo(-13, 6);
    ctx.fillStyle = "#8ce7ef50";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-12, -3);
    ctx.lineTo(-20 - length * 0.65, 0);
    ctx.lineTo(-12, 3);
    ctx.fillStyle = "#d6ffff";
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(20, 0);
  ctx.lineTo(-14, 13);
  ctx.lineTo(-8, 0);
  ctx.lineTo(-14, -13);
  ctx.closePath();
  ctx.fillStyle = "#173846";
  ctx.fill();
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = 1.7;
  ctx.stroke();
  line(
    ctx,
    [
      { x: 13, y: 0 },
      { x: -6, y: 0 },
    ],
    "#e7ffff",
    1.2,
  );
  ctx.restore();
}
function trail(
  ctx: Context,
  s: State,
  b: Point & { readonly id: number },
  color: string,
  width: number,
): void {
  const history = s.trails[b.id] ?? [];
  if (history.length === 0) return;
  const points = [...history, b].map((p) => {
    const d = separation(b, p);
    return { x: d.x, y: d.y };
  });
  const reach = Math.max(...points.map((p) => Math.hypot(p.x, p.y))) + width;
  wrapped(ctx, b, reach, () => {
    // A single tapered ribbon avoids the bright beads caused by overlapping
    // translucent stroke caps at the samples of a curved trail.
    const sides = points.map((p, i) => {
      const before = points[Math.max(0, i - 1)];
      const after = points[Math.min(points.length - 1, i + 1)];
      const dx = after.x - before.x,
        dy = after.y - before.y;
      const length = Math.hypot(dx, dy) || 1;
      const radius = (width * 0.5 * i) / (points.length - 1);
      return {
        left: {
          x: p.x - (dy / length) * radius,
          y: p.y + (dx / length) * radius,
        },
        right: {
          x: p.x + (dy / length) * radius,
          y: p.y - (dx / length) * radius,
        },
      };
    });
    const gradient = ctx.createLinearGradient(points[0].x, points[0].y, 0, 0);
    gradient.addColorStop(0, `${color}00`);
    gradient.addColorStop(1, `${color}cc`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    sides.forEach((p, i) =>
      i === 0 ? ctx.moveTo(p.left.x, p.left.y) : ctx.lineTo(p.left.x, p.left.y),
    );
    for (const p of [...sides].reverse()) ctx.lineTo(p.right.x, p.right.y);
    ctx.closePath();
    ctx.fill();
  });
}
function field(ctx: Context, s: State): void {
  drawStar(ctx, s.fieldTime);
  for (const r of s.rocks)
    wrapped(ctx, r, C.ROCK_RADIUS[r.size], () => rockShape(ctx, r));
  for (const p of s.particles)
    wrapped(ctx, p, 3, () => {
      ctx.globalAlpha = Math.min(1, p.life * 2);
      line(
        ctx,
        [
          { x: 0, y: 0 },
          { x: -p.vx * 0.025, y: -p.vy * 0.025 },
        ],
        p.color,
        1.5,
      );
      ctx.globalAlpha = 1;
    });
  for (const b of [...s.bullets, ...s.enemyBullets]) {
    const color = s.bullets.includes(b) ? CYAN : RED;
    trail(ctx, s, b, color, 4);
    wrapped(ctx, b, 8, () => {
      circle(ctx, 0, 0, 6, `${color}18`, true);
      circle(ctx, 0, 0, C.BULLET_R, color, true);
    });
  }
  for (const t of s.torpedoes) {
    trail(ctx, s, t, RED, 6);
    wrapped(ctx, t, 16, () => {
      ctx.rotate(t.heading);
      ctx.fillStyle = RED;
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-7, 5);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-7, -5);
      ctx.closePath();
      ctx.fill();
      line(
        ctx,
        [
          { x: -6, y: 0 },
          { x: -18, y: 0 },
        ],
        "#ffe1ae",
        3,
      );
    });
  }
  if (s.saucer)
    wrapped(ctx, s.saucer, 28, () => {
      ctx.strokeStyle = RED;
      ctx.lineWidth = 1.7;
      ctx.fillStyle = "#372831";
      ctx.beginPath();
      ctx.ellipse(0, 2, 24, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      line(
        ctx,
        [
          { x: -13, y: -3 },
          { x: -7, y: -12 },
          { x: 7, y: -12 },
          { x: 13, y: -3 },
        ],
        RED,
        1.6,
      );
      for (const x of [-12, 0, 12]) circle(ctx, x, 2, 1.8, "#ffe0cd", true);
    });
  if (s.lives > 0)
    wrapped(ctx, s.ship, 45, () => shipShape(ctx, s.ship, s.fieldTime));
}
function hud(ctx: Context, s: State): void {
  text(ctx, "SCORE", 48, 53, 11, MUTED);
  text(ctx, String(s.score).padStart(6, "0"), 46, 90, 36, INK, "left", 600);
  for (let i = 0; i < Math.max(0, s.lives - 1); i++) {
    ctx.save();
    ctx.translate(56 + i * 24, 115);
    shipShape(ctx, { angle: C.FACE_UP, thrusting: false, invuln: 0 }, 0, 0.42);
    ctx.restore();
  }
  ctx.save();
  ctx.translate(55, 151);
  ctx.rotate(-Math.PI / 4);
  line(
    ctx,
    [
      { x: -8, y: 0 },
      { x: 8, y: 0 },
    ],
    s.torpedoCharge === 1 ? RED : "#5a4650",
    4,
  );
  ctx.restore();
  text(
    ctx,
    s.torpedoCharge === 1 ? "TORPEDO READY" : "RECHARGING",
    74,
    155,
    10,
    s.torpedoCharge === 1 ? RED : MUTED,
  );
  ctx.fillStyle = "#303340";
  ctx.fillRect(47, 166, 124, 3);
  ctx.fillStyle = RED;
  ctx.fillRect(47, 166, 124 * s.torpedoCharge, 3);
  text(
    ctx,
    `WAVE  ${String(s.wave).padStart(2, "0")}`,
    C.FIELD_W - 48,
    54,
    13,
    INK,
    "right",
  );
  text(
    ctx,
    `${String(s.rocks.length).padStart(2, "0")} CONTACTS`,
    C.FIELD_W - 48,
    76,
    11,
    MUTED,
    "right",
  );
  text(ctx, "SHATTER / WARHEAD", 48, C.FIELD_H - 35, 10, "#526375");
  text(
    ctx,
    `P  PAUSE     M  ${s.muted ? "SOUND OFF" : "SOUND ON"}`,
    C.FIELD_W - 48,
    C.FIELD_H - 35,
    10,
    "#718396",
    "right",
  );
  if (s.waveBanner > 0) {
    text(ctx, `WAVE ${s.wave}`, C.FIELD_W / 2, 240, 40, INK, "center", 500);
    text(ctx, "CLEAR THE FIELD", C.FIELD_W / 2, 268, 11, GOLD, "center");
  }
  if (s.extraLifeBanner > 0)
    text(ctx, "+ EXTRA SHIP", C.FIELD_W / 2, 112, 18, CYAN, "center");
}
function menu(ctx: Context, s: State): void {
  menuItems(s).forEach((item, i) => {
    const r = menuRect(s, i);
    if (!r) return;
    const active = s.menuIndex === i;
    ctx.fillStyle = active ? "#8ce7ef" : "#101b29";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    if (!active) {
      ctx.strokeStyle = "#2b3a49";
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    }
    text(
      ctx,
      item,
      r.x + 22,
      r.y + 32,
      14,
      active ? "#0b1d2a" : MUTED,
      "left",
      600,
    );
    text(
      ctx,
      active ? "↗" : "—",
      r.x + r.w - 22,
      r.y + 32,
      20,
      active ? "#0b1d2a" : "#455565",
      "right",
    );
  });
}
function title(ctx: Context, s: State): void {
  drawStar(ctx, s.simTime);
  // The title illustration is a drawn flight study, with no gameplay side effects.
  const rocks = [
    { x: 1004, y: 257, size: "large" as const, scale: 1.8, id: 19 },
    { x: 1113, y: 473, size: "medium" as const, scale: 1.6, id: 24 },
    { x: 850, y: 151, size: "small" as const, scale: 1.6, id: 30 },
  ];
  for (const r of rocks) {
    ctx.save();
    ctx.translate(
      r.x + Math.sin(s.simTime * 0.15 + r.id) * 7,
      r.y + Math.cos(s.simTime * 0.2 + r.id) * 10,
    );
    rockShape(
      ctx,
      {
        id: r.id,
        size: r.size,
        health: C.ROCK_HEALTH[r.size],
        flash: 0,
        spin: s.simTime * 0.07 + r.id,
      },
      r.scale,
    );
    ctx.restore();
  }
  ctx.save();
  ctx.translate(918, 497);
  shipShape(ctx, { angle: -1.1, thrusting: true, invuln: 0 }, s.simTime, 1.7);
  ctx.restore();
  line(
    ctx,
    [
      { x: 934, y: 456 },
      { x: 951, y: 422 },
    ],
    CYAN,
    2,
  );
  circle(ctx, 953, 419, 3, CYAN, true);
  line(
    ctx,
    [
      { x: 1090, y: 234 },
      { x: 1140, y: 203 },
      { x: 1183, y: 203 },
    ],
    "#465361",
  );
  text(ctx, "03 / ARMORED", 1182, 191, 10, GOLD, "right");
  text(ctx, "01", 96, 80, 12, CYAN);
  line(
    ctx,
    [
      { x: 128, y: 76 },
      { x: 179, y: 76 },
    ],
    "#4c6878",
  );
  text(ctx, "DEEP SPACE / FIELD OPERATIONS", 197, 80, 11, MUTED);
  text(ctx, C.TITLE_TEXT, 90, 241, 116, INK, "left", 800);
  text(ctx, C.TAGLINE_TEXT, 100, 282, 16, GOLD);
  text(ctx, "Break the rocks. Bend the shot.", 100, 351, 20, INK);
  text(ctx, "Keep your course.", 100, 379, 20, MUTED);
  menu(ctx, s);
  text(ctx, "WARHEAD", 100, 614, 11, RED);
  text(ctx, "ONE TORPEDO. MAKE IT COUNT.", 195, 614, 11, MUTED);
  line(
    ctx,
    [
      { x: 100, y: 643 },
      { x: 1180, y: 643 },
    ],
    "#2b3745",
  );
  text(ctx, "↑ ↓  SELECT     ENTER  LAUNCH", 100, 676, 11, MUTED);
  text(
    ctx,
    `M  ${s.muted ? "SOUND OFF" : "SOUND ON"}     /     ∞ SECTOR`,
    1180,
    676,
    11,
    MUTED,
    "right",
  );
}
function howto(ctx: Context): void {
  text(ctx, "FLIGHT MANUAL", 80, 76, 12, CYAN);
  text(ctx, "Learn the pull.", 78, 142, 54, INK, "left", 600);
  text(
    ctx,
    "Your ship holds its course. Everything else has to fight gravity.",
    80,
    183,
    18,
    MUTED,
  );
  const entries = [
    [
      "01",
      "BREAK THE FIELD",
      "Shoot every rock, then its fragments, to clear a wave.",
      "Large rocks carry armor. Cracks tell you how close they are to breaking.",
    ],
    [
      "02",
      "WORK THE WELL",
      "The star pulls rocks and bullets, but never your ship. Bend shots around it.",
      "The core absorbs shots; swallowed rocks return from an edge.",
    ],
    [
      "03",
      "BRING A WARHEAD",
      "Your guided torpedo ignores the well and destroys any rock. One charge, ten seconds to reload.",
      "Aim close: it homes on the nearest target in a narrow forward cone.",
    ],
    [
      "04",
      "WATCH YOUR SIX",
      "A saucer will arrive to hunt you. Shoot it down before it lines up a shot.",
      "Keep moving. Turn and thrust against your drift to slow down.",
    ],
  ];
  entries.forEach(([n, heading, a, b], i) => {
    const y = 247 + i * 87;
    text(ctx, n, 80, y, 12, GOLD);
    text(ctx, heading, 124, y, 14, INK, "left", 600);
    text(ctx, a, 124, y + 25, 15, MUTED);
    text(ctx, b, 124, y + 46, 15, MUTED);
  });
  ctx.fillStyle = "#121f2d";
  ctx.fillRect(80, 605, 1120, 57);
  text(
    ctx,
    "ARROWS / WASD  FLY     SPACE  FIRE     F  TORPEDO     P / ESC  PAUSE     M  SOUND",
    102,
    638,
    13,
    CYAN,
  );
  text(ctx, "ENTER / ESC  RETURN TO MENU", 80, 695, 11, MUTED);
}
export function render(s: State, api: RenderApi): void {
  const ctx = api.ctx;
  background(ctx);
  if (s.screen === "title") {
    title(ctx, s);
    return;
  }
  if (s.screen === "howto") {
    howto(ctx);
    return;
  }
  field(ctx, s);
  hud(ctx, s);
  if (s.screen === "paused" || s.screen === "gameover") {
    ctx.fillStyle = "#080e19d9";
    ctx.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
    text(
      ctx,
      s.screen === "paused" ? "FLIGHT ON HOLD" : "SIGNAL LOST",
      C.FIELD_W / 2,
      220,
      12,
      GOLD,
      "center",
    );
    text(
      ctx,
      s.screen === "paused" ? "Paused." : "Game over.",
      C.FIELD_W / 2,
      288,
      60,
      INK,
      "center",
      600,
    );
    text(
      ctx,
      s.screen === "paused"
        ? "Take a breath. The field can wait."
        : `SCORE ${String(s.score).padStart(6, "0")}     /     WAVE ${s.wave}`,
      C.FIELD_W / 2,
      327,
      15,
      MUTED,
      "center",
    );
    menu(ctx, s);
    text(
      ctx,
      "↑ ↓  SELECT     ENTER  CONFIRM",
      C.FIELD_W / 2,
      600,
      11,
      MUTED,
      "center",
    );
  }
}
