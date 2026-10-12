const SIZE = 192;

// Avatar URL -> PNG as base64 (no data: prefix), or null once a load has failed, so a chat
// without a usable avatar is not refetched on every sync.
const cache = new Map<string, string | null>();

export const getCachedShareAvatar = (url: string): string | null | undefined => cache.get(url);

/**
 * Fetches a chat's avatar and returns it as a square PNG, base64-encoded, for the native
 * share-target icon. Resolves null on any failure; the native side then draws a letter.
 */
export async function loadShareAvatar(
  url: string,
  headers?: Record<string, string>
): Promise<string | null> {
  const cached = cache.get(url);
  if (cached !== undefined) return cached;

  let result: string | null = null;
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (response.ok) {
      const bitmap = await createImageBitmap(await response.blob());
      const canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      const side = Math.min(bitmap.width, bitmap.height);
      canvas
        .getContext('2d')
        ?.drawImage(
          bitmap,
          (bitmap.width - side) / 2,
          (bitmap.height - side) / 2,
          side,
          side,
          0,
          0,
          SIZE,
          SIZE
        );
      bitmap.close();
      result = canvas.toDataURL('image/png').split(',')[1] ?? null;
    }
  } catch {
    result = null;
  }
  cache.set(url, result);
  return result;
}
