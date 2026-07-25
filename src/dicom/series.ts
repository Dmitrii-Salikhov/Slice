import type { DicomInstance, DicomSeries, DicomStudy } from './types';
import { parseDicomMeta, type ParseResult } from './parse';

function sliceNormal(instance: DicomInstance): [number, number, number] | null {
  const iop = instance.imageOrientationPatient;
  if (!iop) return null;
  const [rx, ry, rz] = iop.rowCosines;
  const [cx, cy, cz] = iop.colCosines;
  return [ry * cz - rz * cy, rz * cx - rx * cz, rx * cy - ry * cx];
}

/** Project IPP onto slice normal for stack ordering. */
function stackPosition(instance: DicomInstance): number {
  const ipp = instance.imagePositionPatient;
  const normal = sliceNormal(instance);
  if (ipp && normal) {
    return ipp[0] * normal[0] + ipp[1] * normal[1] + ipp[2] * normal[2];
  }
  if (ipp) {
    return ipp[2] ?? ipp[1] ?? ipp[0] ?? 0;
  }
  return instance.instanceNumber;
}

export function sortSeriesInstances(instances: DicomInstance[]): DicomInstance[] {
  return [...instances].sort((a, b) => {
    const fa = a.frameIndex ?? 0;
    const fb = b.frameIndex ?? 0;
    if (a.filePath === b.filePath && (a.numberOfFrames ?? 1) > 1) {
      return fa - fb;
    }
    const pa = stackPosition(a);
    const pb = stackPosition(b);
    if (pa !== pb) return pa - pb;
    return fa - fb;
  });
}

export function groupIntoStudies(
  instances: DicomInstance[],
  documents: import('./documents').DicomDocument[] = [],
): DicomStudy[] {
  const studyMap = new Map<string, Map<string, DicomInstance[]>>();
  const docByStudy = new Map<string, import('./documents').DicomDocument[]>();

  for (const inst of instances) {
    let seriesMap = studyMap.get(inst.studyInstanceUID);
    if (!seriesMap) {
      seriesMap = new Map();
      studyMap.set(inst.studyInstanceUID, seriesMap);
    }
    const list = seriesMap.get(inst.seriesInstanceUID) ?? [];
    list.push(inst);
    seriesMap.set(inst.seriesInstanceUID, list);
  }

  for (const doc of documents) {
    const list = docByStudy.get(doc.studyInstanceUID) ?? [];
    list.push(doc);
    docByStudy.set(doc.studyInstanceUID, list);
  }

  const studies: DicomStudy[] = [];
  const allStudyUids = new Set([...studyMap.keys(), ...docByStudy.keys()]);

  for (const studyUID of allStudyUids) {
    const seriesMap = studyMap.get(studyUID) ?? new Map();
    const series: DicomSeries[] = [];
    let patientName = '';
    let patientId = '';
    let studyDescription = '';

    for (const [seriesUID, raw] of seriesMap) {
      const sorted = sortSeriesInstances(raw);
      const first = sorted[0];
      patientName = first.patientName;
      patientId = first.patientId;
      studyDescription = first.studyDescription;
      series.push({
        seriesInstanceUID: seriesUID,
        studyInstanceUID: studyUID,
        seriesDescription: first.seriesDescription || `Series ${series.length + 1}`,
        modality: first.modality,
        patientName: first.patientName,
        patientId: first.patientId,
        studyDescription: first.studyDescription,
        instances: sorted,
      });
    }

    for (const doc of docByStudy.get(studyUID) ?? []) {
      patientName = patientName || doc.patientName;
      patientId = patientId || doc.patientId;
      studyDescription = studyDescription || doc.studyDescription;
      series.push({
        seriesInstanceUID: doc.seriesInstanceUID || `doc-${doc.sopInstanceUID}`,
        studyInstanceUID: studyUID,
        seriesDescription: doc.seriesDescription || doc.label,
        modality: doc.kind === 'pdf' ? 'DOC' : 'SR',
        patientName: doc.patientName,
        patientId: doc.patientId,
        studyDescription: doc.studyDescription,
        instances: [],
        document: doc,
      });
    }

    series.sort((a, b) => a.seriesDescription.localeCompare(b.seriesDescription));
    studies.push({
      studyInstanceUID: studyUID,
      studyDescription: studyDescription || 'Study',
      patientName,
      patientId,
      series,
    });
  }

  return studies;
}

export type LoadProgress = {
  loaded: number;
  total: number;
  currentFile: string;
};

export type LoadFolderOptions = {
  signal?: AbortSignal;
  onSkipped?: (filePath: string, reason: string) => void;
  /** Concurrent metadata parses (default 6). */
  concurrency?: number;
};

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      if (signal?.aborted) {
        const err = new Error('Load cancelled');
        err.name = 'AbortError';
        throw err;
      }
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Metadata-first folder load (no pixel decode). Use pixelCache.ensure for pixels.
 */
export async function loadDicomFolder(
  filePaths: string[],
  readFile: (path: string) => Promise<ArrayBuffer>,
  onProgress?: (p: LoadProgress) => void,
  options?: LoadFolderOptions,
): Promise<DicomStudy[]> {
  const instances: DicomInstance[] = [];
  const documents: import('./documents').DicomDocument[] = [];
  const total = filePaths.length;
  const signal = options?.signal;
  const concurrency = Math.max(1, options?.concurrency ?? 6);
  let completed = 0;

  await mapPool(
    filePaths,
    concurrency,
    async (filePath) => {
      if (signal?.aborted) {
        const err = new Error('Load cancelled');
        err.name = 'AbortError';
        throw err;
      }
      try {
        const buffer = await readFile(filePath);
        if (signal?.aborted) {
          const err = new Error('Load cancelled');
          err.name = 'AbortError';
          throw err;
        }
        const result: ParseResult = await parseDicomMeta(buffer, filePath);
        if (result.kind === 'document') {
          documents.push(result.document);
        } else {
          instances.push(...result.instances);
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') throw e;
        const reason = e instanceof Error ? e.message : String(e);
        options?.onSkipped?.(filePath, reason);
      } finally {
        completed += 1;
        onProgress?.({ loaded: completed, total, currentFile: filePath });
      }
    },
    signal,
  );

  onProgress?.({ loaded: total, total, currentFile: '' });
  return groupIntoStudies(instances, documents);
}
