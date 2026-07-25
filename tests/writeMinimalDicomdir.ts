import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);

export type MinimalDicomdirOptions = {
  rootRelativeFiles?: string[][];
  patientName?: string;
  patientId?: string;
  studyUID?: string;
  seriesUID?: string;
  studyDescription?: string;
  seriesDescription?: string;
  modality?: string;
};

/**
 * Build a minimal DICOMDIR (Media Storage Directory) with one patient/study/series
 * and IMAGE records pointing at the given multi-component File IDs.
 */
export function buildMinimalDicomdir(opts: MinimalDicomdirOptions = {}): Buffer {
  const dcmjs = require('dcmjs');
  const { DicomMetaDictionary } = dcmjs.data;

  const fileIds = opts.rootRelativeFiles ?? [['DICOM', 'IMG0001']];
  const patientName = opts.patientName ?? 'Test^Patient';
  const patientId = opts.patientId ?? 'P1';
  const studyUID = opts.studyUID ?? '1.2.826.0.1.3680043.9.7333.10.1';
  const seriesUID = opts.seriesUID ?? '1.2.826.0.1.3680043.9.7333.10.1.1';

  const images = fileIds.map((parts, i) => ({
    DirectoryRecordType: 'IMAGE',
    ReferencedFileID: parts,
    ReferencedSOPClassUIDInFile: '1.2.840.10008.5.1.4.1.1.2',
    ReferencedSOPInstanceUIDInFile: `${seriesUID}.${i + 1}`,
    InstanceNumber: String(i + 1),
  }));

  const dataset = {
    FileSetID: 'SLICE',
    DirectoryRecordSequence: [
      {
        DirectoryRecordType: 'PATIENT',
        PatientName: patientName,
        PatientID: patientId,
      },
      {
        DirectoryRecordType: 'STUDY',
        StudyInstanceUID: studyUID,
        StudyDescription: opts.studyDescription ?? 'Phantom Study',
        StudyDate: '20260101',
        AccessionNumber: 'ACC1',
      },
      {
        DirectoryRecordType: 'SERIES',
        SeriesInstanceUID: seriesUID,
        Modality: opts.modality ?? 'CT',
        SeriesDescription: opts.seriesDescription ?? 'Axial',
        SeriesNumber: '1',
      },
      ...images,
    ],
  };

  const denaturalized = DicomMetaDictionary.denaturalizeDataset(dataset);
  const dict = new dcmjs.data.DicomDict({
    MediaStorageSOPClassUID: '1.2.840.10008.1.3.10',
    MediaStorageSOPInstanceUID: '1.2.826.0.1.3680043.9.7333.10',
    TransferSyntaxUID: '1.2.840.10008.1.2.1',
  });
  dict.dict = denaturalized;
  return Buffer.from(dict.write());
}

/** Write DICOMDIR + optional placeholder files under outDir. */
export function writeMinimalDicomdirTree(
  outDir: string,
  fileNames = ['IMG0001', 'IMG0002'],
): { dicomdirPath: string; files: string[] } {
  fs.mkdirSync(path.join(outDir, 'DICOM'), { recursive: true });
  const relative = fileNames.map((name) => ['DICOM', name]);
  const buf = buildMinimalDicomdir({ rootRelativeFiles: relative });
  const dicomdirPath = path.join(outDir, 'DICOMDIR');
  fs.writeFileSync(dicomdirPath, buf);

  const files: string[] = [];
  for (const name of fileNames) {
    const fp = path.join(outDir, 'DICOM', name);
    fs.writeFileSync(fp, Buffer.from('placeholder'));
    files.push(fp);
  }
  return { dicomdirPath, files };
}
