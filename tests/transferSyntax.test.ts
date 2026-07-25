import { describe, expect, it } from 'vitest';
import {
  isEncapsulated,
  isUncompressed,
  TransferSyntax,
} from '../src/dicom/transferSyntax';

describe('transferSyntax', () => {
  it('detects uncompressed', () => {
    expect(isUncompressed(TransferSyntax.ImplicitVRLittleEndian)).toBe(true);
    expect(isUncompressed(TransferSyntax.ExplicitVRLittleEndian)).toBe(true);
    expect(isUncompressed(TransferSyntax.ExplicitVRBigEndian)).toBe(true);
    expect(isUncompressed('')).toBe(true);
    expect(isUncompressed(TransferSyntax.JPEGBaseline)).toBe(false);
  });

  it('detects encapsulated', () => {
    expect(isEncapsulated(TransferSyntax.JPEGBaseline)).toBe(true);
    expect(isEncapsulated(TransferSyntax.JPEGLosslessSV1)).toBe(true);
    expect(isEncapsulated(TransferSyntax.JPEGLSLossless)).toBe(true);
    expect(isEncapsulated(TransferSyntax.JPEG2000)).toBe(true);
    expect(isEncapsulated(TransferSyntax.RLELossless)).toBe(true);
    expect(isEncapsulated(TransferSyntax.ImplicitVRLittleEndian)).toBe(false);
  });
});
