/** DICOM RLE Lossless (1.2.840.10008.1.2.5) decoder */

export function decodeRleFrame(
  encoded: Uint8Array,
  rows: number,
  columns: number,
  samplesPerPixel: number,
  bitsAllocated: number,
): Uint8Array {
  const bytesPerSample = bitsAllocated <= 8 ? 1 : 2;
  const frameSize = rows * columns * samplesPerPixel * bytesPerSample;
  const out = new Uint8Array(frameSize);

  const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
  const numSegments = view.getUint32(0, true);
  if (numSegments < 1 || numSegments > 16) {
    throw new Error(`Invalid RLE segment count: ${numSegments}`);
  }

  const offsets: number[] = [];
  for (let i = 0; i < numSegments; i++) {
    offsets.push(view.getUint32(4 + i * 4, true));
  }
  offsets.push(encoded.byteLength);

  const segmentBuffers: Uint8Array[] = [];
  for (let s = 0; s < numSegments; s++) {
    const start = offsets[s];
    const end = offsets[s + 1];
    segmentBuffers.push(decodeRleSegment(encoded.subarray(start, end)));
  }

  // Interleave segments → little-endian multi-byte / multi-sample
  if (bytesPerSample === 1 && samplesPerPixel === 1) {
    out.set(segmentBuffers[0].subarray(0, frameSize));
    return out;
  }

  if (bytesPerSample === 2 && samplesPerPixel === 1 && numSegments >= 2) {
    const hi = segmentBuffers[0];
    const lo = segmentBuffers[1];
    const n = rows * columns;
    for (let i = 0; i < n; i++) {
      out[i * 2] = lo[i] ?? 0;
      out[i * 2 + 1] = hi[i] ?? 0;
    }
    return out;
  }

  // Generic: segment s is byte plane s
  const n = rows * columns;
  for (let i = 0; i < n; i++) {
    for (let s = 0; s < Math.min(numSegments, samplesPerPixel * bytesPerSample); s++) {
      const sample = Math.floor(s / bytesPerSample);
      const byteIdx = s % bytesPerSample;
      const dest =
        bytesPerSample === 2
          ? i * samplesPerPixel * 2 + sample * 2 + (1 - byteIdx) // hi then lo in DICOM RLE
          : i * samplesPerPixel + sample;
      if (bytesPerSample === 2) {
        // segments: high bytes then low bytes per sample
        const plane = s;
        const val = segmentBuffers[plane]?.[i] ?? 0;
        if (plane % 2 === 0) out[i * 2 + 1] = val;
        else out[i * 2] = val;
      } else {
        out[dest] = segmentBuffers[s]?.[i] ?? 0;
      }
    }
  }
  return out;
}

function decodeRleSegment(src: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < src.length) {
    const n = src[i++];
    if (n > 128) {
      // literal run: next (257-n) bytes
      const count = 257 - n;
      for (let c = 0; c < count && i < src.length; c++) out.push(src[i++]);
    } else if (n < 128) {
      // repeat: next byte repeated (n+1) times
      const value = src[i++] ?? 0;
      for (let c = 0; c < n + 1; c++) out.push(value);
    }
    // n === 128 → no-op
  }
  return Uint8Array.from(out);
}
