/** Decode first; callers retain the old inspection until this promise succeeds. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export function validateImageFile(file: Pick<File, "size" | "type">): void {
  if (!file.size) throw new Error("That image is empty. Choose another photo.");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Choose a photo smaller than 20 MB.");
  if (file.type && !file.type.startsWith("image/")) throw new Error("Choose an image file, such as JPG or PNG.");
}
export function loadImageFile(file: File): Promise<{ url: string; width: number; height: number }> {
  validateImageFile(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const fail = () => reject(new Error("This photo could not be opened. Try a JPG or PNG copy."));
    reader.onerror = fail;
    reader.onabort = fail;
    reader.onload = () => {
      if (typeof reader.result !== "string") { fail(); return; }
      const url = reader.result;
      const image = new Image();
      image.onerror = fail;
      image.onload = () => {
        if (!image.naturalWidth || !image.naturalHeight) { fail(); return; }
        if (image.naturalWidth * image.naturalHeight > 40_000_000) {
          reject(new Error("This image is very large. Choose a copy under 40 megapixels.")); return;
        }
        resolve({ url, width: image.naturalWidth, height: image.naturalHeight });
      };
      image.src = url;
    };
    reader.readAsDataURL(file);
  });
}
