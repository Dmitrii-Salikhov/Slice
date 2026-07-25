/**
 * Write a minimal Implicit VR Little Endian CT-like series (phantom).
 * Usage: node scripts/make-phantom.mjs [outDir] [slices]
 */
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve(process.argv[2] ?? 'sample-dicom');
const slices = Number(process.argv[3] ?? 32);
const rows = 128;
const cols = 128;

function u16le(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}
function u32le(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
}
function padEven(buf, pad = 0x00) {
  if (buf.length % 2 === 1) return Buffer.concat([buf, Buffer.from([pad])]);
  return buf;
}
function ui(s) {
  return padEven(Buffer.from(s, 'ascii'), 0x00);
}
function cs(s) {
  return padEven(Buffer.from(s, 'ascii'), 0x20);
}
function lo(s) {
  return padEven(Buffer.from(s, 'ascii'), 0x20);
}
function pn(s) {
  return padEven(Buffer.from(s, 'ascii'), 0x20);
}
function ds(s) {
  return padEven(Buffer.from(s, 'ascii'), 0x20);
}
function is(s) {
  return padEven(Buffer.from(s, 'ascii'), 0x20);
}
function el(group, element, value) {
  return Buffer.concat([u16le(group), u16le(element), u32le(value.length), value]);
}
function metaEl(element, vr, value) {
  if (vr === 'OB' || vr === 'OW' || vr === 'SQ' || vr === 'UN' || vr === 'UT') {
    const padded = padEven(value, 0x00);
    return Buffer.concat([
      u16le(0x0002),
      u16le(element),
      Buffer.from(vr, 'ascii'),
      Buffer.from([0, 0]),
      u32le(padded.length),
      padded,
    ]);
  }
  const padded = vr === 'UI' ? padEven(value, 0x00) : padEven(value, 0x20);
  return Buffer.concat([
    u16le(0x0002),
    u16le(element),
    Buffer.from(vr, 'ascii'),
    u16le(padded.length),
    padded,
  ]);
}

function buildSlice(zIndex) {
  const instanceNumber = zIndex + 1;
  const z = (zIndex - (slices - 1) / 2) * 2.5;
  const studyUID = '1.2.826.0.1.3680043.9.7333.1.1';
  const seriesUID = '1.2.826.0.1.3680043.9.7333.1.2';
  const sopUID = `1.2.826.0.1.3680043.9.7333.1.3.${instanceNumber}`;

  const pixelBytes = Buffer.alloc(rows * cols * 2);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cx = (x - cols / 2) / (cols / 4);
      const cy = (y - rows / 2) / (rows / 4);
      const cz = (zIndex - (slices - 1) / 2) / (slices / 4);
      const r = Math.sqrt(cx * cx + cy * cy + cz * cz);
      let hu = -1000;
      if (r < 1.0) hu = 40;
      if (r < 0.35) hu = 400;
      if (Math.abs(x - cols / 2) < 2 && Math.abs(y - rows / 2) < 2) hu = 1000;
      pixelBytes.writeInt16LE(hu, (y * cols + x) * 2);
    }
  }

  const metaBody = Buffer.concat([
    metaEl(0x0001, 'OB', Buffer.from([0x00, 0x01])),
    metaEl(0x0002, 'UI', Buffer.from('1.2.840.10008.5.1.4.1.1.2', 'ascii')),
    metaEl(0x0003, 'UI', Buffer.from(sopUID, 'ascii')),
    metaEl(0x0010, 'UI', Buffer.from('1.2.840.10008.1.2', 'ascii')),
  ]);
  const meta = Buffer.concat([metaEl(0x0000, 'UL', u32le(metaBody.length)), metaBody]);

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
    el(0x0028, 0x0011, u16le(cols)),
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

fs.mkdirSync(outDir, { recursive: true });
for (let z = 0; z < slices; z++) {
  const name = path.join(outDir, `IMG${String(z + 1).padStart(4, '0')}.dcm`);
  fs.writeFileSync(name, buildSlice(z));
}
console.log(`Wrote ${slices} slices → ${outDir}`);
