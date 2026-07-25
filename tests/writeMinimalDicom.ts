/**
 * Write a minimal valid Implicit VR Little Endian single-frame CT-like DICOM.
 */
import fs from 'node:fs';
import path from 'node:path';

function u16le(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}

function u32le(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
}

function padEven(buf: Buffer, pad = 0x00): Buffer {
  if (buf.length % 2 === 1) return Buffer.concat([buf, Buffer.from([pad])]);
  return buf;
}

function ui(s: string): Buffer {
  return padEven(Buffer.from(s, 'ascii'), 0x00);
}

function cs(s: string): Buffer {
  return padEven(Buffer.from(s, 'ascii'), 0x20);
}

function lo(s: string): Buffer {
  return padEven(Buffer.from(s, 'ascii'), 0x20);
}

function pn(s: string): Buffer {
  return padEven(Buffer.from(s, 'ascii'), 0x20);
}

function ds(s: string): Buffer {
  return padEven(Buffer.from(s, 'ascii'), 0x20);
}

function is(s: string): Buffer {
  return padEven(Buffer.from(s, 'ascii'), 0x20);
}

/** Implicit VR LE element */
function el(group: number, element: number, value: Buffer): Buffer {
  return Buffer.concat([u16le(group), u16le(element), u32le(value.length), value]);
}

/** Explicit VR LE meta element (group 0002 only) */
function metaEl(element: number, vr: string, value: Buffer): Buffer {
  const v = value;
  if (vr === 'OB' || vr === 'OW' || vr === 'SQ' || vr === 'UN' || vr === 'UT') {
    const padded = padEven(v, 0x00);
    return Buffer.concat([
      u16le(0x0002),
      u16le(element),
      Buffer.from(vr, 'ascii'),
      Buffer.from([0, 0]),
      u32le(padded.length),
      padded,
    ]);
  }
  const padded = vr === 'UI' ? padEven(v, 0x00) : padEven(v, 0x20);
  return Buffer.concat([
    u16le(0x0002),
    u16le(element),
    Buffer.from(vr, 'ascii'),
    u16le(padded.length),
    padded,
  ]);
}

export type MinimalDicomOptions = {
  rows?: number;
  columns?: number;
  instanceNumber?: number;
  z?: number;
  studyUID?: string;
  seriesUID?: string;
  sopUID?: string;
  pixels?: Int16Array;
};

export function buildMinimalDicom(opts: MinimalDicomOptions = {}): Buffer {
  const rows = opts.rows ?? 8;
  const columns = opts.columns ?? 8;
  const instanceNumber = opts.instanceNumber ?? 1;
  const z = opts.z ?? 0;
  const studyUID = opts.studyUID ?? '1.2.826.0.1.3680043.9.7333.1.1';
  const seriesUID = opts.seriesUID ?? '1.2.826.0.1.3680043.9.7333.1.2';
  const sopUID = opts.sopUID ?? `1.2.826.0.1.3680043.9.7333.1.3.${instanceNumber}`;

  const pixels = opts.pixels ?? Int16Array.from({ length: rows * columns }, (_, i) => i);
  const pixelBytes = Buffer.alloc(pixels.length * 2);
  for (let i = 0; i < pixels.length; i++) {
    pixelBytes.writeInt16LE(pixels[i], i * 2);
  }

  // File Meta Information (Explicit VR LE) — required for dicom-parser TS detection
  const metaBody = Buffer.concat([
    metaEl(0x0001, 'OB', Buffer.from([0x00, 0x01])),
    metaEl(0x0002, 'UI', Buffer.from('1.2.840.10008.5.1.4.1.1.2', 'ascii')),
    metaEl(0x0003, 'UI', Buffer.from(sopUID, 'ascii')),
    metaEl(0x0010, 'UI', Buffer.from('1.2.840.10008.1.2', 'ascii')),
  ]);

  // (0002,0000) Group Length = bytes after this element
  const groupLengthElement = metaEl(0x0000, 'UL', u32le(metaBody.length));
  const meta = Buffer.concat([groupLengthElement, metaBody]);

  // Dataset Implicit VR LE
  const dataset = Buffer.concat([
    el(0x0008, 0x0016, ui('1.2.840.10008.5.1.4.1.1.2')),
    el(0x0008, 0x0018, ui(sopUID)),
    el(0x0008, 0x0060, cs('CT')),
    el(0x0008, 0x1030, lo('Slice Phantom')),
    el(0x0008, 0x103e, lo('Axial Phantom')),
    el(0x0010, 0x0010, pn('Phantom^Slice')),
    el(0x0010, 0x0020, lo('PHANTOM001')),
    el(0x0018, 0x0050, ds('2.5')),
    el(0x0020, 0x000d, ui(studyUID)),
    el(0x0020, 0x000e, ui(seriesUID)),
    el(0x0020, 0x0013, is(String(instanceNumber))),
    el(0x0020, 0x0032, ds(`0\\0\\${z}`)),
    el(0x0020, 0x0037, ds('1\\0\\0\\0\\1\\0')),
    el(0x0028, 0x0002, u16le(1)),
    el(0x0028, 0x0004, cs('MONOCHROME2')),
    el(0x0028, 0x0010, u16le(rows)),
    el(0x0028, 0x0011, u16le(columns)),
    el(0x0028, 0x0030, ds('1\\1')),
    el(0x0028, 0x0100, u16le(16)),
    el(0x0028, 0x0101, u16le(16)),
    el(0x0028, 0x0102, u16le(15)),
    el(0x0028, 0x0103, u16le(1)),
    el(0x0028, 0x1050, ds('40')),
    el(0x0028, 0x1051, ds('400')),
    el(0x0028, 0x1052, ds('0')),
    el(0x0028, 0x1053, ds('1')),
    el(0x7fe0, 0x0010, pixelBytes),
  ]);

  return Buffer.concat([Buffer.alloc(128, 0), Buffer.from('DICM', 'ascii'), meta, dataset]);
}

export function writeMinimalSeries(
  outDir: string,
  slices: number,
  rows = 16,
  columns = 16,
): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  const paths: string[] = [];
  for (let z = 0; z < slices; z++) {
    const pixels = new Int16Array(rows * columns);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        const cx = x - columns / 2;
        const cy = y - rows / 2;
        const cz = z - slices / 2;
        const r = Math.sqrt(cx * cx + cy * cy + cz * cz);
        pixels[y * columns + x] = r < 4 ? 40 : -1000;
      }
    }
    const buf = buildMinimalDicom({
      rows,
      columns,
      instanceNumber: z + 1,
      z: (z - (slices - 1) / 2) * 2.5,
      pixels,
    });
    const file = path.join(outDir, `IMG${String(z + 1).padStart(4, '0')}.dcm`);
    fs.writeFileSync(file, buf);
    paths.push(file);
  }
  return paths;
}
