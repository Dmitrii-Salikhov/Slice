import { useEffect, useRef } from 'react';
import { useErrorLog } from '../errorLog/ErrorLogContext';
import { formatErrorTimestamp } from '../errorLog/store';
import { useLocale } from '../i18n/LocaleContext';
import './ErrorLogPanel.css';

export function ErrorLogPanel() {
  const { t, locale } = useLocale();
  const { entries, clearLog } = useErrorLog();
  const listRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(0);

  useEffect(() => {
    if (entries.length === 0) {
      prevCount.current = 0;
      return;
    }
    // Scroll to latest on new entries (and on first paint with items)
    if (entries.length >= prevCount.current) {
      endRef.current?.scrollIntoView({ block: 'end', behavior: 'auto' });
    }
    prevCount.current = entries.length;
  }, [entries]);

  return (
    <section className="error-log" aria-label={t('errorLog.title')}>
      <header className="error-log__head">
        <h2 className="error-log__title">
          {t('errorLog.title')}
          {entries.length > 0 && (
            <span className="error-log__count">{entries.length}</span>
          )}
        </h2>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={clearLog}
          disabled={entries.length === 0}
          title={t('errorLog.clearTip')}
        >
          {t('errorLog.clear')}
        </button>
      </header>

      <div className="error-log__list" ref={listRef} role="log" aria-live="polite">
        {entries.length === 0 ? (
          <p className="error-log__empty">{t('errorLog.empty')}</p>
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
