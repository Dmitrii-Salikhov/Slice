import { useEffect, useRef } from 'react';
import type { ViewerTool, WindowLevel } from '../dicom/types';
import { drawOverlays, renderSliceToCanvas } from '../viewer/render';
import type { ObliqueSlice } from '../viewer/crosshair';
import { createWebGlSliceRenderer, type WebGlSliceRenderer } from '../viewer/webgl';
import './Viewport.css';

type Props = {
  slice: ObliqueSlice;
  wl: WindowLevel;
  zoom: number;
  useWebGl: boolean;
  onWebGlFailed?: () => void;
  onWlDelta: (dCenter: number, dWidth: number) => void;
  onZoomChange: (z: number) => void;
  onScroll: (delta: number) => void;
  tool: ViewerTool;
  obliqueLabel: string;
  canvasLabel: string;
  webglLabel: string;
};

export function ObliqueViewport({
  slice,
  wl,
  zoom,
  useWebGl,
  onWebGlFailed,
  onWlDelta,
  onZoomChange,
  onScroll,
  tool,
  obliqueLabel,
  canvasLabel,
  webglLabel,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<WebGlSliceRenderer | null>(null);
  const grayRef = useRef<Uint8ClampedArray | null>(null);
  const glFailedRef = useRef(false);
  const dragRef = useRef<{ x: number; y: number; active: boolean } | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const onContextLost = (e: Event) => {
      e.preventDefault();
      glFailedRef.current = true;
      glRef.current?.destroy();
      glRef.current = null;
      onWebGlFailed?.();
    };

    if (useWebGl) {
      glFailedRef.current = false;
      glRef.current?.destroy();
      glRef.current = createWebGlSliceRenderer(canvas);
      if (!glRef.current) onWebGlFailed?.();
      else canvas.addEventListener('webglcontextlost', onContextLost);
    } else {
      glRef.current?.destroy();
      glRef.current = null;
    }

    const paint = () => {
      if (useWebGl && glRef.current && !glFailedRef.current) {
        try {
          glRef.current.draw({
            pixels: slice.pixels,
            width: slice.width,
            height: slice.height,
            windowLevel: wl,
            zoom,
            panX: 0,
            panY: 0,
          });
          return;
        } catch {
          glFailedRef.current = true;
          glRef.current?.destroy();
          glRef.current = null;
          onWebGlFailed?.();
        }
      }

      if (!grayRef.current || grayRef.current.length !== slice.pixels.length) {
        grayRef.current = new Uint8ClampedArray(slice.pixels.length);
      }
      renderSliceToCanvas(
        canvas,
        {
          pixels: slice.pixels,
          width: slice.width,
          height: slice.height,
          windowLevel: wl,
          zoom,
          panX: 0,
          panY: 0,
        },
        grayRef.current,
      );
      drawOverlays(canvas, {
        width: slice.width,
        height: slice.height,
        zoom,
        panX: 0,
        panY: 0,
        crosshair: { u: (slice.width - 1) / 2, v: (slice.height - 1) / 2 },
      });
    };

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(1.25, window.devicePixelRatio || 1);
      if (glRef.current) glRef.current.resize(rect.width, rect.height, dpr);
      else {
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
      canvas.removeEventListener('webglcontextlost', onContextLost);
      glRef.current?.destroy();
      glRef.current = null;
    };
  }, [slice, wl, zoom, useWebGl, onWebGlFailed]);

  return (
    <div
      className="viewport mpr__oblique-view"
      ref={wrapRef}
      onWheel={(e) => {
        e.preventDefault();
        if (e.ctrlKey || tool === 'zoom') {
          onZoomChange(Math.min(8, Math.max(0.2, zoom * (e.deltaY > 0 ? 0.9 : 1.1))));
        } else {
          onScroll(e.deltaY > 0 ? 1 : -1);
        }
      }}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        dragRef.current = { x: e.clientX, y: e.clientY, active: true };
      }}
      onPointerMove={(e) => {
        const drag = dragRef.current;
        if (!drag?.active) return;
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        if (tool === 'wl') {
          onWlDelta(dx * 0.5, -dy * 1.5);
          drag.x = e.clientX;
          drag.y = e.clientY;
        } else if (tool === 'zoom') {
          onZoomChange(Math.min(8, Math.max(0.2, zoom * (1 - dy * 0.01))));
          drag.y = e.clientY;
        } else {
          const steps = Math.trunc(dy / 8);
          if (steps !== 0) {
            onScroll(steps);
            drag.y = e.clientY;
          }
        }
      }}
      onPointerUp={() => {
        if (dragRef.current) dragRef.current.active = false;
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={canvasRef} />
      <div className="viewport__overlay">
        <div className="viewport__top">
          <span>{obliqueLabel}</span>
          <span>
            {slice.width}×{slice.height}
          </span>
        </div>
        <div className="viewport__bottom">
          <span>
            {slice.spacing[0].toFixed(2)}×{slice.spacing[1].toFixed(2)} mm
          </span>
          <span>{useWebGl ? webglLabel : canvasLabel}</span>
        </div>
      </div>
    </div>
  );
}
