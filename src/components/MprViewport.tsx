import { useEffect, useRef } from 'react';
import type { MprPlane, ViewerTool, VolumeData, WindowLevel } from '../dicom/types';
import type { VolumeCursor } from '../viewer/crosshair';
import {
  crosshairInPlane,
  cursorFromPlaneClick,
  clampCursor,
} from '../viewer/crosshair';
import { clientToImage } from '../viewer/math';
import { drawOverlays, renderSliceToCanvas } from '../viewer/render';
import type { MprSlice } from '../viewer/mpr';
import { createWebGlSliceRenderer, type WebGlSliceRenderer } from '../viewer/webgl';
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
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<WebGlSliceRenderer | null>(null);
  const dragRef = useRef<{ x: number; y: number; active: boolean; cross?: boolean } | null>(null);
  const grayRef = useRef<Uint8ClampedArray | null>(null);

  const paint = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (useWebGl && glRef.current) {
      glRef.current.draw({
        pixels: slice.pixels,
        width: slice.width,
        height: slice.height,
        windowLevel: wl,
        zoom,
        panX: 0,
        panY: 0,
      });
    } else {
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
    }

    const overlay = overlayRef.current ?? (!useWebGl ? canvas : null);
    if (overlay) {
      if (overlay !== canvas) {
        const ctx = overlay.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, overlay.width, overlay.height);
      }
      const ch = crosshairInPlane(plane, cursor, volume.dims);
      drawOverlays(overlay, {
        width: slice.width,
        height: slice.height,
        zoom,
        panX: 0,
        panY: 0,
        crosshair: ch,
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
      const overlay = overlayRef.current;
      if (overlay) {
        overlay.width = Math.max(1, Math.floor(rect.width * dpr));
        overlay.height = Math.max(1, Math.floor(rect.height * dpr));
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;
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
  }, [slice, wl, zoom, cursor, useWebGl, plane, volume.dims]);

  const setCursorFromEvent = (e: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const img = clientToImage(
      e.clientX,
      e.clientY,
      canvas,
      slice.width,
      slice.height,
      zoom,
      0,
      0,
    );
    if (!img) return;
    const next = clampCursor(
      cursorFromPlaneClick(plane, img.x, img.y, cursor, volume.dims),
      volume,
    );
    onCursorChange(next);
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || tool === 'zoom') {
      onZoomChange(Math.min(8, Math.max(0.2, zoom * (e.deltaY > 0 ? 0.9 : 1.1))));
      return;
    }
    const delta = e.deltaY > 0 ? 1 : -1;
    onSliceChange(Math.min(max, Math.max(0, slice.index + delta)));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (tool === 'crosshair') {
      setCursorFromEvent(e);
      dragRef.current = { x: e.clientX, y: e.clientY, active: true, cross: true };
      return;
    }
    dragRef.current = { x: e.clientX, y: e.clientY, active: true };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag?.active) return;

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
    } else {
      const steps = Math.trunc(dy / 8);
      if (steps !== 0) {
        onSliceChange(Math.min(max, Math.max(0, slice.index + steps)));
        drag.y = e.clientY;
      }
    }
  };

  const onPointerUp = () => {
    if (dragRef.current) dragRef.current.active = false;
  };

  return (
    <div
      className="viewport"
      ref={wrapRef}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
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
    </div>
  );
}
