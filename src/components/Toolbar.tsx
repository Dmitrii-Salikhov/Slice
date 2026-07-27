import { useLocale } from '../i18n/LocaleContext';
import './Toolbar.css';

type ViewMode = 'single' | 'mpr' | 'compare';

type Props = {
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  mprAvailable: boolean;
  compareAvailable: boolean;
  onOpenFolder: () => void;
  onOpenFiles?: () => void;
  onOpenZip: () => void;
  onOpenMedia: () => void;
  onOpenPacs: () => void;
  canOpen: boolean;
  canExport: boolean;
  onExportJpeg: () => void;
  onExportPng: () => void;
  onExportDicomAnon: () => void;
  onExportSeriesAnon: () => void;
  canCancelLoad?: boolean;
  onCancelLoad?: () => void;
  onCheckUpdates?: () => void;
  checkingUpdates?: boolean;
};

export function Toolbar({
  viewMode,
  onViewModeChange,
  mprAvailable,
  compareAvailable,
  onOpenFolder,
  onOpenFiles,
  onOpenZip,
  onOpenMedia,
  onOpenPacs,
  canOpen,
  canExport,
  onExportJpeg,
  onExportPng,
  onExportDicomAnon,
  onExportSeriesAnon,
  canCancelLoad = false,
  onCancelLoad,
  onCheckUpdates,
  checkingUpdates = false,
}: Props) {
  const { t, locale, toggleLocale } = useLocale();

  return (
    <div className="toolbar toolbar--header">
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
