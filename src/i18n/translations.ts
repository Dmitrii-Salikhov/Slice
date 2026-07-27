export type Locale = 'en' | 'ru';

export type MessageKey =
  | 'app.tag'
  | 'app.emptySubtitle'
  | 'app.openFolder'
  | 'app.openDicomFolder'
  | 'app.startWith'
  | 'app.sidebarHint'
  | 'app.loading'
  | 'app.buildingVolume'
  | 'app.noStudies'
  | 'app.anonymous'
  | 'app.study'
  | 'app.series'
  | 'app.images'
  | 'app.selectSeries'
  | 'app.dropHint'
  | 'app.dropOverlay'
  | 'loadStudy.title'
  | 'loadStudy.hint'
  | 'loadStudy.browse'
  | 'loadStudy.browseTip'
  | 'loadStudy.dropHint'
  | 'loadStudy.files'
  | 'loadStudy.filesTip'
  | 'loadStudy.media'
  | 'loadStudy.mediaEmpty'
  | 'loadStudy.refresh'
  | 'loadStudy.pacs'
  | 'toolbar.loadStudyShort'
  | 'toolbar.newStudyShort'
  | 'toolbar.newStudyTip'
  | 'ctx.resetView'
  | 'ctx.toggleInvert'
  | 'ctx.flipH'
  | 'ctx.flipV'
  | 'ctx.clearMeasures'
  | 'ctx.deleteAnnotation'
  | 'ctx.exportJpeg'
  | 'ctx.exportPng'
  | 'ctx.copyPatient'
  | 'ctx.showTags'
  | 'app.about'
  | 'app.aboutVersion'
  | 'toolbar.checkUpdatesTip'
  | 'update.versionTip'
  | 'update.availableTitle'
  | 'update.fromTo'
  | 'update.changelog'
  | 'update.later'
  | 'update.openRelease'
  | 'update.download'
  | 'update.upToDate'
  | 'update.logUpToDate'
  | 'update.logAvailable'
  | 'update.logError'
  | 'update.logDownload'
  | 'updateLog.title'
  | 'updateLog.empty'
  | 'updateLog.clear'
  | 'updateLog.clearTip'
  | 'toolbar.display'
  | 'toolbar.invert'
  | 'toolbar.invertTip'
  | 'toolbar.flipH'
  | 'toolbar.flipHTip'
  | 'toolbar.flipV'
  | 'toolbar.flipVTip'
  | 'toolbar.tags'
  | 'toolbar.tagsTip'
  | 'tags.title'
  | 'tags.filter'
  | 'tags.loading'
  | 'tags.colTag'
  | 'tags.colName'
  | 'tags.colVr'
  | 'tags.colValue'
  | 'error.noApi'
  | 'error.restartRequired'
  | 'error.noFiles'
  | 'error.noParse'
  | 'error.loadCancelled'
  | 'error.dropPaths'
  | 'error.zipPassword'
  | 'error.zipInvalidPassword'
  | 'error.zipExtract'
  | 'errorLog.title'
  | 'errorLog.empty'
  | 'errorLog.clear'
  | 'errorLog.clearTip'
  | 'dialog.cancel'
  | 'dialog.close'
  | 'dicomdir.title'
  | 'dicomdir.hint'
  | 'dicomdir.fileSet'
  | 'dicomdir.empty'
  | 'dicomdir.images'
  | 'dicomdir.loadAll'
  | 'dicomdir.loadPatient'
  | 'dicomdir.loadStudy'
  | 'dicomdir.loadSeries'
  | 'dicomdir.scanFolder'
  | 'dicomdir.parseFail'
  | 'toolbar.tools'
  | 'toolbar.viewMode'
  | 'toolbar.openFolder'
  | 'toolbar.openFolderShort'
  | 'toolbar.openFolderTip'
  | 'toolbar.openFiles'
  | 'toolbar.openFilesShort'
  | 'toolbar.openFilesTip'
  | 'toolbar.openZip'
  | 'toolbar.openZipTip'
  | 'toolbar.openMedia'
  | 'toolbar.openMediaTip'
  | 'toolbar.pacs'
  | 'toolbar.pacsTip'
  | 'toolbar.export'
  | 'toolbar.exportJpeg'
  | 'toolbar.exportJpegTip'
  | 'toolbar.exportPng'
  | 'toolbar.exportPngTip'
  | 'toolbar.exportDicom'
  | 'toolbar.exportDicomTip'
  | 'toolbar.exportSeries'
  | 'toolbar.exportSeriesTip'
  | 'export.saved'
  | 'export.seriesSaved'
  | 'export.noInstance'
  | 'export.fail'
  | 'toolbar.scroll'
  | 'toolbar.scrollTip'
  | 'toolbar.wl'
  | 'toolbar.wlTip'
  | 'toolbar.zoom'
  | 'toolbar.zoomTip'
  | 'toolbar.pan'
  | 'toolbar.panTip'
  | 'toolbar.crosshair'
  | 'toolbar.crosshairTip'
  | 'toolbar.crosshairDisabledTip'
  | 'toolbar.length'
  | 'toolbar.lengthTip'
  | 'toolbar.angle'
  | 'toolbar.angleTip'
  | 'toolbar.roi'
  | 'toolbar.roiTip'
  | 'toolbar.arrow'
  | 'toolbar.arrowTip'
  | 'toolbar.probe'
  | 'toolbar.probeTip'
  | 'toolbar.stack'
  | 'toolbar.stackTip'
  | 'toolbar.mpr'
  | 'toolbar.mprTip'
  | 'toolbar.mprDisabledTip'
  | 'toolbar.compare'
  | 'toolbar.compareTip'
  | 'toolbar.compareDisabledTip'
  | 'toolbar.saveAnnotations'
  | 'toolbar.saveAnnotationsShort'
  | 'toolbar.saveAnnotationsTip'
  | 'toolbar.loadAnnotations'
  | 'toolbar.loadAnnotationsShort'
  | 'toolbar.loadAnnotationsTip'
  | 'toolbar.cine'
  | 'toolbar.cineTip'
  | 'toolbar.cinePlay'
  | 'toolbar.cinePause'
  | 'toolbar.cineFps'
  | 'toolbar.cineFpsTip'
  | 'toolbar.cancelLoad'
  | 'toolbar.cancelLoadTip'
  | 'compare.title'
  | 'compare.seriesHint'
  | 'compare.setB'
  | 'compare.sync'
  | 'compare.syncScroll'
  | 'compare.syncScrollTip'
  | 'compare.syncWl'
  | 'compare.syncWlTip'
  | 'compare.syncZoom'
  | 'compare.syncZoomTip'
  | 'toolbar.window'
  | 'toolbar.windowTip'
  | 'toolbar.level'
  | 'toolbar.levelTip'
  | 'toolbar.presetSoft'
  | 'toolbar.presetLung'
  | 'toolbar.presetBone'
  | 'toolbar.presetBrain'
  | 'toolbar.presetAbdomen'
  | 'toolbar.presetSoftTip'
  | 'toolbar.presetLungTip'
  | 'toolbar.presetBoneTip'
  | 'toolbar.presetBrainTip'
  | 'toolbar.presetAbdomenTip'
  | 'toolbar.webgl'
  | 'toolbar.webglTip'
  | 'toolbar.zoomReset'
  | 'toolbar.zoomResetTip'
  | 'toolbar.clearMeasures'
  | 'toolbar.clearMeasuresTip'
  | 'toolbar.lang'
  | 'toolbar.langTip'
  | 'zip.passwordTitle'
  | 'zip.passwordHint'
  | 'zip.passwordHintNamed'
  | 'zip.password'
  | 'zip.unlock'
  | 'media.title'
  | 'media.hint'
  | 'media.refresh'
  | 'media.scanning'
  | 'media.empty'
  | 'media.hasDicom'
  | 'pacs.title'
  | 'pacs.hint'
  | 'pacs.host'
  | 'pacs.port'
  | 'pacs.calledAe'
  | 'pacs.callingAe'
  | 'pacs.localAe'
  | 'pacs.localPort'
  | 'pacs.profile'
  | 'pacs.profileNew'
  | 'pacs.profileSave'
  | 'pacs.profileRename'
  | 'pacs.profileDelete'
  | 'pacs.profileNamePrompt'
  | 'pacs.profileNewName'
  | 'pacs.profileSaved'
  | 'pacs.profileDeleteLast'
  | 'pacs.profileDeleteConfirm'
  | 'pacs.echo'
  | 'pacs.echoing'
  | 'pacs.echoOk'
  | 'pacs.echoFail'
  | 'pacs.query'
  | 'pacs.queryLevel'
  | 'pacs.levelStudy'
  | 'pacs.levelSeries'
  | 'pacs.levelInstance'
  | 'pacs.studyUid'
  | 'pacs.seriesUid'
  | 'pacs.patientId'
  | 'pacs.patientName'
  | 'pacs.studyDate'
  | 'pacs.accession'
  | 'pacs.modality'
  | 'pacs.find'
  | 'pacs.searching'
  | 'pacs.found'
  | 'pacs.foundSeries'
  | 'pacs.foundInstances'
  | 'pacs.findFail'
  | 'pacs.retrieveMode'
  | 'pacs.retrieve'
  | 'pacs.retrieving'
  | 'pacs.retrievingProgress'
  | 'pacs.retrieveCancel'
  | 'pacs.retrieveCancelled'
  | 'pacs.retrieved'
  | 'pacs.retrieveFail'
  | 'pacs.retrieveProgress'
  | 'pacs.cancelRetrieve'
  | 'pacs.profiles'
  | 'pacs.profileName'
  | 'pacs.newProfile'
  | 'pacs.saveProfile'
  | 'pacs.deleteProfile'
  | 'pacs.savingProfile'
  | 'pacs.drillSeries'
  | 'pacs.drillInstances'
  | 'pacs.drillHint'
  | 'pacs.store'
  | 'pacs.storeTip'
  | 'pacs.storeDisabledTip'
  | 'pacs.storeOk'
  | 'pacs.storeFail'
  | 'pacs.colPatient'
  | 'pacs.colId'
  | 'pacs.colDate'
  | 'pacs.colModality'
  | 'pacs.colDesc'
  | 'pacs.colCount'
  | 'pacs.colLevel'
  | 'pacs.colUid'
  | 'document.pdf'
  | 'document.sr'
  | 'document.openExternal'
  | 'mpr.axial'
  | 'mpr.coronal'
  | 'mpr.sagittal'
  | 'mpr.oblique'
  | 'mpr.yaw'
  | 'mpr.pitch'
  | 'mpr.cursor'
  | 'mpr.volume'
  | 'mpr.canvas'
  | 'mpr.layout'
  | 'mpr.layoutSingle'
  | 'mpr.layoutQuad'
  | 'mpr.layoutSingleTip'
  | 'mpr.layoutQuadTip'
  | 'mpr.plane'
  | 'mpr.basis'
  | 'mpr.basisPatient'
  | 'mpr.basisStack'
  | 'mpr.basisPatientTip'
  | 'mpr.basisStackTip'
  | 'mpr.basisPatientUnavailable'
  | 'viewport.webgl';

type Dict = Record<MessageKey, string>;

const en: Dict = {
  'app.tag': 'DICOM Viewer',
  'app.emptySubtitle': 'Local DICOM viewer — load a study from disk, ZIP, CD/DVD or PACS',
  'app.openFolder': 'Open folder',
  'app.openDicomFolder': 'Open DICOM folder',
  'app.startWith': 'Start with',
  'app.sidebarHint': 'Open a folder, ZIP, disk, or PACS — or drag files here',
  'app.loading': 'Loading {loaded}/{total}',
  'app.buildingVolume': 'Building volume… {loaded}/{total}',
  'app.noStudies': 'No studies loaded',
  'app.anonymous': 'Anonymous',
  'app.study': 'Study',
  'app.series': 'Series',
  'app.images': '{count} images',
  'app.selectSeries': 'Select series',
  'app.dropHint': 'Or drag a folder / ZIP / DICOM files into the window',
  'app.dropOverlay': 'Drop DICOM files, folders, or ZIP archives',
  'loadStudy.title': 'Load study',
  'loadStudy.hint':
    'Pick a folder, ZIP, or DICOM files — Slice detects the source automatically. Optical discs appear below when inserted.',
  'loadStudy.browse': 'Choose on this computer…',
  'loadStudy.browseTip': 'Open a study folder, ZIP archive, or DICOM files',
  'loadStudy.dropHint': 'Or drop a folder / ZIP / files onto this window',
  'loadStudy.files': 'ZIP or DICOM files…',
  'loadStudy.filesTip': 'Open a ZIP archive or individual DICOM files',
  'loadStudy.media': 'Detected discs',
  'loadStudy.mediaEmpty': 'No CD/DVD with DICOM detected',
  'loadStudy.refresh': 'Refresh',
  'loadStudy.pacs': 'PACS / network…',
  'toolbar.loadStudyShort': 'Load',
  'toolbar.newStudyShort': 'New',
  'toolbar.newStudyTip': 'Close the current study and return to the start screen',
  'ctx.resetView': 'Reset zoom / pan',
  'ctx.toggleInvert': 'Invert grayscale',
  'ctx.flipH': 'Flip horizontal',
  'ctx.flipV': 'Flip vertical',
  'ctx.clearMeasures': 'Clear all annotations',
  'ctx.deleteAnnotation': 'Delete annotation',
  'ctx.exportJpeg': 'Export JPEG…',
  'ctx.exportPng': 'Export PNG…',
  'ctx.copyPatient': 'Copy patient / series info',
  'ctx.showTags': 'DICOM tags…',
  'app.about': 'Slice — local DICOM viewer',
  'app.aboutVersion': 'Slice v{version} — local DICOM viewer',
  'toolbar.checkUpdatesTip': 'Check for updates',
  'update.versionTip': 'Application version',
  'update.availableTitle': 'Update available',
  'update.fromTo': 'v{current} → v{latest}',
  'update.changelog': 'What’s new',
  'update.later': 'Later',
  'update.openRelease': 'Open release page',
  'update.download': 'Download',
  'update.upToDate': 'You are on the latest version (v{version}).',
  'update.logUpToDate': 'Update check: up to date (v{version})',
  'update.logAvailable': 'Update available: v{current} → v{latest}',
  'update.logError': 'Update check failed: {message}',
  'update.logDownload': 'Opened download: {url}',
  'updateLog.title': 'Update log',
  'updateLog.empty': 'No update events',
  'updateLog.clear': 'Clear',
  'updateLog.clearTip': 'Clear the update log',
  'toolbar.display': 'Display',
  'toolbar.invert': 'Inv',
  'toolbar.invertTip': 'Invert grayscale (XOR with MONOCHROME1)',
  'toolbar.flipH': '⇄',
  'toolbar.flipHTip': 'Flip horizontal',
  'toolbar.flipV': '⇅',
  'toolbar.flipVTip': 'Flip vertical',
  'toolbar.tags': 'Tags',
  'toolbar.tagsTip': 'Show DICOM tag browser',
  'tags.title': 'DICOM tags',
  'tags.filter': 'Filter…',
  'tags.loading': 'Reading tags…',
  'tags.colTag': 'Tag',
  'tags.colName': 'Name',
  'tags.colVr': 'VR',
  'tags.colValue': 'Value',
  'error.noApi': 'Electron API unavailable — run via npm run dev',
  'error.restartRequired': 'App needs a full restart (npm run dev) — main process is out of date',
  'error.noFiles': 'No DICOM-like files found',
  'error.noParse': 'Could not parse any DICOM files',
  'error.loadCancelled': 'Load cancelled',
  'error.dropPaths': 'Could not read dropped files',
  'error.zipPassword': 'This ZIP is encrypted — enter the password',
  'error.zipInvalidPassword': 'Invalid ZIP password',
  'error.zipExtract': 'Could not extract ZIP',
  'errorLog.title': 'Error log',
  'errorLog.empty': 'No errors',
  'errorLog.clear': 'Clear',
  'errorLog.clearTip': 'Clear the error log',
  'dialog.cancel': 'Cancel',
  'dialog.close': 'Close',
  'dicomdir.title': 'DICOMDIR catalog',
  'dicomdir.hint': '{count} instances indexed · {path}',
  'dicomdir.fileSet': 'File-set',
  'dicomdir.empty': 'No image records in DICOMDIR',
  'dicomdir.images': '{count} img',
  'dicomdir.loadAll': 'Load all',
  'dicomdir.loadPatient': 'Load patient',
  'dicomdir.loadStudy': 'Load study',
  'dicomdir.loadSeries': 'Load series',
  'dicomdir.scanFolder': 'Scan folder instead',
  'dicomdir.parseFail': 'Could not parse DICOMDIR',
  'toolbar.tools': 'Tools',
  'toolbar.viewMode': 'View mode',
  'toolbar.openFolder': 'Open folder',
  'toolbar.openFolderShort': 'Folder',
  'toolbar.openFolderTip': 'Open a folder with DICOM files',
  'toolbar.openFiles': 'Open files',
  'toolbar.openFilesShort': 'Files',
  'toolbar.openFilesTip': 'Open one or more DICOM files',
  'toolbar.openZip': 'ZIP',
  'toolbar.openZipTip': 'Open a ZIP archive (including password-protected)',
  'toolbar.openMedia': 'CD/DVD',
  'toolbar.openMediaTip': 'Detect and open CD/DVD or DICOM media',
  'toolbar.pacs': 'PACS',
  'toolbar.pacsTip': 'Query (C-FIND), retrieve (C-MOVE/C-GET), send (C-STORE)',
  'toolbar.export': 'Export',
  'toolbar.exportJpeg': 'JPEG',
  'toolbar.exportJpegTip': 'Export the current view as JPEG (W/L + annotations)',
  'toolbar.exportPng': 'PNG',
  'toolbar.exportPngTip': 'Export the current view as PNG (W/L + annotations)',
  'toolbar.exportDicom': 'Anon',
  'toolbar.exportDicomTip': 'Export current instance as anonymized DICOM',
  'toolbar.exportSeries': 'A-Series',
  'toolbar.exportSeriesTip': 'Export active series as anonymized DICOM files',
  'export.saved': 'Saved {path}',
  'export.seriesSaved': 'Exported {count} anonymized files to {path}',
  'export.noInstance': 'No slice to export',
  'export.fail': 'Export failed',
  'toolbar.scroll': 'Scroll',
  'toolbar.scrollTip': 'Scroll through slices (mouse wheel or drag)',
  'toolbar.wl': 'W/L',
  'toolbar.wlTip': 'Adjust window width and level (drag)',
  'toolbar.zoom': 'Zoom',
  'toolbar.zoomTip': 'Zoom the image (drag or Ctrl+wheel)',
  'toolbar.pan': 'Pan',
  'toolbar.panTip': 'Pan the image (drag)',
  'toolbar.crosshair': 'Cross',
  'toolbar.crosshairTip': 'Linked crosshair across MPR planes',
  'toolbar.crosshairDisabledTip': 'Available only in MPR mode',
  'toolbar.length': 'Length',
  'toolbar.lengthTip': 'Measure distance in millimeters',
  'toolbar.angle': 'Angle',
  'toolbar.angleTip': 'Measure an angle (three points)',
  'toolbar.roi': 'ROI',
  'toolbar.roiTip': 'Elliptical ROI with mean / SD / min–max / area',
  'toolbar.arrow': 'Arrow',
  'toolbar.arrowTip': 'Place an arrow annotation',
  'toolbar.probe': 'HU',
  'toolbar.probeTip': 'Probe Hounsfield units at a point',
  'toolbar.stack': 'Stack',
  'toolbar.stackTip': 'Single-stack slice view',
  'toolbar.mpr': 'MPR',
  'toolbar.mprTip': 'Multi-planar reconstruction with oblique',
  'toolbar.mprDisabledTip': 'Needs a multi-slice series',
  'toolbar.compare': 'Compare',
  'toolbar.compareTip': 'Side-by-side series comparison',
  'toolbar.compareDisabledTip': 'Needs at least two series',
  'toolbar.saveAnnotations': 'Save ann.',
  'toolbar.saveAnnotationsShort': 'Save',
  'toolbar.saveAnnotationsTip': 'Save annotations for the active series',
  'toolbar.loadAnnotations': 'Load ann.',
  'toolbar.loadAnnotationsShort': 'Load',
  'toolbar.loadAnnotationsTip': 'Load annotations from a JSON file',
  'toolbar.cine': 'Cine',
  'toolbar.cineTip': 'Play slices as a cine loop',
  'toolbar.cinePlay': 'Play',
  'toolbar.cinePause': 'Pause',
  'toolbar.cineFps': 'FPS',
  'toolbar.cineFpsTip': 'Cine frames per second',
  'toolbar.cancelLoad': 'Cancel',
  'toolbar.cancelLoadTip': 'Cancel the current DICOM load',
  'compare.title': 'Series compare',
  'compare.seriesHint': 'Click a series for A; use B to pick the compare series',
  'compare.setB': 'Set as compare series (B)',
  'compare.sync': 'Sync',
  'compare.syncScroll': 'Scroll',
  'compare.syncScrollTip': 'Link slice position between A and B',
  'compare.syncWl': 'W/L',
  'compare.syncWlTip': 'Share window/level between A and B',
  'compare.syncZoom': 'Zoom',
  'compare.syncZoomTip': 'Share zoom and pan between A and B',
  'toolbar.window': 'W',
  'toolbar.windowTip': 'Window width',
  'toolbar.level': 'L',
  'toolbar.levelTip': 'Window level (center)',
  'toolbar.presetSoft': 'soft',
  'toolbar.presetLung': 'lung',
  'toolbar.presetBone': 'bone',
  'toolbar.presetBrain': 'brain',
  'toolbar.presetAbdomen': 'abdomen',
  'toolbar.presetSoftTip': 'Soft tissue preset (W400 / L40)',
  'toolbar.presetLungTip': 'Lung preset (W1500 / L-600)',
  'toolbar.presetBoneTip': 'Bone preset (W1800 / L400)',
  'toolbar.presetBrainTip': 'Brain preset (W80 / L40)',
  'toolbar.presetAbdomenTip': 'Abdomen preset (W400 / L60)',
  'toolbar.webgl': 'WebGL',
  'toolbar.webglTip': 'Use WebGL2 slice renderer',
  'toolbar.zoomReset': 'Reset zoom',
  'toolbar.zoomResetTip': 'Reset zoom and pan to default',
  'toolbar.clearMeasures': 'Clear all',
  'toolbar.clearMeasuresTip': 'Clear all annotations (length, angle, ROI, arrows)',
  'toolbar.lang': 'EN',
  'toolbar.langTip': 'Switch interface language',
  'zip.passwordTitle': 'Encrypted ZIP',
  'zip.passwordHint': 'Enter the archive password to extract DICOM files',
  'zip.passwordHintNamed': 'Password required for {name}',
  'zip.password': 'Password',
  'zip.unlock': 'Unlock',
  'media.title': 'CD / DVD / media',
  'media.hint': 'Optical and removable volumes with DICOM content',
  'media.refresh': 'Refresh',
  'media.scanning': 'Scanning volumes…',
  'media.empty': 'No media detected — insert a disc and refresh',
  'media.hasDicom': 'DICOM',
  'pacs.title': 'PACS',
  'pacs.hint': 'C-FIND query, C-MOVE / C-GET retrieve, C-STORE send. Configure Move destination AE on the server to match Local AE.',
  'pacs.host': 'Host',
  'pacs.port': 'Port',
  'pacs.calledAe': 'Called AE',
  'pacs.callingAe': 'Calling AE',
  'pacs.localAe': 'Local AE (Move dest.)',
  'pacs.localPort': 'Local SCP port',
  'pacs.profile': 'Profile',
  'pacs.profileNew': 'New',
  'pacs.profileSave': 'Save',
  'pacs.profileRename': 'Rename',
  'pacs.profileDelete': 'Delete',
  'pacs.profileNamePrompt': 'Profile name',
  'pacs.profileNewName': 'New PACS',
  'pacs.profileSaved': 'Profile saved',
  'pacs.profileDeleteLast': 'Keep at least one profile',
  'pacs.profileDeleteConfirm': 'Delete profile “{name}”?',
  'pacs.echo': 'C-ECHO',
  'pacs.echoing': 'Echo…',
  'pacs.echoOk': 'Echo OK',
  'pacs.echoFail': 'Echo failed',
  'pacs.query': 'Query',
  'pacs.queryLevel': 'Level',
  'pacs.levelStudy': 'Study',
  'pacs.levelSeries': 'Series',
  'pacs.levelInstance': 'Instance',
  'pacs.studyUid': 'Study UID',
  'pacs.seriesUid': 'Series UID',
  'pacs.patientId': 'Patient ID',
  'pacs.patientName': 'Patient name',
  'pacs.studyDate': 'Study date',
  'pacs.accession': 'Accession',
  'pacs.modality': 'Modality',
  'pacs.find': 'C-FIND',
  'pacs.searching': 'Searching…',
  'pacs.found': 'Found {count} studies',
  'pacs.foundSeries': 'Found {count} series',
  'pacs.foundInstances': 'Found {count} instances',
  'pacs.findFail': 'Find failed',
  'pacs.retrieveMode': 'Retrieve',
  'pacs.retrieve': 'Retrieve',
  'pacs.retrieving': 'Retrieving…',
  'pacs.retrievingProgress': 'Retrieving… {count} received',
  'pacs.retrieveCancel': 'Cancel',
  'pacs.retrieveCancelled': 'Retrieve cancelled ({count} received)',
  'pacs.retrieved': 'Retrieved {count} files',
  'pacs.retrieveFail': 'Retrieve failed or returned no files',
  'pacs.retrieveProgress': 'Retrieved {done}/{total}',
  'pacs.cancelRetrieve': 'Cancel retrieve',
  'pacs.profiles': 'Profiles',
  'pacs.profileName': 'Profile name',
  'pacs.newProfile': 'New profile',
  'pacs.saveProfile': 'Save profile',
  'pacs.deleteProfile': 'Delete profile',
  'pacs.savingProfile': 'Saving…',
  'pacs.drillSeries': 'Series…',
  'pacs.drillInstances': 'Instances…',
  'pacs.drillHint': 'Double-click a study/series to drill down',
  'pacs.store': 'C-STORE',
  'pacs.storeTip': 'Send currently loaded DICOM files to PACS',
  'pacs.storeDisabledTip': 'Load a study first',
  'pacs.storeOk': 'Store completed',
  'pacs.storeFail': 'Store failed',
  'pacs.colPatient': 'Patient',
  'pacs.colId': 'ID',
  'pacs.colDate': 'Date',
  'pacs.colModality': 'Mod.',
  'pacs.colDesc': 'Description',
  'pacs.colCount': '#',
  'pacs.colLevel': 'Lvl',
  'pacs.colUid': 'UID',
  'document.pdf': 'PDF document',
  'document.sr': 'Structured report',
  'document.openExternal': 'Open externally',
  'mpr.axial': 'Axial',
  'mpr.coronal': 'Coronal',
  'mpr.sagittal': 'Sagittal',
  'mpr.oblique': 'Oblique',
  'mpr.yaw': 'Yaw',
  'mpr.pitch': 'Pitch',
  'mpr.cursor': 'Cursor {x}, {y}, {z} · {hu} HU',
  'mpr.volume': 'Vol {dims} · {spacing} mm',
  'mpr.canvas': 'Canvas',
  'mpr.layout': 'MPR layout',
  'mpr.layoutSingle': '1 plane',
  'mpr.layoutQuad': '4 planes',
  'mpr.layoutSingleTip': 'Show one orthogonal plane',
  'mpr.layoutQuadTip': 'Show axial, coronal, sagittal and oblique',
  'mpr.plane': 'Plane',
  'mpr.basis': 'MPR basis',
  'mpr.basisPatient': 'Patient',
  'mpr.basisStack': 'Stack',
  'mpr.basisPatientTip': 'Anatomical planes in patient space (RadiAnt-style)',
  'mpr.basisStackTip': 'Cut along acquisition voxel axes (legacy fallback)',
  'mpr.basisPatientUnavailable': 'Patient geometry missing (IOP/IPP) — use Stack',
  'viewport.webgl': 'WebGL',
};

const ru: Dict = {
  'app.tag': 'DICOM-просмотрщик',
  'app.emptySubtitle': 'Локальный DICOM — загрузка с диска, ZIP, CD/DVD или PACS',
  'app.openFolder': 'Открыть папку',
  'app.openDicomFolder': 'Открыть папку DICOM',
  'app.startWith': 'Запустите через',
  'app.sidebarHint': 'Папка, ZIP, диск или PACS — или перетащите файлы сюда',
  'app.loading': 'Загрузка {loaded}/{total}',
  'app.buildingVolume': 'Сборка volume… {loaded}/{total}',
  'app.noStudies': 'Исследования не загружены',
  'app.anonymous': 'Аноним',
  'app.study': 'Исследование',
  'app.series': 'Серия',
  'app.images': '{count} снимков',
  'app.selectSeries': 'Выбрать серию',
  'app.dropHint': 'Или перетащите папку / ZIP / DICOM в окно',
  'app.dropOverlay': 'Отпустите DICOM, папки или ZIP',
  'loadStudy.title': 'Загрузить исследование',
  'loadStudy.hint':
    'Выберите папку, ZIP или DICOM — программа сама определит источник. Вставленные диски появятся ниже.',
  'loadStudy.browse': 'Выбрать на этом компьютере…',
  'loadStudy.browseTip': 'Открыть папку с исследованием, ZIP-архив или DICOM-файлы',
  'loadStudy.dropHint': 'Или перетащите папку / ZIP / файлы в это окно',
  'loadStudy.files': 'ZIP или DICOM-файлы…',
  'loadStudy.filesTip': 'Открыть ZIP-архив или отдельные DICOM-файлы',
  'loadStudy.media': 'Найденные диски',
  'loadStudy.mediaEmpty': 'CD/DVD с DICOM не обнаружены',
  'loadStudy.refresh': 'Обновить',
  'loadStudy.pacs': 'PACS / сеть…',
  'toolbar.loadStudyShort': 'Загрузить',
  'toolbar.newStudyShort': 'Новое',
  'toolbar.newStudyTip': 'Закрыть текущее исследование и вернуться на стартовый экран',
  'ctx.resetView': 'Сбросить масштаб / pan',
  'ctx.toggleInvert': 'Инверсия',
  'ctx.flipH': 'Отразить по горизонтали',
  'ctx.flipV': 'Отразить по вертикали',
  'ctx.clearMeasures': 'Очистить все метки',
  'ctx.deleteAnnotation': 'Удалить метку',
  'ctx.exportJpeg': 'Экспорт JPEG…',
  'ctx.exportPng': 'Экспорт PNG…',
  'ctx.copyPatient': 'Копировать пациента / серию',
  'ctx.showTags': 'DICOM-теги…',
  'app.about': 'Slice — локальный DICOM-просмотрщик',
  'app.aboutVersion': 'Slice v{version} — локальный DICOM-просмотрщик',
  'toolbar.checkUpdatesTip': 'Проверить обновления',
  'update.versionTip': 'Версия приложения',
  'update.availableTitle': 'Доступно обновление',
  'update.fromTo': 'v{current} → v{latest}',
  'update.changelog': 'Что нового',
  'update.later': 'Позже',
  'update.openRelease': 'Страница релиза',
  'update.download': 'Скачать',
  'update.upToDate': 'У вас актуальная версия (v{version}).',
  'update.logUpToDate': 'Проверка обновлений: актуально (v{version})',
  'update.logAvailable': 'Доступно обновление: v{current} → v{latest}',
  'update.logError': 'Ошибка проверки обновлений: {message}',
  'update.logDownload': 'Открыта загрузка: {url}',
  'updateLog.title': 'Лог обновлений',
  'updateLog.empty': 'Событий обновления нет',
  'updateLog.clear': 'Очистить',
  'updateLog.clearTip': 'Очистить лог обновлений',
  'toolbar.display': 'Отображение',
  'toolbar.invert': 'Inv',
  'toolbar.invertTip': 'Инверсия (XOR с MONOCHROME1)',
  'toolbar.flipH': '⇄',
  'toolbar.flipHTip': 'Отразить по горизонтали',
  'toolbar.flipV': '⇅',
  'toolbar.flipVTip': 'Отразить по вертикали',
  'toolbar.tags': 'Теги',
  'toolbar.tagsTip': 'Браузер DICOM-тегов',
  'tags.title': 'DICOM-теги',
  'tags.filter': 'Фильтр…',
  'tags.loading': 'Чтение тегов…',
  'tags.colTag': 'Тег',
  'tags.colName': 'Имя',
  'tags.colVr': 'VR',
  'tags.colValue': 'Значение',
  'error.noApi': 'API Electron недоступен — запустите npm run dev',
  'error.restartRequired': 'Нужен полный перезапуск (npm run dev) — main-процесс устарел',
  'error.noFiles': 'DICOM-файлы не найдены',
  'error.noParse': 'Не удалось разобрать DICOM-файлы',
  'error.loadCancelled': 'Загрузка отменена',
  'error.dropPaths': 'Не удалось прочитать перетащенные файлы',
  'error.zipPassword': 'ZIP зашифрован — введите пароль',
  'error.zipInvalidPassword': 'Неверный пароль ZIP',
  'error.zipExtract': 'Не удалось распаковать ZIP',
  'errorLog.title': 'Лог ошибок',
  'errorLog.empty': 'Ошибок нет',
  'errorLog.clear': 'Очистить',
  'errorLog.clearTip': 'Очистить лог ошибок',
  'dialog.cancel': 'Отмена',
  'dialog.close': 'Закрыть',
  'dicomdir.title': 'Каталог DICOMDIR',
  'dicomdir.hint': '{count} объектов · {path}',
  'dicomdir.fileSet': 'File-set',
  'dicomdir.empty': 'В DICOMDIR нет записей изображений',
  'dicomdir.images': '{count} сним.',
  'dicomdir.loadAll': 'Загрузить всё',
  'dicomdir.loadPatient': 'Загрузить пациента',
  'dicomdir.loadStudy': 'Загрузить исследование',
  'dicomdir.loadSeries': 'Загрузить серию',
  'dicomdir.scanFolder': 'Сканировать папку',
  'dicomdir.parseFail': 'Не удалось разобрать DICOMDIR',
  'toolbar.tools': 'Инструменты',
  'toolbar.viewMode': 'Режим просмотра',
  'toolbar.openFolder': 'Открыть папку',
  'toolbar.openFolderShort': 'Папка',
  'toolbar.openFolderTip': 'Открыть папку с DICOM-файлами',
  'toolbar.openFiles': 'Открыть файлы',
  'toolbar.openFilesShort': 'Файлы',
  'toolbar.openFilesTip': 'Открыть один или несколько DICOM-файлов',
  'toolbar.openZip': 'ZIP',
  'toolbar.openZipTip': 'Открыть ZIP-архив (в т.ч. с паролем)',
  'toolbar.openMedia': 'CD/DVD',
  'toolbar.openMediaTip': 'Найти и открыть CD/DVD или DICOM-носитель',
  'toolbar.pacs': 'PACS',
  'toolbar.pacsTip': 'Поиск (C-FIND), получение (C-MOVE/C-GET), отправка (C-STORE)',
  'toolbar.export': 'Экспорт',
  'toolbar.exportJpeg': 'JPEG',
  'toolbar.exportJpegTip': 'Экспорт текущего вида в JPEG (W/L + аннотации)',
  'toolbar.exportPng': 'PNG',
  'toolbar.exportPngTip': 'Экспорт текущего вида в PNG (W/L + аннотации)',
  'toolbar.exportDicom': 'Anon',
  'toolbar.exportDicomTip': 'Экспорт текущего файла как обезличенный DICOM',
  'toolbar.exportSeries': 'A-серия',
  'toolbar.exportSeriesTip': 'Экспорт активной серии как обезличенные DICOM',
  'export.saved': 'Сохранено: {path}',
  'export.seriesSaved': 'Экспортировано файлов: {count} → {path}',
  'export.noInstance': 'Нет среза для экспорта',
  'export.fail': 'Экспорт не удался',
  'toolbar.scroll': 'Листать',
  'toolbar.scrollTip': 'Листать срезы (колёсико или перетаскивание)',
  'toolbar.wl': 'W/L',
  'toolbar.wlTip': 'Окно/уровень яркости (перетаскивание)',
  'toolbar.zoom': 'Масштаб',
  'toolbar.zoomTip': 'Масштабирование (перетаскивание или Ctrl+колёсико)',
  'toolbar.pan': 'Сдвиг',
  'toolbar.panTip': 'Сдвиг изображения (перетаскивание)',
  'toolbar.crosshair': 'Крест',
  'toolbar.crosshairTip': 'Связанный крест на плоскостях MPR',
  'toolbar.crosshairDisabledTip': 'Доступно только в режиме MPR',
  'toolbar.length': 'Длина',
  'toolbar.lengthTip': 'Измерить расстояние в миллиметрах',
  'toolbar.angle': 'Угол',
  'toolbar.angleTip': 'Измерить угол (три точки)',
  'toolbar.roi': 'ROI',
  'toolbar.roiTip': 'Эллиптическая ROI: среднее / СКО / min–max / площадь',
  'toolbar.arrow': 'Стрелка',
  'toolbar.arrowTip': 'Добавить стрелку-аннотацию',
  'toolbar.probe': 'HU',
  'toolbar.probeTip': 'Значение Хаунсфилда в точке',
  'toolbar.stack': 'Стек',
  'toolbar.stackTip': 'Просмотр одной серии срезов',
  'toolbar.mpr': 'MPR',
  'toolbar.mprTip': 'Мультипланарная реконструкция с косым срезом',
  'toolbar.mprDisabledTip': 'Нужна серия из нескольких срезов',
  'toolbar.compare': 'Сравнение',
  'toolbar.compareTip': 'Сравнение двух серий рядом',
  'toolbar.compareDisabledTip': 'Нужны как минимум две серии',
  'toolbar.saveAnnotations': 'Сохр. анн.',
  'toolbar.saveAnnotationsShort': 'Сохр.',
  'toolbar.saveAnnotationsTip': 'Сохранить аннотации активной серии',
  'toolbar.loadAnnotations': 'Загр. анн.',
  'toolbar.loadAnnotationsShort': 'Загр.',
  'toolbar.loadAnnotationsTip': 'Загрузить аннотации из JSON',
  'toolbar.cine': 'Кино',
  'toolbar.cineTip': 'Проигрывать срезы как киноцикл',
  'toolbar.cinePlay': 'Пуск',
  'toolbar.cinePause': 'Пауза',
  'toolbar.cineFps': 'к/с',
  'toolbar.cineFpsTip': 'Кадров в секунду',
  'toolbar.cancelLoad': 'Отмена',
  'toolbar.cancelLoadTip': 'Отменить текущую загрузку DICOM',
  'compare.title': 'Сравнение серий',
  'compare.seriesHint': 'Клик — серия A; кнопка B — серия для сравнения',
  'compare.setB': 'Назначить серией сравнения (B)',
  'compare.sync': 'Синхронизация',
  'compare.syncScroll': 'Срезы',
  'compare.syncScrollTip': 'Связать позицию среза между A и B',
  'compare.syncWl': 'W/L',
  'compare.syncWlTip': 'Общий window/level для A и B',
  'compare.syncZoom': 'Масштаб',
  'compare.syncZoomTip': 'Общий масштаб и сдвиг для A и B',
  'toolbar.window': 'W',
  'toolbar.windowTip': 'Ширина окна (Window Width)',
  'toolbar.level': 'L',
  'toolbar.levelTip': 'Уровень окна (Window Center)',
  'toolbar.presetSoft': 'мягк.',
  'toolbar.presetLung': 'лёгк.',
  'toolbar.presetBone': 'кость',
  'toolbar.presetBrain': 'мозг',
  'toolbar.presetAbdomen': 'живот',
  'toolbar.presetSoftTip': 'Предустановка мягких тканей (W400 / L40)',
  'toolbar.presetLungTip': 'Предустановка лёгких (W1500 / L-600)',
  'toolbar.presetBoneTip': 'Предустановка кости (W1800 / L400)',
  'toolbar.presetBrainTip': 'Предустановка мозга (W80 / L40)',
  'toolbar.presetAbdomenTip': 'Предустановка живота (W400 / L60)',
  'toolbar.webgl': 'WebGL',
  'toolbar.webglTip': 'Рендер среза через WebGL2',
  'toolbar.zoomReset': 'Сброс масштаба',
  'toolbar.zoomResetTip': 'Сбросить масштаб и сдвиг',
  'toolbar.clearMeasures': 'Сброс меток',
  'toolbar.clearMeasuresTip': 'Очистить все метки (длина, угол, ROI, стрелки)',
  'toolbar.lang': 'RU',
  'toolbar.langTip': 'Переключить язык интерфейса',
  'zip.passwordTitle': 'Зашифрованный ZIP',
  'zip.passwordHint': 'Введите пароль архива для извлечения DICOM',
  'zip.passwordHintNamed': 'Нужен пароль для {name}',
  'zip.password': 'Пароль',
  'zip.unlock': 'Открыть',
  'media.title': 'CD / DVD / носитель',
  'media.hint': 'Оптические и съёмные тома с DICOM',
  'media.refresh': 'Обновить',
  'media.scanning': 'Сканирование томов…',
  'media.empty': 'Носители не найдены — вставьте диск и обновите',
  'media.hasDicom': 'DICOM',
  'pacs.title': 'PACS',
  'pacs.hint': 'C-FIND, C-MOVE / C-GET, C-STORE. На PACS укажите Destination AE = Local AE.',
  'pacs.host': 'Хост',
  'pacs.port': 'Порт',
  'pacs.calledAe': 'Called AE',
  'pacs.callingAe': 'Calling AE',
  'pacs.localAe': 'Local AE (Move)',
  'pacs.localPort': 'Локальный SCP-порт',
  'pacs.profile': 'Профиль',
  'pacs.profileNew': 'Новый',
  'pacs.profileSave': 'Сохранить',
  'pacs.profileRename': 'Переименовать',
  'pacs.profileDelete': 'Удалить',
  'pacs.profileNamePrompt': 'Имя профиля',
  'pacs.profileNewName': 'Новый PACS',
  'pacs.profileSaved': 'Профиль сохранён',
  'pacs.profileDeleteLast': 'Нужен хотя бы один профиль',
  'pacs.profileDeleteConfirm': 'Удалить профиль «{name}»?',
  'pacs.echo': 'C-ECHO',
  'pacs.echoing': 'Echo…',
  'pacs.echoOk': 'Echo OK',
  'pacs.echoFail': 'Echo не удался',
  'pacs.query': 'Запрос',
  'pacs.queryLevel': 'Уровень',
  'pacs.levelStudy': 'Исследование',
  'pacs.levelSeries': 'Серия',
  'pacs.levelInstance': 'Instance',
  'pacs.studyUid': 'Study UID',
  'pacs.seriesUid': 'Series UID',
  'pacs.patientId': 'ID пациента',
  'pacs.patientName': 'ФИО',
  'pacs.studyDate': 'Дата исследования',
  'pacs.accession': 'Accession',
  'pacs.modality': 'Модальность',
  'pacs.find': 'C-FIND',
  'pacs.searching': 'Поиск…',
  'pacs.found': 'Найдено исследований: {count}',
  'pacs.foundSeries': 'Найдено серий: {count}',
  'pacs.foundInstances': 'Найдено объектов: {count}',
  'pacs.findFail': 'Поиск не удался',
  'pacs.retrieveMode': 'Получение',
  'pacs.retrieve': 'Получить',
  'pacs.retrieving': 'Получение…',
  'pacs.retrievingProgress': 'Получение… получено {count}',
  'pacs.retrieveCancel': 'Отмена',
  'pacs.retrieveCancelled': 'Получение отменено (получено {count})',
  'pacs.retrieved': 'Получено файлов: {count}',
  'pacs.retrieveFail': 'Получение не удалось или файлов нет',
  'pacs.retrieveProgress': 'Получено {done}/{total}',
  'pacs.cancelRetrieve': 'Отменить получение',
  'pacs.profiles': 'Профили',
  'pacs.profileName': 'Имя профиля',
  'pacs.newProfile': 'Новый профиль',
  'pacs.saveProfile': 'Сохранить профиль',
  'pacs.deleteProfile': 'Удалить профиль',
  'pacs.savingProfile': 'Сохранение…',
  'pacs.drillSeries': 'Серии…',
  'pacs.drillInstances': 'Instances…',
  'pacs.drillHint': 'Двойной клик по исследованию/серии — углубить поиск',
  'pacs.store': 'C-STORE',
  'pacs.storeTip': 'Отправить загруженные DICOM на PACS',
  'pacs.storeDisabledTip': 'Сначала загрузите исследование',
  'pacs.storeOk': 'Отправка завершена',
  'pacs.storeFail': 'Отправка не удалась',
  'pacs.colPatient': 'Пациент',
  'pacs.colId': 'ID',
  'pacs.colDate': 'Дата',
  'pacs.colModality': 'Мод.',
  'pacs.colDesc': 'Описание',
  'pacs.colCount': '#',
  'pacs.colLevel': 'Ур.',
  'pacs.colUid': 'UID',
  'document.pdf': 'PDF-документ',
  'document.sr': 'Структурированный отчёт',
  'document.openExternal': 'Открыть снаружи',
  'mpr.axial': 'Аксиал',
  'mpr.coronal': 'Коронал',
  'mpr.sagittal': 'Сагитал',
  'mpr.oblique': 'Косой',
  'mpr.yaw': 'Рысканье',
  'mpr.pitch': 'Тангаж',
  'mpr.cursor': 'Курсор {x}, {y}, {z} · {hu} HU',
  'mpr.volume': 'Объём {dims} · {spacing} мм',
  'mpr.canvas': 'Canvas',
  'mpr.layout': 'Раскладка MPR',
  'mpr.layoutSingle': '1 плоскость',
  'mpr.layoutQuad': '4 плоскости',
  'mpr.layoutSingleTip': 'Показать одну ортогональную плоскость',
  'mpr.layoutQuadTip': 'Аксиал, коронал, сагитал и косая',
  'mpr.plane': 'Плоскость',
  'mpr.basis': 'Базис MPR',
  'mpr.basisPatient': 'Пациент',
  'mpr.basisStack': 'Стек',
  'mpr.basisPatientTip': 'Анатомические плоскости в LPS (как RadiAnt)',
  'mpr.basisStackTip': 'Срезы по осям захвата (запасной режим)',
  'mpr.basisPatientUnavailable': 'Нет геометрии IOP/IPP — доступен только Стек',
  'viewport.webgl': 'WebGL',
};

export const dictionaries: Record<Locale, Dict> = { en, ru };

export function formatMessage(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    params[key] !== undefined ? String(params[key]) : `{${key}}`,
  );
}
