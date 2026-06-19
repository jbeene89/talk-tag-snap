type ImageSize = { w: number; h: number } | null;

export type SessionPersistenceAction = "skip" | "save" | "clear";

export function getSessionPersistenceAction(
  hydrated: boolean,
  imageDataUrl: string | null,
  imageSize: ImageSize,
): SessionPersistenceAction {
  if (!hydrated) return "skip";
  return imageDataUrl && imageSize ? "save" : "clear";
}
