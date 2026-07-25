import { useEffect, useMemo, useRef } from 'react';
import type { MprPlane, ViewerTool, VolumeData, WindowLevel } from '../dicom/types';
import type { VolumeCursor } from '../viewer/crosshair';
import {
  defaultOblique,
  extractObliqueSlice,
  probeVolume,
  rotateOblique,
  setObliqueCenter,
  offsetOrigin,
} from '../viewer/crosshair';
import { extractMprSlice, maxIndex } from '../viewer/mpr';
import { drawOverlays, renderSliceToCanvas } from '../viewer/render';
import { createWebGlSliceRenderer, type WebGlSliceRenderer } from '../viewer/webgl';
import { useLocale } from '../i18n/LocaleContext';
import type { MessageKey } from '../i18n/translations';
import { MprViewport } from './MprViewport';
import './MprLayout.css';
import './Viewport.css';

type Props = {
  volume: VolumeData;
  cursor: VolumeCursor;
  onCursorChange: (c: VolumeCursor) => void;
  wl: WindowLevel;
  tool: ViewerTool;
  onWlDelta: (dCenter: number, dWidth: number) => void;
  zoom: number;
  onZoomChange: (z: number) => void;
  useWebGl: boolean;
  yaw: number;
  pitch: number;
  onYawChange: (v: number) => void;
  onPitchChange: (v: number) => void;
};

const PLANES: { plane: MprPlane; titleKey: MessageKey }[] = [
  { plane: 'axial', titleKey: 'mpr.axial' },
  { plane: 'coronal', titleKey: 'mpr.coronal' },
  { plane: 'sagittal', titleKey: 'mpr.sagittal' },
];

export function MprLayout({
  volume,
  cursor,
  onCursorChange,
  wl,
  tool,
  onWlDelta,
  zoom,
  onZoomChange,
  useWebGl,
  yaw,
  pitch,
  onYawChange,
  onPitchChange,
}: Props) {
  const { t } = useLocale();

  const indices = useMemo(
    () => ({
      axial: Math.round(cursor.z),
      coronal: Math.round(cursor.y),
      sagittal: Math.round(cursor.x),
    }),
    [cursor],
  );

  const slices = useMemo(() => {
    return Object.fromEntries(
      PLANES.map(({ plane }) => [plane, extractMprSlice(volume, plane, indices[plane])]),
    ) as Record<MprPlane, ReturnType<typeof extractMprSlice>>;
  }, [volume, indices]);

  const oblique = useMemo(() => {
    const base = setObliqueCenter(defaultOblique(volume), cursor);
    return rotateOblique(base, yaw, pitch);
  }, [volume, cursor, yaw, pitch]);

  const obliqueSlice = useMemo(() => extractObliqueSlice(volume, oblique), [volume, oblique]);
  const hu = probeVolume(volume, cursor);

  const setPlaneIndex = (plane: MprPlane, index: number) => {
    if (plane === 'axial') onCursorChange({ ...cursor, z: index });
    else if (plane === 'coronal') onCursorChange({ ...cursor, y: index });
    else onCursorChange({ ...cursor, x: index });
  };

  return (
    <div className="mpr">
      {PLANES.map(({ plane, titleKey }) => (
        <div key={plane} className={`mpr__cell mpr__cell--${plane}`}>
          <MprViewport
            label={t(titleKey)}
            plane={plane}
            slice={slices[plane]}
            max={maxIndex(volume, plane)}
            volume={volume}
            cursor={cursor}
            onCursorChange={onCursorChange}
            wl={wl}
            tool={tool}
            zoom={zoom}
            useWebGl={useWebGl}
            onSliceChange={(i) => setPlaneIndex(plane, i)}
            onWlDelta={onWlDelta}
            onZoomChange={onZoomChange}
          />
        </div>
      ))}
      <div className="mpr__cell mpr__cell--oblique">
        <ObliqueViewport
          slice={obliqueSlice}
          wl={wl}
          zoom={zoom}
          useWebGl={useWebGl}
          onWlDelta={onWlDelta}
          onZoomChange={onZoomChange}
          onScroll={(d) => {
            const next = offsetOrigin(oblique, d);
            onCursorChange({
              x: next.origin[0],
              y: next.origin[1],
              z: next.origin[2],
            });
          }}
          tool={tool}
          obliqueLabel={t('mpr.oblique')}
          canvasLabel={t('mpr.canvas')}
          webglLabel={t('viewport.webgl')}
        />
        <div className="mpr__oblique-controls">
          <label title={t('mpr.yaw')}>
            {t('mpr.yaw')}
            <input
              type="range"
              min={-180}
              max={180}
              value={yaw}
              onChange={(e) => onYawChange(Number(e.target.value))}
              title={t('mpr.yaw')}
            />
            <span>{yaw}°</span>
          </label>
          <label title={t('mpr.pitch')}>
            {t('mpr.pitch')}
            <input
              type="range"
              min={-90}
              max={90}
              value={pitch}
              onChange={(e) => onPitchChange(Number(e.target.value))}
              title={t('mpr.pitch')}
            />
            <span>{pitch}°</span>
          </label>
          <p>
            {t('mpr.cursor', {
              x: cursor.x.toFixed(1),
              y: cursor.y.toFixed(1),
              z: cursor.z.toFixed(1),
              hu: hu.toFixed(1),
            })}
          </p>
          <p>
            {t('mpr.volume', {
              dims: volume.dims.join('×'),
              spacing: volume.spacing.map((s) => s.toFixed(2)).join('×'),
            })}
          </p>
        </div>
      </div>
    </div>
  );
}

function ObliqueViewport({
  slice,
  wl,
  zoom,
  useWebGl,
  onWlDelta,
  onZoomChange,
  onScroll,
  tool,
  obliqueLabel,
  canvasLabel,
  webglLabel,
}: {
  slice: ReturnType<typeof extractObliqueSlice>;
  wl: WindowLevel;
  zoom: number;
  useWebGl: boolean;
  onWlDelta: (dC: number, dW: number) => void;
  onZoomChange: (z: number) => void;
  onScroll: (delta: number) => void;
  tool: ViewerTool;
  obliqueLabel: string;
  canvasLabel: string;
  webglLabel: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<WebGlSliceRenderer | null>(null);
  const grayRef = useRef<Uint8ClampedArray | null>(null);
  const dragRef = useRef<{ x: number; y: number; active: boolean } | null>(null);

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

    const paint = () => {
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
        drawOverlays(canvas, {
          width: slice.width,
          height: slice.height,
          zoom,
          panX: 0,
          panY: 0,
          crosshair: { u: (slice.width - 1) / 2, v: (slice.height - 1) / 2 },
        });
      }
    };

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
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
      glRef.current?.destroy();
      glRef.current = null;
    };
  }, [slice, wl, zoom, useWebGl]);

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
