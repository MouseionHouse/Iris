const HEIC_MIME_TYPES = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'];
const HEIC_FILE_NAME = /\.(heic|heif)$/i;

/**
 * iPhones photograph in HEIC, and some Matrix clients upload the file as it is. Only
 * Safari can show one; every other browser fails the `<img>` after a successful download.
 */
export const isHeic = (mimeType?: string, fileName?: string): boolean =>
  (typeof mimeType === 'string' && HEIC_MIME_TYPES.includes(mimeType.toLowerCase())) ||
  (typeof fileName === 'string' && HEIC_FILE_NAME.test(fileName));

const decodesNatively = async (blob: Blob): Promise<boolean> => {
  try {
    const bitmap = await createImageBitmap(blob);
    bitmap.close();
    return true;
  } catch {
    return false;
  }
};

/**
 * Returns an image this browser can show: the blob itself where HEIC decodes natively
 * (Safari), otherwise a JPEG converted in the page. The decoder is a large WebAssembly
 * bundle, so it is only fetched when a HEIC image is actually opened.
 */
export const heicToDisplayable = async (blob: Blob): Promise<Blob> => {
  if (await decodesNatively(blob)) return blob;

  const { heicTo } = await import('heic-to');
  return heicTo({ blob, type: 'image/jpeg', quality: 0.9 });
};
