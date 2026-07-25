import { describe, expect, it } from 'vitest';
import {
  isEncapsulated,
  isUncompressed,
  TransferSyntax,
} from '../src/dicom/transferSyntax';
import { readTransferSyntax } from '../src/dicom/decode';

describe('decode helpers', () => {
  it('readTransferSyntax falls back to Implicit LE', () => {
    const ds = {
      string: () => undefined,
    };
    expect(readTransferSyntax(ds as never)).toBe(TransferSyntax.ImplicitVRLittleEndian);
  });

  it('readTransferSyntax returns tag value', () => {
    const ds = {
      string: (tag: string) => (tag === 'x00020010' ? TransferSyntax.JPEGBaseline : undefined),
    };
    expect(readTransferSyntax(ds as never)).toBe(TransferSyntax.JPEGBaseline);
    expect(isEncapsulated(TransferSyntax.JPEGBaseline)).toBe(true);
    expect(isUncompressed(TransferSyntax.JPEGBaseline)).toBe(false);
  });
});
