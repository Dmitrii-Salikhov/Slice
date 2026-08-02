import { useEffect, useRef, useState } from 'react';
import type {
  Annotation,
  MprBasis,
  MprPlane,
  ViewerTool,
  VolumeData,
  WindowLevel,
} from '../dicom/types';
import type { VolumeCursor } from '../viewer/crosshair';
import { clampCursor } from '../viewer/crosshair';
import { angleDeg, clientToImage } from '../viewer/math';
import {
  annotationHitSlop,
  finishEllipseRoi,
  finishLength,
  isMeasureTool,
  isNavTool,
  pickAnnotation,
} from '../viewer/annotationTools';
import { drawOverlays, renderSliceToCanvas, type DraftOverlay } from '../viewer/render';
import type { MprSlice } from '../viewer/mpr';
import { crosshairInMprPlane, cursorFromMprPlaneClick } from '../viewer/mpr';
import { createWebGlSliceRenderer, type WebGlSliceRenderer } from '../viewer/webgl';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { useLocale } from '../i18n/LocaleContext';
import './Viewport.css';

type Props = {
  label: string;
  plane: MprPlane;
  slice: MprSlice;
  max: number;
  volume: VolumeData;
  cursor: VolumeCursor;
  onCursorChange: (c: VolumeCursor) => void;
  wl: WindowLevel;
  tool: ViewerTool;
  zoom: number;
  useWebGl: boolean;
  onSliceChange: (index: number) => void;
  onWlDelta: (dCenter: number, dWidth: number) => void;
  onZoomChange: (z: number) => void;
  onWebGlFailed?: () => void;
  mprBasis: MprBasis;
  measures: Annotation[];
  onMeasuresChange: (m: Annotation[]) => void;
  selectedAnnotationId?: string | null;
  onSelectAnnotation?: (id: string | null) => void;
  onClearMeasures?: () => void;
  onFocus?: () => void;
};

type DragState = {
  x: number;
  y: number;
  active: boolean;
  cross?: boolean;
  mode?: 'nav' | 'length' | 'roi' | 'arrow';
};

export function MprViewport({
  label,
  plane,
  slice,
  max,
  volume,
  cursor,
  onCursorChange,
  wl,
  tool,
  zoom,
  useWebGl,
  onSliceChange,
  onWlDelta,
  onZoomChange,
  onWebGlFailed,
  mprBasis,
  measures,
  onMeasuresChange,
  selectedAnnotationId = null,
  onSelectAnnotation,
  onClearMeasures,
  onFocus,
}: Props) {
  const { t } = useLocale();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<WebGlSliceRenderer | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const grayRef = useRef<Uint8ClampedArray | null>(null);
  const glFailedRef = useRef(false);
  const wheelRafRef = useRef<number | null>(null);
  const pendingDeltaRef = useRef(0);
  /** Last requested index while props may still lag behind (slow MPR re-renders). */
  const desiredIndexRef = useRef(slice.index);
  const awaitingSliceRef = useRef(false);
  const maxRef = useRef(max);
  maxRef.current = max;
  const onSliceChangeRef = useRef(onSliceChange);
  onSliceChangeRef.current = onSliceChange;

  useEffect(() => {
    if (slice.index === desiredIndexRef.current) {
      awaitingSliceRef.current = false;
      return;
    }
    // Ignore stale props while our scroll request is in flight; adopt external moves only.
    if (!awaitingSliceRef.current) {
      desiredIndexRef.current = slice.index;
    }
  }, [slice.index]);

  useEffect(() => {
    desiredIndexRef.current = Math.min(max, Math.max(0, desiredIndexRef.current));
    awaitingSliceRef.current = false;
  }, [max, plane]);
  const [draft, setDraft] = useState<DraftOverlay | null>(null);
  const [anglePoints, setAnglePoints] = useState<Array<{ x: number; y: number }>>([]);
  const [probe, setProbe] = useState<{
    x: number;
    y: number;
    value: number;
    label?: string;
  } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    hitId: string | null;
  } | null>(null);

  const meta = { sliceIndex: slice.index, mprPlane: plane };

  // Keep latest frame inputs in refs so ResizeObserver never paints a stale slice
  // (that was causing jumps back to old indices / other planes' frames).
  const frameRef = useRef({
    slice,
    wl,
    zoom,
    cursor,
    volume,
    mprBasis,
    plane,
    measures,
    draft,
    probe,
    selectedAnnotationId,
    useWebGl,
  });
  frameRef.current = {
    slice,
    wl,
    zoom,
    cursor,
    volume,
    mprBasis,
    plane,
    measures,
    draft,
    probe,
    selectedAnnotationId,
    useWebGl,
  };

  const paint = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const f = frameRef.current;
    const s = f.slice;
    // Guard against a mismatched slice object ever reaching the wrong pane.
    if (s.plane !== f.plane) return;
    const { col: spacingCol, row: spacingRow } = s.spacing;

    if (f.useWebGl && glRef.current && !glFailedRef.current) {
      try {
        glRef.current.draw({
          pixels: s.pixels,
          width: s.width,
          height: s.height,
          windowLevel: f.wl,
          zoom: f.zoom,
          panX: 0,
          panY: 0,
          spacingCol,
          spacingRow,
        });
      } catch {
        glFailedRef.current = true;
        glRef.current?.destroy();
        glRef.current = null;
        onWebGlFailed?.();
      }
    } else {
      if (!grayRef.current || grayRef.current.length !== s.pixels.length) {
        grayRef.current = new Uint8ClampedArray(s.pixels.length);
      }
      renderSliceToCanvas(
        canvas,
        {
          pixels: s.pixels,
          width: s.width,
          height: s.height,
          windowLevel: f.wl,
          zoom: f.zoom,
          panX: 0,
          panY: 0,
          spacingCol,
          spacingRow,
        },
        grayRef.current,
      );
    }

    const overlay = overlayRef.current ?? (!f.useWebGl ? canvas : null);
    if (overlay) {
      if (overlay !== canvas) {
        const ctx = overlay.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, overlay.width, overlay.height);
      }
      const ch = crosshairInMprPlane(f.volume, f.plane, f.cursor, f.mprBasis, s);
      drawOverlays(overlay, {
        width: s.width,
        height: s.height,
        zoom: f.zoom,
        panX: 0,
        panY: 0,
        crosshair: ch,
        spacing: s.spacing,
        measures: f.measures,
        draftMeasure: f.draft,
        probe: f.probe,
        sliceIndex: s.index,
        mprPlane: f.plane,
        selectedId: f.selectedAnnotationId,
      });
    }
  };
  const paintRef = useRef(paint);
  paintRef.current = paint;

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    if (useWebGl) {
      glFailedRef.current = false;
      glRef.current?.destroy();
      glRef.current = createWebGlSliceRenderer(canvas);
      if (!glRef.current) onWebGlFailed?.();
    } else {
      glRef.current?.destroy();
      glRef.current = null;
    }

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(1.25, window.devicePixelRatio || 1);
      if (glRef.current) {
        glRef.current.resize(rect.width, rect.height, dpr);
      } else {
        canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        canvas.height = Math.max(1, Math.floor(rect.height * dpr));
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
      }
      const overlay = overlayRef.current;
      if (overlay) {
        overlay.width = Math.max(1, Math.floor(rect.width * dpr));
        overlay.height = Math.max(1, Math.floor(rect.height * dpr));
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;
      }
      paintRef.current();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => {
      ro.disconnect();
      glRef.current?.destroy();
      glRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useWebGl]);

  useEffect(() => {
    paintRef.current();
  }, [
    slice,
    wl,
    zoom,
    cursor,
    useWebGl,
    plane,
    volume,
    mprBasis,
    measures,
    draft,
    probe,
    selectedAnnotationId,
  ]);

  useEffect(() => {
    setAnglePoints([]);
    setDraft(null);
    setProbe(null);
  }, [tool, slice.index, plane]);

  const toImage = (clientX: number, clientY: number, allowOutside = false) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return clientToImage(
      clientX,
      clientY,
      canvas,
      slice.width,
      slice.height,
      zoom,
      0,
      0,
      false,
      false,
      slice.spacing.col,
      slice.spacing.row,
      { allowOutside },
    );
  };

  const setCursorFromEvent = (e: { clientX: number; clientY: number }) => {
    const img = toImage(e.clientX, e.clientY);
    if (!img) return;
    onCursorChange(
      clampCursor(
        cursorFromMprPlaneClick(volume, plane, img.x, img.y, cursor, mprBasis, slice),
        volume,
      ),
    );
  };

  const queueSliceDelta = (delta: number) => {
    if (delta === 0) return;
    pendingDeltaRef.current += delta;
    if (wheelRafRef.current != null) return;
    wheelRafRef.current = window.requestAnimationFrame(() => {
      wheelRafRef.current = null;
      const d = pendingDeltaRef.current;
      pendingDeltaRef.current = 0;
      if (d === 0) return;
      const next = Math.min(maxRef.current, Math.max(0, desiredIndexRef.current + d));
      if (next === desiredIndexRef.current && awaitingSliceRef.current) return;
      desiredIndexRef.current = next;
      awaitingSliceRef.current = true;
      onSliceChangeRef.current(next);
    });
  };

  useEffect(
    () => () => {
      if (wheelRafRef.current != null) window.cancelAnimationFrame(wheelRafRef.current);
    },
    [],
  );

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || tool === 'zoom') {
      onZoomChange(Math.min(8, Math.max(0.2, zoom * (e.deltaY > 0 ? 0.9 : 1.1))));
      return;
    }
    queueSliceDelta(e.deltaY > 0 ? 1 : -1);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    onFocus?.();
    // Right/middle click: leave for context menu; do not capture or drag.
    if (e.button !== 0) return;

    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    if (isNavTool(tool)) {
      const img = toImage(e.clientX, e.clientY, true);
      if (img) {
        const hit = pickAnnotation(measures, img, annotationHitSlop(zoom), {
          sliceIndex: slice.index,
          mprPlane: plane,
        });
        onSelectAnnotation?.(hit?.id ?? null);
        if (hit) return;
      } else {
        onSelectAnnotation?.(null);
      }
    }

    if (tool === 'length' || tool === 'roi' || tool === 'arrow') {
      const img = toImage(e.clientX, e.clientY, true);
      if (!img) return;
      setDraft({ kind: tool, x0: img.x, y0: img.y, x1: img.x, y1: img.y });
      dragRef.current = { x: e.clientX, y: e.clientY, active: true, mode: tool };
      return;
    }

    if (tool === 'angle') {
      const img = toImage(e.clientX, e.clientY, true);
      if (!img) return;
      const next = [...anglePoints, img];
      if (next.length === 1) {
        setAnglePoints(next);
        setDraft({ kind: 'angle', x0: img.x, y0: img.y, x1: img.x, y1: img.y });
      } else if (next.length === 2) {
        setAnglePoints(next);
        setDraft({
          kind: 'angle',
          x0: next[0].x,
          y0: next[0].y,
          x1: next[1].x,
          y1: next[1].y,
        });
      } else {
        const done = (() => {
          const deg = angleDeg(
            next[0].x,
            next[0].y,
            next[1].x,
            next[1].y,
            next[2].x,
            next[2].y,
            slice.spacing.col,
            slice.spacing.row,
          );
          if (deg <= 0.1) return null;
          return {
            kind: 'angle' as const,
            id: `${Date.now()}`,
            sliceIndex: meta.sliceIndex,
            mprPlane: meta.mprPlane,
            x0: next[0].x,
            y0: next[0].y,
            x1: next[1].x,
            y1: next[1].y,
            x2: next[2].x,
            y2: next[2].y,
            deg,
          };
        })();
        if (done) onMeasuresChange([...measures, done]);
        setAnglePoints([]);
        setDraft(null);
      }
      return;
    }

    if (tool === 'probe') {
      const img = toImage(e.clientX, e.clientY);
      if (!img) return;
      const x = Math.round(img.x);
      const y = Math.round(img.y);
      if (x < 0 || y < 0 || x >= slice.width || y >= slice.height) return;
      const value = slice.pixels[y * slice.width + x];
      setProbe({ x: img.x, y: img.y, value });
      setCursorFromEvent(e);
      return;
    }

    if (tool === 'crosshair') {
      setCursorFromEvent(e);
      dragRef.current = { x: e.clientX, y: e.clientY, active: true, cross: true };
      return;
    }

    dragRef.current = { x: e.clientX, y: e.clientY, active: true, mode: 'nav' };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;

    if (tool === 'angle' && anglePoints.length > 0) {
      const img = toImage(e.clientX, e.clientY, true);
      if (!img) return;
      if (anglePoints.length === 1) {
        setDraft({
          kind: 'angle',
          x0: anglePoints[0].x,
          y0: anglePoints[0].y,
          x1: img.x,
          y1: img.y,
        });
      } else if (anglePoints.length === 2) {
        setDraft({
          kind: 'angle',
          x0: anglePoints[0].x,
          y0: anglePoints[0].y,
          x1: anglePoints[1].x,
          y1: anglePoints[1].y,
          x2: img.x,
          y2: img.y,
        });
      }
      return;
    }

    if (tool === 'probe' && e.buttons === 1) {
      const img = toImage(e.clientX, e.clientY);
      if (!img) return;
      const x = Math.round(img.x);
      const y = Math.round(img.y);
      if (x < 0 || y < 0 || x >= slice.width || y >= slice.height) return;
      setProbe({ x: img.x, y: img.y, value: slice.pixels[y * slice.width + x] });
      return;
    }

    if (!drag?.active) return;

    if (
      (drag.mode === 'length' || drag.mode === 'roi' || drag.mode === 'arrow') &&
      draft &&
      draft.kind === drag.mode
    ) {
      const img = toImage(e.clientX, e.clientY, true);
      if (img) setDraft({ ...draft, x1: img.x, y1: img.y });
      return;
    }

    if (drag.cross || tool === 'crosshair') {
      setCursorFromEvent(e);
      return;
    }

    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;

    if (tool === 'wl') {
      onWlDelta(dx * 0.5, -dy * 1.5);
      drag.x = e.clientX;
      drag.y = e.clientY;
    } else if (tool === 'zoom') {
      onZoomChange(Math.min(8, Math.max(0.2, zoom * (1 - dy * 0.01))));
      drag.y = e.clientY;
    } else if (!isMeasureTool(tool)) {
      const steps = Math.trunc(dy / 8);
      if (steps !== 0) {
        queueSliceDelta(steps);
        drag.y = e.clientY;
      }
    }
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    if (
      drag?.mode &&
      (drag.mode === 'length' || drag.mode === 'roi' || drag.mode === 'arrow') &&
      draft &&
      draft.kind === drag.mode
    ) {
      if (drag.mode === 'length') {
        const ann = finishLength(draft, slice.spacing.col, slice.spacing.row, meta);
        if (ann) onMeasuresChange([...measures, ann]);
      } else if (drag.mode === 'roi') {
        const result = finishEllipseRoi(
          draft,
          slice.pixels,
          slice.width,
          slice.height,
          slice.spacing.col,
          slice.spacing.row,
          meta,
        );
        if (result) onMeasuresChange([...measures, result.annotation]);
      } else if (drag.mode === 'arrow') {
        if (Math.hypot(draft.x1 - draft.x0, draft.y1 - draft.y0) > 2) {
          onMeasuresChange([
            ...measures,
            {
              kind: 'arrow',
              id: `${Date.now()}`,
              sliceIndex: meta.sliceIndex,
              mprPlane: meta.mprPlane,
              x0: draft.x0,
              y0: draft.y0,
              x1: draft.x1,
              y1: draft.y1,
            },
          ]);
        }
      }
      setDraft(null);
    }
    if (dragRef.current) dragRef.current.active = false;
  };

  const visibility = { sliceIndex: slice.index, mprPlane: plane };

  const ctxItems: ContextMenuItem[] = [
    ...(ctxMenu?.hitId
      ? [
          {
            id: 'delete-annotation',
            label: t('ctx.deleteAnnotation'),
            danger: true,
          } satisfies ContextMenuItem,
          { id: 'sep-del', separator: true } satisfies ContextMenuItem,
        ]
      : []),
    { id: 'clear-measures', label: t('ctx.clearMeasures') },
  ];

  const onCtxSelect = (id: string) => {
    if (id === 'delete-annotation' && ctxMenu?.hitId) {
      const hitId = ctxMenu.hitId;
      onMeasuresChange(measures.filter((m) => m.id !== hitId));
      onSelectAnnotation?.(null);
      return;
    }
    if (id === 'clear-measures') {
      onClearMeasures?.();
      onSelectAnnotation?.(null);
    }
  };

  return (
    <div
      className="viewport"
      ref={wrapRef}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const img = toImage(e.clientX, e.clientY, true);
        const hit = img
          ? pickAnnotation(measures, img, annotationHitSlop(zoom), visibility)
          : null;
        if (hit) onSelectAnnotation?.(hit.id);
        setCtxMenu({ x: e.clientX, y: e.clientY, hitId: hit?.id ?? null });
      }}
    >
      <canvas ref={canvasRef} />
      {useWebGl && <canvas ref={overlayRef} className="viewport__overlay-canvas" />}
      <div className="viewport__overlay">
        <div className="viewport__top">
          <span>{label}</span>
          <span>
            {slice.index + 1} / {max + 1}
          </span>
        </div>
        <div className="viewport__bottom">
          <span>
            W {Math.round(wl.windowWidth)} / L {Math.round(wl.windowCenter)}
          </span>
          <span>
            {slice.width}×{slice.height}
          </span>
        </div>
      </div>
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxItems}
          onClose={() => setCtxMenu(null)}
          onSelect={onCtxSelect}
        />
      )}
    </div>
  );
}
