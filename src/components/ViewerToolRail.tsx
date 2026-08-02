import type { ViewerTool, WindowLevel } from '../dicom/types';
import { useLocale } from '../i18n/LocaleContext';
import type { MessageKey } from '../i18n/translations';
import './ViewerToolRail.css';

type ViewMode = 'single' | 'mpr' | 'compare';

type Props = {
  tool: ViewerTool;
  onToolChange: (t: ViewerTool) => void;
  viewMode: ViewMode;
  wl: WindowLevel;
  onWlChange: (wl: WindowLevel) => void;
  onPreset: (name: string) => void;
  onToggleTags?: () => void;
  tagsOpen?: boolean;
  invert?: boolean;
  onInvertChange?: (v: boolean) => void;
  flipH?: boolean;
  onFlipHChange?: (v: boolean) => void;
  flipV?: boolean;
  onFlipVChange?: (v: boolean) => void;
  zoom: number;
  onZoomReset: () => void;
  useWebGl: boolean;
  onUseWebGlChange: (v: boolean) => void;
  onClearMeasures: () => void;
  canSaveAnnotations?: boolean;
  onSaveAnnotations?: () => void;
  onLoadAnnotations?: () => void;
  cinePlaying?: boolean;
  onCineToggle?: () => void;
  cineFps?: number;
  onCineFpsChange?: (fps: number) => void;
};

const TOOLS: {
  id: ViewerTool;
  glyph: string;
  labelKey: MessageKey;
  tipKey: MessageKey;
  disabledTipKey?: MessageKey;
}[] = [
  { id: 'scroll', glyph: '↕', labelKey: 'toolbar.scroll', tipKey: 'toolbar.scrollTip' },
  { id: 'wl', glyph: '◐', labelKey: 'toolbar.wl', tipKey: 'toolbar.wlTip' },
  { id: 'zoom', glyph: '＋', labelKey: 'toolbar.zoom', tipKey: 'toolbar.zoomTip' },
  { id: 'pan', glyph: '✥', labelKey: 'toolbar.pan', tipKey: 'toolbar.panTip' },
  {
    id: 'crosshair',
    glyph: '✛',
    labelKey: 'toolbar.crosshair',
    tipKey: 'toolbar.crosshairTip',
    disabledTipKey: 'toolbar.crosshairDisabledTip',
  },
  { id: 'length', glyph: '╱', labelKey: 'toolbar.length', tipKey: 'toolbar.lengthTip' },
  { id: 'angle', glyph: '∠', labelKey: 'toolbar.angle', tipKey: 'toolbar.angleTip' },
  { id: 'roi', glyph: '⬭', labelKey: 'toolbar.roi', tipKey: 'toolbar.roiTip' },
  { id: 'arrow', glyph: '→', labelKey: 'toolbar.arrow', tipKey: 'toolbar.arrowTip' },
  { id: 'probe', glyph: '·', labelKey: 'toolbar.probe', tipKey: 'toolbar.probeTip' },
];

const PRESETS: {
  key: string;
  short: string;
  tipKey: MessageKey;
}[] = [
  { key: 'soft', short: 'ST', tipKey: 'toolbar.presetSoftTip' },
  { key: 'lung', short: 'LG', tipKey: 'toolbar.presetLungTip' },
  { key: 'bone', short: 'BN', tipKey: 'toolbar.presetBoneTip' },
  { key: 'brain', short: 'BR', tipKey: 'toolbar.presetBrainTip' },
  { key: 'abdomen', short: 'AB', tipKey: 'toolbar.presetAbdomenTip' },
];

export function ViewerToolRail({
  tool,
  onToolChange,
  viewMode,
  wl,
  onWlChange,
  onPreset,
  onToggleTags,
  tagsOpen = false,
  invert = false,
  onInvertChange,
  flipH = false,
  onFlipHChange,
  flipV = false,
  onFlipVChange,
  zoom,
  onZoomReset,
  useWebGl,
  onUseWebGlChange,
  onClearMeasures,
  canSaveAnnotations = false,
  onSaveAnnotations,
  onLoadAnnotations,
  cinePlaying = false,
  onCineToggle,
  cineFps = 10,
  onCineFpsChange,
}: Props) {
  const { t } = useLocale();

  return (
    <aside className="viewer-rail" aria-label={t('toolbar.tools')}>
      <div className="viewer-rail__section" role="group" aria-label={t('toolbar.tools')}>
        {TOOLS.map((item) => {
          const disabled = item.id === 'crosshair' && viewMode !== 'mpr';
          const tip =
            disabled && item.disabledTipKey ? t(item.disabledTipKey) : t(item.tipKey);
          return (
            <button
              key={item.id}
              type="button"
              className={`btn btn--ghost btn--tool${tool === item.id ? ' btn--active' : ''}`}
              onClick={() => onToolChange(item.id)}
              disabled={disabled}
              title={tip}
              aria-label={t(item.labelKey)}
            >
              <span className="btn__glyph" aria-hidden>
                {item.glyph}
              </span>
            </button>
          );
        })}
      </div>

      <div className="viewer-rail__section viewer-rail__wl">
        <label title={t('toolbar.windowTip')}>
          W
          <input
            type="number"
            value={Math.round(wl.windowWidth)}
            onChange={(e) =>
              onWlChange({ ...wl, windowWidth: Math.max(1, Number(e.target.value) || 1) })
            }
          />
        </label>
        <label title={t('toolbar.levelTip')}>
          L
          <input
            type="number"
            value={Math.round(wl.windowCenter)}
            onChange={(e) =>
              onWlChange({ ...wl, windowCenter: Number(e.target.value) || 0 })
            }
          />
        </label>
      </div>

      <div className="viewer-rail__section viewer-rail__presets">
        {PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            className="btn btn--ghost btn--icon"
            onClick={() => onPreset(preset.key)}
            title={t(preset.tipKey)}
          >
            {preset.short}
          </button>
        ))}
      </div>

      <div className="viewer-rail__section">
        {onInvertChange && (
          <button
            type="button"
            className={`btn btn--ghost btn--icon${invert ? ' btn--active' : ''}`}
            onClick={() => onInvertChange(!invert)}
            title={t('toolbar.invertTip')}
          >
            {t('toolbar.invert')}
          </button>
        )}
        {onFlipHChange && (
          <button
            type="button"
            className={`btn btn--ghost btn--icon${flipH ? ' btn--active' : ''}`}
            onClick={() => onFlipHChange(!flipH)}
            title={t('toolbar.flipHTip')}
          >
            {t('toolbar.flipH')}
          </button>
        )}
        {onFlipVChange && (
          <button
            type="button"
            className={`btn btn--ghost btn--icon${flipV ? ' btn--active' : ''}`}
            onClick={() => onFlipVChange(!flipV)}
            title={t('toolbar.flipVTip')}
          >
            {t('toolbar.flipV')}
          </button>
        )}
        {onToggleTags && (
          <button
            type="button"
            className={`btn btn--ghost btn--icon${tagsOpen ? ' btn--active' : ''}`}
            onClick={onToggleTags}
            title={t('toolbar.tagsTip')}
          >
            {t('toolbar.tags')}
          </button>
        )}
      </div>

      <div className="viewer-rail__section">
        <label className="viewer-rail__check" title={t('toolbar.webglTip')}>
          <input
            type="checkbox"
            checked={useWebGl}
            onChange={(e) => onUseWebGlChange(e.target.checked)}
          />
          GL
        </label>
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={onZoomReset}
          title={t('toolbar.zoomResetTip')}
          aria-label={t('toolbar.zoomReset')}
        >
          {zoom.toFixed(1)}×
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={onClearMeasures}
          title={t('toolbar.clearMeasuresTip')}
        >
          ⌫
        </button>
      </div>

      {(onSaveAnnotations || onLoadAnnotations) && (
        <div className="viewer-rail__section">
          {onSaveAnnotations && (
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              onClick={onSaveAnnotations}
              disabled={!canSaveAnnotations}
              title={t('toolbar.saveAnnotationsTip')}
            >
              {t('toolbar.saveAnnotationsShort')}
            </button>
          )}
          {onLoadAnnotations && (
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              onClick={onLoadAnnotations}
              disabled={!canSaveAnnotations}
              title={t('toolbar.loadAnnotationsTip')}
            >
              {t('toolbar.loadAnnotationsShort')}
            </button>
          )}
        </div>
      )}

      {onCineToggle && viewMode === 'single' && (
        <div className="viewer-rail__section">
          <button
            type="button"
            className={`btn btn--ghost btn--icon${cinePlaying ? ' btn--active' : ''}`}
            onClick={onCineToggle}
            title={`${t('toolbar.cineTip')} (Space)`}
          >
            {cinePlaying ? '❚❚' : '▶'}
          </button>
          {onCineFpsChange && (
            <label className="viewer-rail__check" title={t('toolbar.cineFpsTip')}>
              fps
              <input
                type="number"
                min={1}
                max={60}
                value={cineFps}
                onChange={(e) =>
                  onCineFpsChange(Math.min(60, Math.max(1, Number(e.target.value) || 1)))
                }
              />
            </label>
          )}
        </div>
      )}
    </aside>
  );
}
