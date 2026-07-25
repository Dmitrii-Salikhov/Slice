export type DicomDocumentKind = 'pdf' | 'sr' | 'other';

export type DicomDocument = {
  kind: DicomDocumentKind;
  filePath: string;
  sopInstanceUID: string;
  sopClassUID: string;
  studyInstanceUID: string;
  seriesInstanceUID: string;
  studyDescription: string;
  seriesDescription: string;
  modality: string;
  patientName: string;
  patientId: string;
  label: string;
  /** Raw PDF bytes when kind === 'pdf' */
  pdfBytes?: Uint8Array;
  /** Flattened SR text when kind === 'sr' */
  text?: string;
  mimeType?: string;
};

export const SOP_ENCAPSULATED_PDF = '1.2.840.10008.5.1.4.1.1.104.1';
export const SOP_SR_PREFIX = '1.2.840.10008.5.1.4.1.1.88.';

export function isEncapsulatedPdf(sopClassUID: string): boolean {
  return sopClassUID === SOP_ENCAPSULATED_PDF;
}

export function isStructuredReport(sopClassUID: string): boolean {
  return sopClassUID.startsWith(SOP_SR_PREFIX);
}

export function isDocumentSop(sopClassUID: string): boolean {
  return isEncapsulatedPdf(sopClassUID) || isStructuredReport(sopClassUID);
}

type DatasetLike = {
  string?: (tag: string) => string | undefined;
  elements?: Record<string, { dataOffset: number; length: number }>;
};

/** Extract Encapsulated Document (0042,0011) bytes. */
export function extractEncapsulatedDocument(
  dataSet: DatasetLike,
  byteArray: Uint8Array,
): Uint8Array | null {
  const el = dataSet.elements?.x00420011;
  if (!el || el.length <= 0) return null;
  return byteArray.subarray(el.dataOffset, el.dataOffset + el.length);
}

function walkSrValue(node: unknown, lines: string[], depth: number): void {
  if (!node || typeof node !== 'object') return;
  const n = node as Record<string, unknown>;
  const concept = n.ConceptNameCodeSequence ?? n.ConceptNameCodeSequence;
  const indent = '  '.repeat(depth);

  let name = '';
  const conceptSeq = Array.isArray(concept) ? concept[0] : concept;
  if (conceptSeq && typeof conceptSeq === 'object') {
    const c = conceptSeq as Record<string, unknown>;
    name = String(c.CodeMeaning ?? c.CodeValue ?? '');
  }

  if (n.TextValue != null) {
    lines.push(`${indent}${name ? `${name}: ` : ''}${String(n.TextValue)}`);
  } else if (n.NumericValue != null) {
    const units = n.MeasurementUnitsCodeSequence;
    const u0 = Array.isArray(units) ? units[0] : units;
    const unit =
      u0 && typeof u0 === 'object'
        ? String((u0 as Record<string, unknown>).CodeMeaning ?? '')
        : '';
    lines.push(`${indent}${name ? `${name}: ` : ''}${String(n.NumericValue)}${unit ? ` ${unit}` : ''}`);
  } else if (n.CodeValue != null || n.CodeMeaning != null) {
    lines.push(`${indent}${name || String(n.CodeMeaning ?? n.CodeValue)}`);
  } else if (name) {
    lines.push(`${indent}${name}`);
  }

  const content = n.ContentSequence;
  if (Array.isArray(content)) {
    for (const child of content) walkSrValue(child, lines, depth + (name ? 1 : 0));
  }
}

/** Best-effort flatten of SR ContentSequence via dcmjs naturalized dataset. */
export async function extractSrText(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    const dcmjs = await import('dcmjs');
    const { DicomMessage, DicomMetaDictionary } = dcmjs.data;
    const dicomData = DicomMessage.readFile(arrayBuffer);
    const natural = DicomMetaDictionary.naturalizeDataset(dicomData.dict);
    const lines: string[] = [];
    const title = natural.ConceptNameCodeSequence;
    if (title) {
      const t0 = Array.isArray(title) ? title[0] : title;
      if (t0?.CodeMeaning) lines.push(String(t0.CodeMeaning));
    }
    if (natural.ContentSequence) {
      const seq = Array.isArray(natural.ContentSequence)
        ? natural.ContentSequence
        : [natural.ContentSequence];
      for (const item of seq) walkSrValue(item, lines, 0);
    }
    if (lines.length === 0) {
      return JSON.stringify(natural, null, 2).slice(0, 20000);
    }
    return lines.join('\n');
  } catch (e) {
    return `Could not parse SR: ${e instanceof Error ? e.message : String(e)}`;
  }
}
