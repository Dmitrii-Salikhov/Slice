import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import net from 'node:net';
import { createRequire } from 'node:module';
import { writeMinimalSeries } from './writeMinimalDicom';

const require = createRequire(import.meta.url);
const dcmjsDimse = require('dcmjs-dimse');
const {
  pacsEcho,
  pacsFind,
  pacsStore,
  pacsGet,
  pacsMove,
  datasetToPlain,
  normalizeFindHit,
} = require('../electron/pacs.cjs');

const { Server, Scp, Dataset } = dcmjsDimse;
const { CEchoResponse, CFindResponse, CStoreResponse, CGetResponse, CMoveResponse } =
  dcmjsDimse.responses;
const { CStoreRequest } = dcmjsDimse.requests;
const {
  Status,
  PresentationContextResult,
  TransferSyntax,
} = dcmjsDimse.constants;

const STUDY_UID = '1.2.826.0.1.3680043.9.7333.1.1';
const SERIES_UID = '1.2.826.0.1.3680043.9.7333.1.2';
const SOP_UID = '1.2.826.0.1.3680043.9.7333.1.3.1';

function pickPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on('error', reject);
  });
}

function acceptAllContexts(association: {
  setMaxPduLength: (n: number) => void;
  getPresentationContexts: () => Array<{ id: number }>;
  getPresentationContext: (id: number) => {
    getTransferSyntaxUids: () => string[];
    setResult: (result: number, ts: string) => void;
  };
  sendAssociationAccept?: () => void;
}) {
  association.setMaxPduLength(65536);
  for (const c of association.getPresentationContexts()) {
    const context = association.getPresentationContext(c.id);
    const uids = context.getTransferSyntaxUids();
    const preferred =
      uids.find(
        (u) =>
          u === TransferSyntax.ExplicitVRLittleEndian ||
          u === TransferSyntax.ImplicitVRLittleEndian,
      ) || uids[0];
    if (preferred) context.setResult(PresentationContextResult.Accept, preferred);
    else context.setResult(PresentationContextResult.RejectTransferSyntaxesNotSupported, '');
  }
}

describe('pacs datasetToPlain', () => {
  it('handles null, arrays, and PN Alphabetic objects', () => {
    expect(datasetToPlain(null)).toEqual({});
    expect(
      datasetToPlain({
        PatientID: '1',
        ModalitiesInStudy: ['CT', 'SR'],
        PatientName: { Alphabetic: 'DOE^JOHN' },
        Empty: null,
      }),
    ).toEqual({
      PatientID: '1',
      ModalitiesInStudy: 'CT\\SR',
      PatientName: 'DOE^JOHN',
      Empty: '',
    });
  });
});

describe('pacs validation', () => {
  it('rejects empty store and missing UIDs', async () => {
    const conn = {
      host: '127.0.0.1',
      port: 1,
      callingAe: 'SLICE',
      calledAe: 'PACS',
    };
    await expect(pacsStore(conn, [])).rejects.toThrow(/No files/i);
    await expect(pacsGet(conn, '')).rejects.toThrow(/StudyInstanceUID/i);
    await expect(pacsMove(conn, '')).rejects.toThrow(/StudyInstanceUID/i);
    await expect(
      pacsGet(conn, '1.2.3', { level: 'series' }),
    ).rejects.toThrow(/SeriesInstanceUID/i);
    await expect(
      pacsMove(conn, '1.2.3', { level: 'instance', seriesInstanceUid: '1.2.3.1' }),
    ).rejects.toThrow(/SOPInstanceUID/i);
  });
});

describe('normalizeFindHit', () => {
  it('maps study / series / instance fields', () => {
    expect(normalizeFindHit({ StudyInstanceUID: 'S', ModalitiesInStudy: 'CT' }, 'study').level).toBe(
      'study',
    );
    expect(
      normalizeFindHit(
        {
          StudyInstanceUID: 'S',
          SeriesInstanceUID: 'Se',
          Modality: 'MR',
          SeriesDescription: 'Ax',
          NumberOfSeriesRelatedInstances: '12',
        },
        'series',
      ),
    ).toMatchObject({
      level: 'series',
      seriesInstanceUID: 'Se',
      modality: 'MR',
      seriesDescription: 'Ax',
      instanceCount: '12',
    });
    expect(
      normalizeFindHit(
        {
          StudyInstanceUID: 'S',
          SeriesInstanceUID: 'Se',
          SOPInstanceUID: 'I',
          InstanceNumber: '3',
        },
        'instance',
      ),
    ).toMatchObject({
      level: 'instance',
      sopInstanceUID: 'I',
      instanceNumber: '3',
    });
  });
});

describe('pacs loopback DIMSE', () => {
  let port = 0;
  let server: InstanceType<typeof Server> | null = null;
  let storeDir = '';
  let fixtureFiles: string[] = [];
  const storedOnScp: string[] = [];

  beforeAll(async () => {
    storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slice-pacs-scp-'));
    const seriesDir = path.join(storeDir, 'series');
    fixtureFiles = writeMinimalSeries(seriesDir, 2, 8, 8);
    port = await pickPort();

    class TestScp extends Scp {
      associationRequested(association: Parameters<Scp['associationRequested']>[0]) {
        acceptAllContexts(association as never);
        this.sendAssociationAccept();
      }

      cEchoRequest(request: unknown, callback: (r: unknown) => void) {
        const response = CEchoResponse.fromRequest(request as never);
        response.setStatus(Status.Success);
        callback(response);
      }

      cFindRequest(request: { getDataset?: () => { getElement?: (k: string) => string } }, callback: (r: unknown[]) => void) {
        const level = String(
          request.getDataset?.()?.getElement?.('QueryRetrieveLevel') || 'STUDY',
        ).toUpperCase();

        let dataset: InstanceType<typeof Dataset>;
        if (level === 'SERIES') {
          dataset = new Dataset({
            PatientID: 'PHANTOM001',
            PatientName: 'Phantom^Slice',
            StudyInstanceUID: STUDY_UID,
            SeriesInstanceUID: SERIES_UID,
            Modality: 'CT',
            SeriesDescription: 'Axial Phantom',
            SeriesNumber: '1',
            NumberOfSeriesRelatedInstances: '2',
          });
        } else if (level === 'IMAGE') {
          dataset = new Dataset({
            PatientID: 'PHANTOM001',
            StudyInstanceUID: STUDY_UID,
            SeriesInstanceUID: SERIES_UID,
            SOPInstanceUID: SOP_UID,
            InstanceNumber: '1',
            Modality: 'CT',
          });
        } else {
          dataset = new Dataset({
            PatientID: 'PHANTOM001',
            PatientName: 'Phantom^Slice',
            StudyDate: '20260101',
            StudyDescription: 'Slice Phantom',
            AccessionNumber: 'ACC1',
            ModalitiesInStudy: 'CT',
            StudyInstanceUID: STUDY_UID,
            NumberOfStudyRelatedSeries: '1',
            NumberOfStudyRelatedInstances: '2',
          });
        }

        const pending = CFindResponse.fromRequest(request as never);
        pending.setDataset(dataset);
        pending.setStatus(Status.Pending);
        const done = CFindResponse.fromRequest(request as never);
        done.setStatus(Status.Success);
        callback([pending, done]);
      }

      cStoreRequest(request: { getDataset: () => { toFile: Function } }, callback: (r: unknown) => void) {
        const response = CStoreResponse.fromRequest(request as never);
        const out = path.join(storeDir, `stored-${storedOnScp.length + 1}.dcm`);
        request.getDataset().toFile(out, (err: Error | undefined) => {
          if (err) {
            response.setStatus(Status.ProcessingFailure);
          } else {
            storedOnScp.push(out);
            response.setStatus(Status.Success);
          }
          callback(response);
        });
      }

      cGetRequest(request: unknown, callback: (r: unknown[]) => void) {
        const stores = fixtureFiles.map((f) => new CStoreRequest(f));
        this.sendRequests(stores);

        const pending = CGetResponse.fromRequest(request as never);
        pending.setStatus(Status.Pending);

        const done = CGetResponse.fromRequest(request as never);
        done.setStatus(Status.Success);
        // Respond after stores are queued; association stays open for C-STORE sub-ops
        setTimeout(() => callback([pending, done]), 50);
      }

      cMoveRequest(request: unknown, callback: (r: unknown[]) => void) {
        // Minimal success without actually moving — Move full path tested separately when possible
        const done = CMoveResponse.fromRequest(request as never);
        done.setStatus(Status.Success);
        callback([done]);
      }

      associationReleaseRequested() {
        this.sendAssociationReleaseResponse();
      }
    }

    server = new Server(TestScp);
    server.listen(port);
    await new Promise((r) => setTimeout(r, 100));
  }, 30000);

  afterAll(async () => {
    try {
      server?.close();
    } catch {
      // ignore
    }
    await fs.rm(storeDir, { recursive: true, force: true });
  });

  const conn = () => ({
    host: '127.0.0.1',
    port,
    callingAe: 'SLICE',
    calledAe: 'TEST-SCP',
    localAe: 'SLICE',
    localPort: 0,
  });

  it('C-ECHO succeeds against local SCP', async () => {
    const res = await pacsEcho(conn());
    expect(res.ok).toBe(true);
    expect(res.status).toBe(Status.Success);
  }, 20000);

  it('C-FIND returns study hits', async () => {
    const results = await pacsFind(conn(), { patientId: 'PHANTOM001' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].patientId).toBe('PHANTOM001');
    expect(results[0].studyInstanceUID).toBe(STUDY_UID);
    expect(results[0].level).toBe('study');
    expect(results[0].modalities).toContain('CT');
  }, 20000);

  it('C-FIND returns series hits', async () => {
    const results = await pacsFind(conn(), {
      level: 'series',
      studyInstanceUID: STUDY_UID,
    });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].level).toBe('series');
    expect(results[0].seriesInstanceUID).toBe(SERIES_UID);
    expect(results[0].modality).toBe('CT');
  }, 20000);

  it('C-FIND returns instance hits', async () => {
    const results = await pacsFind(conn(), {
      level: 'instance',
      studyInstanceUID: STUDY_UID,
      seriesInstanceUID: SERIES_UID,
    });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].level).toBe('instance');
    expect(results[0].sopInstanceUID).toBe(SOP_UID);
  }, 20000);

  it('C-STORE uploads local DICOM files', async () => {
    const before = storedOnScp.length;
    const res = await pacsStore(conn(), fixtureFiles);
    expect(res.total).toBe(2);
    expect(res.stored).toBe(2);
    expect(res.failed).toBe(0);
    expect(storedOnScp.length).toBe(before + 2);
  }, 30000);

  it('C-GET retrieves a series', async () => {
    const res = await pacsGet(conn(), STUDY_UID, {
      level: 'series',
      seriesInstanceUid: SERIES_UID,
    });
    expect(res.files.length).toBeGreaterThanOrEqual(1);
    await fs.rm(res.extractDir, { recursive: true, force: true });
  }, 45000);

  it('C-MOVE completes association (destination AE configured separately)', async () => {
    const localPort = await pickPort();
    const res = await pacsMove(
      { ...conn(), localPort, localAe: 'SLICE' },
      STUDY_UID,
    );
    // Test SCP returns success without pushing files — move client path still works
    expect(Array.isArray(res.files)).toBe(true);
    expect(res.extractDir).toBeTruthy();
    await fs.rm(res.extractDir, { recursive: true, force: true });
  }, 45000);
});
