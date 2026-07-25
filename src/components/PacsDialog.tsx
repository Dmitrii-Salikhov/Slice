import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  PacsConnection,
  PacsFindQuery,
  PacsHit,
  PacsQueryLevel,
  PacsRetrieveOpts,
} from '../../electron/api';
import { useLocale } from '../i18n/LocaleContext';
import { useErrorLog } from '../errorLog/ErrorLogContext';
import './Modal.css';

const OLD_STORAGE_KEY = 'slice.pacs.connection';
const PROFILES_KEY = 'slice.pacs.profiles';
const ACTIVE_PROFILE_KEY = 'slice.pacs.activeProfileId';

const DEFAULT_CONN: PacsConnection = {
  host: '127.0.0.1',
  port: 11112,
  callingAe: 'SLICE',
  calledAe: 'PACS',
  localAe: 'SLICE',
  localPort: 11113,
};

type PacsProfile = {
  id: string;
  name: string;
  conn: PacsConnection;
};

type Props = {
  open: boolean;
  canStore: boolean;
  storeFileCount: number;
  onClose: () => void;
  onRetrieved: (files: string[], label: string) => void;
  onStore: (conn: PacsConnection) => Promise<void>;
};

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeConn(raw: Partial<PacsConnection> | null | undefined): PacsConnection {
  const next = { ...DEFAULT_CONN, ...(raw || {}) };
  next.port = Math.min(65535, Math.max(1, Number(next.port) || DEFAULT_CONN.port));
  next.localPort = Math.min(
    65535,
    Math.max(1, Number(next.localPort) || DEFAULT_CONN.localPort!),
  );
  next.host = String(next.host || DEFAULT_CONN.host).slice(0, 253);
  next.callingAe = String(next.callingAe || DEFAULT_CONN.callingAe).slice(0, 16);
  next.calledAe = String(next.calledAe || DEFAULT_CONN.calledAe).slice(0, 16);
  next.localAe = String(next.localAe || DEFAULT_CONN.localAe).slice(0, 16);
  return next;
}

function migrateFromLocalStorage(): { profiles: PacsProfile[]; activeId: string } | null {
  try {
    const rawProfiles = localStorage.getItem(PROFILES_KEY);
    if (rawProfiles) {
      const parsed = JSON.parse(rawProfiles) as PacsProfile[];
      const profiles = (Array.isArray(parsed) ? parsed : [])
        .filter((p) => p && typeof p.id === 'string')
        .map((p) => ({
          id: p.id,
          name: p.name || 'PACS',
          conn: normalizeConn(p.conn),
        }));
      if (profiles.length > 0) {
        const storedActive = localStorage.getItem(ACTIVE_PROFILE_KEY);
        const activeId =
          (storedActive && profiles.some((p) => p.id === storedActive) && storedActive) ||
          profiles[0].id;
        localStorage.removeItem(PROFILES_KEY);
        localStorage.removeItem(ACTIVE_PROFILE_KEY);
        localStorage.removeItem(OLD_STORAGE_KEY);
        return { profiles, activeId };
      }
    }
    const oldRaw = localStorage.getItem(OLD_STORAGE_KEY);
    if (oldRaw) {
      const conn = normalizeConn(JSON.parse(oldRaw) as Partial<PacsConnection>);
      const profile: PacsProfile = { id: newId(), name: 'Default', conn };
      localStorage.removeItem(OLD_STORAGE_KEY);
      return { profiles: [profile], activeId: profile.id };
    }
  } catch {
    // ignore
  }
  return null;
}

function defaultProfiles(): { profiles: PacsProfile[]; activeId: string } {
  const profile: PacsProfile = { id: newId(), name: 'Default', conn: { ...DEFAULT_CONN } };
  return { profiles: [profile], activeId: profile.id };
}

function hitKey(row: PacsHit, index: number): string {
  return (
    row.sopInstanceUID ||
    row.seriesInstanceUID ||
    row.studyInstanceUID ||
    `${row.patientId}-${row.studyDate}-${index}`
  );
}

export function PacsDialog({
  open,
  canStore,
  storeFileCount,
  onClose,
  onRetrieved,
  onStore,
}: Props) {
  const { t } = useLocale();
  const { reportError } = useErrorLog();
  const boot = useMemo(() => defaultProfiles(), []);
  const [profiles, setProfiles] = useState<PacsProfile[]>(boot.profiles);
  const [activeProfileId, setActiveProfileId] = useState(boot.activeId);
  const [conn, setConn] = useState<PacsConnection>({ ...DEFAULT_CONN });
  const [queryLevel, setQueryLevel] = useState<PacsQueryLevel>('study');
  const [query, setQuery] = useState({
    patientId: '',
    patientName: '',
    studyDate: '',
    accession: '',
    modality: '',
    studyInstanceUID: '',
    seriesInstanceUID: '',
  });
  const [results, setResults] = useState<PacsHit[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrieveMode, setRetrieveMode] = useState<'move' | 'get'>('move');
  const [retrieveJobId, setRetrieveJobId] = useState<string | null>(null);
  const [profilesReady, setProfilesReady] = useState(false);

  const persistProfiles = useCallback(
    async (nextProfiles: PacsProfile[], activeId: string) => {
      if (!window.slice?.setPacsProfiles) return;
      await window.slice.setPacsProfiles({ profiles: nextProfiles, activeId });
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        let loaded = window.slice?.getPacsProfiles
          ? await window.slice.getPacsProfiles()
          : null;
        if (
          (!loaded || !Array.isArray(loaded.profiles) || loaded.profiles.length === 0) &&
          !profilesReady
        ) {
          const migrated = migrateFromLocalStorage();
          if (migrated) {
            loaded = migrated;
            await window.slice?.setPacsProfiles?.(migrated);
          }
        }
        if (cancelled) return;
        if (loaded && Array.isArray(loaded.profiles) && loaded.profiles.length > 0) {
          const profilesNext = loaded.profiles.map((p) => ({
            id: p.id,
            name: p.name || 'PACS',
            conn: normalizeConn(p.conn),
          }));
          const activeId =
            (loaded.activeId &&
              profilesNext.some((p) => p.id === loaded.activeId) &&
              loaded.activeId) ||
            profilesNext[0].id;
          setProfiles(profilesNext);
          setActiveProfileId(activeId);
          setConn(profilesNext.find((p) => p.id === activeId)?.conn ?? { ...DEFAULT_CONN });
        } else {
          const fallback = defaultProfiles();
          setProfiles(fallback.profiles);
          setActiveProfileId(fallback.activeId);
          setConn(fallback.profiles[0].conn);
          await window.slice?.setPacsProfiles?.(fallback);
        }
        setProfilesReady(true);
      } catch {
        if (!cancelled) {
          const fallback = defaultProfiles();
          setProfiles(fallback.profiles);
          setActiveProfileId(fallback.activeId);
          setConn(fallback.profiles[0].conn);
          setProfilesReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, profilesReady]);

  const updateConn = useCallback((next: PacsConnection) => {
    setConn(normalizeConn(next));
  }, []);

  const selectProfile = useCallback(
    (id: string) => {
      const profile = profiles.find((p) => p.id === id);
      if (!profile) return;
      setActiveProfileId(id);
      setConn(profile.conn);
      void persistProfiles(profiles, id);
    },
    [profiles, persistProfiles],
  );

  const createProfile = useCallback(() => {
    const name = window.prompt(t('pacs.profileNamePrompt'), t('pacs.profileNewName'));
    if (name == null) return;
    const trimmed = name.trim() || t('pacs.profileNewName');
    const profile: PacsProfile = {
      id: newId(),
      name: trimmed,
      conn: { ...DEFAULT_CONN },
    };
    const next = [...profiles, profile];
    setProfiles(next);
    setActiveProfileId(profile.id);
    setConn(profile.conn);
    void persistProfiles(next, profile.id);
  }, [profiles, t, persistProfiles]);

  const renameProfile = useCallback(() => {
    const current = profiles.find((p) => p.id === activeProfileId);
    if (!current) return;
    const name = window.prompt(t('pacs.profileNamePrompt'), current.name);
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const next = profiles.map((p) => (p.id === activeProfileId ? { ...p, name: trimmed } : p));
    setProfiles(next);
    void persistProfiles(next, activeProfileId);
  }, [profiles, activeProfileId, t, persistProfiles]);

  const deleteProfile = useCallback(() => {
    if (profiles.length <= 1) {
      setError(t('pacs.profileDeleteLast'));
      return;
    }
    const current = profiles.find((p) => p.id === activeProfileId);
    if (!current) return;
    if (!window.confirm(t('pacs.profileDeleteConfirm', { name: current.name }))) return;
    const next = profiles.filter((p) => p.id !== activeProfileId);
    const nextActive = next[0];
    setProfiles(next);
    setActiveProfileId(nextActive.id);
    setConn(nextActive.conn);
    void persistProfiles(next, nextActive.id);
  }, [profiles, activeProfileId, t, persistProfiles]);

  const saveProfile = useCallback(async () => {
    if (!window.slice) return;
    setBusy(true);
    setError(null);
    setStatus(t('pacs.echoing'));
    try {
      const res = await window.slice.pacsEcho(conn);
      if (!res.ok) {
        const msg = res.error || t('pacs.echoFail');
        setError(msg);
        reportError(msg, 'pacs');
        setStatus(null);
        return;
      }
      const next = profiles.map((p) =>
        p.id === activeProfileId ? { ...p, conn: { ...conn } } : p,
      );
      setProfiles(next);
      await persistProfiles(next, activeProfileId);
      setStatus(t('pacs.profileSaved'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      reportError(msg, 'pacs');
    } finally {
      setBusy(false);
    }
  }, [conn, profiles, activeProfileId, t, reportError, persistProfiles]);

  const selected = useMemo(() => {
    if (!selectedKey) return null;
    const idx = results.findIndex((r, i) => hitKey(r, i) === selectedKey);
    return idx >= 0 ? results[idx] : null;
  }, [results, selectedKey]);

  const foundMessageKey =
    queryLevel === 'series'
      ? 'pacs.foundSeries'
      : queryLevel === 'instance'
        ? 'pacs.foundInstances'
        : 'pacs.found';

  const echo = async () => {
    if (!window.slice) return;
    setBusy(true);
    setError(null);
    setStatus(t('pacs.echoing'));
    try {
      const res = await window.slice.pacsEcho(conn);
      if (res.ok) setStatus(t('pacs.echoOk'));
      else {
        const msg = res.error || t('pacs.echoFail');
        setError(msg);
        reportError(msg, 'pacs');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      reportError(msg, 'pacs');
    } finally {
      setBusy(false);
    }
  };

  const runFind = async (override?: Partial<PacsFindQuery> & { level?: PacsQueryLevel }) => {
    if (!window.slice) return;
    const level = override?.level ?? queryLevel;
    setBusy(true);
    setError(null);
    setStatus(t('pacs.searching'));
    setSelectedKey(null);
    try {
      const payload: PacsFindQuery = {
        level,
        patientId: override?.patientId ?? query.patientId,
        patientName: override?.patientName ?? query.patientName,
        studyDate: override?.studyDate ?? query.studyDate,
        accession: override?.accession ?? query.accession,
        modality: override?.modality ?? query.modality,
        studyInstanceUID: override?.studyInstanceUID ?? query.studyInstanceUID,
        seriesInstanceUID: override?.seriesInstanceUID ?? query.seriesInstanceUID,
      };
      const res = await window.slice.pacsFind(conn, payload);
      if (!res.ok) {
        const msg = res.error || t('pacs.findFail');
        setError(msg);
        reportError(msg, 'pacs');
        setResults([]);
        return;
      }
      setQueryLevel(level);
      setResults(res.results);
      const msgKey =
        level === 'series'
          ? 'pacs.foundSeries'
          : level === 'instance'
            ? 'pacs.foundInstances'
            : 'pacs.found';
      setStatus(t(msgKey, { count: res.results.length }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      reportError(msg, 'pacs');
    } finally {
      setBusy(false);
    }
  };

  const drillToSeries = async (row: PacsHit) => {
    if (!row.studyInstanceUID) return;
    setQuery((q) => ({
      ...q,
      studyInstanceUID: row.studyInstanceUID,
      seriesInstanceUID: '',
    }));
    await runFind({ level: 'series', studyInstanceUID: row.studyInstanceUID });
  };

  const drillToInstances = async (row: PacsHit) => {
    if (!row.studyInstanceUID || !row.seriesInstanceUID) return;
    setQuery((q) => ({
      ...q,
      studyInstanceUID: row.studyInstanceUID,
      seriesInstanceUID: row.seriesInstanceUID,
    }));
    await runFind({
      level: 'instance',
      studyInstanceUID: row.studyInstanceUID,
      seriesInstanceUID: row.seriesInstanceUID,
    });
  };

  const cancelRetrieve = async () => {
    if (!window.slice || !retrieveJobId) return;
    await window.slice.pacsRetrieveCancel(retrieveJobId);
  };

  const retrieve = async () => {
    if (!window.slice || !selected?.studyInstanceUID) return;
    const jobId = `${Date.now()}-${Math.random()}`;
    setBusy(true);
    setError(null);
    setRetrieveJobId(jobId);
    setStatus(t('pacs.retrieving'));

    let latestReceived = 0;
    const unsub = window.slice.onPacsRetrieveProgress((p) => {
      if (p.jobId === jobId) {
        latestReceived = p.received;
        setStatus(t('pacs.retrievingProgress', { count: p.received }));
      }
    });

    try {
      const opts: PacsRetrieveOpts = { jobId };
      if (selected.level === 'series' && selected.seriesInstanceUID) {
        opts.level = 'series';
        opts.seriesInstanceUid = selected.seriesInstanceUID;
      } else if (selected.level === 'instance' && selected.seriesInstanceUID && selected.sopInstanceUID) {
        opts.level = 'instance';
        opts.seriesInstanceUid = selected.seriesInstanceUID;
        opts.sopInstanceUid = selected.sopInstanceUID;
      } else {
        opts.level = 'study';
      }

      const res =
        retrieveMode === 'get'
          ? await window.slice.pacsGet(conn, selected.studyInstanceUID, opts)
          : await window.slice.pacsMove(conn, selected.studyInstanceUID, opts);

      if (res.cancelled) {
        setStatus(t('pacs.retrieveCancelled', { count: latestReceived }));
        return;
      }
      if (!res.ok || !res.files?.length) {
        const msg = res.error || t('pacs.retrieveFail');
        setError(msg);
        reportError(msg, 'pacs');
        return;
      }
      setStatus(t('pacs.retrieved', { count: res.files.length }));
      const label =
        selected.seriesInstanceUID ||
        selected.patientId ||
        selected.studyInstanceUID;
      onRetrieved(res.files, `PACS ${label}`);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      reportError(msg, 'pacs');
    } finally {
      unsub();
      setRetrieveJobId(null);
      setBusy(false);
    }
  };

  const store = async () => {
    setBusy(true);
    setError(null);
    try {
      await onStore(conn);
      setStatus(t('pacs.storeOk'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      reportError(msg, 'pacs');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const retrieving = retrieveJobId != null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal modal--wide modal--pacs"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pacs-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="pacs-title">{t('pacs.title')}</h2>
        <p className="modal__hint">{t('pacs.hint')}</p>

        <div className="modal__actions modal__actions--start">
          <label className="modal__inline">
            <span>{t('pacs.profile')}</span>
            <select
              value={activeProfileId}
              disabled={busy}
              onChange={(e) => selectProfile(e.target.value)}
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={createProfile}>
            {t('pacs.profileNew')}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy}
            onClick={() => void saveProfile()}
          >
            {t('pacs.profileSave')}
          </button>
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={renameProfile}>
            {t('pacs.profileRename')}
          </button>
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={deleteProfile}>
            {t('pacs.profileDelete')}
          </button>
        </div>

        <div className="modal__grid">
          <label className="modal__field">
            <span>{t('pacs.host')}</span>
            <input
              value={conn.host}
              onChange={(e) => updateConn({ ...conn, host: e.target.value })}
            />
          </label>
          <label className="modal__field">
            <span>{t('pacs.port')}</span>
            <input
              type="number"
              value={conn.port}
              onChange={(e) => updateConn({ ...conn, port: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="modal__field">
            <span>{t('pacs.calledAe')}</span>
            <input
              value={conn.calledAe}
              onChange={(e) => updateConn({ ...conn, calledAe: e.target.value })}
            />
          </label>
          <label className="modal__field">
            <span>{t('pacs.callingAe')}</span>
            <input
              value={conn.callingAe}
              onChange={(e) => updateConn({ ...conn, callingAe: e.target.value })}
            />
          </label>
          <label className="modal__field">
            <span>{t('pacs.localAe')}</span>
            <input
              value={conn.localAe ?? ''}
              onChange={(e) => updateConn({ ...conn, localAe: e.target.value })}
            />
          </label>
          <label className="modal__field">
            <span>{t('pacs.localPort')}</span>
            <input
              type="number"
              value={conn.localPort ?? 11113}
              onChange={(e) => updateConn({ ...conn, localPort: Number(e.target.value) || 0 })}
            />
          </label>
        </div>

        <div className="modal__actions modal__actions--start">
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void echo()}>
            {t('pacs.echo')}
          </button>
        </div>

        <h3 className="modal__sub">{t('pacs.query')}</h3>
        <div className="modal__grid">
          <label className="modal__field">
            <span>{t('pacs.queryLevel')}</span>
            <select
              value={queryLevel}
              onChange={(e) => setQueryLevel(e.target.value as PacsQueryLevel)}
            >
              <option value="study">{t('pacs.levelStudy')}</option>
              <option value="series">{t('pacs.levelSeries')}</option>
              <option value="instance">{t('pacs.levelInstance')}</option>
            </select>
          </label>
          <label className="modal__field">
            <span>{t('pacs.patientId')}</span>
            <input
              value={query.patientId}
              onChange={(e) => setQuery({ ...query, patientId: e.target.value })}
            />
          </label>
          <label className="modal__field">
            <span>{t('pacs.patientName')}</span>
            <input
              value={query.patientName}
              onChange={(e) => setQuery({ ...query, patientName: e.target.value })}
            />
          </label>
          <label className="modal__field">
            <span>{t('pacs.studyDate')}</span>
            <input
              value={query.studyDate}
              placeholder="YYYYMMDD"
              onChange={(e) => setQuery({ ...query, studyDate: e.target.value })}
            />
          </label>
          <label className="modal__field">
            <span>{t('pacs.accession')}</span>
            <input
              value={query.accession}
              onChange={(e) => setQuery({ ...query, accession: e.target.value })}
            />
          </label>
          <label className="modal__field">
            <span>{t('pacs.modality')}</span>
            <input
              value={query.modality}
              onChange={(e) => setQuery({ ...query, modality: e.target.value })}
            />
          </label>
          {(queryLevel === 'series' || queryLevel === 'instance') && (
            <label className="modal__field">
              <span>{t('pacs.studyUid')}</span>
              <input
                value={query.studyInstanceUID}
                onChange={(e) => setQuery({ ...query, studyInstanceUID: e.target.value })}
              />
            </label>
          )}
          {queryLevel === 'instance' && (
            <label className="modal__field">
              <span>{t('pacs.seriesUid')}</span>
              <input
                value={query.seriesInstanceUID}
                onChange={(e) => setQuery({ ...query, seriesInstanceUID: e.target.value })}
              />
            </label>
          )}
        </div>

        <div className="modal__actions modal__actions--start">
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy}
            onClick={() => void runFind()}
          >
            {t('pacs.find')}
          </button>
          <label className="modal__inline">
            <span>{t('pacs.retrieveMode')}</span>
            <select
              value={retrieveMode}
              onChange={(e) => setRetrieveMode(e.target.value as 'move' | 'get')}
            >
              <option value="move">C-MOVE</option>
              <option value="get">C-GET</option>
            </select>
          </label>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy || !selected}
            onClick={() => void retrieve()}
          >
            {t('pacs.retrieve')}
          </button>
          {retrieving && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => void cancelRetrieve()}
            >
              {t('pacs.retrieveCancel')}
            </button>
          )}
          {selected?.level === 'study' && (
            <button
              type="button"
              className="btn btn--ghost"
              disabled={busy || !selected.studyInstanceUID}
              onClick={() => void drillToSeries(selected)}
            >
              {t('pacs.drillSeries')}
            </button>
          )}
          {selected?.level === 'series' && (
            <button
              type="button"
              className="btn btn--ghost"
              disabled={busy || !selected.seriesInstanceUID}
              onClick={() => void drillToInstances(selected)}
            >
              {t('pacs.drillInstances')}
            </button>
          )}
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy || !canStore}
            title={canStore ? t('pacs.storeTip') : t('pacs.storeDisabledTip')}
            onClick={() => void store()}
          >
            {t('pacs.store')} ({storeFileCount})
          </button>
        </div>

        {status && <p className="modal__status">{status}</p>}
        {error && <p className="modal__error">{error}</p>}

        <div className="modal__table-wrap">
          <table className="modal__table">
            <thead>
              <tr>
                <th>{t('pacs.colLevel')}</th>
                <th>{t('pacs.colPatient')}</th>
                <th>{t('pacs.colId')}</th>
                <th>{t('pacs.colModality')}</th>
                <th>{t('pacs.colDesc')}</th>
                <th>{t('pacs.colUid')}</th>
                <th>{t('pacs.colCount')}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((row, index) => {
                const key = hitKey(row, index);
                const desc =
                  row.level === 'instance'
                    ? `#${row.instanceNumber || '—'}`
                    : row.level === 'series'
                      ? row.seriesDescription || row.seriesNumber
                      : row.studyDescription;
                const uid =
                  row.level === 'instance'
                    ? row.sopInstanceUID
                    : row.level === 'series'
                      ? row.seriesInstanceUID
                      : row.studyInstanceUID;
                return (
                  <tr
                    key={key}
                    className={key === selectedKey ? 'is-selected' : ''}
                    onClick={() => setSelectedKey(key)}
                    onDoubleClick={() => {
                      if (row.level === 'study') void drillToSeries(row);
                      else if (row.level === 'series') void drillToInstances(row);
                    }}
                  >
                    <td>{row.level}</td>
                    <td>{row.patientName}</td>
                    <td>{row.patientId}</td>
                    <td>{row.modality || row.modalities}</td>
                    <td>{desc}</td>
                    <td title={uid}>{uid ? `${uid.slice(0, 18)}…` : ''}</td>
                    <td>{row.instanceCount || row.seriesCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="modal__hint" style={{ marginTop: 8 }}>
          {t(foundMessageKey, { count: results.length })} · {t('pacs.drillHint')}
        </p>

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t('dialog.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
