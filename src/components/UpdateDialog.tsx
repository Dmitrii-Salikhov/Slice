import { useLocale } from '../i18n/LocaleContext';
import type { UpdateCheckResult } from '../update/checkUpdates';
import './Modal.css';
import './UpdateDialog.css';

type Props = {
  result: Extract<UpdateCheckResult, { status: 'available' }> | null;
  onClose: () => void;
  onOpenRelease: (url: string) => void;
  onDownload: (url: string) => void;
};

export function UpdateDialog({ result, onClose, onOpenRelease, onDownload }: Props) {
  const { t } = useLocale();
  if (!result) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal update-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__head">
          <h2 id="update-title">{t('update.availableTitle')}</h2>
          <button type="button" className="btn btn--ghost btn--icon" onClick={onClose}>
            {t('dialog.close')}
          </button>
        </header>
        <div className="modal__body update-dialog__body">
          <p className="update-dialog__versions">
            {t('update.fromTo', {
              current: result.currentVersion,
              latest: result.latestVersion,
            })}
          </p>
          <h3 className="update-dialog__notes-title">{t('update.changelog')}</h3>
          <pre className="update-dialog__notes">{result.body}</pre>
        </div>
        <footer className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t('update.later')}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => onOpenRelease(result.htmlUrl)}
          >
            {t('update.openRelease')}
          </button>
          {result.downloadUrl && (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => onDownload(result.downloadUrl!)}
            >
              {t('update.download')}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
