import { useDeferredValue, useMemo } from 'react';
import type { MprBasis, MprPlane, ViewerTool, VolumeData, WindowLevel } from '../dicom/types';
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
}: Props) {
  const { t } = useLocale();
  const deferredYaw = useDeferredValue(yaw);
  const deferredPitch = useDeferredValue(pitch);
  const deferredCursor = useDeferredValue(cursor);
  const basis = resolveMprBasis(volume, mprBasis);
  const canPatient = hasPatientGeometry(volume);

  const axialIndex = planeIndexFromCursor(volume, 'axial', cursor, basis);
  const coronalIndex = planeIndexFromCursor(volume, 'coronal', cursor, basis);
  const sagittalIndex = planeIndexFromCursor(volume, 'sagittal', cursor, basis);

  const axialSlice = useMemo(
    () => extractMprSlice(volume, 'axial', axialIndex, basis),
    [volume, axialIndex, basis],
  );
  const coronalSlice = useMemo(
    () => extractMprSlice(volume, 'coronal', coronalIndex, basis),
    [volume, coronalIndex, basis],
  );
  const sagittalSlice = useMemo(
    () => extractMprSlice(volume, 'sagittal', sagittalIndex, basis),
    [volume, sagittalIndex, basis],
  );

  const slices = useMemo(
    () => ({
      axial: axialSlice,
      coronal: coronalSlice,
      sagittal: sagittalSlice,
    }),
    [axialSlice, coronalSlice, sagittalSlice],
  );

  const oblique = useMemo(() => {
    const base = setObliqueCenter(defaultOblique(volume), deferredCursor);
    return downscaleObliquePlane(rotateOblique(base, deferredYaw, deferredPitch));
  }, [volume, deferredCursor, deferredYaw, deferredPitch]);

  const obliqueSlice = useMemo(
    () => (layoutMode === 'quad' ? extractObliqueSlice(volume, oblique) : null),
    [layoutMode, volume, oblique],
  );

  const hu = probeVolume(volume, cursor);

  const setPlaneIndex = (plane: MprPlane, index: number) => {
    onCursorChange(
      clampCursor(cursorFromPlaneIndex(volume, plane, index, cursor, basis), volume),
    );
  };

  const renderViewport = (plane: MprPlane, titleKey: MessageKey) => (
    <MprViewport
      label={t(titleKey)}
      plane={plane}
      slice={slices[plane]}
      max={maxIndex(volume, plane, basis)}
      volume={volume}
      cursor={cursor}
      onCursorChange={onCursorChange}
      wl={wl}
      tool={tool}
      zoom={zoom}
      useWebGl={useWebGl}
      onWebGlFailed={onWebGlFailed}
      onSliceChange={(i) => setPlaneIndex(plane, i)}
      onWlDelta={onWlDelta}
      onZoomChange={onZoomChange}
      mprBasis={basis}
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
