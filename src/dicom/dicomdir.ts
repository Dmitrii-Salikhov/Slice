import type {
  DicomdirCatalog,
  DicomdirInstanceRef,
  DicomdirPatient,
  DicomdirRecordType,
  DicomdirSeries,
  DicomdirStudy,
} from './dicomdirTypes';
import {
  DICOMDIR_LEAF_TYPES,
  joinMediaPath,
  recordTypeLevel,
  splitFileId,
} from './dicomdirTypes';

type DataSetLike = {
  string?: (tag: string) => string | undefined;
  elements?: Record<
    string,
    {
      items?: Array<{ dataSet: DataSetLike }>;
    }
  >;
};

function str(ds: DataSetLike, tag: string, fallback = ''): string {
  return (ds.string?.(tag) ?? fallback).trim();
}

function normalizeRecordType(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, ' ');
}

/**
 * Parse a DICOMDIR ArrayBuffer into a hierarchical catalog.
 * Uses Directory Record Sequence in depth-first order (stack by record type level).
 */
export async function parseDicomdir(
  arrayBuffer: ArrayBuffer,
  dicomdirPath: string,
  rootDir: string,
): Promise<DicomdirCatalog> {
  const dicomParser = await import('dicom-parser');
  const byteArray = new Uint8Array(arrayBuffer);
  const dataSet = dicomParser.parseDicom(byteArray) as DataSetLike;

  const fileSetId = str(dataSet, 'x00041130') || str(dataSet, 'x00041141') || '';
  const seq = dataSet.elements?.x00041220;
  if (!seq?.items?.length) {
    throw new Error('DICOMDIR has no Directory Record Sequence');
  }

  const patients: DicomdirPatient[] = [];
  let currentPatient: DicomdirPatient | null = null;
  let currentStudy: DicomdirStudy | null = null;
  let currentSeries: DicomdirSeries | null = null;

  const ensurePatient = (): DicomdirPatient => {
    if (!currentPatient) {
      currentPatient = {
        patientId: 'UNKNOWN',
        patientName: 'Anonymous',
        studies: [],
      };
      patients.push(currentPatient);
    }
    return currentPatient;
  };

  const ensureStudy = (): DicomdirStudy => {
    const patient = ensurePatient();
    if (!currentStudy) {
      currentStudy = {
        studyInstanceUID: `unknown-study-${patient.studies.length + 1}`,
        studyDescription: 'Study',
        studyDate: '',
        accessionNumber: '',
        series: [],
      };
      patient.studies.push(currentStudy);
    }
    return currentStudy;
  };

  const ensureSeries = (): DicomdirSeries => {
    const study = ensureStudy();
    if (!currentSeries) {
      currentSeries = {
        seriesInstanceUID: `unknown-series-${study.series.length + 1}`,
        seriesDescription: 'Series',
        modality: '',
        seriesNumber: '',
        instances: [],
      };
      study.series.push(currentSeries);
    }
    return currentSeries;
  };

  for (const item of seq.items) {
    const ds = item.dataSet;
    if (!ds) continue;

    const type = normalizeRecordType(str(ds, 'x00041430'));
    if (!type) continue;

    const level = recordTypeLevel(type);

    if (level <= 1) {
      currentPatient = null;
      currentStudy = null;
      currentSeries = null;
    } else if (level === 2) {
      currentStudy = null;
      currentSeries = null;
    } else if (level === 3) {
      currentSeries = null;
    }

    if (type === 'PATIENT') {
      currentPatient = {
        patientId: str(ds, 'x00100020') || `P${patients.length + 1}`,
        patientName: str(ds, 'x00100010') || 'Anonymous',
        studies: [],
      };
      patients.push(currentPatient);
      continue;
    }

    if (type === 'STUDY') {
      const patient = ensurePatient();
      currentStudy = {
        studyInstanceUID: str(ds, 'x0020000d') || `study-${patient.studies.length + 1}`,
        studyDescription: str(ds, 'x00081030') || 'Study',
        studyDate: str(ds, 'x00080020'),
        accessionNumber: str(ds, 'x00080050'),
        series: [],
      };
      patient.studies.push(currentStudy);
      continue;
    }

    if (type === 'SERIES') {
      const study = ensureStudy();
      currentSeries = {
        seriesInstanceUID: str(ds, 'x0020000e') || `series-${study.series.length + 1}`,
        seriesDescription: str(ds, 'x0008103e') || 'Series',
        modality: str(ds, 'x00080060'),
        seriesNumber: str(ds, 'x00200011'),
        instances: [],
      };
      study.series.push(currentSeries);
      continue;
    }

    // Leaf / image-like
    if (DICOMDIR_LEAF_TYPES.has(type) || level >= 4) {
      const fileIdRaw = str(ds, 'x00041500');
      if (!fileIdRaw) continue;

      const parts = splitFileId(fileIdRaw);
      const filePath = joinMediaPath(rootDir, parts);
      if (!filePath) continue;
      const series = ensureSeries();
      const inst: DicomdirInstanceRef = {
        filePath,
        fileId: parts.join('/'),
        sopInstanceUID: str(ds, 'x00041511') || str(ds, 'x00080018'),
        instanceNumber: Number(str(ds, 'x00200013')) || series.instances.length + 1,
        recordType: (type as DicomdirRecordType) || 'IMAGE',
      };
      series.instances.push(inst);
    }
  }

  // Drop empty branches
  for (const patient of patients) {
    patient.studies = patient.studies
      .map((study) => ({
        ...study,
        series: study.series.filter((s) => s.instances.length > 0),
      }))
      .filter((s) => s.series.length > 0);
  }

  return {
    dicomdirPath,
    rootDir,
    fileSetId,
    patients: patients.filter((p) => p.studies.length > 0),
  };
}

export { collectCatalogFilePaths, countCatalogInstances } from './dicomdirTypes';
