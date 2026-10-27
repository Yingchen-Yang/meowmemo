const MAX_IMAGE_BYTES = 8_000_000;
const MAX_AVATAR_SIDE = 512;

export async function optimizeAvatar(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file for the profile photo.");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("That photo is too large. Choose one under 8 MB.");

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const scale = Math.min(1, MAX_AVATAR_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("We couldn't prepare that photo. Try another image.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("That photo")) throw error;
    throw new Error("We couldn't read that photo. Try a JPG, PNG, or WebP image.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image could not be loaded."));
    image.src = src;
  });
}
