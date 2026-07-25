import type { Annotation } from '../dicom/types';

export type AnnotationsFile = {
  version: 1;
  seriesInstanceUID: string;
  annotations: Annotation[];
};

export function serializeAnnotations(
  seriesInstanceUID: string,
  annotations: Annotation[],
): string {
  const payload: AnnotationsFile = {
    version: 1,
    seriesInstanceUID,
    annotations,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function parseAnnotationsFile(raw: string): AnnotationsFile {
  const data = JSON.parse(raw) as AnnotationsFile;
  if (!data || data.version !== 1 || !Array.isArray(data.annotations)) {
    throw new Error('Invalid annotations file');
  }
  if (typeof data.seriesInstanceUID !== 'string') {
    throw new Error('Missing seriesInstanceUID');
  }
  return data;
}
