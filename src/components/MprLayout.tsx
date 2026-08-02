import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Annotation,
  MprBasis,
  MprPlane,
  ViewerTool,
  VolumeData,
  WindowLevel,
} from '../dicom/types';
import type { VolumeCursor, ObliquePlane } from '../viewer/crosshair';
import {
  defaultOblique,
  extractObliqueSlice,
  probeVolume,
  rotateOblique,
  setObliqueCenter,
  offsetOrigin,
  clampCursor,
} from '../viewer/crosshair';
import {
  extractMprSlice,
  maxIndex,
  planeIndexFromCursor,
  cursorFromPlaneIndex,
  resolveMprBasis,
} from '../viewer/mpr';
import { hasPatientGeometry } from '../viewer/volumeGeometry';
import { useLocale } from '../i18n/LocaleContext';
import type { MessageKey } from '../i18n/translations';
import { MprViewport } from './MprViewport';
import { ObliqueViewport } from './ObliqueViewport';
import './MprLayout.css';
import './Viewport.css';

export type MprLayoutMode = 'quad' | 'single';

type PlaneIndices = Record<MprPlane, number>;

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
  onWebGlFailed?: () => void;
  yaw: number;
  pitch: number;
  onYawChange: (v: number) => void;
  onPitchChange: (v: number) => void;
  layoutMode: MprLayoutMode;
  onLayoutModeChange: (mode: MprLayoutMode) => void;
  singlePlane: MprPlane;
  onSinglePlaneChange: (plane: MprPlane) => void;
  mprBasis: MprBasis;
  onMprBasisChange: (basis: MprBasis) => void;
  measures: Annotation[];
  onMeasuresChange: (m: Annotation[]) => void;
  selectedAnnotationId?: string | null;
  onSelectAnnotation?: (id: string | null) => void;
  onClearMeasures?: () => void;
  onPlaneFocus?: (plane: MprPlane) => void;
};

const PLANES: { plane: MprPlane; titleKey: MessageKey }[] = [
  { plane: 'axial', titleKey: 'mpr.axial' },
  { plane: 'coronal', titleKey: 'mpr.coronal' },
  { plane: 'sagittal', titleKey: 'mpr.sagittal' },
];

const OBLIQUE_MAX = 256;

function downscaleObliquePlane(plane: ObliquePlane): ObliquePlane {
  const maxDim = Math.max(plane.width, plane.height);
  if (maxDim <= OBLIQUE_MAX) return plane;
  const scale = OBLIQUE_MAX / maxDim;
  return {
    ...plane,
    width: Math.max(32, Math.round(plane.width * scale)),
    height: Math.max(32, Math.round(plane.height * scale)),
  };
}

function indicesFromCursor(
  volume: VolumeData,
  cursor: VolumeCursor,
  basis: MprBasis,
): PlaneIndices {
  return {
    axial: planeIndexFromCursor(volume, 'axial', cursor, basis),
    coronal: planeIndexFromCursor(volume, 'coronal', cursor, basis),
    sagittal: planeIndexFromCursor(volume, 'sagittal', cursor, basis),
  };
}

function clampPlaneIndex(
  volume: VolumeData,
  plane: MprPlane,
  index: number,
  basis: MprBasis,
) {
  return Math.min(maxIndex(volume, plane, basis), Math.max(0, index));
}

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
  onWebGlFailed,
  yaw,
  pitch,
  onYawChange,
  onPitchChange,
  layoutMode,
  onLayoutModeChange,
  singlePlane,
  onSinglePlaneChange,
  mprBasis,
  onMprBasisChange,
  measures,
  onMeasuresChange,
  selectedAnnotationId = null,
  onSelectAnnotation,
  onClearMeasures,
  onPlaneFocus,
}: Props) {
  const { t } = useLocale();
  const [syncScroll, setSyncScroll] = useState(false);
  const basis = resolveMprBasis(volume, mprBasis);
  const canPatient = hasPatientGeometry(volume);

  // Display indices are explicit — never re-derived after scroll (avoids patient↔voxel jumps).
  const [planeIndices, setPlaneIndices] = useState<PlaneIndices>(() =>
    indicesFromCursor(volume, cursor, basis),
  );
  const planeIndicesRef = useRef(planeIndices);
  planeIndicesRef.current = planeIndices;
  const cursorRef = useRef(cursor);

  useEffect(() => {
    setPlaneIndices(indicesFromCursor(volume, cursorRef.current, basis));
  }, [volume, basis]);

  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

  const axialSlice = useMemo(
    () => extractMprSlice(volume, 'axial', planeIndices.axial, basis),
    [volume, planeIndices.axial, basis],
  );
  const coronalSlice = useMemo(
    () => extractMprSlice(volume, 'coronal', planeIndices.coronal, basis),
    [volume, planeIndices.coronal, basis],
  );
  const sagittalSlice = useMemo(
    () => extractMprSlice(volume, 'sagittal', planeIndices.sagittal, basis),
    [volume, planeIndices.sagittal, basis],
  );

  const slices = useMemo(
    () => ({
      axial: axialSlice,
      coronal: coronalSlice,
      sagittal: sagittalSlice,
    }),
    [axialSlice, coronalSlice, sagittalSlice],
  );

  const deferredYaw = useDeferredValue(yaw);
  const deferredPitch = useDeferredValue(pitch);
  const deferredCursor = useDeferredValue(cursor);

  const oblique = useMemo(() => {
    const base = setObliqueCenter(defaultOblique(volume), deferredCursor);
    return downscaleObliquePlane(rotateOblique(base, deferredYaw, deferredPitch));
  }, [volume, deferredCursor, deferredYaw, deferredPitch]);

  const obliqueSlice = useMemo(
    () => (layoutMode === 'quad' ? extractObliqueSlice(volume, oblique) : null),
    [layoutMode, volume, oblique],
  );

  const hu = probeVolume(volume, cursor);

  const publishCursor = (next: VolumeCursor) => {
    cursorRef.current = next;
    onCursorChange(next);
  };

  /** Crosshair / oblique: move 3D cursor; keep each plane's slice index stable except the focused one. */
  const handleCursorChange = (c: VolumeCursor, focusedPlane?: MprPlane) => {
    const next = clampCursor(c, volume);
    const derived = indicesFromCursor(volume, next, basis);
    setPlaneIndices((prev) => {
      // Crosshair in one pane should not replace other panes' scroll positions
      // with unstable patient↔voxel round-trips (that looked like "coronal in axial").
      const merged: PlaneIndices = focusedPlane
        ? {
            axial: focusedPlane === 'axial' ? derived.axial : prev.axial,
            coronal: focusedPlane === 'coronal' ? derived.coronal : prev.coronal,
            sagittal: focusedPlane === 'sagittal' ? derived.sagittal : prev.sagittal,
          }
        : derived;
      planeIndicesRef.current = merged;
      return merged;
    });
    publishCursor(next);
  };

  const setPlaneIndex = (plane: MprPlane, index: number) => {
    const zi = clampPlaneIndex(volume, plane, index, basis);

    if (!syncScroll || layoutMode !== 'quad') {
      const nextCursor = clampCursor(
        cursorFromPlaneIndex(volume, plane, zi, cursorRef.current, basis),
        volume,
      );
      // Only the scrolled plane changes slice; others stay put (no derived jump).
      setPlaneIndices((prev) => {
        const next = { ...prev, [plane]: zi };
        planeIndicesRef.current = next;
        return next;
      });
      publishCursor(nextCursor);
      return;
    }

    const prev = planeIndicesRef.current;
    const delta = zi - prev[plane];
    if (delta === 0) return;
    const nextIndices: PlaneIndices = {
      axial: clampPlaneIndex(volume, 'axial', prev.axial + delta, basis),
      coronal: clampPlaneIndex(volume, 'coronal', prev.coronal + delta, basis),
      sagittal: clampPlaneIndex(volume, 'sagittal', prev.sagittal + delta, basis),
    };
    planeIndicesRef.current = nextIndices;
    setPlaneIndices(nextIndices);
    const c = cursorRef.current;
    publishCursor(
      clampCursor(
        {
          x: c.x + delta,
          y: c.y + delta,
          z: c.z + delta,
        },
        volume,
      ),
    );
  };

  const renderViewport = (plane: MprPlane, titleKey: MessageKey) => (
    <MprViewport
      key={plane}
      label={t(titleKey)}
      plane={plane}
      slice={slices[plane]}
      max={maxIndex(volume, plane, basis)}
      volume={volume}
      cursor={cursor}
      onCursorChange={(c) => handleCursorChange(c, plane)}
      wl={wl}
      tool={tool}
      zoom={zoom}
      useWebGl={useWebGl}
      onWebGlFailed={onWebGlFailed}
      onSliceChange={(i) => setPlaneIndex(plane, i)}
      onWlDelta={onWlDelta}
      onZoomChange={onZoomChange}
      mprBasis={basis}
      measures={measures}
      onMeasuresChange={onMeasuresChange}
      selectedAnnotationId={selectedAnnotationId}
      onSelectAnnotation={onSelectAnnotation}
      onClearMeasures={onClearMeasures}
      onFocus={() => onPlaneFocus?.(plane)}
    />
  );

  return (
    <div className={`mpr-root${layoutMode === 'single' ? ' mpr-root--single' : ''}`}>
      <div className="mpr__toolbar">
        <div className="mpr__layout-toggle" role="group" aria-label={t('mpr.layout')}>
          <button
            type="button"
            className={`btn btn--ghost btn--sm${layoutMode === 'single' ? ' btn--active' : ''}`}
            onClick={() => onLayoutModeChange('single')}
            title={t('mpr.layoutSingleTip')}
          >
            {t('mpr.layoutSingle')}
          </button>
          <button
            type="button"
            className={`btn btn--ghost btn--sm${layoutMode === 'quad' ? ' btn--active' : ''}`}
            onClick={() => onLayoutModeChange('quad')}
            title={t('mpr.layoutQuadTip')}
          >
            {t('mpr.layoutQuad')}
          </button>
        </div>

        <div className="mpr__layout-toggle" role="group" aria-label={t('mpr.basis')}>
          <button
            type="button"
            className={`btn btn--ghost btn--sm${basis === 'patient' ? ' btn--active' : ''}`}
            onClick={() => onMprBasisChange('patient')}
            disabled={!canPatient}
            title={
              canPatient ? t('mpr.basisPatientTip') : t('mpr.basisPatientUnavailable')
            }
          >
            {t('mpr.basisPatient')}
          </button>
          <button
            type="button"
            className={`btn btn--ghost btn--sm${basis === 'stack' ? ' btn--active' : ''}`}
            onClick={() => onMprBasisChange('stack')}
            title={t('mpr.basisStackTip')}
          >
            {t('mpr.basisStack')}
          </button>
        </div>

        {layoutMode === 'quad' && (
          <button
            type="button"
            className={`btn btn--ghost btn--sm${syncScroll ? ' btn--active' : ''}`}
            onClick={() => setSyncScroll((v) => !v)}
            title={t('mpr.syncScrollTip')}
            aria-pressed={syncScroll}
          >
            {t('mpr.syncScroll')}
          </button>
        )}

        {layoutMode === 'single' && (
          <div className="mpr__plane-toggle" role="group" aria-label={t('mpr.plane')}>
            {PLANES.map(({ plane, titleKey }) => (
              <button
                key={plane}
                type="button"
                className={`btn btn--ghost btn--sm${singlePlane === plane ? ' btn--active' : ''}`}
                onClick={() => onSinglePlaneChange(plane)}
                title={t(titleKey)}
              >
                {t(titleKey)}
              </button>
            ))}
          </div>
        )}

        <p className="mpr__status">
          {t('mpr.cursor', {
            x: cursor.x.toFixed(1),
            y: cursor.y.toFixed(1),
            z: cursor.z.toFixed(1),
            hu: hu.toFixed(1),
          })}
        </p>
      </div>

      {layoutMode === 'single' ? (
        <div className="mpr mpr--single">
          {renderViewport(
            singlePlane,
            PLANES.find((p) => p.plane === singlePlane)?.titleKey ?? 'mpr.axial',
          )}
        </div>
      ) : (
        <div className="mpr">
          {PLANES.map(({ plane, titleKey }) => (
            <div key={plane} className={`mpr__cell mpr__cell--${plane}`}>
              {renderViewport(plane, titleKey)}
            </div>
          ))}
          <div className="mpr__cell mpr__cell--oblique">
            {obliqueSlice && (
              <ObliqueViewport
                slice={obliqueSlice}
                wl={wl}
                zoom={zoom}
                useWebGl={useWebGl}
                onWebGlFailed={onWebGlFailed}
                onWlDelta={onWlDelta}
                onZoomChange={onZoomChange}
                onScroll={(d) => {
                  const next = offsetOrigin(oblique, d);
                  handleCursorChange({
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
            )}
            <div className="mpr__oblique-controls">
              <label title={t('mpr.yaw')}>
                {t('mpr.yaw')}
                <input
                  type="range"
                  min={-180}
                  max={180}
                  value={yaw}
                  onChange={(e) => onYawChange(Number(e.target.value))}
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
                />
                <span>{pitch}°</span>
              </label>
              <p>
                {t('mpr.volume', {
                  dims: volume.dims.join('×'),
                  spacing: volume.spacing.map((s) => s.toFixed(2)).join('×'),
                })}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
