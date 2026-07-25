import type { DicomSeries, DicomStudy } from '../dicom/types';
import { useLocale } from '../i18n/LocaleContext';
import './SeriesList.css';

type Props = {
  studies: DicomStudy[];
  activeSeriesUid: string | null;
  compareSeriesUid: string | null;
  onSelect: (series: DicomSeries) => void;
  onSelectCompare: (series: DicomSeries) => void;
};

export function SeriesList({
  studies,
  activeSeriesUid,
  compareSeriesUid,
  onSelect,
  onSelectCompare,
}: Props) {
  const { t } = useLocale();

  if (studies.length === 0) {
    return <div className="series-list series-list--empty">{t('app.noStudies')}</div>;
  }

  return (
    <div className="series-list">
      <p className="series-list__hint">{t('compare.seriesHint')}</p>
      {studies.map((study) => (
        <section key={study.studyInstanceUID} className="study">
          <header className="study__header">
            <div className="study__patient">{study.patientName || t('app.anonymous')}</div>
            <div className="study__desc">{study.studyDescription || t('app.study')}</div>
            {study.patientId && <div className="study__id">ID {study.patientId}</div>}
          </header>
          <ul className="study__series">
            {study.series.map((series) => {
              const active = series.seriesInstanceUID === activeSeriesUid;
              const compare = series.seriesInstanceUID === compareSeriesUid;
              return (
                <li key={series.seriesInstanceUID}>
                  <div
                    className={`series-item${active ? ' series-item--active' : ''}${
                      compare ? ' series-item--compare' : ''
                    }`}
                  >
                    <button
                      type="button"
                      className="series-item__main"
                      onClick={() => onSelect(series)}
                      title={t('app.selectSeries')}
                    >
                      <span className="series-item__mod">{series.modality || '—'}</span>
                      <span className="series-item__body">
                        <span className="series-item__name">
                          {series.seriesDescription || t('app.series')}
                          {active && <span className="series-item__tag">A</span>}
                          {compare && <span className="series-item__tag series-item__tag--b">B</span>}
                        </span>
                        <span className="series-item__meta">
                          {series.document
                            ? series.document.kind === 'pdf'
                              ? t('document.pdf')
                              : t('document.sr')
                            : t('app.images', { count: series.instances.length })}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`series-item__b${compare ? ' is-active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectCompare(series);
                      }}
                      title={t('compare.setB')}
                      aria-label={t('compare.setB')}
                      disabled={!!series.document}
                    >
                      B
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
