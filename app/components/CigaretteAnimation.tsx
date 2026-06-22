"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import Pusher from "pusher-js";

// Global singletons to prevent duplicate connections/listeners during dev remounts
let globalPusher: Pusher | null = null;
let globalChannel: any = null;
let globalBC: BroadcastChannel | null = null;

/* ═══════════════════════════════════════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════════════════════════════════════ */

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  maxAlpha: number;
  age: number; maxAge: number;
  phase: number;
  drift: number;
}

interface AshFrag {
  x: number; y: number;
  vx: number; vy: number;
  rot: number; rotV: number;
  w: number; h: number;
  alpha: number;
  dead: boolean;
}

interface Crack {
  xOff: number;   // horizontal offset from CIG_CX
  yFrac: number;  // fraction along ash height (0=top, 1=bottom)
  dx: number; dy: number;
}

type AshPhase = "growing" | "wobbling" | "falling";

interface SmokeRing {
  x: number; y: number;
  vx: number; vy: number;
  radiusX: number; radiusY: number;
  maxRadiusX: number;
  thickness: number;
  alpha: number;
  age: number; maxAge: number;
  wobblePhase: number;
  wobbleSpeed: number;
  rotation: number;
  rotSpeed: number;
}

interface ChatBubble {
  id: string;
  x: number; y: number;
  vx: number; vy: number;
  radius: number;
  text: string;
  lines: string[];
  color: string;
  borderCol: string;
  alpha: number;
  age: number; maxAge: number;
  wobbleSpeed: number;
  wobbleAmp: number;
  phase: number;
}

interface Sim {
  lit: boolean;
  progress: number;       // 0..1
  startMs: number | null;
  prevProgress: number;
  done: boolean;
  ashLen: number;         // px height of ash column (grows upward from ember)
  ashPhase: AshPhase;
  wobAngle: number;       // tilt angle (left/right sway)
  wobAmp: number;
  ashCracks: Crack[];
  particles: Particle[];
  frags: AshFrag[];
  smokeRings: SmokeRing[];
  flickTarget: number;
  flickVal: number;
  flickNextMs: number;
  puffPower: number;
  igniteFlash: number;
  bubbles: ChatBubble[];
}

/* ═══════════════════════════════════════════════════════════════════════════════
   CONSTANTS  (portrait canvas — cigarette is vertical, tip at top)
═══════════════════════════════════════════════════════════════════════════════ */

const CW = 440;          // canvas width
const CH = 800;          // canvas height
const BURN_MS = 300_000; // 5 minutes

const CIG_CX  = 220;    // horizontal centre of cigarette
const CIG_R   = 15;     // radius → 30 px diameter (thicker)
const TIP_Y   = 450;    // top of paper (burning tip — ember starts here, smaller height)
const FIL_Y   = 720;    // top of filter
const FIL_EY  = 800;    // bottom of filter (fixed flush to screen bottom)
const PAPER_H = FIL_Y - TIP_Y;  // 340 px of burnable paper

// Ash thresholds (in canvas pixels — max 5 px per user request)
const ASH_WOBBLE_AT = 3;
const ASH_FALL_AT   = 10;
const ASH_STUB      = 0;

const GRAVITY = 0.52;   // px / frame² for falling fragments

/* ═══════════════════════════════════════════════════════════════════════════════
   PURE HELPERS
═══════════════════════════════════════════════════════════════════════════════ */

const rnd   = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Y-position of the ember (moves DOWN as cigarette burns) */
function getEmberY(s: Sim): number {
  return TIP_Y + s.progress * PAPER_H;
}

/** Emit one (or several) smoke particles from just above the ash/ember */
function emitSmoke(s: Sim, ey: number, puff: boolean): void {
  const originY = ey - s.ashLen - CIG_R - rnd(0, 4);
  const n = puff ? Math.ceil(rnd(3, 6)) : 1;
  for (let i = 0; i < n; i++) {
    s.particles.push({
      x: CIG_CX + rnd(-4, 4),
      y: originY,
      vx: rnd(-0.35, 0.35) * (puff ? 2.5 : 1),
      vy: -(rnd(0.45, 1.1)  * (puff ? 1.75 : 1)),  // upward = negative y
      r: rnd(6, 16) * (puff ? 1.4 : 1),
      maxAlpha: rnd(0.27, 0.52),
      age: 0,
      maxAge: Math.floor(rnd(120, 220)) * (puff ? 0.62 : 1),
      phase: rnd(0, Math.PI * 2),
      drift: rnd(0.2, 0.7) * (puff ? 1.9 : 1),
    });
  }
}

/** Emit a single smoke ring from the exact centre of the cigarette tip */
function emitSmokeRing(s: Sim, ey: number): void {
  const originY = ey - s.ashLen - CIG_R - 4;
  s.smokeRings.push({
    x: CIG_CX,
    y: originY,
    vx: 0,
    vy: -0.85,
    radiusX: CIG_R * 0.6,
    radiusY: CIG_R * 0.22,
    maxRadiusX: 55,
    thickness: 4.5,
    alpha: 0.7,
    age: 0,
    maxAge: 130,
    wobblePhase: rnd(0, Math.PI * 2),
    wobbleSpeed: 0.03,
    rotation: 0,
    rotSpeed: 0,
  });
}

/** Spawn ash fragments that fall away from the tip of the column */
function spawnFrags(s: Sim, ey: number): void {
  const ashTopY = ey - s.ashLen;
  for (let i = 0; i < Math.ceil(rnd(5, 9)); i++) {
    s.frags.push({
      x: CIG_CX + rnd(-CIG_R * 0.85, CIG_R * 0.85),
      y: ashTopY + rnd(0, s.ashLen),
      vx: rnd(-2.2, 2.2),
      vy: rnd(-1.2, 0.6),   // some go up briefly then fall
      rot: rnd(0, Math.PI * 2),
      rotV: rnd(-0.09, 0.09),
      w: rnd(2, 8),
      h: rnd(1, 4),
      alpha: 0.88,
      dead: false,
    });
  }
}

/** Pre-bake crack lines so they don't flicker each frame */
function makeCracks(): Crack[] {
  return Array.from({ length: 5 }, () => ({
    xOff: rnd(-CIG_R * 0.65, CIG_R * 0.65),
    yFrac: rnd(0.1, 0.9),
    dx: rnd(-4, 4),
    dy: rnd(-3, 3),
  }));
}

/* ═══════════════════════════════════════════════════════════════════════════════
   DRAW FUNCTIONS   (all pure — take ctx + data, no side-effects)
═══════════════════════════════════════════════════════════════════════════════ */

function drawBackground(ctx: CanvasRenderingContext2D, s: Sim, ey: number) {
  // Dark fill
  ctx.fillStyle = "#0c0c13";
  ctx.fillRect(0, 0, CW, CH);

  // Radial vignette
  const vg = ctx.createRadialGradient(CW / 2, CH / 2, CW * 0.1, CW / 2, CH / 2, CW * 0.9);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.65)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, CW, CH);

  // Warm ember ambience bleeding into the surrounding darkness
  if (s.lit) {
    const f = s.flickVal * (1 + s.puffPower * 0.4);
    const ag = ctx.createRadialGradient(CIG_CX, ey, 0, CIG_CX, ey, 65);
    ag.addColorStop(0, `rgba(255,80,0,${0.12 * f})`);
    ag.addColorStop(1, "rgba(200,30,0,0)");
    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.arc(CIG_CX, ey, 80, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCigarette(ctx: CanvasRenderingContext2D, s: Sim) {
  const ey      = getEmberY(s);
  const ashTopY = ey - s.ashLen;
  const ELLIPSE_RY = CIG_R * 0.35; // vertical radius of the elliptical caps

  /* ── Helper: cylindrical shading gradient left→centre→right ─────── */
  const cylGrad = (baseR: number, baseG: number, baseB: number, boost: number = 0) => {
    const g = ctx.createLinearGradient(CIG_CX - CIG_R, 0, CIG_CX + CIG_R, 0);
    const clr = (r: number, gc: number, b: number) => `rgb(${r},${gc},${b})`;
    const d = 40; // darkening at edges
    g.addColorStop(0,    clr(baseR - d - 10, baseG - d - 10, baseB - d - 10));
    g.addColorStop(0.08, clr(baseR - d, baseG - d, baseB - d));
    g.addColorStop(0.25, clr(baseR - 8 + boost, baseG - 8 + boost, baseB - 8 + boost));
    g.addColorStop(0.42, clr(baseR + boost, baseG + boost, baseB + boost));
    g.addColorStop(0.50, clr(Math.min(255, baseR + 12 + boost), Math.min(255, baseG + 12 + boost), Math.min(255, baseB + 12 + boost)));
    g.addColorStop(0.58, clr(baseR + boost, baseG + boost, baseB + boost));
    g.addColorStop(0.75, clr(baseR - 8 + boost, baseG - 8 + boost, baseB - 8 + boost));
    g.addColorStop(0.92, clr(baseR - d, baseG - d, baseB - d));
    g.addColorStop(1,    clr(baseR - d - 10, baseG - d - 10, baseB - d - 10));
    return g;
  };

  /* ── Unburned paper body (3D cylinder with elliptical cap) ──────── */
  const paperTop = s.lit ? ey : TIP_Y;
  const paperH   = FIL_Y - paperTop;

  if (paperH > 0) {
    // Main body — cylindrical shading (off-white paper)
    ctx.fillStyle = cylGrad(235, 232, 222, 0);
    ctx.fillRect(CIG_CX - CIG_R, paperTop, CIG_R * 2, paperH);

    // Soft drop shadow on left & right edges (3D depth)
    const shadowL = ctx.createLinearGradient(CIG_CX - CIG_R - 3, 0, CIG_CX - CIG_R + 5, 0);
    shadowL.addColorStop(0, "rgba(0,0,0,0.22)");
    shadowL.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = shadowL;
    ctx.fillRect(CIG_CX - CIG_R - 3, paperTop, 8, paperH);

    const shadowR = ctx.createLinearGradient(CIG_CX + CIG_R - 5, 0, CIG_CX + CIG_R + 3, 0);
    shadowR.addColorStop(0, "rgba(0,0,0,0)");
    shadowR.addColorStop(1, "rgba(0,0,0,0.22)");
    ctx.fillStyle = shadowR;
    ctx.fillRect(CIG_CX + CIG_R - 5, paperTop, 8, paperH);

    // Specular highlight strip (shifted left like real lighting)
    const hlG = ctx.createLinearGradient(CIG_CX - CIG_R + 3, 0, CIG_CX - CIG_R + 12, 0);
    hlG.addColorStop(0, "rgba(255,255,255,0)");
    hlG.addColorStop(0.3, "rgba(255,255,255,0.32)");
    hlG.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = hlG;
    ctx.fillRect(CIG_CX - CIG_R + 3, paperTop, 9, paperH);

    // Paper grain texture — very fine horizontal lines
    ctx.strokeStyle = "rgba(180,175,160,0.09)";
    ctx.lineWidth = 0.4;
    for (let y = paperTop + 3; y < FIL_Y; y += 3) {
      ctx.beginPath();
      ctx.moveTo(CIG_CX - CIG_R + 1, y + Math.sin(y * 0.7) * 0.3);
      ctx.lineTo(CIG_CX + CIG_R - 1, y + Math.sin(y * 0.7 + 1) * 0.3);
      ctx.stroke();
    }

    // Paper seam — faint vertical line down one side (like the real seam)
    ctx.strokeStyle = "rgba(160,155,140,0.18)";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(CIG_CX + CIG_R * 0.65, paperTop);
    ctx.lineTo(CIG_CX + CIG_R * 0.65, FIL_Y);
    ctx.stroke();

    // Elliptical top cap (3D look — visible when unlit or when there's no ash)
    if (!s.lit) {
      ctx.save();
      ctx.fillStyle = "#e8e4da";
      ctx.beginPath();
      ctx.ellipse(CIG_CX, paperTop, CIG_R, ELLIPSE_RY, 0, 0, Math.PI * 2);
      ctx.fill();
      // Tobacco fill visible inside the top
      ctx.fillStyle = "#8b6914";
      ctx.beginPath();
      ctx.ellipse(CIG_CX, paperTop, CIG_R - 2, ELLIPSE_RY - 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Tobacco specks
      ctx.fillStyle = "rgba(60,35,5,0.4)";
      for (let i = 0; i < 12; i++) {
        const angle = rnd(0, Math.PI * 2);
        const dist = rnd(0, CIG_R - 4);
        const sx = CIG_CX + Math.cos(angle) * dist * 0.85;
        const sy = paperTop + Math.sin(angle) * dist * (ELLIPSE_RY / CIG_R) * 0.7;
        ctx.fillRect(sx - 0.8, sy - 0.4, rnd(1, 2.5), rnd(0.5, 1.2));
      }
      ctx.restore();
    }
  }

  /* ── Filter (3D cylindrical with gold bands) ────────────────────── */
  {
    const filterH = FIL_EY - FIL_Y;
    // Main filter body — cylindrical cork shading
    ctx.fillStyle = cylGrad(178, 120, 62, 0);
    ctx.fillRect(CIG_CX - CIG_R, FIL_Y, CIG_R * 2, filterH);

    // Cork texture — wavy horizontal lines for organic look
    ctx.strokeStyle = "rgba(90,50,15,0.12)";
    ctx.lineWidth = 0.5;
    for (let y = FIL_Y + 2; y < FIL_EY; y += 2.5) {
      ctx.beginPath();
      ctx.moveTo(CIG_CX - CIG_R + 2, y);
      for (let x = CIG_CX - CIG_R + 2; x <= CIG_CX + CIG_R - 2; x += 4) {
        ctx.lineTo(x, y + Math.sin(x * 0.5 + y * 0.3) * 0.6);
      }
      ctx.stroke();
    }
    // Speckle dots on cork
    ctx.fillStyle = "rgba(60,30,8,0.08)";
    for (let i = 0; i < 30; i++) {
      const dx = rnd(CIG_CX - CIG_R + 2, CIG_CX + CIG_R - 2);
      const dy = rnd(FIL_Y + 2, FIL_EY - 2);
      ctx.beginPath();
      ctx.arc(dx, dy, rnd(0.3, 0.8), 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Gold double-band (like Marlboro/classic cigarette) ──────
    const bandY = FIL_Y + 2;
    const bandH = 8;
    const bandGap = 3;
    for (let b = 0; b < 2; b++) {
      const by = bandY + b * (bandH + bandGap);
      const bg = ctx.createLinearGradient(CIG_CX - CIG_R, 0, CIG_CX + CIG_R, 0);
      bg.addColorStop(0,    "#8a6e28");
      bg.addColorStop(0.15, "#c9a84c");
      bg.addColorStop(0.35, "#e8cc6e");
      bg.addColorStop(0.5,  "#f0d878");
      bg.addColorStop(0.65, "#e8cc6e");
      bg.addColorStop(0.85, "#c9a84c");
      bg.addColorStop(1,    "#8a6e28");
      ctx.fillStyle = bg;
      ctx.fillRect(CIG_CX - CIG_R, by, CIG_R * 2, bandH);
      // Top and bottom hairline on band
      ctx.strokeStyle = "rgba(100,75,20,0.4)";
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(CIG_CX - CIG_R, by); ctx.lineTo(CIG_CX + CIG_R, by); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(CIG_CX - CIG_R, by + bandH); ctx.lineTo(CIG_CX + CIG_R, by + bandH); ctx.stroke();
    }

    // Filter-paper junction line (dark separator)
    ctx.strokeStyle = "rgba(30,12,2,0.7)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(CIG_CX - CIG_R, FIL_Y);
    ctx.lineTo(CIG_CX + CIG_R, FIL_Y);
    ctx.stroke();

    // Specular highlight on filter
    const fhlG = ctx.createLinearGradient(CIG_CX - CIG_R + 3, 0, CIG_CX - CIG_R + 11, 0);
    fhlG.addColorStop(0, "rgba(255,220,160,0)");
    fhlG.addColorStop(0.3, "rgba(255,220,160,0.18)");
    fhlG.addColorStop(1, "rgba(255,220,160,0)");
    ctx.fillStyle = fhlG;
    ctx.fillRect(CIG_CX - CIG_R + 3, FIL_Y, 8, filterH);

    // Elliptical bottom cap of filter
    ctx.save();
    ctx.fillStyle = cylGrad(165, 110, 55, -10);
    ctx.beginPath();
    ctx.ellipse(CIG_CX, FIL_EY, CIG_R, ELLIPSE_RY, 0, 0, Math.PI * 2);
    ctx.fill();
    // Inner ring
    ctx.strokeStyle = "rgba(80,45,15,0.3)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(CIG_CX, FIL_EY, CIG_R - 3, ELLIPSE_RY - 1.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /* ── Ash column (sits ABOVE the ember, grows upward) ────────────── */
  if (s.lit && s.ashLen > 0.2) {
    const aTop = ey - s.ashLen;
    const aLen = s.ashLen;

    // Ash body — cylindrical shading (grey tones)
    ctx.fillStyle = cylGrad(170, 170, 170, 0);
    ctx.fillRect(CIG_CX - CIG_R, aTop, CIG_R * 2, aLen);

    // Edge shadows
    ctx.fillStyle = "rgba(0,0,0,0.14)";
    ctx.fillRect(CIG_CX - CIG_R, aTop, 2.5, aLen);
    ctx.fillRect(CIG_CX + CIG_R - 2.5, aTop, 2.5, aLen);

    // Ash crack texture
    ctx.strokeStyle = "rgba(60,60,60,0.15)";
    ctx.lineWidth = 0.5;
    for (const c of s.ashCracks) {
      const cy = aTop + c.yFrac * aLen;
      ctx.beginPath();
      ctx.moveTo(CIG_CX + c.xOff, cy);
      ctx.lineTo(CIG_CX + c.xOff + c.dx, cy + c.dy);
      ctx.stroke();
    }

    // Free-end crumble ellipse cap (at the very top of ash column)
    ctx.save();
    const capG = ctx.createRadialGradient(CIG_CX, aTop, 0, CIG_CX, aTop, CIG_R + 2);
    capG.addColorStop(0,   "rgba(140,140,140,0.6)");
    capG.addColorStop(0.5, "rgba(110,110,110,0.25)");
    capG.addColorStop(1,   "rgba(0,0,0,0)");
    ctx.fillStyle = capG;
    ctx.beginPath();
    ctx.ellipse(CIG_CX, aTop, CIG_R + 1, ELLIPSE_RY + 1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawEmber(ctx: CanvasRenderingContext2D, s: Sim) {
  if (!s.lit) return;
  const ey = getEmberY(s);
  const f  = s.flickVal;
  const pb = 1 + s.puffPower * 0.48;
  const ELLIPSE_RY = CIG_R * 0.35;

  // 1. Outer heat haze glow
  const g = ctx.createRadialGradient(CIG_CX, ey, CIG_R * 0.3, CIG_CX, ey, 35 * pb);
  g.addColorStop(0, `rgba(255, 70, 0, ${0.3 * f * pb})`);
  g.addColorStop(0.4, `rgba(220, 30, 0, ${0.12 * f})`);
  g.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(CIG_CX, ey, 35 * pb, 0, Math.PI * 2);
  ctx.fill();

  // 2. Ember band — rectangular coal with 3D elliptical top edge
  const rectH = 8 * pb;
  ctx.save();
  ctx.beginPath();
  ctx.rect(CIG_CX - CIG_R, ey - rectH / 2, CIG_R * 2, rectH);
  ctx.clip();

  // Multi-stop coal gradient (white-hot center → orange → dark red edges)
  const coalG = ctx.createLinearGradient(CIG_CX - CIG_R, 0, CIG_CX + CIG_R, 0);
  coalG.addColorStop(0,    `rgba(120, 20, 0, ${0.7 * f})`);
  coalG.addColorStop(0.2,  `rgba(200, 60, 0, ${0.85 * f})`);
  coalG.addColorStop(0.35, `rgba(255, 140, 30, ${0.95 * f})`);
  coalG.addColorStop(0.5,  `rgba(255, 200, 100, ${1.0 * f})`);
  coalG.addColorStop(0.65, `rgba(255, 140, 30, ${0.95 * f})`);
  coalG.addColorStop(0.8,  `rgba(200, 60, 0, ${0.85 * f})`);
  coalG.addColorStop(1,    `rgba(120, 20, 0, ${0.7 * f})`);
  ctx.fillStyle = coalG;
  ctx.fillRect(CIG_CX - CIG_R, ey - rectH / 2, CIG_R * 2, rectH);

  // Vertical gradient overlay (bright top → dark bottom like real ember)
  const coalV = ctx.createLinearGradient(0, ey - rectH / 2, 0, ey + rectH / 2);
  coalV.addColorStop(0, `rgba(255,220,150,${0.3 * f})`);
  coalV.addColorStop(0.5, "rgba(0,0,0,0)");
  coalV.addColorStop(1, `rgba(80,10,0,${0.3 * f})`);
  ctx.fillStyle = coalV;
  ctx.fillRect(CIG_CX - CIG_R, ey - rectH / 2, CIG_R * 2, rectH);
  ctx.restore();

  // 3. Elliptical ember top (the burning face visible from above)
  ctx.save();
  const emberTopG = ctx.createRadialGradient(CIG_CX, ey - rectH / 2, 0, CIG_CX, ey - rectH / 2, CIG_R);
  emberTopG.addColorStop(0, `rgba(255,210,120,${0.6 * f * pb})`);
  emberTopG.addColorStop(0.5, `rgba(255,100,10,${0.4 * f * pb})`);
  emberTopG.addColorStop(1, `rgba(140,20,0,${0.15 * f})`);
  ctx.fillStyle = emberTopG;
  ctx.beginPath();
  ctx.ellipse(CIG_CX, ey - rectH / 2, CIG_R, ELLIPSE_RY, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 4. Thin hot edge strokes
  ctx.strokeStyle = `rgba(200, 50, 0, ${0.7 * f})`;
  ctx.lineWidth = 1.2 * pb;
  ctx.beginPath();
  ctx.moveTo(CIG_CX - CIG_R, ey + rectH / 2);
  ctx.lineTo(CIG_CX + CIG_R, ey + rectH / 2);
  ctx.stroke();

  // 5. Ignition flash
  if (s.igniteFlash > 0) {
    const flashG = ctx.createRadialGradient(CIG_CX, ey, 0, CIG_CX, ey, 70 * s.igniteFlash);
    flashG.addColorStop(0, `rgba(255, 200, 80, ${0.55 * s.igniteFlash})`);
    flashG.addColorStop(1, "rgba(255, 120, 0, 0)");
    ctx.fillStyle = flashG;
    ctx.beginPath();
    ctx.arc(CIG_CX, ey, 90 * s.igniteFlash, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSmoke(ctx: CanvasRenderingContext2D, particles: Particle[]) {
  for (const p of particles) {
    const t = p.age / p.maxAge;
    // Opacity envelope: fade in → hold → fade out
    const alpha =
      t < 0.15 ? (t / 0.15) * p.maxAlpha :
      t < 0.65 ? p.maxAlpha * (1 - (t - 0.15) / 0.50) :
      0;
    if (alpha < 0.005) continue;
    const curR = p.r * (1 + t * 2.6);
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, curR);
    g.addColorStop(0,    `rgba(208,208,220,${alpha})`);
    g.addColorStop(0.55, `rgba(185,188,205,${alpha * 0.5})`);
    g.addColorStop(1,    "rgba(162,165,188,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, curR, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Draw toroidal smoke rings — expanding ellipses that drift upward */
function drawSmokeRings(ctx: CanvasRenderingContext2D, rings: SmokeRing[]) {
  for (const r of rings) {
    const t = r.age / r.maxAge;
    // Opacity: fade in quickly, hold, then fade out
    let alpha: number;
    if (t < 0.08) {
      alpha = (t / 0.08) * r.alpha;
    } else if (t < 0.55) {
      alpha = r.alpha * (1 - (t - 0.08) * 0.4);
    } else {
      alpha = r.alpha * (1 - t) * 1.8;
    }
    if (alpha < 0.005) continue;

    const expand = 1 + t * ((r.maxRadiusX / r.radiusX) - 1);
    const curRX = r.radiusX * expand;
    const curRY = r.radiusY * expand * 0.85;
    const curThick = r.thickness * (1 + t * 1.2);

    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(r.rotation);

    // Outer glow
    ctx.strokeStyle = `rgba(195,195,210,${alpha * 0.3})`;
    ctx.lineWidth = curThick + 4;
    ctx.beginPath();
    ctx.ellipse(0, 0, curRX + 2, curRY + 1, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Main ring body
    ctx.strokeStyle = `rgba(210,210,225,${alpha})`;
    ctx.lineWidth = curThick;
    ctx.beginPath();
    ctx.ellipse(0, 0, curRX, curRY, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Inner highlight (top of torus)
    ctx.strokeStyle = `rgba(235,235,245,${alpha * 0.5})`;
    ctx.lineWidth = curThick * 0.4;
    ctx.beginPath();
    ctx.ellipse(0, -curThick * 0.15, curRX * 0.92, curRY * 0.88, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }
}

function drawFrags(ctx: CanvasRenderingContext2D, frags: AshFrag[]) {
  for (const f of frags) {
    if (f.dead || f.alpha < 0.01) continue;
    ctx.save();
    ctx.globalAlpha = f.alpha;
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rot);
    const g = ctx.createLinearGradient(-f.w / 2, -f.h / 2, f.w / 2, f.h / 2);
    g.addColorStop(0, "#c0c0c0");
    g.addColorStop(1, "#7e7e7e");
    ctx.fillStyle = g;
    ctx.fillRect(-f.w / 2, -f.h / 2, f.w, f.h);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawUI(ctx: CanvasRenderingContext2D, s: Sim) {
  // UI texts and progress bar/timer have been removed per user request
}

/* ── BUBBLE SYSTEM ──────────────────────────────────────────────────────── */



function splitTextIntoLines(text: string, maxLineLength: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (currentLine === "") {
      currentLine = word;
    } else if ((currentLine + " " + word).length > maxLineLength) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine += " " + word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

function spawnBubble(s: Sim, text: string): void {
  const isSmall = typeof window !== "undefined" && window.innerWidth < 500;
  
  // Split into lines to make bubble smaller
  const maxLineLength = isSmall ? 14 : 18;
  const lines = splitTextIntoLines(text, maxLineLength);
  
  // Calculate bounding box and minimum enclosing circle radius
  const charWidth = isSmall ? 5.2 : 6.8;
  const maxLen = Math.max(...lines.map(l => l.length));
  const textWidth = maxLen * charWidth;
  const textHeight = lines.length * (isSmall ? 12 : 16);
  
  // R = sqrt((W/2)^2 + (H/2)^2) + padding
  const radius = Math.sqrt((textWidth / 2) * (textWidth / 2) + (textHeight / 2) * (textHeight / 2)) + (isSmall ? 8 : 12);
  
  const startX = rnd(radius + 20, CW - radius - 20);
  const startY = CH + radius + rnd(10, 40);
  
  // Slower velocities for a relaxing feel
  const vx = rnd(-0.2, 0.2);
  const vy = rnd(-0.95, -0.6);

  s.bubbles.push({
    id: String(Date.now()) + Math.random(),
    x: startX,
    y: startY,
    vx,
    vy,
    radius,
    text,
    lines,
    color: "rgba(255, 255, 255, 0.08)", // fully white glassy bubble fill
    borderCol: "rgba(255, 255, 255, 0.45)", // white ring border
    alpha: 0.9,
    age: 0,
    maxAge: Math.floor(rnd(750, 950)), // longer life because speed is slower
    wobbleSpeed: rnd(0.008, 0.018),
    wobbleAmp: rnd(0.2, 0.45),
    phase: rnd(0, Math.PI * 2),
  });
}



function drawBubbles(ctx: CanvasRenderingContext2D, s: Sim) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const isSmall = typeof window !== "undefined" && window.innerWidth < 500;
  const lineHeight = isSmall ? 12 : 16;
  
  for (const b of s.bubbles) {
    ctx.globalAlpha = b.alpha;

    // Draw the bubble background (semi-transparent white)
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.fill();

    // Draw the circular ring (white border)
    ctx.strokeStyle = b.borderCol;
    ctx.lineWidth = isSmall ? 1.2 : 1.6;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.stroke();

    // Draw the text (solid white)
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.font = isSmall
      ? "bold 10px system-ui, -apple-system, sans-serif"
      : "bold 13px system-ui, -apple-system, sans-serif";
      
    const totalLines = b.lines ? b.lines.length : 1;
    const startY = b.y - ((totalLines - 1) * lineHeight) / 2;
    
    if (b.lines && b.lines.length > 0) {
      b.lines.forEach((line, idx) => {
        ctx.fillText(line, b.x, startY + idx * lineHeight);
      });
    } else {
      ctx.fillText(b.text, b.x, b.y);
    }
  }
  ctx.restore();
}

/* ═══════════════════════════════════════════════════════════════════════════════
   COMPONENT
═══════════════════════════════════════════════════════════════════════════════ */

interface CigaretteAnimationProps {
  /** When true, the component is driven by external props instead of internal state */
  controlled?: boolean;
  /** External lit state (only used when controlled=true) */
  controlledLit?: boolean;
  /** External burn progress 0..1 (only used when controlled=true) */
  controlledProgress?: number;
  /** External puff power 0..1 (only used when controlled=true) */
  externalPuffPower?: number;
}

export default function CigaretteAnimation({
  controlled = false,
  controlledLit = false,
  controlledProgress = 0,
  externalPuffPower = 0,
}: CigaretteAnimationProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef    = useRef<Sim>({
    lit: false, progress: 0, startMs: null, prevProgress: 0, done: false,
    ashLen: 0, ashPhase: "growing", wobAngle: 0, wobAmp: 0.015, ashCracks: [],
    particles: [], frags: [], smokeRings: [], bubbles: [],
    flickTarget: 0.85, flickVal: 0.85, flickNextMs: 0,
    puffPower: 0, igniteFlash: 0,
  });
  const [inputVal, setInputVal] = useState("");
  const [isLit, setIsLit] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);

  // Sync controlled props into sim
  const controlledLitRef = useRef(controlledLit);
  const controlledProgressRef = useRef(controlledProgress);
  const externalPuffRef = useRef(externalPuffPower);
  controlledLitRef.current = controlledLit;
  controlledProgressRef.current = controlledProgress;
  externalPuffRef.current = externalPuffPower;

  const handleSendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;

    const text = inputVal.trim();
    setInputVal("");

    const key = process.env.NEXT_PUBLIC_PUSHER_APP_KEY;
    const isPusherValid = key && !key.includes("your_pusher_key");

    // Send the message to the backend API route which will trigger the Pusher broadcast
    try {
      fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      }).then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          console.error("Chat API returned error:", res.status, errData);
        }
      }).catch((err) => {
        console.error("Error calling chat API:", err);
      });
    } catch (err) {
      console.error("Error calling chat API:", err);
    }

    const s = simRef.current;
    
    // If Pusher is not configured, fallback to spawning locally and broadcasting to other tabs
    if (!isPusherValid) {
      spawnBubble(s, text);
      try {
        const localBC = new BroadcastChannel("chat-channel");
        localBC.postMessage({ 
          text,
          senderId: typeof window !== "undefined" ? sessionStorage.getItem("tabId") : null
        });
        localBC.close();
      } catch (err) {
        console.error("BroadcastChannel fallback error:", err);
      }
    }

    if (s.lit) {
      s.puffPower = Math.min(1, s.puffPower + 0.82);
      const ey = getEmberY(s);
      for (let i = 0; i < 5; i++) {
        emitSmoke(s, ey, true);
      }
    } else if (!s.done) {
      s.lit         = true;
      s.startMs     = performance.now();
      s.prevProgress = 0;
      s.ashLen      = 0;
      s.ashPhase    = "growing";
      s.puffPower   = 0.9;
      s.igniteFlash = 1.0;
      for (let i = 0; i < 8; i++) emitSmoke(s, TIP_Y, true);
    }
  }, [inputVal]);

  const rafRef    = useRef(0);
  const prevMsRef = useRef(0);
  const emitRef   = useRef(0);
  const lastBubbleEmitRef = useRef(0);

  /* ── MAIN RAF LOOP ────────────────────────────────────────────────────── */
  const loop = useCallback((now: number) => {
    const dt = clamp(now - prevMsRef.current, 0, 50);
    prevMsRef.current = now;
    const s      = simRef.current;
    const canvas = canvasRef.current;
    if (!canvas) { rafRef.current = requestAnimationFrame(loop); return; }
    const ctx    = canvas.getContext("2d");
    if (!ctx)    { rafRef.current = requestAnimationFrame(loop); return; }

    /* 1 ── Burn progress ─────────────────────────────────────────────── */
    if (controlled) {
      // In controlled mode, sync from external props
      s.prevProgress = s.progress;
      s.lit = controlledLitRef.current;
      s.progress = controlledProgressRef.current;
      s.done = s.progress >= 1;
      // Apply external puff power additively
      if (externalPuffRef.current > 0) {
        s.puffPower = Math.max(s.puffPower, externalPuffRef.current);
      }
      // Auto-ignite if first time lit
      if (s.lit && s.startMs === null) {
        s.startMs = now;
        s.igniteFlash = 1.0;
        for (let i = 0; i < 8; i++) emitSmoke(s, TIP_Y, true);
      }
    } else if (s.lit && !s.done && s.startMs !== null) {
      s.prevProgress = s.progress;
      const elapsed = now - s.startMs;
      s.progress = clamp(elapsed / BURN_MS, 0, 1);
      if (s.progress >= 1) {
        s.done = true; s.lit = false; s.ashLen = 0; s.progress = 1;
        setIsLit(false);
        setIsDone(true);
        setCompletedCount((prev) => {
          const nextVal = prev + 1;
          if (typeof window !== "undefined") {
            localStorage.setItem("completedCigarettesCount", String(nextVal));
          }
          return nextVal;
        });
      }
    }
    const ey = getEmberY(s);

    /* 2 ── Ash accumulation (max 5 px before it falls) ──────────────── */
    if (s.lit && !s.done && s.ashPhase !== "falling") {
      const delta = s.progress - s.prevProgress;
      if (delta > 0) {
        s.ashLen = Math.min(s.ashLen + delta * PAPER_H * 0.88, ASH_FALL_AT + 1);
      }
      // State transitions: when it hits the threshold, trigger immediate fall
      if (s.ashLen >= ASH_FALL_AT) {
        spawnFrags(s, ey);
        s.ashLen   = ASH_STUB;
        s.ashPhase = "falling";
      }
    }
    // Return to growing once all fragments are gone
    if (s.ashPhase === "falling" && s.frags.every(f => f.dead)) {
      s.ashPhase = "growing";
    }

    /* 3 ── Ember flicker ─────────────────────────────────────────────── */
    if (s.lit) {
      if (now >= s.flickNextMs) {
        s.flickTarget = rnd(0.6, 1.0);
        s.flickNextMs = now + rnd(65, 295);
      }
      s.flickVal += (s.flickTarget - s.flickVal) * 0.09;
    }

    /* 4 ── Decay transient values ─────────────────────────────────────── */
    if (s.puffPower   > 0) s.puffPower   = Math.max(0, s.puffPower   - 0.016 * dt / 16);
    if (s.igniteFlash > 0) s.igniteFlash = Math.max(0, s.igniteFlash - 0.025 * dt / 16);

    /* 5 ── Smoke emission ─────────────────────────────────────────────── */
    if (s.lit && !s.done) {
      const interval = s.puffPower > 0.18 ? 42 : 115;
      if (now - emitRef.current > interval) {
        emitSmoke(s, ey, s.puffPower > 0.22);
        emitRef.current = now;
      }
    }



    /* 6 ── Particle physics ───────────────────────────────────────────── */
    s.particles = s.particles.filter(p => {
      p.age++;
      if (p.age >= p.maxAge) return false;
      p.x  += p.vx + Math.sin(p.phase + p.age * 0.032) * p.drift;
      p.y  += p.vy;
      p.vy *= 0.997;   // very slight deceleration
      return true;
    });
    if (s.particles.length > 90) s.particles.splice(0, s.particles.length - 90);

    /* 6.5 ── Smoke ring physics ───────────────────────────────────────── */
    s.smokeRings = s.smokeRings.filter(r => {
      r.age++;
      if (r.age >= r.maxAge) return false;
      r.x += r.vx + Math.sin(r.wobblePhase + r.age * r.wobbleSpeed) * 0.25;
      r.y += r.vy;
      r.vy *= 0.997;  // slight deceleration
      r.rotation += r.rotSpeed;
      return true;
    });
    if (s.smokeRings.length > 15) s.smokeRings.splice(0, s.smokeRings.length - 15);

    /* 7 ── Fragment physics ───────────────────────────────────────────── */
    for (const f of s.frags) {
      if (f.dead) continue;
      f.vy  += GRAVITY;
      f.x   += f.vx;
      f.y   += f.vy;
      f.rot += f.rotV;
      f.alpha -= 0.0075;
      if (f.alpha <= 0 || f.y > CH + 40) { f.dead = true; f.alpha = 0; }
    }
    if (s.frags.length > 50) s.frags = s.frags.filter(f => !f.dead);

    /* 7.5 ── Bubble physics ───────────────────────────────────────────── */
    // A. Circle-circle collision resolution to prevent overlaps
    for (let i = 0; i < s.bubbles.length; i++) {
      for (let j = i + 1; j < s.bubbles.length; j++) {
        const b1 = s.bubbles[i];
        const b2 = s.bubbles[j];

        const dx = b2.x - b1.x;
        const dy = b2.y - b1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = b1.radius + b2.radius + 6; // with 6px gap buffer

        if (dist < minDist) {
          const overlap = minDist - dist;
          const nx = dx / (dist || 1);
          const ny = dy / (dist || 1);

          // Push them away from each other
          b1.x -= nx * overlap * 0.5;
          b1.y -= ny * overlap * 0.5;
          b2.x += nx * overlap * 0.5;
          b2.y += ny * overlap * 0.5;

          // Gentle horizontal deflection
          b1.vx = b1.vx * 0.9 - nx * 0.08;
          b2.vx = b2.vx * 0.9 + nx * 0.08;
        }
      }
    }

    // B. Position updates and bounds filtering
    s.bubbles = s.bubbles.filter(b => {
      b.age++;
      if (b.age >= b.maxAge) return false;
      b.x += b.vx + Math.sin(b.phase + b.age * b.wobbleSpeed) * b.wobbleAmp;
      b.y += b.vy;
      
      // Left and right boundary containment (bounce back inside)
      if (b.x < b.radius) {
        b.x = b.radius;
        b.vx = Math.abs(b.vx) * 0.85; // move right
      } else if (b.x > CW - b.radius) {
        b.x = CW - b.radius;
        b.vx = -Math.abs(b.vx) * 0.85; // move left
      }

      // End at the top: Only start fading out in the final 50px of the screen
      if (b.y < 50) {
        b.alpha = clamp(b.y / 50, 0, 0.9);
      }
      
      if (b.y < -b.radius - 20) return false;
      return true;
    });

    /* 8 ── Draw ───────────────────────────────────────────────────────── */
    drawBackground(ctx, s, ey);
    drawSmokeRings(ctx, s.smokeRings);    // rings drawn behind smoke
    drawSmoke(ctx, s.particles);          // smoke drawn behind the cigarette
    drawBubbles(ctx, s);                  // bubbles drawn behind the cigarette
    drawCigarette(ctx, s);
    drawFrags(ctx, s.frags);
    drawEmber(ctx, s);
    drawUI(ctx, s);

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  /* ── POINTER (mouse + touch) ──────────────────────────────────────────── */
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Core pointer handler — mode: "puff" = normal smoke, "ring" = single smoke ring */
  const handlePointer = useCallback((clientX: number, clientY: number, mode: "puff" | "ring") => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx   = (clientX - rect.left) * (CW / rect.width);
    const my   = (clientY - rect.top)  * (CH / rect.height);
    const s    = simRef.current;
    const ey   = getEmberY(s);
    const cigTopY = s.lit ? (ey - s.ashLen - 5) : TIP_Y;

    const onCig =
      mx >= CIG_CX - CIG_R - 10 && mx <= CIG_CX + CIG_R + 10 &&
      my >= cigTopY - 10        && my <= FIL_EY + 10;

    if (!onCig) return;

    if (!s.lit && !s.done) {
      // Ignite
      s.lit         = true;
      s.startMs     = performance.now();
      s.prevProgress = 0;
      s.ashLen      = 0;
      s.ashPhase    = "growing";
      s.puffPower   = 0.9;
      s.igniteFlash = 1.0;
      for (let i = 0; i < 8; i++) emitSmoke(s, TIP_Y, true);
      setIsLit(true);
    } else if (s.lit) {
      if (mode === "ring") {
        // Double-click/tap → single smoke ring only
        emitSmokeRing(s, ey);
      } else {
        // Single click/tap → normal smoke puff
        s.puffPower = Math.min(1, s.puffPower + 0.82);
        for (let i = 0; i < 5; i++) emitSmoke(s, ey, true);
      }
    }
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const { clientX, clientY } = e;
      if (clickTimerRef.current !== null) {
        // Second click within window → double-click → ring
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
        handlePointer(clientX, clientY, "ring");
      } else {
        // First click → wait to see if a second comes
        clickTimerRef.current = setTimeout(() => {
          clickTimerRef.current = null;
          handlePointer(clientX, clientY, "puff");
        }, 250);
      }
    },
    [handlePointer],
  );

  const handleTouch = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      if (!t) return;
      const { clientX, clientY } = t;
      if (clickTimerRef.current !== null) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
        handlePointer(clientX, clientY, "ring");
      } else {
        clickTimerRef.current = setTimeout(() => {
          clickTimerRef.current = null;
          handlePointer(clientX, clientY, "puff");
        }, 250);
      }
    },
    [handlePointer],
  );

  const handleResetCigarette = useCallback(() => {
    const s = simRef.current;
    s.lit = false;
    s.progress = 0;
    s.startMs = null;
    s.prevProgress = 0;
    s.done = false;
    s.ashLen = 0;
    s.ashPhase = "growing";
    s.wobAngle = 0;
    s.ashCracks = [];
    s.particles = [];
    s.frags = [];
    s.smokeRings = [];
    s.puffPower = 0;
    s.igniteFlash = 0;
    s.bubbles = []; // Clear existing bubbles on reset
    
    setIsDone(false);
    setIsLit(false);
  }, []);

  /* ── MOUNT / UNMOUNT ──────────────────────────────────────────────────── */
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (!sessionStorage.getItem("tabId")) {
        sessionStorage.setItem("tabId", String(Math.random()));
      }
      const stored = localStorage.getItem("completedCigarettesCount");
      if (stored) {
        setCompletedCount(parseInt(stored, 10) || 0);
      }
    }
  }, []);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_APP_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    const isPusherValid = key && cluster && !key.includes("your_pusher_key");

    if (isPusherValid) {
      // Clean up local BroadcastChannel if active
      if (globalBC) {
        globalBC.close();
        globalBC = null;
      }

      if (!globalPusher) {
        globalPusher = new Pusher(key!, {
          cluster: cluster!,
        });
        globalChannel = globalPusher.subscribe("chat-channel");
      }

      const handleNewBubble = (data: { text: string }) => {
        if (data && data.text && simRef.current.lit) {
          spawnBubble(simRef.current, data.text);
        }
      };

      globalChannel.unbind("new-bubble");
      globalChannel.bind("new-bubble", handleNewBubble);
    } else {
      console.warn("Pusher credentials are missing/placeholder. Using BroadcastChannel fallback for multi-tab sync.");
      
      // Clean up Pusher if active
      if (globalPusher) {
        globalPusher.disconnect();
        globalPusher = null;
        globalChannel = null;
      }

      if (!globalBC) {
        try {
          globalBC = new BroadcastChannel("chat-channel");
        } catch (err) {
          console.error("Failed to initialize BroadcastChannel fallback:", err);
        }
      }

      if (globalBC) {
        globalBC.onmessage = (event: MessageEvent) => {
          if (event.data && event.data.text && simRef.current.lit) {
            const senderId = event.data.senderId;
            const currentTabId = typeof window !== "undefined" ? sessionStorage.getItem("tabId") : null;
            // Ignore messages from the same tab to avoid duplicates
            if (senderId !== currentTabId) {
              spawnBubble(simRef.current, event.data.text);
            }
          }
        };
      }
    }

    return () => {
      // Unbind listener on component unmount to prevent memory leaks,
      // but keep the connection active in dev environment
      if (globalChannel) {
        globalChannel.unbind("new-bubble");
      }
    };
  }, []);

  useEffect(() => {
    const now     = performance.now();
    prevMsRef.current = now;
    emitRef.current   = now;
    lastBubbleEmitRef.current = now;
    rafRef.current    = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [loop]);

  /* ── RENDER ───────────────────────────────────────────────────────────── */

  // In controlled mode, just render the canvas with no UI overlays
  if (controlled) {
    return (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          background: "#0c0c13",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <canvas
          ref={canvasRef}
          width={CW}
          height={CH}
          style={{
            height: "100%",
            width: "auto",
            maxWidth: "100%",
            display: "block",
            touchAction: "none",
          }}
        />
      </div>
    );
  }

  // Standalone mode — full UI with chat input, badges, and overlays
  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        background: "#0c0c13",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* Floating Chat Box Overlay (at screen top, styled in dark damp theme) */}
      {isLit && (
        <div
          style={{
            position: "absolute",
            top: "24px",
            width: "90%",
            maxWidth: "400px",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            zIndex: 10,
          }}
        >
          {/* Unified Input Box (rounded-md / 8px) */}
          <form
            onSubmit={handleSendMessage}
            style={{
              display: "flex",
              alignItems: "center",
              background: "rgba(20, 20, 28, 0.8)",
              backdropFilter: "blur(14px)",
              border: "1px solid rgba(255, 110, 0, 0.22)",
              borderRadius: "8px",
              padding: "4px 4px 4px 10px",
              boxShadow: "0 6px 20px rgba(0, 0, 0, 0.7), inset 0 0 5px rgba(255, 110, 0, 0.04)",
              width: "100%",
            }}
          >
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value.slice(0, 50))}
              placeholder="Type a message..."
              maxLength={50}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "#e2e2e9",
                fontSize: "14px",
                padding: "6px 0",
                fontFamily: "system-ui, sans-serif",
              }}
            />
            <button
              type="submit"
              style={{
                background: "rgba(255, 100, 0, 0.16)",
                border: "1px solid rgba(255, 100, 0, 0.35)",
                color: "#ffc299",
                borderRadius: "6px",
                padding: "6px 12px",
                fontSize: "13px",
                cursor: "pointer",
                fontWeight: 500,
                fontFamily: "system-ui, sans-serif",
                transition: "all 0.2s ease",
                marginLeft: "8px",
                outline: "none",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = "rgba(255, 100, 0, 0.26)";
                e.currentTarget.style.borderColor = "rgba(255, 100, 0, 0.55)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = "rgba(255, 100, 0, 0.16)";
                e.currentTarget.style.borderColor = "rgba(255, 100, 0, 0.35)";
              }}
            >
              Send
            </button>
          </form>
          <div style={{ display: "flex", justifyContent: "flex-end", paddingRight: "6px" }}>
            <span
              style={{
                fontSize: "11px",
                color: inputVal.length >= 45 ? "#ff8800" : "rgba(255, 255, 255, 0.35)",
                fontFamily: "monospace",
                userSelect: "none",
              }}
            >
              {inputVal.length}/50 characters
            </span>
          </div>
        </div>
      )}

      <canvas
        ref={canvasRef}
        width={CW}
        height={CH}
        onClick={handleClick}
        onTouchEnd={handleTouch}
        style={{
          height: "100vh",
          width: "auto",
          maxWidth: "100vw",
          display: "block",
          cursor: "pointer",
          touchAction: "none",
        }}
      />

      {/* Completed count badge (floating bottom-right) */}
      <div
        style={{
          position: "absolute",
          bottom: "24px",
          right: "24px",
          background: "rgba(20, 20, 28, 0.65)",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "20px",
          padding: "6px 14px",
          color: "rgba(255, 255, 255, 0.7)",
          fontSize: "12px",
          fontWeight: 500,
          fontFamily: "system-ui, sans-serif",
          zIndex: 5,
          userSelect: "none",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
        }}
      >
        <span>🚬</span>
        <span>{completedCount} completed</span>
      </div>

      {/* New Cigarette Reset Option Overlay */}
      {isDone && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "rgba(20, 20, 28, 0.9)",
            backdropFilter: "blur(18px)",
            border: "1px solid rgba(255, 110, 0, 0.35)",
            borderRadius: "12px",
            padding: "24px 32px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "16px",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.8)",
            zIndex: 100,
          }}
        >
          <div style={{ fontSize: "15px", color: "#e2e2e9", fontWeight: 500 }}>
            You completed your break.
          </div>
          <button
            onClick={handleResetCigarette}
            style={{
              background: "rgba(255, 100, 0, 0.22)",
              border: "1px solid rgba(255, 100, 0, 0.45)",
              color: "#ffc299",
              borderRadius: "6px",
              padding: "8px 18px",
              fontSize: "14px",
              cursor: "pointer",
              fontWeight: 500,
              fontFamily: "system-ui, sans-serif",
              transition: "all 0.2s ease",
              outline: "none",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "rgba(255, 100, 0, 0.36)";
              e.currentTarget.style.borderColor = "rgba(255, 100, 0, 0.65)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "rgba(255, 100, 0, 0.22)";
              e.currentTarget.style.borderColor = "rgba(255, 100, 0, 0.45)";
            }}
          >
            Get a new stick
          </button>
        </div>
      )}
    </div>
  );
}

