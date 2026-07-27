import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SliceApi } from '../electron/api';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const EXPECTED_API_METHODS: (keyof SliceApi)[] = [
  'openFolder',
  'openStudy',
  'openStudyFiles',
  'openZipDialog',
  'openFileDialog',
  'openDicomFilesDialog',
  'openPath',
  'saveFileDialog',
  'saveDirectoryDialog',
  'listDicomFiles',
  'findDicomdir',
  'resolveDroppedPaths',
  'readFile',
  'writeFile',
  'writeTemp',
  'zipNeedsPassword',
  'extractZip',
  'listMedia',
  'openMedia',
  'pacsEcho',
  'pacsFind',
  'pacsMove',
  'pacsGet',
  'pacsStore',
  'pacsRetrieveCancel',
  'onPacsRetrieveProgress',
  'getPacsProfiles',
  'setPacsProfiles',
  'setProgressBar',
  'onAppCommand',
  'onOpenPaths',
  'getPathForFile',
  'getAppVersion',
  'getUpdateRepo',
  'checkUpdate',
  'openExternal',
];

describe('Slice API contract', () => {
  it('preload exposes all SliceApi methods', () => {
    const preload = fs.readFileSync(path.join(root, 'electron/preload.cjs'), 'utf8');
    for (const method of EXPECTED_API_METHODS) {
      expect(preload).toContain(`${method}:`);
    }
  });

  it('main process registers IPC channels for new sources', () => {
    const main = fs.readFileSync(path.join(root, 'electron/main.cjs'), 'utf8');
    for (const channel of [
      'dialog:openStudy',
      'dialog:openStudyFiles',
      'dialog:openZip',
      'dialog:openFile',
      'dialog:openDicomFiles',
      'shell:openPath',
      'window:setProgress',
      'zip:needsPassword',
      'zip:extract',
      'media:list',
      'media:open',
      'dialog:saveFile',
      'dialog:saveDirectory',
      'fs:writeFile',
      'fs:writeTemp',
      'fs:findDicomdir',
      'pacs:echo',
      'pacs:find',
      'pacs:move',
      'pacs:get',
      'pacs:store',
      'pacs:retrieve-cancel',
      'settings:getPacsProfiles',
      'settings:setPacsProfiles',
      'app:getVersion',
      'app:getUpdateRepo',
      'app:checkUpdate',
      'shell:openExternal',
    ]) {
      expect(main).toContain(`'${channel}'`);
    }
    expect(main).toContain('pacs:retrieve-progress');
    expect(main).toContain('requestSingleInstanceLock');
    expect(main).toContain('installAppMenu');
    expect(main).toContain('Icon.ico');
    expect(main).toContain('sandbox: true');
    expect(main).toContain('Content-Security-Policy');
  });

  it('API method list stays unique', () => {
    expect(new Set(EXPECTED_API_METHODS).size).toBe(EXPECTED_API_METHODS.length);
  });
});
