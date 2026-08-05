import type { MessageKey } from '../i18n/translations';

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

type Rule = {
  test: (msg: string) => boolean;
  key: MessageKey;
  params?: (msg: string) => Record<string, string | number>;
};

const RULES: Rule[] = [
  {
    test: (m) => /No handler registered/i.test(m),
    key: 'error.restartRequired',
  },
  {
    test: (m) => /Electron API unavailable|API Electron недоступен/i.test(m),
    key: 'error.noApi',
  },
  {
    test: (m) => /Invalid path|path denied|Media path denied|not allowed/i.test(m),
    key: 'error.accessDenied',
  },
  {
    test: (m) => /EACCES|EPERM|permission denied/i.test(m),
    key: 'error.accessDenied',
  },
  {
    test: (m) => /ENOENT|no such file|not found/i.test(m),
    key: 'error.fileNotFound',
  },
  {
    test: (m) => /Invalid password|неверный пароль/i.test(m),
    key: 'error.zipInvalidPassword',
  },
  {
    test: (m) => /encrypted|needs.?password|NEEDS_PASSWORD/i.test(m),
    key: 'error.zipPassword',
  },
  {
    test: (m) => /zip|extract/i.test(m) && /fail|error|could not|не удалось/i.test(m),
    key: 'error.zipExtract',
  },
  {
    test: (m) => /Unsupported transfer syntax|Unsupported encapsulated transfer/i.test(m),
    key: 'error.unsupportedTransfer',
  },
  {
    test: (m) => /Unsupported SOP Class|no image pixels/i.test(m),
    key: 'error.notImageDicom',
  },
  {
    test: (m) =>
      /dicomParser|missing required meta header|Missing Rows\/Columns|not a DICOM|invalid DICOM/i.test(
        m,
      ),
    key: 'error.wrongFormat',
  },
  {
    test: (m) => /Missing Pixel Data|JPEG.*decode failed|JpegLS|J2KDecoder|RLE/i.test(m),
    key: 'error.decodeFailed',
  },
  {
    test: (m) => /BitsAllocated/i.test(m),
    key: 'error.decodeFailed',
  },
  {
    test: (m) => /Inhomogeneous series|Empty series|Missing pixels for slice/i.test(m),
    key: 'error.mprFailed',
  },
  {
    test: (m) => /WebGL unavailable|createShader|shader compile|texture limit|context lost/i.test(m),
    key: 'error.webglFallback',
  },
  {
    test: (m) => /DICOMDIR|Directory Record Sequence/i.test(m),
    key: 'dicomdir.parseFail',
  },
  {
    test: (m) => /Invalid annotations|Missing seriesInstanceUID/i.test(m),
    key: 'error.annotationsInvalid',
  },
  {
    test: (m) => /No pixel data to export|Invalid export size|Could not create canvas/i.test(m),
    key: 'export.fail',
  },
  {
    test: (m) => /PACS|Association|DIMSE|C-ECHO|C-FIND|C-MOVE|C-STORE|AE Title|localPort/i.test(m),
    key: 'error.pacsFailed',
  },
];

/** Map a raw / technical error into a short user-facing message. */
export function humanizeError(raw: unknown, t: Translate): string {
  const msg = (raw instanceof Error ? raw.message : String(raw ?? '')).trim();
  if (!msg) return t('error.unknown');

  for (const rule of RULES) {
    if (rule.test(msg)) {
      return t(rule.key, rule.params?.(msg));
    }
  }

  return msg;
}

function isWrongFormatReason(reason: string): boolean {
  return /dicomParser|missing required meta header|Missing Rows\/Columns|not a DICOM|invalid DICOM|byteArray/i.test(
    reason,
  );
}

function isUnsupportedTransferReason(reason: string): boolean {
  return /Unsupported transfer syntax|Unsupported encapsulated transfer/i.test(reason);
}

function isNotImageReason(reason: string): boolean {
  return /Unsupported SOP Class|no image pixels/i.test(reason);
}

/**
 * Pick a clear load-failure message when a scan found candidate files but none loaded.
 */
export function messageForFailedLoad(
  fileCount: number,
  skippedReasons: string[],
  t: Translate,
): string {
  if (fileCount <= 0) return t('error.noFiles');
  if (skippedReasons.length === 0) return t('error.noParse');

  if (skippedReasons.every(isWrongFormatReason)) return t('error.wrongFormat');
  if (skippedReasons.every(isUnsupportedTransferReason)) return t('error.unsupportedTransfer');
  if (skippedReasons.every(isNotImageReason)) return t('error.notImageDicom');

  const wrong = skippedReasons.filter(isWrongFormatReason).length;
  const transfer = skippedReasons.filter(isUnsupportedTransferReason).length;
  if (wrong > 0 && wrong >= skippedReasons.length / 2) return t('error.wrongFormat');
  if (transfer > 0 && transfer >= skippedReasons.length / 2) return t('error.unsupportedTransfer');

  return t('error.noParse');
}
