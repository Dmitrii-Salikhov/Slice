const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const dcmjsDimse = require('dcmjs-dimse');

const { Client, Server, Scp } = dcmjsDimse;
const { CFindRequest, CMoveRequest, CGetRequest, CStoreRequest, CEchoRequest } =
  dcmjsDimse.requests;
const { CStoreResponse } = dcmjsDimse.responses;
const {
  Status,
  PresentationContextResult,
  TransferSyntax,
} = dcmjsDimse.constants;

function elemToString(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(elemToString).filter(Boolean).join('\\');
  if (typeof value === 'object') {
    if (value.Alphabetic != null) return elemToString(value.Alphabetic);
    if (value.Value != null) return elemToString(value.Value);
  }
  return String(value);
}

function datasetToPlain(ds) {
  if (!ds) return {};
  const elements = typeof ds.getElements === 'function' ? ds.getElements() : ds;
  const out = {};
  for (const [k, v] of Object.entries(elements || {})) {
    out[k] = elemToString(v);
  }
  return out;
}

function runClient(host, port, callingAe, calledAe, build) {
  return new Promise((resolve, reject) => {
    const client = new Client();
    let settled = false;
    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(value);
    };

    client.on('networkError', (e) => finish(e instanceof Error ? e : new Error(String(e))));
    client.on('closed', () => finish(null, undefined));

    try {
      build(client);
      client.send(host, Number(port), callingAe, calledAe);
    } catch (e) {
      finish(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

function pickTransferSyntax(uids) {
  const preferred = [
    TransferSyntax.ExplicitVRLittleEndian,
    TransferSyntax.ImplicitVRLittleEndian,
    TransferSyntax.ExplicitVRBigEndian,
  ];
  for (const p of preferred) {
    if (uids.includes(p)) return p;
  }
  return uids[0];
}

function createReceiveScp(saveDir, savedFiles, onFile) {
  let counter = 0;

  class SliceStoreScp extends Scp {
    constructor(socket, opts) {
      super(socket, opts);
      this.association = undefined;
    }

    associationRequested(association) {
      this.association = association;
      association.setMaxPduLength(65536);
      const contexts = association.getPresentationContexts();
      for (const c of contexts) {
        const context = association.getPresentationContext(c.id);
        const ts = pickTransferSyntax(context.getTransferSyntaxUids());
        if (ts) {
          context.setResult(PresentationContextResult.Accept, ts);
        } else {
          context.setResult(PresentationContextResult.RejectTransferSyntaxesNotSupported);
        }
      }
      this.sendAssociationAccept();
    }

    cEchoRequest(request, callback) {
      const { CEchoResponse } = dcmjsDimse.responses;
      const response = CEchoResponse.fromRequest(request);
      response.setStatus(Status.Success);
      callback(response);
    }

    cStoreRequest(request, callback) {
      const response = CStoreResponse.fromRequest(request);
      try {
        const dataset = request.getDataset();
        counter += 1;
        const sop = elemToString(dataset?.getElement?.('SOPInstanceUID')) || `inst-${counter}`;
        const safe = sop.replace(/[^\w.-]+/g, '_');
        const filePath = path.join(saveDir, `${String(counter).padStart(5, '0')}_${safe}.dcm`);
        dataset.toFile(filePath, (err) => {
          if (err) {
            response.setStatus(Status.ProcessingFailure);
          } else {
            savedFiles.push(filePath);
            response.setStatus(Status.Success);
            onFile?.(filePath, savedFiles.length);
          }
          callback(response);
        });
      } catch {
        response.setStatus(Status.ProcessingFailure);
        callback(response);
      }
    }

    associationReleaseRequested() {
      this.sendAssociationReleaseResponse();
    }
  }

  return SliceStoreScp;
}

function abortIfCancelled(isCancelled) {
  if (!isCancelled?.()) return;
  const err = new Error('Retrieve cancelled');
  err.name = 'AbortError';
  throw err;
}

async function waitForFiles(
  saveDir,
  savedFiles,
  { timeoutMs = 120000, quietMs = 1500, isCancelled } = {},
) {
  const started = Date.now();
  let lastCount = -1;
  let lastChange = Date.now();

  while (Date.now() - started < timeoutMs) {
    abortIfCancelled(isCancelled);
    if (savedFiles.length !== lastCount) {
      lastCount = savedFiles.length;
      lastChange = Date.now();
    }
    if (savedFiles.length > 0 && Date.now() - lastChange >= quietMs) {
      return;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

/**
 * @param {{ host: string, port: number, callingAe: string, calledAe: string }} conn
 */
async function pacsEcho(conn) {
  let ok = false;
  let status = null;
  await runClient(conn.host, conn.port, conn.callingAe, conn.calledAe, (client) => {
    const request = new CEchoRequest();
    request.on('response', (response) => {
      status = response.getStatus();
      ok = status === Status.Success;
    });
    client.addRequest(request);
  });
  return { ok, status };
}

/**
 * @param {{ host: string, port: number, callingAe: string, calledAe: string }} conn
 * @param {Record<string, string>} query
 *   level?: 'study'|'series'|'instance'
 *   patientId, patientName, studyDate, accession, modality
 *   studyInstanceUID, seriesInstanceUID
 */
async function pacsFind(conn, query = {}) {
  const level = (query.level || 'study').toLowerCase();
  const results = [];

  let request;
  if (level === 'series') {
    request = CFindRequest.createSeriesFindRequest({
      StudyInstanceUID: query.studyInstanceUID ?? '',
      SeriesInstanceUID: '',
      Modality: query.modality ?? '',
      SeriesDescription: '',
      SeriesNumber: '',
      NumberOfSeriesRelatedInstances: '',
      PatientID: query.patientId ?? '',
      PatientName: query.patientName ?? '',
      StudyDate: query.studyDate ?? '',
      AccessionNumber: query.accession ?? '',
    });
  } else if (level === 'instance' || level === 'image') {
    request = CFindRequest.createImageFindRequest({
      StudyInstanceUID: query.studyInstanceUID ?? '',
      SeriesInstanceUID: query.seriesInstanceUID ?? '',
      SOPInstanceUID: '',
      InstanceNumber: '',
      Modality: query.modality ?? '',
      PatientID: query.patientId ?? '',
      PatientName: query.patientName ?? '',
    });
  } else {
    request = CFindRequest.createStudyFindRequest({
      PatientID: query.patientId ?? '',
      PatientName: query.patientName ?? '',
      StudyDate: query.studyDate ?? '',
      AccessionNumber: query.accession ?? '',
      ModalitiesInStudy: query.modality ?? '',
      StudyDescription: '',
      StudyInstanceUID: query.studyInstanceUID ?? '',
      PatientBirthDate: '',
      PatientSex: '',
      NumberOfStudyRelatedSeries: '',
      NumberOfStudyRelatedInstances: '',
    });
  }

  await runClient(conn.host, conn.port, conn.callingAe, conn.calledAe, (client) => {
    request.on('response', (response) => {
      const st = response.getStatus();
      if (st === Status.Pending && response.hasDataset()) {
        const plain = datasetToPlain(response.getDataset());
        results.push(normalizeFindHit(plain, level));
      }
    });
    client.addRequest(request);
  });

  return results;
}

function normalizeFindHit(plain, level) {
  const resolvedLevel =
    level === 'image' || level === 'instance'
      ? 'instance'
      : level === 'series'
        ? 'series'
        : 'study';

  return {
    level: resolvedLevel,
    patientId: plain.PatientID || '',
    patientName: plain.PatientName || '',
    studyDate: plain.StudyDate || '',
    studyDescription: plain.StudyDescription || '',
    accessionNumber: plain.AccessionNumber || '',
    modalities: plain.ModalitiesInStudy || plain.Modality || '',
    modality: plain.Modality || plain.ModalitiesInStudy || '',
    studyInstanceUID: plain.StudyInstanceUID || '',
    seriesInstanceUID: plain.SeriesInstanceUID || '',
    sopInstanceUID: plain.SOPInstanceUID || '',
    seriesDescription: plain.SeriesDescription || '',
    seriesNumber: plain.SeriesNumber || '',
    instanceNumber: plain.InstanceNumber || '',
    seriesCount: plain.NumberOfStudyRelatedSeries || '',
    instanceCount:
      plain.NumberOfSeriesRelatedInstances ||
      plain.NumberOfStudyRelatedInstances ||
      '',
  };
}

/**
 * C-MOVE with local Store SCP to receive instances.
 * @param {{ host: string, port: number, callingAe: string, calledAe: string, localAe: string, localPort: number }} conn
 * @param {string} studyInstanceUid
 * @param {{ level?: 'study'|'series'|'instance', seriesInstanceUid?: string, sopInstanceUid?: string, jobId?: string, onProgress?: (received: number) => void, isCancelled?: () => boolean }} [opts]
 */
async function pacsMove(conn, studyInstanceUid, opts = {}) {
  if (!studyInstanceUid) throw new Error('StudyInstanceUID required');

  const level = opts.level || 'study';
  const seriesInstanceUid = opts.seriesInstanceUid;
  const sopInstanceUid = opts.sopInstanceUid;
  const onProgress = opts.onProgress;
  const isCancelled = opts.isCancelled;

  if ((level === 'series' || level === 'instance') && !seriesInstanceUid) {
    throw new Error('SeriesInstanceUID required');
  }
  if (level === 'instance' && !sopInstanceUid) {
    throw new Error('SOPInstanceUID required');
  }

  const saveDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slice-pacs-'));
  const savedFiles = [];
  const ScpClass = createReceiveScp(saveDir, savedFiles, (_filePath, count) => {
    onProgress?.(count);
  });
  const server = new Server(ScpClass);

  const localPort = Number(conn.localPort) || 11112;
  const localAe = conn.localAe || conn.callingAe || 'SLICE';

  try {
    abortIfCancelled(isCancelled);

    await new Promise((resolve, reject) => {
      server.once('networkError', reject);
      try {
        server.listen(localPort);
        resolve();
      } catch (e) {
        reject(e);
      }
    });

    await new Promise((r) => setTimeout(r, 150));
    abortIfCancelled(isCancelled);

    await runClient(conn.host, conn.port, conn.callingAe, conn.calledAe, (client) => {
      let request;
      if (level === 'instance') {
        request = CMoveRequest.createImageMoveRequest(
          localAe,
          studyInstanceUid,
          seriesInstanceUid,
          sopInstanceUid,
        );
      } else if (level === 'series') {
        request = CMoveRequest.createSeriesMoveRequest(
          localAe,
          studyInstanceUid,
          seriesInstanceUid,
        );
      } else {
        request = CMoveRequest.createStudyMoveRequest(localAe, studyInstanceUid);
      }
      client.addRequest(request);
    });

    abortIfCancelled(isCancelled);

    if (savedFiles.length === 0) {
      await waitForFiles(saveDir, savedFiles, {
        timeoutMs: 8000,
        quietMs: 600,
        isCancelled,
      });
    } else {
      await waitForFiles(saveDir, savedFiles, {
        timeoutMs: 60000,
        quietMs: 1200,
        isCancelled,
      });
    }
  } finally {
    try {
      server.close();
    } catch {
      // ignore
    }
  }

  abortIfCancelled(isCancelled);
  return { files: [...savedFiles], extractDir: saveDir };
}

/**
 * C-GET retrieve on same association.
 * @param {{ host: string, port: number, callingAe: string, calledAe: string }} conn
 * @param {string} studyInstanceUid
 * @param {{ level?: 'study'|'series'|'instance', seriesInstanceUid?: string, sopInstanceUid?: string, jobId?: string, onProgress?: (received: number) => void, isCancelled?: () => boolean }} [opts]
 */
async function pacsGet(conn, studyInstanceUid, opts = {}) {
  if (!studyInstanceUid) throw new Error('StudyInstanceUID required');

  const level = opts.level || 'study';
  const seriesInstanceUid = opts.seriesInstanceUid;
  const sopInstanceUid = opts.sopInstanceUid;
  const onProgress = opts.onProgress;
  const isCancelled = opts.isCancelled;

  if ((level === 'series' || level === 'instance') && !seriesInstanceUid) {
    throw new Error('SeriesInstanceUID required');
  }
  if (level === 'instance' && !sopInstanceUid) {
    throw new Error('SOPInstanceUID required');
  }

  const saveDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slice-pacs-'));
  const savedFiles = [];
  let counter = 0;

  abortIfCancelled(isCancelled);

  await runClient(conn.host, conn.port, conn.callingAe, conn.calledAe, (client) => {
    let request;
    if (level === 'instance') {
      request = CGetRequest.createImageGetRequest(
        studyInstanceUid,
        seriesInstanceUid,
        sopInstanceUid,
      );
    } else if (level === 'series') {
      request = CGetRequest.createSeriesGetRequest(studyInstanceUid, seriesInstanceUid);
    } else {
      request = CGetRequest.createStudyGetRequest(studyInstanceUid);
    }

    client.on('cStoreRequest', (storeRequest, callback) => {
      const response = CStoreResponse.fromRequest(storeRequest);
      try {
        const dataset = storeRequest.getDataset();
        counter += 1;
        const sop = elemToString(dataset?.getElement?.('SOPInstanceUID')) || `inst-${counter}`;
        const safe = sop.replace(/[^\w.-]+/g, '_');
        const filePath = path.join(saveDir, `${String(counter).padStart(5, '0')}_${safe}.dcm`);
        dataset.toFile(filePath, (err) => {
          if (err) {
            response.setStatus(Status.ProcessingFailure);
          } else {
            savedFiles.push(filePath);
            response.setStatus(Status.Success);
            onProgress?.(savedFiles.length);
          }
          callback(response);
        });
      } catch {
        response.setStatus(Status.ProcessingFailure);
        callback(response);
      }
    });
    client.addRequest(request);
  });

  abortIfCancelled(isCancelled);
  await new Promise((r) => setTimeout(r, 400));
  await waitForFiles(saveDir, savedFiles, {
    timeoutMs: 30000,
    quietMs: 800,
    isCancelled,
  });

  abortIfCancelled(isCancelled);
  return { files: [...savedFiles], extractDir: saveDir };
}

/**
 * C-STORE SCU — send local files to PACS.
 * @param {{ host: string, port: number, callingAe: string, calledAe: string }} conn
 * @param {string[]} filePaths
 */
async function pacsStore(conn, filePaths) {
  const files = (filePaths || []).filter(Boolean);
  if (files.length === 0) throw new Error('No files to store');

  let stored = 0;
  let failed = 0;

  await runClient(conn.host, conn.port, conn.callingAe, conn.calledAe, (client) => {
    for (const filePath of files) {
      const request = new CStoreRequest(filePath);
      request.on('response', (response) => {
        if (response.getStatus() === Status.Success) stored += 1;
        else failed += 1;
      });
      client.addRequest(request);
    }
  });

  return { stored, failed, total: files.length };
}

module.exports = {
  pacsEcho,
  pacsFind,
  pacsMove,
  pacsGet,
  pacsStore,
  datasetToPlain,
  normalizeFindHit,
};
