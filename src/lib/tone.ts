export interface Pt {
  x: number;
  y: number; // screen coordinates: y grows downwards
}

/**
 * Classify a drawn tone gesture:
 *  1 = flat line (–), 2 = rising (/), 3 = dip (∨), 4 = falling (\), 5 = tap (neutral).
 * `size` is the pad size in px, used to scale the thresholds.
 */
export function classifyTone(points: Pt[], size: number): 1 | 2 | 3 | 4 | 5 {
  if (points.length < 2) return 5;
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  if (length < size * 0.08) return 5;

  const start = points[0];
  const end = points[points.length - 1];
  // lowest point on screen (largest y)
  let low = start;
  let lowIdx = 0;
  points.forEach((p, i) => {
    if (p.y > low.y) {
      low = p;
      lowIdx = i;
    }
  });
  const dipStart = low.y - start.y;
  const dipEnd = low.y - end.y;
  const inMiddle = lowIdx > points.length * 0.15 && lowIdx < points.length * 0.9;
  if (inMiddle && dipStart > size * 0.1 && dipEnd > size * 0.1) return 3;

  const dx = Math.abs(end.x - start.x);
  const rise = start.y - end.y; // positive = upwards
  const angle = (Math.atan2(rise, Math.max(dx, 1)) * 180) / Math.PI;
  if (angle > 18) return 2;
  if (angle < -18) return 4;
  return 1;
}

export const TONE_SYMBOL: Record<number, string> = { 1: 'ˉ', 2: 'ˊ', 3: 'ˇ', 4: 'ˋ', 5: '·' };
