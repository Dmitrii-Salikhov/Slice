/** DICOMDIR (Media Storage Directory) catalog types and helpers. */

export type DicomdirRecordType =
  | 'PATIENT'
  | 'STUDY'
  | 'SERIES'
  | 'IMAGE'
  | 'SR DOCUMENT'
  | 'KEY OBJECT DOC'
  | 'PRESENTATION'
  | 'WAVEFORM'
  | 'RT DOSE'
  | 'RT STRUCTURE SET'
  | 'RT PLAN'
  | 'RT TREAT RECORD'
  | 'OTHER';

export type DicomdirInstanceRef = {
  filePath: string;
  /** Relative File ID as in DICOMDIR */
  fileId: string;
  sopInstanceUID: string;
  instanceNumber: number;
  recordType: DicomdirRecordType;
};

export type DicomdirSeries = {
  seriesInstanceUID: string;
  seriesDescription: string;
  modality: string;
  seriesNumber: string;
  instances: DicomdirInstanceRef[];
};

export type DicomdirStudy = {
  studyInstanceUID: string;
  studyDescription: string;
  studyDate: string;
  accessionNumber: string;
  series: DicomdirSeries[];
};

export type DicomdirPatient = {
  patientId: string;
  patientName: string;
  studies: DicomdirStudy[];
};

export type DicomdirCatalog = {
  dicomdirPath: string;
  rootDir: string;
  fileSetId: string;
  patients: DicomdirPatient[];
};

/** Record types that usually reference a file on media. */
export const DICOMDIR_LEAF_TYPES = new Set<string>([
  'IMAGE',
  'SR DOCUMENT',
  'KEY OBJECT DOC',
  'PRESENTATION',
  'WAVEFORM',
  'RT DOSE',
  'RT STRUCTURE SET',
  'RT PLAN',
  'RT TREAT RECORD',
  'ENCAP DOC',
  'SPECTROSCOPY',
  'RAW DATA',
  'REGISTRATION',
  'FIDUCIAL',
  'SURFACE',
  'MEASUREMENT',
  'OVERLAY',
  'MODALITY LUT',
  'VOI LUT',
  'CURVE',
  'STORED PRINT',
  'PRIVATE',
]);

export function recordTypeLevel(type: string): number {
  const t = type.trim().toUpperCase();
  if (t === 'PATIENT') return 1;
  if (t === 'STUDY') return 2;
  if (t === 'SERIES') return 3;
  if (DICOMDIR_LEAF_TYPES.has(t) || t === 'IMAGE') return 4;
  // Unknown: treat as leaf-ish under series
  return 4;
}

/** Join DICOMDIR root with multi-component Referenced File ID.
 * Returns null if the path would escape rootDir (path traversal).
 */
export function joinMediaPath(rootDir: string, fileIdParts: string[]): string | null {
  const sep = /\\/.test(rootDir) && !rootDir.startsWith('/') ? '\\' : '/';
  const cleanRoot = rootDir.replace(/[/\\]+$/, '');
  const parts = fileIdParts
    .map((p) => p.replace(/^[/\\]+|[/\\]+$/g, ''))
    .filter(Boolean);

  for (const part of parts) {
    if (
      part === '.' ||
      part === '..' ||
      part.includes('..') ||
      part.includes('\0') ||
      /^[a-zA-Z]:/.test(part) ||
      part.includes('/') ||
      part.includes('\\')
    ) {
      return null;
    }
  }

  return [cleanRoot, ...parts].join(sep);
}

export function splitFileId(fileId: string): string[] {
  return fileId
    .split(/[\\/]/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Collect absolute file paths for a series / study / patient / whole catalog. */
export function collectCatalogFilePaths(
  catalog: DicomdirCatalog,
  selection?: {
    patientId?: string;
    studyInstanceUID?: string;
    seriesInstanceUID?: string;
  },
): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();

  for (const patient of catalog.patients) {
    if (selection?.patientId && patient.patientId !== selection.patientId) continue;
    for (const study of patient.studies) {
      if (selection?.studyInstanceUID && study.studyInstanceUID !== selection.studyInstanceUID) {
        continue;
      }
      for (const series of study.series) {
        if (
          selection?.seriesInstanceUID &&
          series.seriesInstanceUID !== selection.seriesInstanceUID
        ) {
          continue;
        }
        for (const inst of series.instances) {
          if (seen.has(inst.filePath)) continue;
          seen.add(inst.filePath);
          paths.push(inst.filePath);
        }
      }
    }
  }

  return paths;
}

export function countCatalogInstances(catalog: DicomdirCatalog): number {
  let n = 0;
  for (const p of catalog.patients) {
    for (const s of p.studies) {
      for (const se of s.series) n += se.instances.length;
    }
  }
  return n;
}
