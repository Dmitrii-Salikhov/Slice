import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaSource } from '../../electron/api';
import { useLocale } from '../i18n/LocaleContext';
import './Modal.css';
import './LoadStudyDialog.css';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Opens OS dialog; paths are auto-classified (folder / ZIP / DICOM). */
  onBrowseLocal: () => void;
  /** ZIP / DICOM files (needed on Windows where browse is folder-first). */
  onBrowseFiles: () => void;
  onOpenPaths: (paths: string[]) => void;
  onOpenMedia: (media: MediaSource) => void;
  onOpenPacs: () => void;
  busy?: boolean;
};

export function LoadStudyDialog({
  open,
  onClose,
  onBrowseLocal,
  onBrowseFiles,
  onOpenPaths,
  onOpenMedia,
  onOpenPacs,
  busy = false,
}: Props) {
  const { t } = useLocale();
  const [media, setMedia] = useState<MediaSource[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  const refreshMedia = useCallback(async () => {
    if (!window.slice?.listMedia) {
      setMedia([]);
      return;
    }
    setScanning(true);
    setScanError(null);
    try {
      const list = await window.slice.listMedia();
      setMedia(list.filter((m) => m.hasDicom || m.kind === 'optical'));
    } catch (e) {
      setScanError(e instanceof Error ? e.message : String(e));
      setMedia([]);
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void refreshMedia();
  }, [open, refreshMedia]);

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (![...e.dataTransfer.types].includes('Files')) return;
    dragDepth.current += 1;
    setDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setDragging(false);
    if (!window.slice || busy) return;
    const items = e.dataTransfer?.files;
    if (!items?.length) return;
    const paths: string[] = [];
    for (let i = 0; i < items.length; i++) {
      const p = window.slice.getPathForFile(items[i]);
      if (p) paths.push(p);
    }
    if (paths.length) onOpenPaths(paths);
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className={`modal load-study${dragging ? ' load-study--drag' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={t('loadStudy.title')}
        onClick={(e) => e.stopPropagation()}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <header className="modal__header">
          <h2>{t('loadStudy.title')}</h2>
          <button type="button" className="btn btn--ghost btn--icon" onClick={onClose} disabled={busy}>
            ✕
          </button>
        </header>

        <p className="load-study__hint">{t('loadStudy.hint')}</p>

        <button
          type="button"
          className="btn btn--primary load-study__primary"
          onClick={onBrowseLocal}
          disabled={busy}
          title={t('loadStudy.browseTip')}
        >
          {t('loadStudy.browse')}
        </button>
        <button
          type="button"
          className="btn btn--ghost load-study__files"
          onClick={onBrowseFiles}
          disabled={busy}
          title={t('loadStudy.filesTip')}
        >
          {t('loadStudy.files')}
        </button>
        <p className="load-study__drop-hint">{t('loadStudy.dropHint')}</p>

        <div className="load-study__section">
          <div className="load-study__section-head">
            <h3>{t('loadStudy.media')}</h3>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => void refreshMedia()}
              disabled={busy || scanning}
            >
              {scanning ? '…' : t('loadStudy.refresh')}
            </button>
          </div>
          {scanError && <p className="load-study__error">{scanError}</p>}
          {media.length === 0 && !scanning ? (
            <p className="load-study__empty">{t('loadStudy.mediaEmpty')}</p>
          ) : (
            <ul className="load-study__media">
              {media.map((m) => (
                <li key={m.path}>
                  <button
                    type="button"
                    className="btn btn--ghost load-study__media-btn"
                    disabled={busy}
                    onClick={() => onOpenMedia(m)}
                    title={m.path}
                  >
                    <span className="load-study__media-name">{m.name || m.path}</span>
                    <span className="load-study__media-meta">
                      {m.kind}
                      {m.hasDicom ? ' · DICOM' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          className="btn btn--ghost load-study__pacs"
          onClick={onOpenPacs}
          disabled={busy}
          title={t('toolbar.pacsTip')}
        >
          {t('loadStudy.pacs')}
        </button>
      </div>
    </div>
  );
}
