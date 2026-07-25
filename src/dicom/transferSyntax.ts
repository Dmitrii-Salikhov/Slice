/** DICOM Transfer Syntax UIDs */

export const TransferSyntax = {
  ImplicitVRLittleEndian: '1.2.840.10008.1.2',
  ExplicitVRLittleEndian: '1.2.840.10008.1.2.1',
  ExplicitVRBigEndian: '1.2.840.10008.1.2.2',
  RLELossless: '1.2.840.10008.1.2.5',
  JPEGBaseline: '1.2.840.10008.1.2.4.50',
  JPEGExtended: '1.2.840.10008.1.2.4.51',
  JPEGLossless: '1.2.840.10008.1.2.4.57',
  JPEGLosslessSV1: '1.2.840.10008.1.2.4.70',
  JPEGLSLossless: '1.2.840.10008.1.2.4.80',
  JPEGLSNearLossless: '1.2.840.10008.1.2.4.81',
  JPEG2000Lossless: '1.2.840.10008.1.2.4.90',
  JPEG2000: '1.2.840.10008.1.2.4.91',
} as const;

export type TransferSyntaxUID = (typeof TransferSyntax)[keyof typeof TransferSyntax] | string;

export function isEncapsulated(ts: string): boolean {
  return (
    ts === TransferSyntax.RLELossless ||
    ts.startsWith('1.2.840.10008.1.2.4.') ||
    ts === '1.2.840.10008.1.2.5'
  );
}

export function isUncompressed(ts: string): boolean {
  return (
    ts === TransferSyntax.ImplicitVRLittleEndian ||
    ts === TransferSyntax.ExplicitVRLittleEndian ||
    ts === TransferSyntax.ExplicitVRBigEndian ||
    !ts
  );
}
