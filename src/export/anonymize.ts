/**
 * Basic DICOM de-identification for local export (not a full Part 15 profile).
 * Strips / replaces common PHI while preserving pixels and geometry.
 */

export type AnonymizeOptions = {
  patientName?: string;
  patientId?: string;
  /** If true, also replace Study/Series/SOP UIDs (default false — keep series loadable as stack). */
  regenerateUids?: boolean;
};

const CLEAR_KEYS = [
  'PatientBirthDate',
  'PatientBirthTime',
  'PatientSex',
  'PatientAge',
  'PatientAddress',
  'PatientTelephoneNumbers',
  'EthnicGroup',
  'OtherPatientIDs',
  'OtherPatientNames',
  'OtherPatientIDsSequence',
  'PatientComments',
  'ReferringPhysicianName',
  'ReferringPhysicianAddress',
  'ReferringPhysicianTelephoneNumbers',
  'PhysiciansOfRecord',
  'PerformingPhysicianName',
  'NameOfPhysiciansReadingStudy',
  'OperatorsName',
  'InstitutionName',
  'InstitutionAddress',
  'InstitutionalDepartmentName',
  'StationName',
  'StudyID',
  'AccessionNumber',
  'RequestingPhysician',
  'RequestingService',
  'AdmissionID',
  'IssuerOfAdmissionID',
  'PatientIdentityRemoved',
] as const;

function ensureAlphabeticName(value: string): { Alphabetic: string } {
  return { Alphabetic: value };
}

/**
 * Anonymize a DICOM Part 10 buffer. Returns a new Part 10 ArrayBuffer.
 */
export async function anonymizeDicomBuffer(
  arrayBuffer: ArrayBuffer,
  options: AnonymizeOptions = {},
): Promise<ArrayBuffer> {
  const dcmjs = await import('dcmjs');
  const { DicomMetaDictionary, DicomMessage, DicomDict } = dcmjs.data;

  const dicomData = DicomMessage.readFile(arrayBuffer);
  const natural = DicomMetaDictionary.naturalizeDataset(dicomData.dict) as Record<
    string,
    unknown
  >;

  const patientName = options.patientName ?? 'Anonymous';
  const patientId = options.patientId ?? 'ANON';

  natural.PatientName = ensureAlphabeticName(patientName);
  natural.PatientID = patientId;
  natural.PatientIdentityRemoved = 'YES';
  natural.DeidentificationMethod = 'Slice basic export anonymization';

  for (const key of CLEAR_KEYS) {
    if (key === 'PatientIdentityRemoved') continue;
    if (key in natural) delete natural[key];
  }

  // Extra common free-text PHI
  for (const key of Object.keys(natural)) {
    if (/Physician|Operator|Institution|Address|Telephone|Comment/i.test(key)) {
      if (key === 'DeidentificationMethod') continue;
      delete natural[key];
    }
  }

  if (options.regenerateUids) {
    natural.StudyInstanceUID = DicomMetaDictionary.uid();
    natural.SeriesInstanceUID = DicomMetaDictionary.uid();
    natural.SOPInstanceUID = DicomMetaDictionary.uid();
    if (dicomData.meta) {
      dicomData.meta.MediaStorageSOPInstanceUID = natural.SOPInstanceUID;
    }
  }

  const denaturalized = DicomMetaDictionary.denaturalizeDataset(natural);
  const out = new DicomDict(dicomData.meta);
  out.dict = denaturalized;
  const written = out.write({ fragmentMultiframe: false });
  const bytes = written instanceof ArrayBuffer ? new Uint8Array(written) : new Uint8Array(written);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

export function suggestDicomFileName(
  meta: { patientId?: string; instanceNumber?: number; sopInstanceUID?: string },
  anonymized = true,
): string {
  const id = (meta.patientId || (anonymized ? 'ANON' : 'PAT'))
    .replace(/[^\w.-]+/g, '_')
    .slice(0, 24);
  const n = String(meta.instanceNumber ?? 1).padStart(4, '0');
  const tail = (meta.sopInstanceUID || '').replace(/[^\w.-]+/g, '_').slice(-12);
  return `${id}_${n}${tail ? `_${tail}` : ''}.dcm`;
}
