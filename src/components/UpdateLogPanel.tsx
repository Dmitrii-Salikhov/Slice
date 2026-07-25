import { useEffect, useRef } from 'react';
import { formatErrorTimestamp } from '../errorLog/store';
import { useLocale } from '../i18n/LocaleContext';
import { useUpdateLog } from '../update/UpdateLogContext';
import '../components/ErrorLogPanel.css';

/** Same UI/retention semantics as ErrorLogPanel; separate store for updates. */
export function UpdateLogPanel() {
  const { t, locale } = useLocale();
  const { entries, clearLog } = useUpdateLog();
  const endRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(0);

  useEffect(() => {
    if (entries.length === 0) {
      prevCount.current = 0;
      return;
    }
    if (entries.length >= prevCount.current) {
      endRef.current?.scrollIntoView({ block: 'end', behavior: 'auto' });
    }
    prevCount.current = entries.length;
  }, [entries]);

  return (
    <section className="error-log" aria-label={t('updateLog.title')}>
      <header className="error-log__head">
        <h2 className="error-log__title">
          {t('updateLog.title')}
          {entries.length > 0 && (
            <span className="error-log__count">{entries.length}</span>
          )}
        </h2>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={clearLog}
          disabled={entries.length === 0}
          title={t('updateLog.clearTip')}
        >
          {t('updateLog.clear')}
        </button>
      </header>

      <div className="error-log__list" role="log" aria-live="polite">
        {entries.length === 0 ? (
          <p className="error-log__empty">{t('updateLog.empty')}</p>
        ) : (
          entries.map((entry, index) => {
            const isLatest = index === entries.length - 1;
            return (
              <article
                key={entry.id}
                className={`error-log__item${isLatest ? ' error-log__item--latest' : ''}`}
              >
                <time
                  className="error-log__time"
                  dateTime={new Date(entry.at).toISOString()}
                >
                  {formatErrorTimestamp(entry.at, locale)}
                </time>
                {entry.source && (
                  <span className="error-log__source">{entry.source}</span>
                )}
                <p className="error-log__msg">{entry.message}</p>
              </article>
            );
          })
        )}
        <div ref={endRef} className="error-log__end" aria-hidden />
      </div>
    </section>
  );
}
