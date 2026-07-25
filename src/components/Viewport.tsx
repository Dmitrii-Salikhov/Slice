import { useEffect, useRef, useState } from 'react';
import type { Annotation, DicomInstance, ViewerTool, WindowLevel } from '../dicom/types';
import { getModalityPixel, getPixelBuffer, hasPixels } from '../dicom/parse';
import { angleDeg, clientToImage, lengthMm } from '../viewer/math';
import { computeRoiStats } from '../viewer/roiStats';
import {
  drawOverlays,
  renderSliceToCanvas,
  type DraftOverlay,
} from '../viewer/render';
import { createWebGlSliceRenderer, type WebGlSliceRenderer } from '../viewer/webgl';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { useLocale } from '../i18n/LocaleContext';
import './Viewport.css';

type Props = {
  instance: DicomInstance | null;
  sliceIndex: number;
  sliceCount: number;
  onSliceChange: (index: number) => void;
  wl: WindowLevel;
  zoom: number;
  pan: { x: number; y: number };
  tool: ViewerTool;
  onWlDelta: (dCenter: number, dWidth: number) => void;
  onZoomChange: (z: number) => void;
  onPanChange: (p: { x: number; y: number }) => void;
  useWebGl: boolean;
  measures: Annotation[];
  onMeasuresChange: (m: Annotation[]) => void;
  label?: string;
  /** Bump when lazy pixels arrive (instance is mutated in place). */
  pixelsRevision?: number;
  onContextAction?: (action: string) => void;
  /** Display invert (combined with MONOCHROME1 by caller). */
  invert?: boolean;
  flipH?: boolean;
  flipV?: boolean;
};

type DragMode = 'nav' | 'length' | 'roi' | 'arrow';

export function Viewport({
  instance,
  sliceIndex,
  sliceCount,
  onSliceChange,
  wl,
  zoom,
  pan,
  tool,
  onWlDelta,
  onZoomChange,
  onPanChange,
  useWebGl,
  measures,
  onMeasuresChange,
  label,
  pixelsRevision = 0,
  onContextAction,
  invert = false,
  flipH = false,
  flipV = false,
}: Props) {
  const { t } = useLocale();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<WebGlSliceRenderer | null>(null);
  const grayRef = useRef<Uint8ClampedArray | null>(null);
  const ready = !!(instance && hasPixels(instance));
  const dragRef = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
    active: boolean;
    mode: DragMode;
  } | null>(null);
  const [draft, setDraft] = useState<DraftOverlay | null>(null);
  const [anglePoints, setAnglePoints] = useState<
    Array<{ x: number; y: number }>
  >([]);
  const [probe, setProbe] = useState<{
    x: number;
    y: number;
    value: number;
    label?: string;
  } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  const isColor = !!(instance?.colorRgba && instance.colorRgba.length > 0);

  const paint = () => {
    const canvas = canvasRef.current;
    if (!canvas || !instance) return;
    const pixels = getPixelBuffer(instance);
    if (!pixels && !instance.colorRgba) return;

    if (useWebGl && glRef.current && (pixels || instance.colorRgba)) {
      glRef.current.draw({
        pixels: pixels ?? new Float32Array(instance.columns * instance.rows),
        width: instance.columns,
        height: instance.rows,
        windowLevel: wl,
        zoom,
        panX: pan.x,
        panY: pan.y,
        invert,
        flipH,
        flipV,
        colorRgba: instance.colorRgba,
      });
    } else if (pixels) {
      if (!grayRef.current || grayRef.current.length !== pixels.length) {
        grayRef.current = new Uint8ClampedArray(pixels.length);
      }
      renderSliceToCanvas(
        canvas,
        {
          pixels,
          width: instance.columns,
          height: instance.rows,
          windowLevel: wl,
          zoom,
          panX: pan.x,
          panY: pan.y,
          invert,
          flipH,
          flipV,
          colorRgba: instance.colorRgba,
        },
        grayRef.current,
      );
      drawOverlays(canvas, {
        width: instance.columns,
        height: instance.rows,
        zoom,
        panX: pan.x,
        panY: pan.y,
        flipH,
        flipV,
        measures,
        draftMeasure: draft,
        probe,
        spacing: instance.pixelSpacing,
        sliceIndex,
      });
    }
  };

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    if (useWebGl) {
      glRef.current?.destroy();
      glRef.current = createWebGlSliceRenderer(canvas);
    } else {
      glRef.current?.destroy();
      glRef.current = null;
    }

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (glRef.current) {
        glRef.current.resize(rect.width, rect.height, dpr);
      } else {
        canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        canvas.height = Math.max(1, Math.floor(rect.height * dpr));
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
      }
      paint();
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
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance, wl, zoom, pan, measures, draft, probe, useWebGl, sliceIndex, pixelsRevision, ready, invert, flipH, flipV]);

  useEffect(() => {
    setAnglePoints([]);
    setDraft(null);
  }, [tool, sliceIndex]);

  const sampleProbe = (ix: number, iy: number) => {
    if (!instance) return null;
    const x = Math.round(ix);
    const y = Math.round(iy);
    if (x < 0 || y < 0 || x >= instance.columns || y >= instance.rows) return null;
    if (instance.colorRgba && instance.colorRgba.length >= (y * instance.columns + x + 1) * 4) {
      const o = (y * instance.columns + x) * 4;
      const r = instance.colorRgba[o];
      const g = instance.colorRgba[o + 1];
      const b = instance.colorRgba[o + 2];
      return { x: ix, y: iy, value: (r + g + b) / 3, label: `R${r} G${g} B${b}` };
    }
    const value = getModalityPixel(instance, y * instance.columns + x);
    if (Number.isNaN(value)) return null;
    return { x: ix, y: iy, value };
  };

  const toImage = (clientX: number, clientY: number) => {
    if (!instance || !canvasRef.current) return null;
    return clientToImage(
      clientX,
      clientY,
      canvasRef.current,
      instance.columns,
      instance.rows,
      zoom,
      pan.x,
      pan.y,
      flipH,
      flipV,
    );
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || tool === 'zoom') {
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      onZoomChange(Math.min(8, Math.max(0.2, zoom * factor)));
      return;
    }
    const delta = e.deltaY > 0 ? 1 : -1;
    onSliceChange(Math.min(sliceCount - 1, Math.max(0, sliceIndex + delta)));
  };

  const startDragTool = (
    mode: 'length' | 'roi' | 'arrow',
    e: React.PointerEvent,
    img: { x: number; y: number },
  ) => {
    setDraft({ kind: mode, x0: img.x, y0: img.y, x1: img.x, y1: img.y });
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
      active: true,
      mode,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!instance || !canvasRef.current) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    if (tool === 'length' || tool === 'roi' || tool === 'arrow') {
      const img = toImage(e.clientX, e.clientY);
      if (!img) return;
      startDragTool(tool, e, img);
      return;
    }

    if (tool === 'angle') {
      const img = toImage(e.clientX, e.clientY);
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
        const deg = angleDeg(
          next[0].x,
          next[0].y,
          next[1].x,
          next[1].y,
          next[2].x,
          next[2].y,
          instance.pixelSpacing.col,
          instance.pixelSpacing.row,
        );
        if (deg > 0.1) {
          onMeasuresChange([
            ...measures,
            {
              kind: 'angle',
              id: `${Date.now()}`,
              sliceIndex,
              x0: next[0].x,
              y0: next[0].y,
              x1: next[1].x,
              y1: next[1].y,
              x2: next[2].x,
              y2: next[2].y,
              deg,
            },
          ]);
        }
        setAnglePoints([]);
        setDraft(null);
      }
      return;
    }

    if (tool === 'probe') {
      const img = toImage(e.clientX, e.clientY);
      if (!img) return;
      const p = sampleProbe(img.x, img.y);
      if (p) setProbe(p);
      return;
    }

    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
      active: true,
      mode: 'nav',
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!instance || !canvasRef.current) return;

    if (tool === 'angle' && anglePoints.length > 0) {
      const img = toImage(e.clientX, e.clientY);
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
      const p = sampleProbe(img.x, img.y);
      if (p) setProbe(p);
      return;
    }

    if (!drag?.active) return;

    if (
      (drag.mode === 'length' || drag.mode === 'roi' || drag.mode === 'arrow') &&
      draft &&
      draft.kind === drag.mode
    ) {
      const img = toImage(e.clientX, e.clientY);
      if (img) setDraft({ ...draft, x1: img.x, y1: img.y });
      return;
    }

    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;

    if ((tool === 'wl' || e.buttons === 2) && !isColor) {
      onWlDelta(dx * 0.5, -dy * 1.5);
      drag.x = e.clientX;
      drag.y = e.clientY;
    } else if (tool === 'pan') {
      onPanChange({ x: drag.panX + dx, y: drag.panY + dy });
    } else if (tool === 'zoom') {
      onZoomChange(Math.min(8, Math.max(0.2, zoom * (1 - dy * 0.01))));
      drag.y = e.clientY;
    } else if (tool === 'scroll') {
      const steps = Math.trunc(dy / 8);
      if (steps !== 0) {
        onSliceChange(Math.min(sliceCount - 1, Math.max(0, sliceIndex + steps)));
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
      draft.kind === drag.mode &&
      instance
    ) {
      if (drag.mode === 'length') {
        const mm = lengthMm(
          draft.x1 - draft.x0,
          draft.y1 - draft.y0,
          instance.pixelSpacing.col,
          instance.pixelSpacing.row,
        );
        if (mm > 0.1) {
          onMeasuresChange([
            ...measures,
            {
              kind: 'length',
              id: `${Date.now()}`,
              sliceIndex,
              x0: draft.x0,
              y0: draft.y0,
              x1: draft.x1,
              y1: draft.y1,
              mm,
            },
          ]);
        }
      } else if (drag.mode === 'roi') {
        const pixels = getPixelBuffer(instance);
        if (!pixels) {
          setDraft(null);
          if (dragRef.current) dragRef.current.active = false;
          return;
        }
        const stats = computeRoiStats(
          pixels,
          instance.columns,
          instance.rows,
          draft.x0,
          draft.y0,
          draft.x1,
          draft.y1,
          instance.pixelSpacing.col,
          instance.pixelSpacing.row,
          'ellipse',
        );
        if (stats.count > 0 && Math.hypot(draft.x1 - draft.x0, draft.y1 - draft.y0) > 2) {
          onMeasuresChange([
            ...measures,
            {
              kind: 'roi',
              shape: 'ellipse',
              id: `${Date.now()}`,
              sliceIndex,
              x0: draft.x0,
              y0: draft.y0,
              x1: draft.x1,
              y1: draft.y1,
              mean: stats.mean,
              sd: stats.sd,
              min: stats.min,
              max: stats.max,
              areaMm2: stats.areaMm2,
            },
          ]);
        }
      } else if (drag.mode === 'arrow') {
        if (Math.hypot(draft.x1 - draft.x0, draft.y1 - draft.y0) > 2) {
          onMeasuresChange([
            ...measures,
            {
              kind: 'arrow',
              id: `${Date.now()}`,
              sliceIndex,
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

  const ctxItems: ContextMenuItem[] = [
    { id: 'reset-view', label: t('ctx.resetView') },
    { id: 'toggle-invert', label: t('ctx.toggleInvert') },
    { id: 'flip-h', label: t('ctx.flipH') },
    { id: 'flip-v', label: t('ctx.flipV') },
    { id: 'sep1', separator: true },
    { id: 'preset-soft', label: t('toolbar.presetSoft') },
    { id: 'preset-lung', label: t('toolbar.presetLung') },
    { id: 'preset-bone', label: t('toolbar.presetBone') },
    { id: 'preset-brain', label: t('toolbar.presetBrain') },
    { id: 'preset-abdomen', label: t('toolbar.presetAbdomen') },
    { id: 'sep2', separator: true },
    { id: 'clear-measures', label: t('ctx.clearMeasures') },
    { id: 'export-jpeg', label: t('ctx.exportJpeg'), disabled: !instance },
    { id: 'export-png', label: t('ctx.exportPng'), disabled: !instance },
    { id: 'copy-patient', label: t('ctx.copyPatient'), disabled: !instance },
    { id: 'show-tags', label: t('ctx.showTags'), disabled: !instance },
  ];

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
        if (!onContextAction) return;
        setCtxMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <canvas ref={canvasRef} />
      {!ready && instance && (
        <div className="viewport__loading" aria-live="polite">
          Decoding…
        </div>
      )}
      {useWebGl && instance && ready && (
        <OverlayCanvas
          width={instance.columns}
          height={instance.rows}
          zoom={zoom}
          pan={pan}
          flipH={flipH}
          flipV={flipV}
          measures={measures}
          draft={draft}
          probe={probe}
          sliceIndex={sliceIndex}
        />
      )}
      <div className="viewport__overlay">
        <div className="viewport__top">
          <span>{label ?? instance?.seriesDescription ?? ''}</span>
          <span>
            {sliceCount > 0 ? `${sliceIndex + 1} / ${sliceCount}` : '—'}
            {instance?.transferSyntax ? ` · TS` : ''}
            {isColor ? ' · RGB' : ''}
          </span>
        </div>
        <div className="viewport__bottom">
          <span>
            {isColor
              ? 'Color'
              : `W ${Math.round(wl.windowWidth)} / L ${Math.round(wl.windowCenter)}`}
            {useWebGl ? ' · WebGL' : ''}
          </span>
          {instance && (
            <span>
              {instance.columns}×{instance.rows}
              {instance.pixelSpacing.col
                ? ` · ${instance.pixelSpacing.col.toFixed(2)}mm`
                : ''}
            </span>
          )}
        </div>
      </div>
      {ctxMenu && onContextAction && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxItems}
          onClose={() => setCtxMenu(null)}
          onSelect={(id) => onContextAction(id)}
        />
      )}
    </div>
  );
}

function OverlayCanvas({
  width,
  height,
  zoom,
  pan,
  flipH = false,
  flipV = false,
  measures,
  draft,
  probe,
  sliceIndex,
}: {
  width: number;
  height: number;
  zoom: number;
  pan: { x: number; y: number };
  flipH?: boolean;
  flipV?: boolean;
  measures: Annotation[];
  draft: DraftOverlay | null;
  probe: { x: number; y: number; value: number; label?: string } | null;
  sliceIndex: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawOverlays(canvas, {
          width,
          height,
          zoom,
          panX: pan.x,
          panY: pan.y,
          flipH,
          flipV,
          measures,
          draftMeasure: draft,
          probe,
          sliceIndex,
        });
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [width, height, zoom, pan, flipH, flipV, measures, draft, probe, sliceIndex]);

  return <canvas ref={ref} className="viewport__overlay-canvas" />;
}
