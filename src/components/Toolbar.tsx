import type { ViewerTool, WindowLevel } from '../dicom/types';
import { useLocale } from '../i18n/LocaleContext';
import type { MessageKey } from '../i18n/translations';
import './Toolbar.css';

type ViewMode = 'single' | 'mpr' | 'compare';

type Props = {
  tool: ViewerTool;
  onToolChange: (t: ViewerTool) => void;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  mprAvailable: boolean;
  compareAvailable: boolean;
  syncScroll: boolean;
  onSyncScrollChange: (v: boolean) => void;
  syncWl: boolean;
  onSyncWlChange: (v: boolean) => void;
  syncZoom: boolean;
  onSyncZoomChange: (v: boolean) => void;
  wl: WindowLevel;
  onWlChange: (wl: WindowLevel) => void;
  onPreset: (name: string) => void;
  onOpenFolder: () => void;
  onOpenFiles?: () => void;
  onOpenZip: () => void;
  onOpenMedia: () => void;
  onOpenPacs: () => void;
  onToggleTags?: () => void;
  tagsOpen?: boolean;
  canOpen: boolean;
  canExport: boolean;
  invert?: boolean;
  onInvertChange?: (v: boolean) => void;
  flipH?: boolean;
  onFlipHChange?: (v: boolean) => void;
  flipV?: boolean;
  onFlipVChange?: (v: boolean) => void;
  onExportJpeg: () => void;
  onExportPng: () => void;
  onExportDicomAnon: () => void;
  onExportSeriesAnon: () => void;
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
  canCancelLoad?: boolean;
  onCancelLoad?: () => void;
  onCheckUpdates?: () => void;
  checkingUpdates?: boolean;
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
  labelKey: MessageKey;
  tipKey: MessageKey;
}[] = [
  { key: 'soft', short: 'ST', labelKey: 'toolbar.presetSoft', tipKey: 'toolbar.presetSoftTip' },
  { key: 'lung', short: 'LG', labelKey: 'toolbar.presetLung', tipKey: 'toolbar.presetLungTip' },
  { key: 'bone', short: 'BN', labelKey: 'toolbar.presetBone', tipKey: 'toolbar.presetBoneTip' },
  { key: 'brain', short: 'BR', labelKey: 'toolbar.presetBrain', tipKey: 'toolbar.presetBrainTip' },
  {
    key: 'abdomen',
    short: 'AB',
    labelKey: 'toolbar.presetAbdomen',
    tipKey: 'toolbar.presetAbdomenTip',
  },
];

export function Toolbar({
  tool,
  onToolChange,
  viewMode,
  onViewModeChange,
  mprAvailable,
  compareAvailable,
  syncScroll,
  onSyncScrollChange,
  syncWl,
  onSyncWlChange,
  syncZoom,
  onSyncZoomChange,
  wl,
  onWlChange,
  onPreset,
  onOpenFolder,
  onOpenFiles,
  onOpenZip,
  onOpenMedia,
  onOpenPacs,
  onToggleTags,
  tagsOpen = false,
  canOpen,
  canExport,
  invert = false,
  onInvertChange,
  flipH = false,
  onFlipHChange,
  flipV = false,
  onFlipVChange,
  onExportJpeg,
  onExportPng,
  onExportDicomAnon,
  onExportSeriesAnon,
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
  canCancelLoad = false,
  onCancelLoad,
  onCheckUpdates,
  checkingUpdates = false,
}: Props) {
  const { t, locale, toggleLocale } = useLocale();

  return (
    <div className="toolbar">
      <div className="toolbar__group" role="group" aria-label={t('toolbar.openFolder')}>
        <button
          type="button"
          className="btn btn--primary btn--icon"
          onClick={onOpenFolder}
          disabled={!canOpen}
          title={`${t('toolbar.openFolderTip')} (Ctrl+O)`}
        >
          <span className="btn__label">{t('toolbar.openFolderShort')}</span>
        </button>
        {onOpenFiles && (
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            onClick={onOpenFiles}
            disabled={!canOpen}
            title={`${t('toolbar.openFilesTip')} (Ctrl+Shift+O)`}
          >
            <span className="btn__label">{t('toolbar.openFilesShort')}</span>
          </button>
        )}
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={onOpenZip}
          disabled={!canOpen}
          title={t('toolbar.openZipTip')}
        >
          <span className="btn__label">{t('toolbar.openZip')}</span>
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={onOpenMedia}
          disabled={!canOpen}
          title={t('toolbar.openMediaTip')}
        >
          <span className="btn__label">{t('toolbar.openMedia')}</span>
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={onOpenPacs}
          disabled={!canOpen}
          title={t('toolbar.pacsTip')}
        >
          <span className="btn__label">{t('toolbar.pacs')}</span>
        </button>
      </div>

      <div className="toolbar__group" role="group" aria-label={t('toolbar.export')}>
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={onExportJpeg}
          disabled={!canExport}
          title={`${t('toolbar.exportJpegTip')} (Ctrl+E)`}
        >
          JPG
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={onExportPng}
          disabled={!canExport}
          title={t('toolbar.exportPngTip')}
        >
          PNG
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={onExportDicomAnon}
          disabled={!canExport}
          title={t('toolbar.exportDicomTip')}
        >
          {t('toolbar.exportDicom')}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={onExportSeriesAnon}
          disabled={!canExport}
          title={t('toolbar.exportSeriesTip')}
        >
          {t('toolbar.exportSeries')}
        </button>
      </div>

      <div className="toolbar__group" role="group" aria-label={t('toolbar.tools')}>
        {TOOLS.map((item) => {
          const disabled = item.id === 'crosshair' && viewMode !== 'mpr';
          const tip =
            disabled && item.disabledTipKey
              ? t(item.disabledTipKey)
              : `${t(item.tipKey)}`;
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

      <div className="toolbar__group" role="group" aria-label={t('toolbar.viewMode')}>
        <button
          type="button"
          className={`btn btn--ghost btn--icon${viewMode === 'single' ? ' btn--active' : ''}`}
          onClick={() => onViewModeChange('single')}
          title={t('toolbar.stackTip')}
        >
          {t('toolbar.stack')}
        </button>
        <button
          type="button"
          className={`btn btn--ghost btn--icon${viewMode === 'compare' ? ' btn--active' : ''}`}
          onClick={() => onViewModeChange('compare')}
          disabled={!compareAvailable}
          title={
            compareAvailable ? t('toolbar.compareTip') : t('toolbar.compareDisabledTip')
          }
        >
          {t('toolbar.compare')}
        </button>
        <button
          type="button"
          className={`btn btn--ghost btn--icon${viewMode === 'mpr' ? ' btn--active' : ''}`}
          onClick={() => onViewModeChange('mpr')}
          disabled={!mprAvailable}
          title={mprAvailable ? t('toolbar.mprTip') : t('toolbar.mprDisabledTip')}
        >
          {t('toolbar.mpr')}
        </button>
      </div>

      {viewMode === 'compare' && (
        <div className="toolbar__group" role="group" aria-label={t('compare.sync')}>
          <label className="toolbar__check" title={t('compare.syncScrollTip')}>
            <input
              type="checkbox"
              checked={syncScroll}
              onChange={(e) => onSyncScrollChange(e.target.checked)}
            />
            {t('compare.syncScroll')}
          </label>
          <label className="toolbar__check" title={t('compare.syncWlTip')}>
            <input
              type="checkbox"
              checked={syncWl}
              onChange={(e) => onSyncWlChange(e.target.checked)}
            />
            {t('compare.syncWl')}
          </label>
          <label className="toolbar__check" title={t('compare.syncZoomTip')}>
            <input
              type="checkbox"
              checked={syncZoom}
              onChange={(e) => onSyncZoomChange(e.target.checked)}
            />
            {t('compare.syncZoom')}
          </label>
        </div>
      )}

      <div className="toolbar__wl">
        <label title={t('toolbar.windowTip')}>
          W
          <input
            type="number"
            value={Math.round(wl.windowWidth)}
            onChange={(e) =>
              onWlChange({ ...wl, windowWidth: Math.max(1, Number(e.target.value) || 1) })
            }
            title={t('toolbar.windowTip')}
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
            title={t('toolbar.levelTip')}
          />
        </label>
      </div>

      <div className="toolbar__group toolbar__presets">
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

      <div className="toolbar__group" role="group" aria-label={t('toolbar.display')}>
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

      <label className="toolbar__check" title={t('toolbar.webglTip')}>
        <input
          type="checkbox"
          checked={useWebGl}
          onChange={(e) => onUseWebGlChange(e.target.checked)}
          title={t('toolbar.webglTip')}
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

      {onCineToggle && (
        <div className="toolbar__group" role="group" aria-label={t('toolbar.cine')}>
          <button
            type="button"
            className={`btn btn--ghost btn--icon${cinePlaying ? ' btn--active' : ''}`}
            onClick={onCineToggle}
            title={`${t('toolbar.cineTip')} (Space)`}
          >
            {cinePlaying ? '❚❚' : '▶'}
          </button>
          {onCineFpsChange && (
            <label className="toolbar__check" title={t('toolbar.cineFpsTip')}>
              fps
              <input
                type="number"
                min={1}
                max={60}
                value={cineFps}
                onChange={(e) =>
                  onCineFpsChange(Math.min(60, Math.max(1, Number(e.target.value) || 1)))
                }
                style={{ width: 40 }}
              />
            </label>
          )}
        </div>
      )}

      {canCancelLoad && onCancelLoad && (
        <button
          type="button"
          className="btn btn--ghost btn--icon btn--danger"
          onClick={onCancelLoad}
          title={t('toolbar.cancelLoadTip')}
        >
          {t('toolbar.cancelLoad')}
        </button>
      )}

      {onCheckUpdates && (
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={onCheckUpdates}
          disabled={checkingUpdates}
          title={t('toolbar.checkUpdatesTip')}
        >
          {checkingUpdates ? '…' : '↻'}
        </button>
      )}

      <button
        type="button"
        className="btn btn--ghost btn--lang"
        onClick={toggleLocale}
        title={t('toolbar.langTip')}
        aria-label={t('toolbar.langTip')}
      >
        {locale === 'ru' ? 'RU' : 'EN'}
      </button>
    </div>
  );
}
