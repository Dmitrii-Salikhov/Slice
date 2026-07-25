import { useMemo, useState } from 'react';
import type { DicomdirCatalog, DicomdirSeries, DicomdirStudy } from '../dicom/dicomdirTypes';
import { countCatalogInstances } from '../dicom/dicomdirTypes';
import { useLocale } from '../i18n/LocaleContext';
import './Modal.css';
import './DicomdirDialog.css';

export type DicomdirSelection = {
  patientId?: string;
  studyInstanceUID?: string;
  seriesInstanceUID?: string;
};

type Props = {
  open: boolean;
  catalog: DicomdirCatalog | null;
  onClose: () => void;
  onLoad: (selection?: DicomdirSelection) => void;
  onFallbackScan: () => void;
};

export function DicomdirDialog({ open, catalog, onClose, onLoad, onFallbackScan }: Props) {
  const { t } = useLocale();
  const [selected, setSelected] = useState<DicomdirSelection>({});

  const total = useMemo(() => (catalog ? countCatalogInstances(catalog) : 0), [catalog]);

  if (!open || !catalog) return null;

  const selectSeries = (patientId: string, study: DicomdirStudy, series: DicomdirSeries) => {
    setSelected({
      patientId,
      studyInstanceUID: study.studyInstanceUID,
      seriesInstanceUID: series.seriesInstanceUID,
    });
  };

  const selectStudy = (patientId: string, study: DicomdirStudy) => {
    setSelected({
      patientId,
      studyInstanceUID: study.studyInstanceUID,
    });
  };

  const selectPatient = (patientId: string) => {
    setSelected({ patientId });
  };

  const selectionLabel = () => {
    if (selected.seriesInstanceUID) return t('dicomdir.loadSeries');
    if (selected.studyInstanceUID) return t('dicomdir.loadStudy');
    if (selected.patientId) return t('dicomdir.loadPatient');
    return t('dicomdir.loadAll');
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal modal--wide dicomdir-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dicomdir-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="dicomdir-title">{t('dicomdir.title')}</h2>
        <p className="modal__hint">
          {t('dicomdir.hint', {
            count: total,
            path: catalog.rootDir,
          })}
        </p>
        {catalog.fileSetId && (
          <p className="dicomdir-dialog__fileset">
            {t('dicomdir.fileSet')}: <code>{catalog.fileSetId}</code>
          </p>
        )}

        <div className="dicomdir-dialog__tree">
          {catalog.patients.length === 0 ? (
            <p className="modal__status">{t('dicomdir.empty')}</p>
          ) : (
            catalog.patients.map((patient) => {
              const patientActive =
                selected.patientId === patient.patientId &&
                !selected.studyInstanceUID &&
                !selected.seriesInstanceUID;
              return (
                <div key={patient.patientId} className="dicomdir-node">
                  <button
                    type="button"
                    className={`dicomdir-node__row${patientActive ? ' is-selected' : ''}`}
                    onClick={() => selectPatient(patient.patientId)}
                  >
                    <span className="dicomdir-node__kind">P</span>
                    <span className="dicomdir-node__title">
                      {patient.patientName || t('app.anonymous')}
                    </span>
                    <span className="dicomdir-node__meta">{patient.patientId}</span>
                  </button>

                  {patient.studies.map((study) => {
                    const studyActive =
                      selected.studyInstanceUID === study.studyInstanceUID &&
                      !selected.seriesInstanceUID;
                    return (
                      <div key={study.studyInstanceUID} className="dicomdir-node dicomdir-node--study">
                        <button
                          type="button"
                          className={`dicomdir-node__row${studyActive ? ' is-selected' : ''}`}
                          onClick={() => selectStudy(patient.patientId, study)}
                        >
                          <span className="dicomdir-node__kind">St</span>
                          <span className="dicomdir-node__title">
                            {study.studyDescription || t('app.study')}
                          </span>
                          <span className="dicomdir-node__meta">
                            {[study.studyDate, study.accessionNumber].filter(Boolean).join(' · ')}
                          </span>
                        </button>

                        {study.series.map((series) => {
                          const seriesActive =
                            selected.seriesInstanceUID === series.seriesInstanceUID;
                          return (
                            <button
                              key={series.seriesInstanceUID}
                              type="button"
                              className={`dicomdir-node__row dicomdir-node__row--series${
                                seriesActive ? ' is-selected' : ''
                              }`}
                              onClick={() => selectSeries(patient.patientId, study, series)}
                            >
                              <span className="dicomdir-node__kind">
                                {series.modality || 'Se'}
                              </span>
                              <span className="dicomdir-node__title">
                                {series.seriesDescription || t('app.series')}
                              </span>
                              <span className="dicomdir-node__meta">
                                {t('dicomdir.images', { count: series.instances.length })}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        <div className="modal__actions modal__actions--start">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() =>
              onLoad(
                selected.patientId || selected.studyInstanceUID || selected.seriesInstanceUID
                  ? selected
                  : undefined,
              )
            }
            disabled={total === 0}
          >
            {selectionLabel()}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => onLoad(undefined)}>
            {t('dicomdir.loadAll')}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onFallbackScan}>
            {t('dicomdir.scanFolder')}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t('dialog.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
