import { useEffect, useMemo, useState } from 'react';
import { parseDicomTagBrowser, type DicomTagRow } from '../dicom/tags';
import { useLocale } from '../i18n/LocaleContext';
import './TagBrowser.css';

type Props = {
  filePath: string | null;
  open: boolean;
  onClose: () => void;
};

export function TagBrowser({ filePath, open, onClose }: Props) {
  const { t } = useLocale();
  const [rows, setRows] = useState<DicomTagRow[]>([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !filePath || !window.slice) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const buf = await window.slice!.readFile(filePath);
        const tags = await parseDicomTagBrowser(buf);
        if (!cancelled) setRows(tags);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, filePath]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.tag.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.value.toLowerCase().includes(q),
    );
  }, [rows, filter]);

  if (!open) return null;

  return (
    <div className="tag-browser" role="dialog" aria-label={t('tags.title')}>
      <div className="tag-browser__header">
        <strong>{t('tags.title')}</strong>
        <input
          className="tag-browser__filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('tags.filter')}
          aria-label={t('tags.filter')}
        />
        <button type="button" className="btn btn--ghost btn--icon" onClick={onClose}>
          {t('dialog.close')}
        </button>
      </div>
      {loading && <p className="tag-browser__status">{t('tags.loading')}</p>}
      {error && <p className="tag-browser__status tag-browser__status--err">{error}</p>}
      {!loading && !error && (
        <div className="tag-browser__table-wrap">
          <table className="tag-browser__table">
            <thead>
              <tr>
                <th>{t('tags.colTag')}</th>
                <th>{t('tags.colName')}</th>
                <th>{t('tags.colVr')}</th>
                <th>{t('tags.colValue')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.tag + r.name}>
                  <td className="tag-browser__mono">{r.tag}</td>
                  <td>{r.name}</td>
                  <td className="tag-browser__mono">{r.vr}</td>
                  <td className="tag-browser__val" title={r.value}>
                    {r.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
