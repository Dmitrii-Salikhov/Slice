import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { collectOpenPathsFromArgv } = require('../electron/argv.cjs');

describe('collectOpenPathsFromArgv', () => {
  it('keeps existing filesystem paths and skips scripts/electron', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slice-argv-'));
    const file = path.join(dir, 'study.dcm');
    fs.writeFileSync(file, 'x');

    const paths = collectOpenPathsFromArgv(
      [
        '/usr/bin/electron',
        path.join(dir, 'main.cjs'),
        '--inspect',
        file,
        path.join(dir, 'missing.dcm'),
      ],
      { execPath: '/usr/bin/electron' },
    );

    expect(paths).toEqual([file]);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
