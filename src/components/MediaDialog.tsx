import { useCallback, useEffect, useState } from 'react';
import type { MediaSource } from '../../electron/api';
import { useLocale } from '../i18n/LocaleContext';
import { useErrorLog } from '../errorLog/ErrorLogContext';
import './Modal.css';

type Props = {
  open: boolean;
  onClose: () => void;
  onOpen: (media: MediaSource) => void;
};

export function MediaDialog({ open, onClose, onOpen }: Props) {
  const { t } = useLocale();
  const { reportError } = useErrorLog();
  const [items, setItems] = useState<MediaSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!window.slice) return;
    setLoading(true);
    setError(null);
    try {
      const list = await window.slice.listMedia();
      setItems(list);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      reportError(msg, 'media');
    } finally {
      setLoading(false);
    }
  }, [reportError]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="media-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__head">
          <h2 id="media-title">{t('media.title')}</h2>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void refresh()}>
            {t('media.refresh')}
          </button>
        </div>
        <p className="modal__hint">{t('media.hint')}</p>
        {loading && <p className="modal__status">{t('media.scanning')}</p>}
        {error && <p className="modal__error">{error}</p>}
        {!loading && items.length === 0 && (
          <p className="modal__status">{t('media.empty')}</p>
        )}
        <ul className="modal__list">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="modal__list-item"
                onClick={() => onOpen(item)}
              >
                <span className="modal__list-title">{item.name}</span>
                <span className="modal__list-meta">
                  {item.kind}
                  {item.hasDicom ? ` · ${t('media.hasDicom')}` : ''}
                </span>
                <span className="modal__list-path">{item.path}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t('dialog.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
