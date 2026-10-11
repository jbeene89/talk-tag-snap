export type TrailDrawingMode = "link" | "annotation" | null;

export function toggleTrailDrawingMode(
  current: TrailDrawingMode,
  requested: Exclude<TrailDrawingMode, null>,
): TrailDrawingMode {
  return current === requested ? null : requested;
}
