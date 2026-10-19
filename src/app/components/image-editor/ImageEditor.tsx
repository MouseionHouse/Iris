import React, {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import classNames from 'classnames';
import { Box, Button, Header, Icon, IconButton, Icons, Spinner, Text, as, color } from 'folds';
import * as css from './ImageEditor.css';
import { CropIcon, RotateIcon, UndoIcon } from './icons';
import {
  CROP_HANDLES,
  CropHandle,
  EditImage,
  ImageEditState,
  Rect,
  Size,
  Stroke,
  createEditState,
  dragCrop,
  editedSize,
  exportEdit,
  isEdited,
  loadImage,
  outputToSource,
  rectFromRotated,
  renderEdit,
  resetTransform,
  rotateClockwise,
  rotatedCrop,
  rotatedSize,
  roundRect,
  sameEditState,
} from './imageEdit';
import { useElementSizeObserver } from '../../hooks/useElementSizeObserver';

export const PEN_COLORS = [
  { name: 'White', value: '#FFFFFF' },
  { name: 'Black', value: '#000000' },
  { name: 'Red', value: '#E5484D' },
  { name: 'Yellow', value: '#FFC53D' },
  { name: 'Iris', value: '#C7A3F0' },
];
/** pen widths in screen pixels at the size the image is shown */
export const PEN_SIZES = [
  { name: 'Thin', value: 4 },
  { name: 'Medium', value: 10 },
  { name: 'Thick', value: 22 },
];

/** the view decodes at screen size; only Done works at full resolution */
const VIEW_MAX_EDGE = 2048;
const CROP_PAD = 24;
const DRAW_PAD = 12;
const CROP_MIN = 32;

type EditorMode = 'crop' | 'draw';

const handlePosition = (handle: CropHandle) => {
  const along = (start: boolean, end: boolean) => {
    if (start) return '0%';
    if (end) return '100%';
    return '50%';
  };
  return {
    left: along(handle.includes('w'), handle.includes('e')),
    top: along(handle.includes('n'), handle.includes('s')),
  };
};

type LoadedImage = {
  image: EditImage;
  size: Size;
  close: () => void;
};

const loadView = async (source: Blob): Promise<LoadedImage> => {
  const img = await loadImage(source);
  const size = { width: img.naturalWidth, height: img.naturalHeight };
  const scale = Math.min(1, VIEW_MAX_EDGE / Math.max(size.width, size.height));
  if (scale < 1 && typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(img, {
        resizeWidth: Math.round(size.width * scale),
        resizeHeight: Math.round(size.height * scale),
        resizeQuality: 'high',
      });
      return { image: bitmap, size, close: () => bitmap.close() };
    } catch {
      // draw from the image element
    }
  }
  return { image: img, size, close: () => undefined };
};

export type ImageEditResult = {
  file: File;
  state: ImageEditState;
};

export type ImageEditorProps = {
  /** the untouched image; edits always start from it */
  source: Blob;
  name: string;
  /** an earlier edit of `source`, still adjustable */
  initialState?: ImageEditState;
  /** locks the crop to width / height */
  aspect?: number;
  /** shows the crop through a round mask */
  round?: boolean;
  /** header text; defaults to "Edit image" */
  title?: string;
  /** false leaves out the Draw mode and its switch */
  drawing?: boolean;
  /** a small live preview of the result beside the crop tools */
  preview?: boolean;
  /** caps the longest edge of the export; a larger image is exported even when not edited */
  maxEdge?: number;
  /** the phone layout: tools above the mode switch */
  compact?: boolean;
  /** `undefined` when the image ends up unedited */
  onDone: (result: ImageEditResult | undefined) => void;
  requestClose: () => void;
};

const PREVIEW_SIZE = 40;

/** The result at avatar size, drawn by the same render function as the export. */
function EditPreview({
  image,
  size,
  edit,
  round,
}: {
  image: EditImage;
  size: Size;
  edit: ImageEditState;
  round?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dpr = window.devicePixelRatio || 1;
  const out = editedSize(edit, size);
  const scale = (PREVIEW_SIZE * dpr) / Math.max(out.width, out.height);
  const width = Math.max(1, Math.round(out.width * scale));
  const height = Math.max(1, Math.round(out.height * scale));
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) renderEdit(ctx, image, size, edit, { scale });
  }, [image, size, edit, scale]);
  return (
    <canvas
      ref={canvasRef}
      className={classNames(css.Preview, round && css.PreviewRound)}
      data-testid="edit-preview"
      width={width}
      height={height}
      style={{ width: width / dpr, height: height / dpr }}
      aria-label="Preview"
    />
  );
}

type Drag = {
  pointerId: number;
  handle: CropHandle;
  startX: number;
  startY: number;
  startRect: Rect;
};

export const ImageEditor = as<'div', ImageEditorProps>(
  (
    {
      className,
      source,
      name,
      initialState,
      aspect,
      round,
      title = 'Edit image',
      drawing = true,
      preview,
      maxEdge,
      compact,
      onDone,
      requestClose,
      ...props
    },
    ref
  ) => {
    const [loaded, setLoaded] = useState<LoadedImage>();
    const [loadError, setLoadError] = useState(false);
    const [edit, setEdit] = useState<ImageEditState>(initialState ?? createEditState());
    const [editorMode, setMode] = useState<EditorMode>('crop');
    const mode = drawing ? editorMode : 'crop';
    const [penColor, setPenColor] = useState(PEN_COLORS[0].value);
    const [penSize, setPenSize] = useState(PEN_SIZES[1].value);
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState<string>();
    const [stageSize, setStageSize] = useState<Size>({ width: 0, height: 0 });

    const stageRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const dragRef = useRef<Drag>();
    const pendingRef = useRef<{ pointerId: number; stroke: Stroke }>();
    const frameRequest = useRef<number>();

    useEffect(() => {
      let disposed = false;
      let view: LoadedImage | undefined;
      loadView(source).then(
        (result) => {
          if (disposed) {
            result.close();
            return;
          }
          view = result;
          setLoaded(result);
          // an aspect lock starts on its largest centred crop
          if (aspect && !initialState) {
            setEdit((s) => resetTransform(s, result.size, aspect));
          }
        },
        () => !disposed && setLoadError(true)
      );
      return () => {
        disposed = true;
        view?.close();
      };
      // the editor shows one source for its whole life
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [source]);

    useElementSizeObserver(
      useCallback(() => stageRef.current, []),
      useCallback((width, height) => setStageSize({ width, height }), [])
    );

    // the view: the whole rotated image in Crop, the edited image in Draw
    const size = loaded?.size;
    let viewScale = 0;
    let viewSize: Size = { width: 0, height: 0 };
    if (size) {
      const shown = mode === 'crop' ? rotatedSize(size, edit.turns) : editedSize(edit, size);
      const pad = mode === 'crop' ? CROP_PAD : DRAW_PAD;
      viewScale = Math.max(
        0,
        Math.min(
          (stageSize.width - pad * 2) / shown.width,
          (stageSize.height - pad * 2) / shown.height
        )
      );
      viewSize = { width: shown.width * viewScale, height: shown.height * viewScale };
    }
    const viewLeft = (stageSize.width - viewSize.width) / 2;
    const viewTop = (stageSize.height - viewSize.height) / 2;
    const dpr = window.devicePixelRatio || 1;
    const cropped = mode === 'draw';

    const draw = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx || !loaded || viewScale <= 0) return;
      renderEdit(ctx, loaded.image, loaded.size, edit, {
        scale: viewScale * dpr,
        cropped,
        pending: pendingRef.current?.stroke,
      });
    }, [loaded, edit, viewScale, dpr, cropped]);

    useEffect(() => {
      draw();
    }, [draw]);

    const requestDraw = () => {
      if (frameRequest.current !== undefined) return;
      frameRequest.current = requestAnimationFrame(() => {
        frameRequest.current = undefined;
        draw();
      });
    };
    useEffect(
      () => () => {
        if (frameRequest.current !== undefined) cancelAnimationFrame(frameRequest.current);
      },
      []
    );

    // ---- crop

    const cropBounds = size ? rotatedSize(size, edit.turns) : undefined;
    const frame = size ? rotatedCrop(edit, size) : undefined;

    const setRotatedCrop = (rect: Rect) => {
      if (!size || !cropBounds) return;
      const rounded = roundRect(rect, cropBounds);
      setEdit((s) => ({ ...s, crop: rectFromRotated(rounded, size, s.turns) }));
    };

    const handleCropDown = (handle: CropHandle) => (evt: ReactPointerEvent<HTMLElement>) => {
      if (!frame || dragRef.current || evt.button > 0) return;
      evt.preventDefault();
      evt.stopPropagation();
      evt.currentTarget.setPointerCapture(evt.pointerId);
      dragRef.current = {
        pointerId: evt.pointerId,
        handle,
        startX: evt.clientX,
        startY: evt.clientY,
        startRect: frame,
      };
    };
    const handleCropMove = (evt: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== evt.pointerId || !cropBounds || viewScale <= 0) return;
      const dx = (evt.clientX - drag.startX) / viewScale;
      const dy = (evt.clientY - drag.startY) / viewScale;
      setRotatedCrop(
        dragCrop(drag.startRect, drag.handle, dx, dy, cropBounds, {
          aspect,
          min: CROP_MIN / viewScale,
        })
      );
    };
    const handleCropUp = (evt: ReactPointerEvent<HTMLElement>) => {
      if (dragRef.current?.pointerId === evt.pointerId) dragRef.current = undefined;
    };

    /** arrows move the frame; with Shift they resize it from the bottom right corner */
    const handleCropKey = (evt: ReactKeyboardEvent<HTMLElement>) => {
      if (!frame || !cropBounds) return;
      const step = Math.max(1, Math.round(Math.max(cropBounds.width, cropBounds.height) / 50));
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const move = moves[evt.key];
      if (!move) return;
      evt.preventDefault();
      setRotatedCrop(
        dragCrop(frame, evt.shiftKey ? 'se' : 'move', move[0], move[1], cropBounds, {
          aspect,
          min: CROP_MIN / Math.max(viewScale, 0.0001),
        })
      );
    };

    // ---- draw

    const pointInView = (evt: ReactPointerEvent<HTMLElement>) => {
      const box = evt.currentTarget.getBoundingClientRect();
      return { x: evt.clientX - box.left, y: evt.clientY - box.top };
    };

    const handleDrawDown = (evt: ReactPointerEvent<HTMLCanvasElement>) => {
      if (mode !== 'draw' || !size || pendingRef.current || evt.button > 0 || viewScale <= 0)
        return;
      evt.preventDefault();
      evt.currentTarget.setPointerCapture(evt.pointerId);
      const p = outputToSource(pointInView(evt), edit, size, viewScale);
      pendingRef.current = {
        pointerId: evt.pointerId,
        stroke: { color: penColor, width: penSize / viewScale, points: [p.x, p.y] },
      };
      requestDraw();
    };
    const handleDrawMove = (evt: ReactPointerEvent<HTMLCanvasElement>) => {
      const pending = pendingRef.current;
      if (!pending || pending.pointerId !== evt.pointerId || !size) return;
      const p = outputToSource(pointInView(evt), edit, size, viewScale);
      pending.stroke.points.push(p.x, p.y);
      requestDraw();
    };
    const handleDrawUp = (evt: ReactPointerEvent<HTMLCanvasElement>) => {
      const pending = pendingRef.current;
      if (!pending || pending.pointerId !== evt.pointerId) return;
      pendingRef.current = undefined;
      const stroke = {
        ...pending.stroke,
        points: pending.stroke.points.map((n) => Math.round(n * 10) / 10),
      };
      setEdit((s) => ({ ...s, strokes: [...s.strokes, stroke] }));
    };

    // ---- actions

    const handleRotate = () => setEdit(rotateClockwise);
    const handleReset = () => size && setEdit((s) => resetTransform(s, size, aspect));
    const handleUndo = () => setEdit((s) => ({ ...s, strokes: s.strokes.slice(0, -1) }));

    const handleDone = async () => {
      if (!size || exporting) return;
      if (!isEdited(edit, size) && (!maxEdge || Math.max(size.width, size.height) <= maxEdge)) {
        onDone(undefined);
        return;
      }
      if (initialState && sameEditState(initialState, edit) && !maxEdge) {
        requestClose();
        return;
      }
      setExporting(true);
      setExportError(undefined);
      try {
        const file = await exportEdit(source, size, edit, {
          name,
          type: source.type,
          maxEdge,
        });
        onDone({ file, state: edit });
      } catch (err) {
        setExporting(false);
        setExportError(err instanceof Error ? err.message : 'The image could not be saved');
      }
    };

    const canReset = !!size && !sameEditState(edit, resetTransform(edit, size, aspect));

    const cropTools = (
      <>
        {preview && loaded && (
          <EditPreview image={loaded.image} size={loaded.size} edit={edit} round={round} />
        )}
        <Button
          size="300"
          variant="Secondary"
          fill="Soft"
          radii="Pill"
          before={<Icon size="100" src={RotateIcon} />}
          onClick={handleRotate}
          disabled={!size}
        >
          <Text size="B300">Rotate</Text>
        </Button>
        <Button
          size="300"
          variant="Secondary"
          fill="None"
          radii="Pill"
          before={<Icon size="100" src={Icons.Reload} />}
          onClick={handleReset}
          disabled={!canReset}
        >
          <Text size="B300">Reset</Text>
        </Button>
      </>
    );

    const drawTools = (
      <>
        <Box gap="100" alignItems="Center" role="group" aria-label="Pen colour">
          {PEN_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              className={css.Swatch}
              style={{ backgroundColor: c.value }}
              aria-label={c.name}
              aria-pressed={penColor === c.value}
              onClick={() => setPenColor(c.value)}
            />
          ))}
        </Box>
        <span className={css.ToolDivider} />
        <Box gap="0" alignItems="Center" role="group" aria-label="Pen size">
          {PEN_SIZES.map((s) => (
            <button
              key={s.value}
              type="button"
              className={css.SizeButton}
              aria-label={s.name}
              aria-pressed={penSize === s.value}
              onClick={() => setPenSize(s.value)}
            >
              <span
                className={css.SizeDot}
                style={{ width: Math.min(s.value, 18), height: Math.min(s.value, 18) }}
              />
            </button>
          ))}
        </Box>
        <span className={css.ToolDivider} />
        <IconButton
          size="300"
          radii="300"
          variant="Secondary"
          fill="None"
          aria-label="Undo"
          onClick={handleUndo}
          disabled={edit.strokes.length === 0}
        >
          <Icon size="100" src={UndoIcon} />
        </IconButton>
      </>
    );

    const modeSwitch = (
      <div className={css.Segmented} role="group" aria-label="Edit mode">
        <button
          type="button"
          className={css.SegmentedButton}
          aria-pressed={mode === 'crop'}
          onClick={() => setMode('crop')}
        >
          <Icon size="100" src={CropIcon} />
          <Text as="span" size="B300">
            Crop
          </Text>
        </button>
        <button
          type="button"
          className={css.SegmentedButton}
          aria-pressed={mode === 'draw'}
          onClick={() => setMode('draw')}
        >
          <Icon size="100" src={Icons.Pencil} />
          <Text as="span" size="B300">
            Draw
          </Text>
        </button>
      </div>
    );

    const tools = mode === 'crop' ? cropTools : drawTools;

    return (
      <Box
        className={classNames(css.ImageEditor, className)}
        direction="Column"
        data-mode={mode}
        {...props}
        ref={ref}
      >
        <Header className={css.ImageEditorHeader} size="500">
          <Box grow="Yes" alignItems="Center" gap="200">
            <IconButton size="300" radii="300" aria-label="Back" onClick={requestClose}>
              <Icon size="200" src={Icons.ArrowLeft} />
            </IconButton>
            <Text size="H4" truncate>
              {title}
            </Text>
          </Box>
          <Box shrink="No" alignItems="Center" gap="200">
            <Button
              size="300"
              variant="Primary"
              radii="Pill"
              before={
                exporting ? (
                  <Spinner size="100" variant="Primary" fill="Solid" />
                ) : (
                  <Icon size="100" src={Icons.Check} />
                )
              }
              onClick={handleDone}
              disabled={!size || exporting}
              aria-disabled={!size || exporting}
            >
              <Text size="B300">Done</Text>
            </Button>
          </Box>
        </Header>
        <div ref={stageRef} className={css.Stage} data-testid="image-editor-stage">
          {loadError && (
            <Text className={css.StageMessage} size="T300">
              This image can’t be edited.
            </Text>
          )}
          {!loaded && !loadError && (
            <div className={css.StageMessage}>
              <Spinner size="400" variant="Secondary" />
            </div>
          )}
          {loaded && viewScale > 0 && (
            <canvas
              ref={canvasRef}
              className={classNames(css.Canvas, mode === 'draw' && css.CanvasDraw)}
              width={Math.max(1, Math.round(viewSize.width * dpr))}
              height={Math.max(1, Math.round(viewSize.height * dpr))}
              style={{
                left: viewLeft,
                top: viewTop,
                width: viewSize.width,
                height: viewSize.height,
              }}
              aria-label={mode === 'draw' ? 'Drawing area' : name}
              onPointerDown={handleDrawDown}
              onPointerMove={handleDrawMove}
              onPointerUp={handleDrawUp}
              onPointerCancel={handleDrawUp}
            />
          )}
          {loaded && mode === 'crop' && frame && viewScale > 0 && (
            <div
              className={css.CropFrame}
              data-testid="crop-frame"
              role="button"
              aria-roledescription="crop frame"
              aria-label="Crop. Arrow keys move the frame, Shift and arrow keys resize it."
              tabIndex={0}
              style={{
                left: viewLeft + frame.x * viewScale,
                top: viewTop + frame.y * viewScale,
                width: frame.width * viewScale,
                height: frame.height * viewScale,
              }}
              onKeyDown={handleCropKey}
              onPointerDown={handleCropDown('move')}
              onPointerMove={handleCropMove}
              onPointerUp={handleCropUp}
              onPointerCancel={handleCropUp}
            >
              <div className={classNames(css.CropShade, round && css.CropShadeRound)} />
              {[1, 2].map((n) => (
                <React.Fragment key={n}>
                  <div
                    className={css.CropThird}
                    style={{ left: `${(n * 100) / 3}%`, top: 0, bottom: 0, width: 1 }}
                  />
                  <div
                    className={css.CropThird}
                    style={{ top: `${(n * 100) / 3}%`, left: 0, right: 0, height: 1 }}
                  />
                </React.Fragment>
              ))}
              {CROP_HANDLES.map((handle) => (
                <div
                  key={handle}
                  className={classNames(css.CropHandle, css.CropHandles[handle as 'n'])}
                  data-handle={handle}
                  style={handlePosition(handle)}
                  onPointerDown={handleCropDown(handle)}
                  onPointerMove={handleCropMove}
                  onPointerUp={handleCropUp}
                  onPointerCancel={handleCropUp}
                />
              ))}
            </div>
          )}
        </div>
        <Box
          className={css.Toolbar}
          direction={compact ? 'Column' : 'Row'}
          alignItems={compact ? 'Stretch' : 'Center'}
          justifyContent="SpaceBetween"
        >
          {exportError && (
            <Text size="T200" style={{ color: color.Critical.Main }}>
              {exportError}
            </Text>
          )}
          {compact ? (
            <>
              <Box className={css.ToolRow} alignItems="Center" justifyContent="Center">
                {tools}
              </Box>
              {drawing && <Box justifyContent="Center">{modeSwitch}</Box>}
            </>
          ) : (
            <>
              {drawing ? modeSwitch : <span />}
              <Box className={css.ToolRow} alignItems="Center" justifyContent="End">
                {tools}
              </Box>
            </>
          )}
        </Box>
      </Box>
    );
  }
);
