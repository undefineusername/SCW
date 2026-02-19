/**
 * Optimizes and resizes an image to fit within E2EE constraints (under 50KB).
 * @param base64 The original image in Base64
 * @param maxWidth Max width/height
 * @param quality Compression quality (0 to 1)
 */
export async function optimizeImage(base64: string, maxWidth = 128, quality = 0.6): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxWidth) {
          width *= maxWidth / height;
          height = maxWidth;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject('Failed to get canvas context');

      ctx.drawImage(img, 0, 0, width, height);

      // Try different formats to see which is smaller
      const optimized = canvas.toDataURL('image/jpeg', quality);
      console.log(`🖼️ Optimized image size: ${(optimized.length / 1024).toFixed(2)} KB`);
      resolve(optimized);
    };
    img.onerror = (e) => reject(e);
  });
}
