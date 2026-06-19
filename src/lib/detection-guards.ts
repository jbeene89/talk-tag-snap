export type Point = { x: number; y: number };
export type NormalizedBox = { x: number; y: number; w: number; h: number };

export function createTapFallbackBox(point: Point, size = 0.12): NormalizedBox {
  const safeSize = Math.max(0.04, Math.min(0.3, size));
  return {
    x: Math.max(0, Math.min(1 - safeSize, point.x - safeSize / 2)),
    y: Math.max(0, Math.min(1 - safeSize, point.y - safeSize / 2)),
    w: safeSize,
    h: safeSize,
  };
}

export function chooseTapBox(
  candidate: NormalizedBox | null | undefined,
  point: Point,
): NormalizedBox {
  const fallback = createTapFallbackBox(point);
  if (!candidate) return fallback;

  const values = [candidate.x, candidate.y, candidate.w, candidate.h];
  if (values.some((value) => !Number.isFinite(value))) return fallback;
  if (candidate.w <= 0 || candidate.h <= 0) return fallback;
  if (
    candidate.x < 0 ||
    candidate.y < 0 ||
    candidate.x + candidate.w > 1 ||
    candidate.y + candidate.h > 1
  ) {
    return fallback;
  }

  const margin = 0.025;
  const containsTap =
    point.x >= candidate.x - margin &&
    point.x <= candidate.x + candidate.w + margin &&
    point.y >= candidate.y - margin &&
    point.y <= candidate.y + candidate.h + margin;
  const isLocal =
    candidate.w <= 0.65 && candidate.h <= 0.65 && candidate.w * candidate.h <= 0.2;

  return containsTap && isLocal ? candidate : fallback;
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("AI request timed out")), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
