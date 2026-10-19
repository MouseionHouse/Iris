/**
 * The image edit model: one state in source-image pixels, one render function for the
 * on-screen view and for export, and the geometry between the two.
 *
 * Frames:
 *  - source: the decoded image with its EXIF orientation applied, `size` wide and high.
 *  - rotated: the source turned clockwise by `turns` quarter turns. Its origin is the top
 *    left of the turned image. The crop frame is drawn and dragged in this frame.
 *  - output: the rotated crop, scaled. This is the exported canvas, and in Draw mode the view.
 *
 * Crop and strokes are kept in source pixels, so a rotation turns them with the image and
 * nothing has to be re-mapped.
 */

export type Size = { width: number; height: number };
export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type QuarterTurns = 0 | 1 | 2 | 3;

export type Stroke = {
  color: string;
  /** line width in source pixels */
  width: number;
  /** flat x, y pairs in source pixels */
  points: number[];
};

export type ImageEditState = {
  turns: QuarterTurns;
  /** in source pixels; undefined is the whole image */
  crop?: Rect;
  strokes: Stroke[];
};

/** what the editor draws from: the image element, or a bitmap decoded at another size */
export type EditImage = HTMLImageElement | ImageBitmap;

export const createEditState = (): ImageEditState => ({ turns: 0, strokes: [] });

export const EXPORT_MAX_EDGE = 4096;

const NOT_EDITABLE_TYPES = ['image/gif', 'image/svg+xml'];
/** Static images only; whether the browser can decode it is known once it has tried. */
export const isEditableImageType = (type: string): boolean =>
  type.startsWith('image/') && !NOT_EDITABLE_TYPES.includes(type);

const isFullRect = (rect: Rect, size: Size): boolean =>
  rect.x <= 0 && rect.y <= 0 && rect.width >= size.width && rect.height >= size.height;

/** True when the state changes the image at all. */
export const isEdited = (state: ImageEditState, size: Size): boolean =>
  state.turns !== 0 || state.strokes.length > 0 || (!!state.crop && !isFullRect(state.crop, size));

export const sameEditState = (a: ImageEditState, b: ImageEditState): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------------------------------------
// source <-> rotated

export const rotatedSize = (size: Size, turns: QuarterTurns): Size =>
  turns % 2 === 0 ? size : { width: size.height, height: size.width };

export const toRotated = (p: Point, size: Size, turns: QuarterTurns): Point => {
  const { width: W, height: H } = size;
  if (turns === 1) return { x: H - p.y, y: p.x };
  if (turns === 2) return { x: W - p.x, y: H - p.y };
  if (turns === 3) return { x: p.y, y: W - p.x };
  return { x: p.x, y: p.y };
};

export const fromRotated = (p: Point, size: Size, turns: QuarterTurns): Point => {
  const { width: W, height: H } = size;
  if (turns === 1) return { x: p.y, y: H - p.x };
  if (turns === 2) return { x: W - p.x, y: H - p.y };
  if (turns === 3) return { x: W - p.y, y: p.x };
  return { x: p.x, y: p.y };
};

const rectFromCorners = (a: Point, b: Point): Rect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(a.x - b.x),
  height: Math.abs(a.y - b.y),
});

export const rectToRotated = (rect: Rect, size: Size, turns: QuarterTurns): Rect =>
  rectFromCorners(
    toRotated({ x: rect.x, y: rect.y }, size, turns),
    toRotated({ x: rect.x + rect.width, y: rect.y + rect.height }, size, turns)
  );

export const rectFromRotated = (rect: Rect, size: Size, turns: QuarterTurns): Rect =>
  rectFromCorners(
    fromRotated({ x: rect.x, y: rect.y }, size, turns),
    fromRotated({ x: rect.x + rect.width, y: rect.y + rect.height }, size, turns)
  );

/** The source → rotated canvas matrix (a, b, c, d, e, f). */
const rotationMatrix = (
  size: Size,
  turns: QuarterTurns
): [number, number, number, number, number, number] => {
  const { width: W, height: H } = size;
  if (turns === 1) return [0, 1, -1, 0, H, 0];
  if (turns === 2) return [-1, 0, 0, -1, W, H];
  if (turns === 3) return [0, -1, 1, 0, 0, W];
  return [1, 0, 0, 1, 0, 0];
};

export const sourceCrop = (state: ImageEditState, size: Size): Rect =>
  state.crop ?? { x: 0, y: 0, width: size.width, height: size.height };

/** The crop in the rotated frame. */
export const rotatedCrop = (state: ImageEditState, size: Size): Rect =>
  rectToRotated(sourceCrop(state, size), size, state.turns);

/** Size of the edited image in source pixels: the rotated crop. */
export const editedSize = (state: ImageEditState, size: Size): Size => {
  const crop = rotatedCrop(state, size);
  return { width: crop.width, height: crop.height };
};

/**
 * Maps a point of the output (or of the view showing it at `scale` output pixels per source
 * pixel) back to source pixels.
 */
export const outputToSource = (
  p: Point,
  state: ImageEditState,
  size: Size,
  scale: number,
  cropped = true
): Point => {
  const origin = cropped ? rotatedCrop(state, size) : { x: 0, y: 0 };
  return fromRotated({ x: origin.x + p.x / scale, y: origin.y + p.y / scale }, size, state.turns);
};

// ---------------------------------------------------------------------------------------------
// render

export type RenderOptions = {
  /** output pixels per source pixel */
  scale: number;
  /** false draws the whole rotated image, as the Crop view does */
  cropped?: boolean;
  /** a stroke still being drawn */
  pending?: Stroke;
};

const drawStroke = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
  const { points } = stroke;
  if (points.length < 2) return;
  ctx.fillStyle = stroke.color;
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (points.length === 2) {
    ctx.beginPath();
    ctx.arc(points[0], points[1], stroke.width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) {
    ctx.lineTo(points[i], points[i + 1]);
  }
  ctx.stroke();
};

/**
 * Draws the edited image into `ctx`, whose canvas is expected to be the output size times
 * `scale` (or the rotated size times `scale` when not cropped). `image` may be decoded at any
 * resolution: it is drawn over `size` source pixels.
 */
export const renderEdit = (
  ctx: CanvasRenderingContext2D,
  image: EditImage,
  size: Size,
  state: ImageEditState,
  { scale, cropped = true, pending }: RenderOptions
) => {
  const origin = cropped ? rotatedCrop(state, size) : { x: 0, y: 0 };
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(scale, 0, 0, scale, -origin.x * scale, -origin.y * scale);
  ctx.transform(...rotationMatrix(size, state.turns));
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, size.width, size.height);
  state.strokes.forEach((stroke) => drawStroke(ctx, stroke));
  if (pending) drawStroke(ctx, pending);
  ctx.restore();
};

// ---------------------------------------------------------------------------------------------
// decode and export

/** Loads the image at its oriented size. The browser decodes it lazily, at the size drawn. */
export const loadImage = (source: Blob): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The image could not be decoded'));
    };
    img.src = url;
  });

/** Decodes `source` (EXIF orientation applied) at `scale` of its oriented `size`. */
const decodeAt = async (
  source: Blob,
  size: Size,
  scale: number
): Promise<{ image: EditImage; close: () => void }> => {
  if (typeof createImageBitmap === 'function') {
    try {
      const resizeWidth = Math.max(1, Math.round(size.width * scale));
      const resizeHeight = Math.max(1, Math.round(size.height * scale));
      // 'from-image' is the default, but older lib typings do not know the value
      const orient = { imageOrientation: 'from-image' } as unknown as ImageBitmapOptions;
      const bitmap = await createImageBitmap(
        source,
        scale < 1 ? { ...orient, resizeWidth, resizeHeight, resizeQuality: 'high' } : orient
      );
      // A browser which resizes before it orients hands back the image on its side.
      const portrait = (w: number, h: number) => w > h;
      if (portrait(bitmap.width, bitmap.height) === portrait(size.width, size.height)) {
        return { image: bitmap, close: () => bitmap.close() };
      }
      bitmap.close();
    } catch {
      // fall back to the image element
    }
  }
  const img = await loadImage(source);
  return { image: img, close: () => undefined };
};

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

/** `name` with the extension of `type`. */
export const editedFileName = (name: string, type: string): string => {
  const ext = EXTENSIONS[type];
  if (!ext) return name;
  const base = name.replace(/\.[^./]*$/, '') || 'image';
  return `${base}.${ext}`;
};

const canvasToBlob = (canvas: HTMLCanvasElement, type: string): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The image could not be encoded'))),
      type,
      0.92
    );
  });

export type ExportOptions = {
  name: string;
  /** the source's type; the browser may encode another one */
  type: string;
  maxEdge?: number;
};

/**
 * Renders the edit at full resolution, the longest edge capped at `maxEdge`, and encodes it.
 * The result has no EXIF data.
 */
export const exportEdit = async (
  source: Blob,
  size: Size,
  state: ImageEditState,
  { name, type, maxEdge = EXPORT_MAX_EDGE }: ExportOptions
): Promise<File> => {
  const out = editedSize(state, size);
  const scale = Math.min(1, maxEdge / Math.max(out.width, out.height));
  const { image, close } = await decodeAt(source, size, scale);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(out.width * scale));
    canvas.height = Math.max(1, Math.round(out.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas available');
    renderEdit(ctx, image, size, state, { scale });
    const blob = await canvasToBlob(canvas, type);
    // browsers fall back to PNG for a type they cannot encode
    const outType = blob.type || 'image/png';
    canvas.width = 0;
    canvas.height = 0;
    return new File([blob], editedFileName(name, outType), { type: outType });
  } finally {
    close();
  }
};

// ---------------------------------------------------------------------------------------------
// crop frame geometry, in the rotated frame

export type CropHandle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se' | 'move';
export const CROP_HANDLES: CropHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export type CropOptions = {
  /** width / height; the avatar crop locks it to 1 */
  aspect?: number;
  /** smallest side, in rotated pixels */
  min: number;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), Math.max(lo, hi));

/** The largest rect of `aspect` centred in `bounds`. */
export const fitAspect = (bounds: Size, aspect: number): Rect => {
  const width = Math.min(bounds.width, bounds.height * aspect);
  const height = width / aspect;
  return { x: (bounds.width - width) / 2, y: (bounds.height - height) / 2, width, height };
};

const resizeLocked = (
  start: Rect,
  handle: Exclude<CropHandle, 'move'>,
  dx: number,
  dy: number,
  bounds: Size,
  aspect: number,
  minSide: number
): Rect => {
  const left = start.x;
  const top = start.y;
  const right = start.x + start.width;
  const bottom = start.y + start.height;
  const cx = start.x + start.width / 2;
  const cy = start.y + start.height / 2;
  const minW = Math.max(minSide, minSide * aspect);

  // the fixed point, the room the frame has from it, and the width the pointer asks for
  let maxW: number;
  let wantW: number;
  if (handle === 'n' || handle === 's') {
    const roomH = handle === 'n' ? bottom : bounds.height - top;
    maxW = Math.min(2 * Math.min(cx, bounds.width - cx), roomH * aspect);
    wantW = (start.height + (handle === 'n' ? -dy : dy)) * aspect;
  } else if (handle === 'e' || handle === 'w') {
    const roomW = handle === 'w' ? right : bounds.width - left;
    maxW = Math.min(roomW, 2 * Math.min(cy, bounds.height - cy) * aspect);
    wantW = start.width + (handle === 'w' ? -dx : dx);
  } else {
    const roomW = handle.includes('w') ? right : bounds.width - left;
    const roomH = handle.includes('n') ? bottom : bounds.height - top;
    maxW = Math.min(roomW, roomH * aspect);
    const byX = start.width + (handle.includes('w') ? -dx : dx);
    const byY = (start.height + (handle.includes('n') ? -dy : dy)) * aspect;
    wantW = Math.max(byX, byY);
  }
  const width = clamp(wantW, Math.min(minW, maxW), maxW);
  const height = width / aspect;

  let x: number;
  let y: number;
  if (handle === 'n' || handle === 's') x = cx - width / 2;
  else x = handle.includes('w') ? right - width : left;
  if (handle === 'e' || handle === 'w') y = cy - height / 2;
  else y = handle.includes('n') ? bottom - height : top;
  return { x, y, width, height };
};

/** The crop frame after dragging `handle` by (dx, dy) from `start`. */
export const dragCrop = (
  start: Rect,
  handle: CropHandle,
  dx: number,
  dy: number,
  bounds: Size,
  { aspect, min }: CropOptions
): Rect => {
  if (handle === 'move') {
    return {
      ...start,
      x: clamp(start.x + dx, 0, bounds.width - start.width),
      y: clamp(start.y + dy, 0, bounds.height - start.height),
    };
  }
  if (aspect) return resizeLocked(start, handle, dx, dy, bounds, aspect, min);

  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;
  const minW = Math.min(min, bounds.width);
  const minH = Math.min(min, bounds.height);
  if (handle.includes('w')) left = clamp(left + dx, 0, right - minW);
  if (handle.includes('e')) right = clamp(right + dx, left + minW, bounds.width);
  if (handle.includes('n')) top = clamp(top + dy, 0, bottom - minH);
  if (handle.includes('s')) bottom = clamp(bottom + dy, top + minH, bounds.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
};

/** Snaps a rect to whole source pixels inside the image. */
export const roundRect = (rect: Rect, size: Size): Rect => {
  const x = clamp(Math.round(rect.x), 0, size.width - 1);
  const y = clamp(Math.round(rect.y), 0, size.height - 1);
  return {
    x,
    y,
    width: clamp(Math.round(rect.width), 1, size.width - x),
    height: clamp(Math.round(rect.height), 1, size.height - y),
  };
};

/** The state after a quarter turn clockwise. Crop and strokes are in source pixels already. */
export const rotateClockwise = (state: ImageEditState): ImageEditState => ({
  ...state,
  turns: ((state.turns + 1) % 4) as QuarterTurns,
});

/** Reset clears rotation and crop; an aspect lock gets its largest centred crop back. */
export const resetTransform = (
  state: ImageEditState,
  size: Size,
  aspect?: number
): ImageEditState => ({
  ...state,
  turns: 0,
  crop: aspect ? roundRect(fitAspect(size, aspect), size) : undefined,
});
