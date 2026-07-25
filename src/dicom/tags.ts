import type { DataSet } from 'dicom-parser';

export type DicomTagRow = {
  tag: string;
  name: string;
  vr: string;
  value: string;
};

/** Common DICOM dictionary subset for display names. */
const TAG_NAMES: Record<string, string> = {
  x00020010: 'Transfer Syntax UID',
  x00080016: 'SOP Class UID',
  x00080018: 'SOP Instance UID',
  x00080020: 'Study Date',
  x00080030: 'Study Time',
  x00080050: 'Accession Number',
  x00080060: 'Modality',
  x00080070: 'Manufacturer',
  x00080080: 'Institution Name',
  x00080090: 'Referring Physician',
  x00081030: 'Study Description',
  x0008103e: 'Series Description',
  x00100010: 'Patient Name',
  x00100020: 'Patient ID',
  x00100030: 'Patient Birth Date',
  x00100040: 'Patient Sex',
  x00180050: 'Slice Thickness',
  x00180088: 'Spacing Between Slices',
  x00185100: 'Patient Position',
  x0020000d: 'Study Instance UID',
  x0020000e: 'Series Instance UID',
  x00200011: 'Series Number',
  x00200013: 'Instance Number',
  x00200032: 'Image Position Patient',
  x00200037: 'Image Orientation Patient',
  x00201041: 'Slice Location',
  x00280002: 'Samples Per Pixel',
  x00280004: 'Photometric Interpretation',
  x00280008: 'Number of Frames',
  x00280010: 'Rows',
  x00280011: 'Columns',
  x00280030: 'Pixel Spacing',
  x00280100: 'Bits Allocated',
  x00280101: 'Bits Stored',
  x00280103: 'Pixel Representation',
  x00281050: 'Window Center',
  x00281051: 'Window Width',
  x00281052: 'Rescale Intercept',
  x00281053: 'Rescale Slope',
  x7fe00010: 'Pixel Data',
};

function formatTag(key: string): string {
  const m = /^x([0-9a-f]{4})([0-9a-f]{4})$/i.exec(key);
  if (!m) return key;
  return `(${m[1].toUpperCase()},${m[2].toUpperCase()})`;
}

function readValue(dataSet: DataSet, key: string, length: number): string {
  if (key === 'x7fe00010' || length > 4096) {
    return length > 0 ? `<binary ${length} bytes>` : '';
  }
  try {
    const s = dataSet.string(key);
    if (s != null && s !== '') return s;
  } catch {
    // continue
  }
  try {
    const u = dataSet.uint16(key);
    if (u != null && Number.isFinite(u)) return String(u);
  } catch {
    // continue
  }
  try {
    const i = dataSet.int16?.(key);
    if (i != null && Number.isFinite(i)) return String(i);
  } catch {
    // continue
  }
  if (length > 0) return `<${length} bytes>`;
  return '';
}

/**
 * Dump dataset elements into sortable rows for a tag browser.
 */
export function dumpDicomTags(dataSet: DataSet): DicomTagRow[] {
  const elements = dataSet.elements ?? {};
  const keys = Object.keys(elements).sort();
  const rows: DicomTagRow[] = [];

  for (const key of keys) {
    const el = elements[key];
    const length = el?.length ?? 0;
    const vr = (el as { vr?: string })?.vr ?? '';
    rows.push({
      tag: formatTag(key),
      name: TAG_NAMES[key.toLowerCase()] ?? TAG_NAMES[key] ?? '',
      vr,
      value: readValue(dataSet, key, length),
    });
  }
  return rows;
}

export async function parseDicomTagBrowser(
  arrayBuffer: ArrayBuffer,
): Promise<DicomTagRow[]> {
  const dicomParser = await import('dicom-parser');
  const byteArray = new Uint8Array(arrayBuffer);
  const dataSet = dicomParser.parseDicom(byteArray) as DataSet;
  return dumpDicomTags(dataSet);
}
