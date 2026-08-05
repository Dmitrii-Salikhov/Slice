import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Annotation,
  DicomSeries,
  DicomStudy,
  MprBasis,
  MprPlane,
  ViewerTool,
  VolumeData,
  WindowLevel,
} from './dicom/types';
import { loadDicomFolder, type LoadProgress } from './dicom/series';
import { sharedPixelCache } from './dicom/pixelCache';
import { buildVolumeProgressive, type BuildVolumeProgress } from './viewer/mpr';
import {
  clampCursor,
  cursorFromIndices,
  type VolumeCursor,
} from './viewer/crosshair';
import { PRESETS, clampWindowLevel } from './viewer/windowLevel';
import { DEFAULT_SYNC_FLAGS, mapSliceIndex } from './viewer/seriesSync';
import { parseAnnotationsFile, serializeAnnotations } from './viewer/annotationsIo';
import { SeriesList } from './components/SeriesList';
import { Toolbar } from './components/Toolbar';
import { ViewerToolRail } from './components/ViewerToolRail';
import { Viewport } from './components/Viewport';
import { DocumentPane } from './components/DocumentPane';
import { MprLayout, type MprLayoutMode } from './components/MprLayout';
import { CompareLayout } from './components/CompareLayout';
import { PasswordDialog } from './components/PasswordDialog';
import { MediaDialog } from './components/MediaDialog';
import { PacsDialog } from './components/PacsDialog';
import { DicomdirDialog, type DicomdirSelection } from './components/DicomdirDialog';
import { ErrorLogPanel } from './components/ErrorLogPanel';
import { UpdateLogPanel } from './components/UpdateLogPanel';
import { UpdateDialog } from './components/UpdateDialog';
import type { MediaSource, PacsConnection } from '../electron/api';
import { parseDicomdir } from './dicom/dicomdir';
import {
  collectCatalogFilePaths,
  countCatalogInstances,
  type DicomdirCatalog,
} from './dicom/dicomdirTypes';
import {
  encodeRenderedSlice,
  suggestImageFileName,
  type ImageExportFormat,
} from './export/imageExport';
import { anonymizeDicomBuffer, suggestDicomFileName } from './export/anonymize';
import {
  extractMprSlice,
  planeIndexFromCursor,
  resolveMprBasis,
} from './viewer/mpr';
import { useLocale } from './i18n/LocaleContext';
import { useErrorLog } from './errorLog/ErrorLogContext';
import { messageForFailedLoad } from './errorLog/humanizeError';
import { useUpdateLog } from './update/UpdateLogContext';
import { checkGithubUpdate, type UpdateCheckResult } from './update/checkUpdates';
import { GITHUB_REPO } from './config/github';
import { LoadStudyDialog } from './components/LoadStudyDialog';
import { TagBrowser } from './components/TagBrowser';
import { isEditableTarget } from './shell/appCommands';
import './App.css';

function joinExportPath(dir: string, name: string): string {
  const sep = /\\/.test(dir) && !dir.startsWith('/') ? '\\' : '/';
  return `${dir.replace(/[/\\]+$/, '')}${sep}${name}`;
}

function firstOtherSeries(
  studies: DicomStudy[],
  excludeUid: string | null,
): DicomSeries | null {
  for (const study of studies) {
    for (const series of study.series) {
      if (series.seriesInstanceUID !== excludeUid) return series;
    }
  }
  return null;
}

type ViewMode = 'single' | 'mpr' | 'compare';

export default function App() {
  const { t } = useLocale();
  const { reportError } = useErrorLog();
  const { reportUpdate } = useUpdateLog();
  const [appVersion, setAppVersion] = useState('1.0.5');
  const [updateResult, setUpdateResult] = useState<Extract<
    UpdateCheckResult,
    { status: 'available' }
  > | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateOk, setUpdateOk] = useState(false);
  const [studies, setStudies] = useState<DicomStudy[]>([]);
  const [activeSeries, setActiveSeries] = useState<DicomSeries | null>(null);
  const [compareSeries, setCompareSeries] = useState<DicomSeries | null>(null);
  const [sliceIndex, setSliceIndex] = useState(0);
  const [compareSliceIndex, setCompareSliceIndex] = useState(0);
  const [wl, setWl] = useState<WindowLevel>({ windowCenter: 40, windowWidth: 400 });
  const [compareWl, setCompareWl] = useState<WindowLevel>({
    windowCenter: 40,
    windowWidth: 400,
  });
  const [zoom, setZoom] = useState(1);
  const [compareZoom, setCompareZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [comparePan, setComparePan] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState<ViewerTool>('scroll');
  const [viewMode, setViewMode] = useState<ViewMode>('single');
  const [syncScroll, setSyncScroll] = useState(DEFAULT_SYNC_FLAGS.scroll);
  const [syncWl, setSyncWl] = useState(DEFAULT_SYNC_FLAGS.wl);
  const [syncZoom, setSyncZoom] = useState(DEFAULT_SYNC_FLAGS.zoom);
  const [volume, setVolume] = useState<VolumeData | null>(null);
  const [mprBuilding, setMprBuilding] = useState(false);
  const [mprProgress, setMprProgress] = useState<BuildVolumeProgress | null>(null);
  const [pixelsRevision, setPixelsRevision] = useState(0);
  const mprAbortRef = useRef<AbortController | null>(null);
  const [cursor, setCursor] = useState<VolumeCursor>({ x: 0, y: 0, z: 0 });
  const [yaw, setYaw] = useState(30);
  const [pitch, setPitch] = useState(20);
  const [mprLayoutMode, setMprLayoutMode] = useState<MprLayoutMode>('single');
  const [mprSinglePlane, setMprSinglePlane] = useState<MprPlane>('axial');
  const [mprFocusPlane, setMprFocusPlane] = useState<MprPlane>('axial');
  const [mprBasis, setMprBasis] = useState<MprBasis>('patient');
  const [useWebGl, setUseWebGl] = useState(false);
  const [invertUser, setInvertUser] = useState(false);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [measures, setMeasures] = useState<Annotation[]>([]);
  const [compareMeasures, setCompareMeasures] = useState<Annotation[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [cinePlaying, setCinePlaying] = useState(false);
  const [cineFps, setCineFps] = useState(10);
  const loadAbortRef = useRef<AbortController | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [loadedFiles, setLoadedFiles] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  const [zipPrompt, setZipPrompt] = useState<{ path: string; error?: string | null } | null>(
    null,
  );
  const [mediaOpen, setMediaOpen] = useState(false);
  const [pacsOpen, setPacsOpen] = useState(false);
  const [loadStudyOpen, setLoadStudyOpen] = useState(false);
  const [dicomdirCatalog, setDicomdirCatalog] = useState<DicomdirCatalog | null>(null);
  const [dicomdirOpen, setDicomdirOpen] = useState(false);

  const hasApi = typeof window !== 'undefined' && !!window.slice;

  const selectSeries = useCallback((series: DicomSeries) => {
    setCinePlaying(false);
    mprAbortRef.current?.abort();
    setMprBuilding(false);
    setMprProgress(null);
    setActiveSeries(series);
    setSliceIndex(Math.floor(series.instances.length / 2));
    const mid = series.instances[Math.floor(series.instances.length / 2)] ?? series.instances[0];
    if (mid) setWl({ ...mid.windowLevel });
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setMeasures([]);
    setSelectedAnnotationId(null);
    setVolume(null);
    setInvertUser(false);
    setFlipH(false);
    setFlipV(false);
    setTagsOpen(false);
    setCompareSeries((prev) =>
      prev?.seriesInstanceUID === series.seriesInstanceUID ? null : prev,
    );

    if (series.document || series.instances.length === 0) {
      setViewMode((mode) => (mode === 'mpr' ? 'single' : mode));
      return;
    }

    setViewMode((mode) => (mode === 'mpr' ? 'single' : mode));
  }, []);

  const applyCompareSeries = useCallback(
    (series: DicomSeries, fromIndex: number, fromCount: number) => {
      setCompareSeries(series);
      const mid =
        series.instances[Math.floor(series.instances.length / 2)] ?? series.instances[0];
      setCompareSliceIndex(
        mapSliceIndex(fromIndex, fromCount, series.instances.length),
      );
      setCompareWl({ ...mid.windowLevel });
      setCompareZoom(1);
      setComparePan({ x: 0, y: 0 });
      setCompareMeasures([]);
    },
    [],
  );

  const selectCompareSeries = useCallback(
    (series: DicomSeries) => {
      if (activeSeries?.seriesInstanceUID === series.seriesInstanceUID) return;
      applyCompareSeries(
        series,
        sliceIndex,
        activeSeries?.instances.length ?? series.instances.length,
      );
      setViewMode('compare');
      if (tool === 'crosshair') setTool('scroll');
    },
    [activeSeries, applyCompareSeries, sliceIndex, tool],
  );

  const loadFromFiles = useCallback(
    async (files: string[], label: string) => {
      if (!window.slice) {
        reportError(t('error.noApi'), 'load');
        return;
      }
      if (files.length === 0) {
        reportError(t('error.noFiles'), 'load');
        return;
      }

      loadAbortRef.current?.abort();
      const controller = new AbortController();
      loadAbortRef.current = controller;

      setLoading(true);
      setFolderPath(label);
      setLoadedFiles(files);
      setStudies([]);
      setActiveSeries(null);
      setCompareSeries(null);
      setVolume(null);
      setMprBuilding(false);
      setMprProgress(null);
      mprAbortRef.current?.abort();
      sharedPixelCache.clear();
      setPixelsRevision(0);
      setCinePlaying(false);
      setViewMode((m) => (m === 'compare' || m === 'mpr' ? 'single' : m));

      try {
        const skippedReasons: string[] = [];
        const loaded = await loadDicomFolder(
          files,
          (p) => window.slice!.readFile(p),
          setProgress,
          {
            signal: controller.signal,
            onSkipped: (_path, reason) => {
              skippedReasons.push(reason);
            },
          },
        );
        if (controller.signal.aborted) return;
        if (loaded.length === 0) {
          reportError(messageForFailedLoad(files.length, skippedReasons, t), 'load');
          return;
        }
        setStudies(loaded);
        const firstSeries = loaded[0]?.series[0] ?? null;
        if (firstSeries) selectSeries(firstSeries);
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') {
          // Cancelled by user — not an error for the log
          return;
        }
        reportError(e instanceof Error ? e.message : String(e), 'load');
      } finally {
        if (loadAbortRef.current === controller) {
          loadAbortRef.current = null;
        }
        setLoading(false);
        setProgress(null);
      }
    },
    [selectSeries, t, reportError],
  );

  const cancelLoad = useCallback(() => {
    loadAbortRef.current?.abort();
    mprAbortRef.current?.abort();
  }, []);

  const closeStudy = useCallback(() => {
    cancelLoad();
    sharedPixelCache.clear();
    setStudies([]);
    setActiveSeries(null);
    setCompareSeries(null);
    setVolume(null);
    setMprBuilding(false);
    setMprProgress(null);
    setLoadedFiles([]);
    setFolderPath(null);
    setMeasures([]);
    setCompareMeasures([]);
    setSelectedAnnotationId(null);
    setDicomdirCatalog(null);
    setDicomdirOpen(false);
    setTagsOpen(false);
    setCinePlaying(false);
    setPixelsRevision(0);
    setSliceIndex(0);
    setCompareSliceIndex(0);
    setZoom(1);
    setCompareZoom(1);
    setPan({ x: 0, y: 0 });
    setComparePan({ x: 0, y: 0 });
    setInvertUser(false);
    setFlipH(false);
    setFlipV(false);
    setViewMode('single');
    setTool('scroll');
    setCursor({ x: 0, y: 0, z: 0 });
    setLoadStudyOpen(false);
    setMediaOpen(false);
    setPacsOpen(false);
    setZipPrompt(null);
  }, [cancelLoad]);

  const handleWebGlFailed = useCallback(() => {
    setUseWebGl(false);
    reportError(t('error.webglFallback'), 'render');
  }, [reportError, t]);

  const tryOpenDicomdir = useCallback(
    async (rootPath: string): Promise<boolean> => {
      if (!window.slice) return false;
      try {
        const dicomdirPath = await window.slice.findDicomdir(rootPath);
        if (!dicomdirPath) return false;
        const buffer = await window.slice.readFile(dicomdirPath);
        const catalog = await parseDicomdir(buffer, dicomdirPath, rootPath);
        if (countCatalogInstances(catalog) === 0) return false;
        setDicomdirCatalog(catalog);
        setDicomdirOpen(true);
        return true;
      } catch (e) {
        reportError(
          e instanceof Error ? e.message : t('dicomdir.parseFail'),
          'dicomdir',
        );
        return false;
      }
    },
    [reportError, t],
  );

  const loadFromDicomdir = useCallback(
    async (selection?: DicomdirSelection) => {
      if (!dicomdirCatalog) return;
      setDicomdirOpen(false);
      const files = collectCatalogFilePaths(dicomdirCatalog, selection);
      await loadFromFiles(files, dicomdirCatalog.rootDir);
    },
    [dicomdirCatalog, loadFromFiles],
  );

  const scanFolderFallback = useCallback(async () => {
    if (!window.slice || !dicomdirCatalog) return;
    setDicomdirOpen(false);
    try {
      const files = await window.slice.listDicomFiles(dicomdirCatalog.rootDir);
      await loadFromFiles(files, dicomdirCatalog.rootDir);
    } catch (e) {
      reportError(e instanceof Error ? e.message : String(e), 'folder');
    }
  }, [dicomdirCatalog, loadFromFiles, reportError]);

  const openZipWithPassword = useCallback(
    async (zipPath: string, password?: string) => {
      if (!window.slice) {
        reportError(t('error.noApi'), 'zip');
        return;
      }
      setLoading(true);
      try {
        const result = await window.slice.extractZip(zipPath, password);
        if (!result.ok) {
          if (result.code === 'INVALID_PASSWORD' || result.error.includes('Invalid password')) {
            setZipPrompt({ path: zipPath, error: t('error.zipInvalidPassword') });
            return;
          }
          if (result.code === 'NEEDS_PASSWORD' || result.error.includes('encrypted')) {
            setZipPrompt({ path: zipPath, error: t('error.zipPassword') });
            return;
          }
          reportError(result.error || t('error.zipExtract'), 'zip');
          return;
        }
        setZipPrompt(null);
        await loadFromFiles(result.files, zipPath);
      } catch (e) {
        reportError(e instanceof Error ? e.message : t('error.zipExtract'), 'zip');
      } finally {
        setLoading(false);
      }
    },
    [loadFromFiles, t, reportError],
  );

  const openFolder = useCallback(async () => {
    if (!window.slice) {
      reportError(t('error.noApi'), 'folder');
      return;
    }
    const folder = await window.slice.openFolder();
    if (!folder) return;

    try {
      if (await tryOpenDicomdir(folder)) return;
      const files = await window.slice.listDicomFiles(folder);
      await loadFromFiles(files, folder);
    } catch (e) {
      reportError(e instanceof Error ? e.message : String(e), 'folder');
    }
  }, [loadFromFiles, t, reportError, tryOpenDicomdir]);

  const openFiles = useCallback(async () => {
    if (!window.slice) {
      reportError(t('error.noApi'), 'folder');
      return;
    }
    const files = await window.slice.openDicomFilesDialog();
    if (!files.length) return;
    await loadFromFiles(files, files[0]);
  }, [loadFromFiles, t, reportError]);

  const openZip = useCallback(async () => {
    if (!window.slice) {
      reportError(t('error.noApi'), 'zip');
      return;
    }
    const zipPath = await window.slice.openZipDialog();
    if (!zipPath) return;
    const needs = await window.slice.zipNeedsPassword(zipPath);
    if (needs) {
      setZipPrompt({ path: zipPath, error: null });
      return;
    }
    await openZipWithPassword(zipPath);
  }, [openZipWithPassword, t, reportError]);

  const openMediaSource = useCallback(
    async (media: MediaSource) => {
      if (!window.slice) return;
      setMediaOpen(false);
      try {
        if (window.slice.openMedia) {
          const claimed = await window.slice.openMedia(media.path);
          if (!claimed.ok) throw new Error(claimed.error || 'Media path denied');
        }
        if (await tryOpenDicomdir(media.path)) return;
        const files = await window.slice.listDicomFiles(media.path);
        await loadFromFiles(files, media.path);
      } catch (e) {
        reportError(e instanceof Error ? e.message : String(e), 'media');
      }
    },
    [loadFromFiles, reportError, tryOpenDicomdir],
  );

  const storeToPacs = useCallback(
    async (conn: PacsConnection) => {
      if (!window.slice) throw new Error(t('error.noApi'));
      if (loadedFiles.length === 0) throw new Error(t('pacs.storeDisabledTip'));
      const res = await window.slice.pacsStore(conn, loadedFiles);
      if (!res.ok) throw new Error(res.error || t('pacs.storeFail'));
    },
    [loadedFiles, t],
  );

  const handleDropPaths = useCallback(
    async (paths: string[]) => {
      if (!window.slice) {
        reportError(t('error.noApi'), 'drop');
        return;
      }
      try {
        if (paths.length === 1 && (await tryOpenDicomdir(paths[0]))) return;

        const resolved = await window.slice.resolveDroppedPaths(paths);
        if (resolved.needsPassword && resolved.zipPath) {
          setZipPrompt({ path: resolved.zipPath, error: t('error.zipPassword') });
          return;
        }
        const label =
          paths.length === 1 ? paths[0] : `${paths.length} items → ${resolved.files.length} files`;
        await loadFromFiles(resolved.files, label);
      } catch (e) {
        reportError(e instanceof Error ? e.message : t('error.dropPaths'), 'drop');
      }
    },
    [loadFromFiles, t, reportError, tryOpenDicomdir],
  );

  const browseLoadStudy = useCallback(async () => {
    if (!window.slice?.openStudy) {
      reportError(t('error.restartRequired'), 'load');
      return;
    }
    try {
      const paths = await window.slice.openStudy();
      if (paths.length === 0) return;
      setLoadStudyOpen(false);
      await handleDropPaths(paths);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      reportError(
        /No handler registered/i.test(msg) ? t('error.restartRequired') : msg,
        'load',
      );
    }
  }, [handleDropPaths, reportError, t]);

  const browseLoadStudyFiles = useCallback(async () => {
    if (!window.slice?.openStudyFiles) {
      reportError(t('error.restartRequired'), 'load');
      return;
    }
    try {
      const paths = await window.slice.openStudyFiles();
      if (paths.length === 0) return;
      setLoadStudyOpen(false);
      await handleDropPaths(paths);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      reportError(
        /No handler registered/i.test(msg) ? t('error.restartRequired') : msg,
        'load',
      );
    }
  }, [handleDropPaths, reportError, t]);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (![...e.dataTransfer.types].includes('Files')) return;
    dragDepth.current += 1;
    setDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragDepth.current = 0;
      setDragging(false);

      if (!window.slice || loading) return;

      const items = e.dataTransfer?.files;
      if (!items || items.length === 0) return;

      const paths: string[] = [];
      for (let i = 0; i < items.length; i++) {
        const file = items[i];
        const p = window.slice.getPathForFile(file);
        if (p) paths.push(p);
      }

      if (paths.length === 0) {
        reportError(t('error.dropPaths'), 'drop');
        return;
      }

      await handleDropPaths(paths);
    },
    [handleDropPaths, loading, t, reportError],
  );

  const activeInstance = useMemo(() => {
    if (!activeSeries) return null;
    return activeSeries.instances[sliceIndex] ?? null;
  }, [activeSeries, sliceIndex]);

  const activeDocument = activeSeries?.document ?? null;

  const compareInstance = useMemo(() => {
    if (!compareSeries) return null;
    return compareSeries.instances[compareSliceIndex] ?? null;
  }, [compareSeries, compareSliceIndex]);

  const seriesCount = useMemo(
    () => studies.reduce((n, s) => n + s.series.length, 0),
    [studies],
  );
  const compareAvailable = seriesCount >= 2;
  const mprAvailable =
    !!activeSeries && !activeSeries.document && activeSeries.instances.length > 1;

  const bumpPixels = useCallback(() => {
    setPixelsRevision((n) => n + 1);
  }, []);

  const readFile = useCallback((path: string) => {
    if (!window.slice) return Promise.reject(new Error('No API'));
    return window.slice.readFile(path);
  }, []);

  /** Lazy-decode active (+ compare) slice and prefetch neighbors. */
  useEffect(() => {
    // MPR owns the volume buffers — do not decode/prefetch stack slices in parallel
    // (that OOM-crashes the renderer and reloads to the empty screen).
    if (!hasApi || !activeSeries || activeDocument || viewMode === 'mpr' || mprBuilding) {
      return;
    }
    const series = activeSeries;
    const idx = sliceIndex;
    const inst = series.instances[idx];
    if (!inst) return;
    let cancelled = false;

    const neighbors: typeof series.instances = [];
    const radius = 8;
    for (let d = 1; d <= radius; d++) {
      if (idx - d >= 0) neighbors.push(series.instances[idx - d]);
      if (idx + d < series.instances.length) neighbors.push(series.instances[idx + d]);
    }

    void (async () => {
      try {
        await sharedPixelCache.ensure(inst, readFile);
        if (cancelled) return;
        bumpPixels();
        void sharedPixelCache.prefetch(neighbors, readFile);
      } catch (e) {
        if (!cancelled) {
          reportError(e instanceof Error ? e.message : String(e), 'decode');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    hasApi,
    activeSeries,
    activeDocument,
    viewMode,
    mprBuilding,
    sliceIndex,
    readFile,
    bumpPixels,
    reportError,
  ]);

  useEffect(() => {
    if (!hasApi || viewMode !== 'compare' || !compareSeries) return;
    const series = compareSeries;
    const idx = compareSliceIndex;
    const inst = series.instances[idx];
    if (!inst) return;
    let cancelled = false;
    const neighbors: typeof series.instances = [];
    for (let d = 1; d <= 8; d++) {
      if (idx - d >= 0) neighbors.push(series.instances[idx - d]);
      if (idx + d < series.instances.length) neighbors.push(series.instances[idx + d]);
    }
    void (async () => {
      try {
        await sharedPixelCache.ensure(inst, readFile);
        if (!cancelled) bumpPixels();
        void sharedPixelCache.prefetch(neighbors, readFile);
      } catch {
        // ignore compare decode errors in prefetch path
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasApi, viewMode, compareSeries, compareSliceIndex, readFile, bumpPixels]);

  const enterMpr = useCallback(async () => {
    if (!activeSeries || activeSeries.document || activeSeries.instances.length < 2) {
      reportError(t('error.noParse'), 'mpr');
      return;
    }
    if (!window.slice) {
      reportError(t('error.noApi'), 'mpr');
      return;
    }

    mprAbortRef.current?.abort();
    const controller = new AbortController();
    mprAbortRef.current = controller;
    setCinePlaying(false);
    setViewMode('mpr');
    setVolume(null);
    setMprBuilding(true);
    setMprProgress({ loaded: 0, total: activeSeries.instances.length });

    try {
      const vol = await buildVolumeProgressive(
        activeSeries,
        async (inst) => {
          await sharedPixelCache.ensure(inst, readFile);
        },
        {
          signal: controller.signal,
          onProgress: (p) => setMprProgress(p),
        },
      );
      if (controller.signal.aborted) return;
      // Volume owns pixel data now — free per-instance decode cache to avoid OOM while scrolling.
      sharedPixelCache.clear();
      setVolume(vol);
      setCursor(
        cursorFromIndices({
          axial: Math.floor(vol.dims[2] / 2),
          coronal: Math.floor(vol.dims[1] / 2),
          sagittal: Math.floor(vol.dims[0] / 2),
        }),
      );
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        setViewMode('single');
        return;
      }
      setViewMode('single');
      setVolume(null);
      reportError(e instanceof Error ? e.message : String(e), 'mpr');
    } finally {
      if (mprAbortRef.current === controller) mprAbortRef.current = null;
      setMprBuilding(false);
      setMprProgress(null);
    }
  }, [activeSeries, readFile, reportError, t]);

  const changeViewMode = useCallback(
    (m: ViewMode) => {
      if (m === 'mpr') {
        void enterMpr();
        return;
      }
      mprAbortRef.current?.abort();
      setMprBuilding(false);
      setMprProgress(null);
      if (viewMode === 'mpr') {
        setSliceIndex(Math.round(cursor.z));
      }
      setVolume(null);
      setViewMode(m);
      if (tool === 'crosshair') setTool('scroll');
    },
    [enterMpr, tool, viewMode, cursor.z],
  );

  useEffect(() => {
    if (viewMode !== 'compare') return;
    if (!activeSeries) {
      setViewMode('single');
      return;
    }
    if (
      compareSeries &&
      compareSeries.seriesInstanceUID !== activeSeries.seriesInstanceUID
    ) {
      return;
    }
    const other = firstOtherSeries(studies, activeSeries.seriesInstanceUID);
    if (!other) {
      setViewMode('single');
      return;
    }
    applyCompareSeries(other, sliceIndex, activeSeries.instances.length);
  }, [
    viewMode,
    activeSeries,
    compareSeries,
    studies,
    sliceIndex,
    applyCompareSeries,
  ]);

  const onPrimarySliceChange = useCallback(
    (index: number) => {
      setSliceIndex(index);
      if (viewMode === 'compare' && syncScroll && compareSeries && activeSeries) {
        setCompareSliceIndex(
          mapSliceIndex(index, activeSeries.instances.length, compareSeries.instances.length),
        );
      }
    },
    [viewMode, syncScroll, compareSeries, activeSeries],
  );

  const onCompareSliceChange = useCallback(
    (index: number) => {
      setCompareSliceIndex(index);
      if (syncScroll && activeSeries && compareSeries) {
        setSliceIndex(
          mapSliceIndex(index, compareSeries.instances.length, activeSeries.instances.length),
        );
      }
    },
    [syncScroll, activeSeries, compareSeries],
  );

  const exportImage = useCallback(
    async (format: ImageExportFormat) => {
      if (!window.slice) {
        reportError(t('export.noInstance'), 'export');
        return;
      }

      try {
        let bytes: Uint8Array;
        let fileName: string;

        if (viewMode === 'mpr' && volume) {
          const plane = mprLayoutMode === 'single' ? mprSinglePlane : mprFocusPlane;
          const basis = resolveMprBasis(volume, mprBasis);
          const index = planeIndexFromCursor(volume, plane, cursor, basis);
          const slice = extractMprSlice(volume, plane, index, basis);
          bytes = await encodeRenderedSlice({
            width: slice.width,
            height: slice.height,
            windowLevel: wl,
            pixels: slice.pixels,
            invert: invertUser,
            measures,
            sliceIndex: slice.index,
            mprPlane: plane,
            format,
          });
          fileName = suggestImageFileName(
            {
              patientId: activeSeries?.patientId,
              seriesDescription: activeSeries?.seriesDescription,
              instanceNumber: slice.index + 1,
              plane,
            },
            format,
          );
        } else {
          if (!activeInstance) {
            reportError(t('export.noInstance'), 'export');
            return;
          }
          await sharedPixelCache.ensure(activeInstance, readFile);
          bumpPixels();
          const invert =
            (activeInstance.photometricInterpretation === 'MONOCHROME1') !== invertUser;
          bytes = await encodeRenderedSlice({
            width: activeInstance.columns,
            height: activeInstance.rows,
            windowLevel: wl,
            pixels: activeInstance.pixelsInt16 ?? activeInstance.pixels,
            colorRgba: activeInstance.colorRgba,
            invert,
            flipH,
            flipV,
            measures,
            sliceIndex,
            format,
          });
          fileName = suggestImageFileName(activeInstance, format);
        }

        const path = await window.slice.saveFileDialog({
          title: format === 'png' ? t('toolbar.exportPng') : t('toolbar.exportJpeg'),
          defaultPath: fileName,
          filters:
            format === 'png'
              ? [
                  { name: 'PNG', extensions: ['png'] },
                  { name: 'All files', extensions: ['*'] },
                ]
              : [
                  { name: 'JPEG', extensions: ['jpg', 'jpeg'] },
                  { name: 'All files', extensions: ['*'] },
                ],
        });
        if (!path) return;
        const written = await window.slice.writeFile(path, bytes);
        if (!written?.ok) {
          throw new Error(written?.error || t('export.fail'));
        }
        setFolderPath(t('export.saved', { path }));
      } catch (e) {
        reportError(e instanceof Error ? e.message : t('export.fail'), 'export');
      }
    },
    [
      viewMode,
      volume,
      mprLayoutMode,
      mprSinglePlane,
      mprFocusPlane,
      mprBasis,
      cursor,
      wl,
      invertUser,
      measures,
      activeSeries,
      activeInstance,
      flipH,
      flipV,
      sliceIndex,
      readFile,
      bumpPixels,
      reportError,
      t,
    ],
  );

  const exportJpeg = useCallback(async () => {
    await exportImage('jpeg');
  }, [exportImage]);

  const exportPng = useCallback(async () => {
    await exportImage('png');
  }, [exportImage]);

  const exportDicomAnon = useCallback(async () => {
    if (!window.slice || !activeInstance?.filePath) {
      reportError(t('export.noInstance'), 'export');
      return;
    }
    try {
      const raw = await window.slice.readFile(activeInstance.filePath);
      const anon = await anonymizeDicomBuffer(raw);
      const name = suggestDicomFileName({
        patientId: 'ANON',
        instanceNumber: activeInstance.instanceNumber,
        sopInstanceUID: activeInstance.sopInstanceUID,
      });
      const path = await window.slice.saveFileDialog({
        title: t('toolbar.exportDicom'),
        defaultPath: name,
        filters: [
          { name: 'DICOM', extensions: ['dcm', 'dicom', 'ima'] },
          { name: 'All files', extensions: ['*'] },
        ],
      });
      if (!path) return;
      await window.slice.writeFile(path, anon);
      setFolderPath(t('export.saved', { path }));
    } catch (e) {
      reportError(e instanceof Error ? e.message : t('export.fail'), 'export');
    }
  }, [activeInstance, reportError, t]);

  const exportSeriesAnon = useCallback(async () => {
    if (!window.slice || !activeSeries) {
      reportError(t('export.noInstance'), 'export');
      return;
    }
    try {
      const dir = await window.slice.saveDirectoryDialog({
        title: t('toolbar.exportSeries'),
      });
      if (!dir) return;

      setLoading(true);
      let written = 0;
      const total = activeSeries.instances.length;
      for (let i = 0; i < total; i++) {
        const inst = activeSeries.instances[i];
        setProgress({ loaded: i, total, currentFile: inst.filePath });
        if (!inst.filePath) continue;
        const raw = await window.slice.readFile(inst.filePath);
        const anon = await anonymizeDicomBuffer(raw);
        const name = suggestDicomFileName({
          patientId: 'ANON',
          instanceNumber: inst.instanceNumber,
          sopInstanceUID: inst.sopInstanceUID,
        });
        await window.slice.writeFile(joinExportPath(dir, name), anon);
        written += 1;
      }
      setProgress(null);
      setFolderPath(t('export.seriesSaved', { count: written, path: dir }));
    } catch (e) {
      reportError(e instanceof Error ? e.message : t('export.fail'), 'export');
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }, [activeSeries, reportError, t]);

  const saveAnnotations = useCallback(async () => {
    if (!window.slice || !activeSeries || activeDocument) return;
    try {
      const json = serializeAnnotations(activeSeries.seriesInstanceUID, measures);
      const path = await window.slice.saveFileDialog({
        title: t('toolbar.saveAnnotations'),
        defaultPath: 'annotations.json',
        filters: [
          { name: 'JSON', extensions: ['json'] },
          { name: 'All files', extensions: ['*'] },
        ],
      });
      if (!path) return;
      const bytes = new TextEncoder().encode(json);
      await window.slice.writeFile(path, bytes);
      setFolderPath(t('export.saved', { path }));
    } catch (e) {
      reportError(e instanceof Error ? e.message : String(e), 'annotations');
    }
  }, [activeSeries, activeDocument, measures, reportError, t]);

  const loadAnnotations = useCallback(async () => {
    if (!window.slice || !activeSeries || activeDocument) return;
    try {
      const path = await window.slice.openFileDialog({
        title: t('toolbar.loadAnnotations'),
        filters: [
          { name: 'JSON', extensions: ['json'] },
          { name: 'All files', extensions: ['*'] },
        ],
      });
      if (!path) return;
      const buffer = await window.slice.readFile(path);
      const raw = new TextDecoder().decode(buffer);
      const parsed = parseAnnotationsFile(raw);
      if (parsed.seriesInstanceUID !== activeSeries.seriesInstanceUID) {
        reportError(
          `Annotations series UID mismatch (${parsed.seriesInstanceUID} ≠ ${activeSeries.seriesInstanceUID})`,
          'annotations',
        );
      }
      setMeasures(parsed.annotations);
      setSelectedAnnotationId(null);
    } catch (e) {
      reportError(e instanceof Error ? e.message : String(e), 'annotations');
    }
  }, [activeSeries, activeDocument, reportError, t]);

  const openDocumentExternal = useCallback(async () => {
    if (!window.slice || !activeDocument) return;
    try {
      if (activeDocument.kind === 'pdf' && activeDocument.pdfBytes?.length) {
        const res = await window.slice.writeTemp(
          'document.pdf',
          activeDocument.pdfBytes,
        );
        if (!res.ok || !res.path) {
          throw new Error(res.error || 'Failed to write temp PDF');
        }
        await window.slice.openPath(res.path);
        return;
      }
      if (activeDocument.filePath) {
        await window.slice.openPath(activeDocument.filePath);
      }
    } catch (e) {
      reportError(e instanceof Error ? e.message : String(e), 'document');
    }
  }, [activeDocument, reportError]);

  useEffect(() => {
    if (!cinePlaying || !activeSeries || activeDocument || viewMode !== 'single') return;
    const count = activeSeries.instances.length;
    if (count <= 1) return;
    const ms = Math.max(16, Math.round(1000 / Math.max(1, cineFps)));
    const id = window.setInterval(() => {
      setSliceIndex((i) => (i + 1) % count);
    }, ms);
    return () => window.clearInterval(id);
  }, [cinePlaying, cineFps, activeSeries, activeDocument, viewMode]);

  useEffect(() => {
    setCinePlaying(false);
  }, [viewMode, activeSeries?.seriesInstanceUID]);

  useEffect(() => {
    const ft = activeInstance?.frameTimeMs;
    if (ft && ft > 0) {
      setCineFps(Math.min(60, Math.max(1, Math.round(1000 / ft))));
    }
  }, [activeInstance?.sopInstanceUID, activeInstance?.frameTimeMs]);

  useEffect(() => {
    if (!window.slice?.getAppVersion) return;
    void window.slice.getAppVersion().then((v) => {
      if (v) setAppVersion(v);
    });
  }, []);

  const runUpdateCheck = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = !!opts?.silent;
      if (!silent) setCheckingUpdate(true);
      try {
        let result: UpdateCheckResult;
        if (window.slice?.checkUpdate) {
          result = await window.slice.checkUpdate();
        } else {
          let repo = GITHUB_REPO;
          if (window.slice?.getUpdateRepo) {
            repo = await window.slice.getUpdateRepo();
          }
          const current =
            (window.slice?.getAppVersion && (await window.slice.getAppVersion())) ||
            appVersion;
          result = await checkGithubUpdate(current, repo);
        }
        if (result.status === 'up-to-date') {
          setUpdateOk(true);
        } else if (result.status === 'available') {
          setUpdateOk(false);
          setUpdateResult(result);
        } else {
          setUpdateOk(false);
          reportUpdate(
            t('update.logError', { message: result.message }),
            'update',
          );
          if (!silent) {
            reportError(result.message, 'update');
          }
        }
      } catch (e) {
        setUpdateOk(false);
        const msg = e instanceof Error ? e.message : String(e);
        reportUpdate(t('update.logError', { message: msg }), 'update');
        if (!silent) reportError(msg, 'update');
      } finally {
        if (!silent) setCheckingUpdate(false);
      }
    },
    [appVersion, reportUpdate, reportError, t],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void runUpdateCheck({ silent: true });
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [runUpdateCheck]);

  useEffect(() => {
    if (!window.slice?.setProgressBar) return;
    if (loading && progress && progress.total > 0) {
      window.slice.setProgressBar(progress.loaded / progress.total);
    } else if (mprBuilding && mprProgress && mprProgress.total > 0) {
      window.slice.setProgressBar(mprProgress.loaded / mprProgress.total);
    } else {
      window.slice.setProgressBar(-1);
    }
  }, [loading, progress, mprBuilding, mprProgress]);

  useEffect(() => {
    if (!window.slice?.onOpenPaths) return;
    return window.slice.onOpenPaths((paths) => {
      void handleDropPaths(paths);
    });
  }, [handleDropPaths]);

  const applyPreset = useCallback(
    (name: string) => {
      const next = PRESETS[name];
      if (!next) return;
      setWl({ ...next });
      if (syncWl) setCompareWl({ ...next });
    },
    [syncWl],
  );

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setCompareZoom(1);
    setComparePan({ x: 0, y: 0 });
  }, []);

  const clearAllMeasures = useCallback(() => {
    setMeasures([]);
    setCompareMeasures([]);
    setSelectedAnnotationId(null);
  }, []);

  const deleteSelectedAnnotation = useCallback(() => {
    if (!selectedAnnotationId) return;
    setMeasures((prev) => prev.filter((m) => m.id !== selectedAnnotationId));
    setCompareMeasures((prev) => prev.filter((m) => m.id !== selectedAnnotationId));
    setSelectedAnnotationId(null);
  }, [selectedAnnotationId]);

  const toggleCine = useCallback(() => {
    if (!activeSeries || activeDocument || activeSeries.instances.length <= 1) return;
    setCinePlaying((p) => !p);
  }, [activeSeries, activeDocument]);

  const dispatchCommand = useCallback(
    (command: string, payload?: unknown) => {
      switch (command) {
        case 'open-study':
          setLoadStudyOpen(true);
          break;
        case 'open-folder':
          void openFolder();
          break;
        case 'open-files':
          void openFiles();
          break;
        case 'open-zip':
          void openZip();
          break;
        case 'open-media':
          setMediaOpen(true);
          break;
        case 'open-pacs':
          setPacsOpen(true);
          break;
        case 'new-study':
          closeStudy();
          break;
        case 'export-jpeg':
          void exportJpeg();
          break;
        case 'export-png':
          void exportPng();
          break;
        case 'export-dicom':
          void exportDicomAnon();
          break;
        case 'export-series':
          void exportSeriesAnon();
          break;
        case 'cancel-load':
          cancelLoad();
          break;
        case 'tool':
          if (typeof payload === 'string') {
            const toolId = payload as ViewerTool;
            if (toolId === 'crosshair' && viewMode !== 'mpr') break;
            setTool(toolId);
          }
          break;
        case 'clear-measures':
          clearAllMeasures();
          break;
        case 'view-mode':
          if (payload === 'single' || payload === 'compare' || payload === 'mpr') {
            changeViewMode(payload);
          }
          break;
        case 'zoom-reset':
        case 'reset-view':
          resetView();
          break;
        case 'cine-toggle':
          toggleCine();
          break;
        case 'slice-delta': {
          if (!activeSeries || activeDocument) break;
          const delta = typeof payload === 'number' ? payload : 0;
          onPrimarySliceChange(
            Math.min(
              activeSeries.instances.length - 1,
              Math.max(0, sliceIndex + delta),
            ),
          );
          break;
        }
        case 'slice-home':
          if (!activeSeries || activeDocument) break;
          onPrimarySliceChange(0);
          break;
        case 'slice-end':
          if (!activeSeries || activeDocument) break;
          onPrimarySliceChange(activeSeries.instances.length - 1);
          break;
        case 'preset':
          if (typeof payload === 'string') applyPreset(payload);
          break;
        case 'about':
          window.alert(t('app.aboutVersion', { version: appVersion }));
          break;
        case 'check-updates':
          void runUpdateCheck();
          break;
        default:
          break;
      }
    },
    [
      openFolder,
      openFiles,
      openZip,
      closeStudy,
      exportJpeg,
      exportPng,
      exportDicomAnon,
      exportSeriesAnon,
      cancelLoad,
      viewMode,
      clearAllMeasures,
      changeViewMode,
      resetView,
      toggleCine,
      activeSeries,
      activeDocument,
      onPrimarySliceChange,
      sliceIndex,
      applyPreset,
      appVersion,
      runUpdateCheck,
      t,
    ],
  );

  const displayInvert =
    !!activeInstance &&
    (activeInstance.photometricInterpretation === 'MONOCHROME1') !== invertUser;

  const onViewportContext = useCallback(
    (action: string) => {
      if (action.startsWith('preset-')) {
        applyPreset(action.slice('preset-'.length));
        return;
      }
      switch (action) {
        case 'reset-view':
          resetView();
          break;
        case 'toggle-invert':
          setInvertUser((v) => !v);
          break;
        case 'flip-h':
          setFlipH((v) => !v);
          break;
        case 'flip-v':
          setFlipV((v) => !v);
          break;
        case 'clear-measures':
          clearAllMeasures();
          break;
        case 'export-jpeg':
          void exportJpeg();
          break;
        case 'export-png':
          void exportPng();
          break;
        case 'show-tags':
          setTagsOpen(true);
          break;
        case 'copy-patient': {
          const inst = activeInstance;
          if (!inst) break;
          const text = [
            inst.patientName,
            inst.patientId,
            inst.seriesDescription,
            inst.modality,
            `${inst.columns}×${inst.rows}`,
          ]
            .filter(Boolean)
            .join(' · ');
          void navigator.clipboard?.writeText(text);
          break;
        }
        default:
          break;
      }
    },
    [
      applyPreset,
      resetView,
      clearAllMeasures,
      exportJpeg,
      exportPng,
      activeInstance,
    ],
  );

  useEffect(() => {
    if (!window.slice?.onAppCommand) return;
    return window.slice.onAppCommand(({ command, payload }) => {
      dispatchCommand(command, payload);
    });
  }, [dispatchCommand]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;

      if (e.key === 'Escape') {
        if (loading || mprBuilding) {
          e.preventDefault();
          cancelLoad();
          return;
        }
        if (selectedAnnotationId) {
          e.preventDefault();
          setSelectedAnnotationId(null);
          return;
        }
      }

      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        selectedAnnotationId &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        deleteSelectedAnnotation();
        return;
      }

      if (!activeSeries || activeDocument) return;

      if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        toggleCine();
        return;
      }

      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        onPrimarySliceChange(Math.max(0, sliceIndex - 1));
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        onPrimarySliceChange(
          Math.min(activeSeries.instances.length - 1, sliceIndex + 1),
        );
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        onPrimarySliceChange(0);
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        onPrimarySliceChange(activeSeries.instances.length - 1);
        return;
      }

      if (e.ctrlKey || e.metaKey) return;

      const toolMap: Record<string, ViewerTool> = {
        '1': 'scroll',
        '2': 'wl',
        '3': 'zoom',
        '4': 'pan',
        '5': 'crosshair',
        '6': 'length',
        '7': 'angle',
        '8': 'roi',
        '9': 'arrow',
        '0': 'probe',
      };
      const nextTool = toolMap[e.key];
      if (nextTool) {
        if (nextTool === 'crosshair' && viewMode !== 'mpr') return;
        e.preventDefault();
        setTool(nextTool);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    activeSeries,
    activeDocument,
    sliceIndex,
    onPrimarySliceChange,
    toggleCine,
    loading,
    mprBuilding,
    cancelLoad,
    viewMode,
    selectedAnnotationId,
    deleteSelectedAnnotation,
  ]);

  const onWlDelta = useCallback((dCenter: number, dWidth: number) => {
    setWl((prev) =>
      clampWindowLevel({
        windowCenter: prev.windowCenter + dCenter,
        windowWidth: prev.windowWidth + dWidth,
      }),
    );
  }, []);

  const onCompareWlDelta = useCallback(
    (dCenter: number, dWidth: number) => {
      if (syncWl) {
        onWlDelta(dCenter, dWidth);
        return;
      }
      setCompareWl((prev) =>
        clampWindowLevel({
          windowCenter: prev.windowCenter + dCenter,
          windowWidth: prev.windowWidth + dWidth,
        }),
      );
    },
    [syncWl, onWlDelta],
  );

  const onPrimaryZoomChange = useCallback(
    (z: number) => {
      setZoom(z);
      if (syncZoom) setCompareZoom(z);
    },
    [syncZoom],
  );

  const onCompareZoomChange = useCallback(
    (z: number) => {
      if (syncZoom) {
        setZoom(z);
        setCompareZoom(z);
      } else {
        setCompareZoom(z);
      }
    },
    [syncZoom],
  );

  const onPrimaryPanChange = useCallback(
    (p: { x: number; y: number }) => {
      setPan(p);
      if (syncZoom) setComparePan(p);
    },
    [syncZoom],
  );

  const onComparePanChange = useCallback(
    (p: { x: number; y: number }) => {
      if (syncZoom) {
        setPan(p);
        setComparePan(p);
      } else {
        setComparePan(p);
      }
    },
    [syncZoom],
  );

  const onCursorChange = useCallback(
    (c: VolumeCursor) => {
      if (!volume) {
        setCursor(c);
        return;
      }
      setCursor(clampCursor(c, volume));
    },
    [volume],
  );

  return (
    <div
      className={`app${dragging ? ' app--dragging' : ''}`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {dragging && (
        <div className="drop-overlay" aria-hidden>
          <div className="drop-overlay__card">
            <span className="drop-overlay__title">{t('app.dropOverlay')}</span>
          </div>
        </div>
      )}

      <header className="app__header">
        <div className="app__brand">
          <span className="app__logo">Slice</span>
          <span className="app__version" title={t('update.versionTip')}>
            v{appVersion}
          </span>
          {updateOk && (
            <span
              className="app__update-ok"
              title={t('update.upToDate', { version: appVersion })}
              aria-label={t('update.upToDate', { version: appVersion })}
            >
              ✓
            </span>
          )}
          <span className="app__tag">{t('app.tag')}</span>
        </div>
        <Toolbar
          viewMode={viewMode}
          onViewModeChange={changeViewMode}
          mprAvailable={mprAvailable}
          compareAvailable={compareAvailable}
          onLoadStudy={() => setLoadStudyOpen(true)}
          onNewStudy={closeStudy}
          canOpen={hasApi && !loading}
          hasStudy={!!activeSeries || studies.length > 0 || !!folderPath}
          canExport={hasApi && !loading && (!!activeInstance || (viewMode === 'mpr' && !!volume))}
          onExportJpeg={() => void exportJpeg()}
          onExportPng={() => void exportPng()}
          onExportDicomAnon={() => void exportDicomAnon()}
          onExportSeriesAnon={() => void exportSeriesAnon()}
          canCancelLoad={loading || mprBuilding}
          onCancelLoad={cancelLoad}
          onCheckUpdates={() => void runUpdateCheck()}
          checkingUpdates={checkingUpdate}
        />
      </header>

      <UpdateDialog
        result={updateResult}
        onClose={() => setUpdateResult(null)}
        onOpenRelease={(url) => {
          void window.slice?.openExternal?.(url);
        }}
        onDownload={(url) => {
          void window.slice?.openExternal?.(url);
        }}
      />

      <PasswordDialog
        open={!!zipPrompt}
        zipName={zipPrompt?.path.split(/[/\\]/).pop()}
        error={zipPrompt?.error}
        onCancel={() => setZipPrompt(null)}
        onSubmit={(password) => {
          if (zipPrompt) void openZipWithPassword(zipPrompt.path, password);
        }}
      />
      <LoadStudyDialog
        open={loadStudyOpen}
        busy={loading}
        onClose={() => setLoadStudyOpen(false)}
        onBrowseLocal={() => void browseLoadStudy()}
        onBrowseFiles={() => void browseLoadStudyFiles()}
        onOpenPaths={(paths) => {
          setLoadStudyOpen(false);
          void handleDropPaths(paths);
        }}
        onOpenMedia={(m) => {
          setLoadStudyOpen(false);
          void openMediaSource(m);
        }}
        onOpenPacs={() => {
          setLoadStudyOpen(false);
          setPacsOpen(true);
        }}
      />
      <MediaDialog
        open={mediaOpen}
        onClose={() => setMediaOpen(false)}
        onOpen={(m) => void openMediaSource(m)}
      />
      <PacsDialog
        open={pacsOpen}
        canStore={loadedFiles.length > 0}
        storeFileCount={loadedFiles.length}
        onClose={() => setPacsOpen(false)}
        onRetrieved={(files, label) => void loadFromFiles(files, label)}
        onStore={storeToPacs}
      />
      <DicomdirDialog
        open={dicomdirOpen}
        catalog={dicomdirCatalog}
        onClose={() => setDicomdirOpen(false)}
        onLoad={(selection) => void loadFromDicomdir(selection)}
        onFallbackScan={() => void scanFolderFallback()}
      />

      <div className="app__body">
        <aside className="app__sidebar">
          <div className="sidebar__meta">
            {folderPath ? (
              <p className="sidebar__path" title={folderPath}>
                {folderPath}
              </p>
            ) : (
              <p className="sidebar__hint">{t('app.sidebarHint')}</p>
            )}
            {loading && progress && (
              <p className="sidebar__progress">
                {t('app.loading', { loaded: progress.loaded, total: progress.total })}
              </p>
            )}
            {mprBuilding && mprProgress && (
              <p className="sidebar__progress">
                {t('app.buildingVolume', {
                  loaded: mprProgress.loaded,
                  total: mprProgress.total,
                })}
              </p>
            )}
          </div>
          <SeriesList
            studies={studies}
            activeSeriesUid={activeSeries?.seriesInstanceUID ?? null}
            compareSeriesUid={compareSeries?.seriesInstanceUID ?? null}
            onSelect={selectSeries}
            onSelectCompare={selectCompareSeries}
          />
          <ErrorLogPanel />
          <UpdateLogPanel />
        </aside>

        <div className="app__viewer">
          {activeSeries && (
            <ViewerToolRail
              tool={tool}
              onToolChange={setTool}
              viewMode={viewMode}
              wl={wl}
              onWlChange={(next) => {
                setWl(next);
                if (syncWl) setCompareWl(next);
              }}
              onPreset={applyPreset}
              onToggleTags={() => setTagsOpen((v) => !v)}
              tagsOpen={tagsOpen}
              invert={invertUser}
              onInvertChange={setInvertUser}
              flipH={flipH}
              onFlipHChange={setFlipH}
              flipV={flipV}
              onFlipVChange={setFlipV}
              zoom={zoom}
              onZoomReset={resetView}
              useWebGl={useWebGl}
              onUseWebGlChange={setUseWebGl}
              onClearMeasures={clearAllMeasures}
              canSaveAnnotations={hasApi && !!activeSeries && !activeDocument}
              onSaveAnnotations={() => void saveAnnotations()}
              onLoadAnnotations={() => void loadAnnotations()}
              cinePlaying={cinePlaying}
              onCineToggle={toggleCine}
              cineFps={cineFps}
              onCineFpsChange={setCineFps}
            />
          )}

          <main className="app__main">
          {!activeSeries ? (
            <div className="empty">
              <h1>Slice</h1>
              <p>{t('app.emptySubtitle')}</p>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setLoadStudyOpen(true)}
                disabled={!hasApi || loading}
                title={t('loadStudy.browseTip')}
              >
                {t('loadStudy.title')}
              </button>
              <p className="empty__drop">{t('app.dropHint')}</p>
              {!hasApi && (
                <p className="empty__note">
                  {t('app.startWith')} <code>npm run dev</code> (Electron)
                </p>
              )}
            </div>
          ) : activeDocument ? (
            <DocumentPane
              document={activeDocument}
              onOpenExternal={hasApi ? () => void openDocumentExternal() : undefined}
            />
          ) : viewMode === 'mpr' && mprBuilding ? (
            <div className="empty">
              <p>
                {t('app.buildingVolume', {
                  loaded: mprProgress?.loaded ?? 0,
                  total: mprProgress?.total ?? 0,
                })}
              </p>
              <button type="button" className="btn btn--ghost" onClick={cancelLoad}>
                {t('dialog.cancel')}
              </button>
            </div>
          ) : viewMode === 'mpr' && volume ? (
            <MprLayout
              volume={volume}
              cursor={cursor}
              onCursorChange={onCursorChange}
              wl={wl}
              tool={tool}
              onWlDelta={onWlDelta}
              zoom={zoom}
              onZoomChange={setZoom}
              useWebGl={useWebGl}
              onWebGlFailed={handleWebGlFailed}
              yaw={yaw}
              pitch={pitch}
              onYawChange={setYaw}
              onPitchChange={setPitch}
              layoutMode={mprLayoutMode}
              onLayoutModeChange={setMprLayoutMode}
              singlePlane={mprSinglePlane}
              onSinglePlaneChange={(plane) => {
                setMprSinglePlane(plane);
                setMprFocusPlane(plane);
              }}
              mprBasis={mprBasis}
              onMprBasisChange={setMprBasis}
              measures={measures}
              onMeasuresChange={setMeasures}
              selectedAnnotationId={selectedAnnotationId}
              onSelectAnnotation={setSelectedAnnotationId}
              onClearMeasures={clearAllMeasures}
              onPlaneFocus={setMprFocusPlane}
            />
          ) : viewMode === 'compare' && compareSeries ? (
            <CompareLayout
              left={{
                instance: activeInstance,
                sliceIndex,
                sliceCount: activeSeries.instances.length,
                label: activeSeries.seriesDescription || t('app.series'),
                onSliceChange: onPrimarySliceChange,
                measures,
                onMeasuresChange: setMeasures,
                selectedAnnotationId,
                onSelectAnnotation: setSelectedAnnotationId,
                pixelsRevision,
                onContextAction: onViewportContext,
              }}
              right={{
                instance: compareInstance,
                sliceIndex: compareSliceIndex,
                sliceCount: compareSeries.instances.length,
                label: compareSeries.seriesDescription || t('app.series'),
                onSliceChange: onCompareSliceChange,
                measures: compareMeasures,
                onMeasuresChange: setCompareMeasures,
                selectedAnnotationId,
                onSelectAnnotation: setSelectedAnnotationId,
                pixelsRevision,
                onContextAction: onViewportContext,
              }}
              leftWl={wl}
              rightWl={syncWl ? wl : compareWl}
              leftZoom={zoom}
              rightZoom={syncZoom ? zoom : compareZoom}
              leftPan={pan}
              rightPan={syncZoom ? pan : comparePan}
              tool={tool}
              onLeftWlDelta={onWlDelta}
              onRightWlDelta={onCompareWlDelta}
              onLeftZoomChange={onPrimaryZoomChange}
              onRightZoomChange={onCompareZoomChange}
              onLeftPanChange={onPrimaryPanChange}
              onRightPanChange={onComparePanChange}
              useWebGl={useWebGl}
              invert={displayInvert}
              flipH={flipH}
              flipV={flipV}
              onWebGlFailed={handleWebGlFailed}
              syncScroll={syncScroll}
              onSyncScrollChange={(v) => {
                setSyncScroll(v);
                if (v && activeSeries && compareSeries) {
                  setCompareSliceIndex(
                    mapSliceIndex(
                      sliceIndex,
                      activeSeries.instances.length,
                      compareSeries.instances.length,
                    ),
                  );
                }
              }}
              syncWl={syncWl}
              onSyncWlChange={(v) => {
                setSyncWl(v);
                if (v) setCompareWl(wl);
              }}
              syncZoom={syncZoom}
              onSyncZoomChange={(v) => {
                setSyncZoom(v);
                if (v) {
                  setCompareZoom(zoom);
                  setComparePan(pan);
                }
              }}
            />
          ) : (
            <Viewport
              instance={activeInstance}
              sliceIndex={sliceIndex}
              sliceCount={activeSeries.instances.length}
              onSliceChange={onPrimarySliceChange}
              wl={wl}
              zoom={zoom}
              pan={pan}
              tool={tool}
              onWlDelta={onWlDelta}
              onZoomChange={setZoom}
              onPanChange={setPan}
              useWebGl={useWebGl}
              measures={measures}
              onMeasuresChange={setMeasures}
              selectedAnnotationId={selectedAnnotationId}
              onSelectAnnotation={setSelectedAnnotationId}
              pixelsRevision={pixelsRevision}
              onContextAction={onViewportContext}
              invert={displayInvert}
              flipH={flipH}
              flipV={flipV}
              onWebGlFailed={handleWebGlFailed}
            />
          )}
          <TagBrowser
            open={tagsOpen}
            filePath={activeInstance?.filePath ?? null}
            onClose={() => setTagsOpen(false)}
          />
        </main>
        </div>
      </div>
    </div>
  );
}
