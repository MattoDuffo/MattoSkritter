/** Brush-style ink: turns a finger path into a filled outline that tapers at both ends. */

export interface Pt {
  x: number;
  y: number;
}

/** Points from an "M x y L x y ..." path string (as Hanzi Writer reports drawn strokes). */
export function parsePath(d: string): Pt[] {
  const n = d.match(/-?\d*\.?\d+(?:e-?\d+)?/gi)?.map(Number) ?? [];
  const pts: Pt[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) pts.push({ x: n[i], y: n[i + 1] });
  return pts;
}

/** Evenly spaced points along the path, lightly smoothed, so the outline has no kinks. */
function resample(pts: Pt[], step: number): Pt[] {
  const out: Pt[] = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    let t = step - carry;
    while (t <= seg) {
      out.push({ x: a.x + ((b.x - a.x) * t) / seg, y: a.y + ((b.y - a.y) * t) / seg });
      t += step;
    }
    carry = seg - (t - step);
  }
  const last = pts[pts.length - 1];
  const end = out[out.length - 1];
  if (Math.hypot(last.x - end.x, last.y - end.y) > step * 0.3) out.push(last);
  if (out.length < 4) return out;
  // 3-point moving average, keeping the end points where the finger actually was
  return out.map((p, i) =>
    i === 0 || i === out.length - 1
      ? p
      : { x: (out[i - 1].x + p.x + out[i + 1].x) / 3, y: (out[i - 1].y + p.y + out[i + 1].y) / 3 },
  );
}

const r = (v: number) => Math.round(v * 10) / 10;

/**
 * SVG path (to be filled) for a stroke of the given full width that narrows towards both
 * ends. Returns '' for paths too short to draw.
 */
export function taperedStroke(input: Pt[], width: number): string {
  if (input.length < 2) return '';
  const pts = resample(input, Math.max(1.5, width / 4));
  if (pts.length < 2) return '';
  const dist = [0];
  for (let i = 1; i < pts.length; i++) {
    dist.push(dist[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const total = dist[dist.length - 1];
  if (total < 1) return '';
  const taper = Math.min(total * 0.35, width * 3);
  const minFrac = 0.25;
  const half = (s: number) => {
    const t = Math.min(1, s / taper, (total - s) / taper);
    return (width / 2) * (minFrac + (1 - minFrac) * Math.sin((t * Math.PI) / 2));
  };
  const left: Pt[] = [];
  const right: Pt[] = [];
  const tangents: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const tx = (b.x - a.x) / len;
    const ty = (b.y - a.y) / len;
    tangents.push({ x: tx, y: ty });
    const h = half(dist[i]);
    left.push({ x: pts[i].x - ty * h, y: pts[i].y + tx * h });
    right.push({ x: pts[i].x + ty * h, y: pts[i].y - tx * h });
  }
  const n = pts.length - 1;
  // rounded caps: a curve bulging past each end by about the half-width there
  const capEnd = { x: pts[n].x + tangents[n].x * half(total) * 1.3, y: pts[n].y + tangents[n].y * half(total) * 1.3 };
  const capStart = { x: pts[0].x - tangents[0].x * half(0) * 1.3, y: pts[0].y - tangents[0].y * half(0) * 1.3 };
  let d = `M${r(left[0].x)} ${r(left[0].y)}`;
  for (let i = 1; i <= n; i++) d += `L${r(left[i].x)} ${r(left[i].y)}`;
  d += `Q${r(capEnd.x)} ${r(capEnd.y)} ${r(right[n].x)} ${r(right[n].y)}`;
  for (let i = n - 1; i >= 0; i--) d += `L${r(right[i].x)} ${r(right[i].y)}`;
  d += `Q${r(capStart.x)} ${r(capStart.y)} ${r(left[0].x)} ${r(left[0].y)}Z`;
  return d;
}
