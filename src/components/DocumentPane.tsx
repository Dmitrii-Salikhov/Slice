import { useEffect, useMemo } from 'react';
import type { DicomDocument } from '../dicom/documents';
import { useLocale } from '../i18n/LocaleContext';
import './DocumentPane.css';

type Props = {
  document: DicomDocument;
  onOpenExternal?: () => void;
};

export function DocumentPane({ document, onOpenExternal }: Props) {
  const { t } = useLocale();

  const pdfUrl = useMemo(() => {
    if (document.kind !== 'pdf' || !document.pdfBytes || document.pdfBytes.length === 0) {
      return null;
    }
    const blob = new Blob([document.pdfBytes.slice()], {
      type: document.mimeType || 'application/pdf',
    });
    return URL.createObjectURL(blob);
  }, [document.kind, document.pdfBytes, document.mimeType]);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  const title =
    document.kind === 'pdf'
      ? t('document.pdf')
      : document.kind === 'sr'
        ? t('document.sr')
        : document.label || document.modality || 'Document';

  return (
    <div className="document-pane">
      <header className="document-pane__header">
        <div className="document-pane__meta">
          <span className="document-pane__kind">{title}</span>
          <span className="document-pane__label" title={document.label}>
            {document.label || document.seriesDescription || document.filePath}
          </span>
        </div>
        {onOpenExternal && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onOpenExternal}
            title={t('document.openExternal')}
          >
            {t('document.openExternal')}
          </button>
        )}
      </header>

      <div className="document-pane__body">
        {document.kind === 'pdf' && pdfUrl ? (
          <iframe
            className="document-pane__pdf"
            title={document.label || t('document.pdf')}
            src={pdfUrl}
          />
        ) : document.kind === 'sr' ? (
          <pre className="document-pane__sr">{document.text || ''}</pre>
        ) : (
          <pre className="document-pane__sr">
            {document.text || document.label || document.filePath}
          </pre>
        )}
      </div>
    </div>
  );
}
