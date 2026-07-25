const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('slice', {
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  openZipDialog: () => ipcRenderer.invoke('dialog:openZip'),
  openFileDialog: (opts) => ipcRenderer.invoke('dialog:openFile', opts),
  openDicomFilesDialog: () => ipcRenderer.invoke('dialog:openDicomFiles'),
  openPath: (filePath) => ipcRenderer.invoke('shell:openPath', filePath),
  saveFileDialog: (opts) => ipcRenderer.invoke('dialog:saveFile', opts),
  saveDirectoryDialog: (opts) => ipcRenderer.invoke('dialog:saveDirectory', opts),
  listDicomFiles: (folderPath) => ipcRenderer.invoke('fs:listDicomFiles', folderPath),
  findDicomdir: (folderPath) => ipcRenderer.invoke('fs:findDicomdir', folderPath),
  resolveDroppedPaths: (paths) => ipcRenderer.invoke('fs:resolveDroppedPaths', paths),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath, data) => ipcRenderer.invoke('fs:writeFile', filePath, data),
  writeTemp: (fileName, data) => ipcRenderer.invoke('fs:writeTemp', fileName, data),
  zipNeedsPassword: (zipPath) => ipcRenderer.invoke('zip:needsPassword', zipPath),
  extractZip: (zipPath, password) => ipcRenderer.invoke('zip:extract', zipPath, password),
  listMedia: () => ipcRenderer.invoke('media:list'),
  pacsEcho: (conn) => ipcRenderer.invoke('pacs:echo', conn),
  pacsFind: (conn, query) => ipcRenderer.invoke('pacs:find', conn, query),
  pacsMove: (conn, studyInstanceUid, opts) =>
    ipcRenderer.invoke('pacs:move', conn, studyInstanceUid, opts),
  pacsGet: (conn, studyInstanceUid, opts) =>
    ipcRenderer.invoke('pacs:get', conn, studyInstanceUid, opts),
  pacsStore: (conn, filePaths) => ipcRenderer.invoke('pacs:store', conn, filePaths),
  pacsRetrieveCancel: (jobId) => ipcRenderer.invoke('pacs:retrieve-cancel', jobId),
  onPacsRetrieveProgress: (cb) => {
    const listener = (_event, payload) => {
      cb(payload);
    };
    ipcRenderer.on('pacs:retrieve-progress', listener);
    return () => {
      ipcRenderer.removeListener('pacs:retrieve-progress', listener);
    };
  },
  getPacsProfiles: () => ipcRenderer.invoke('settings:getPacsProfiles'),
  setPacsProfiles: (payload) => ipcRenderer.invoke('settings:setPacsProfiles', payload),
  setProgressBar: (value) => {
    ipcRenderer.send('window:setProgress', value);
  },
  onAppCommand: (cb) => {
    const listener = (_event, payload) => {
      cb(payload);
    };
    ipcRenderer.on('app:command', listener);
    return () => {
      ipcRenderer.removeListener('app:command', listener);
    };
  },
  onOpenPaths: (cb) => {
    const listener = (_event, paths) => {
      cb(paths);
    };
    ipcRenderer.on('app:open-paths', listener);
    return () => {
      ipcRenderer.removeListener('app:open-paths', listener);
    };
  },
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return file?.path || '';
    }
  },
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  getUpdateRepo: () => ipcRenderer.invoke('app:getUpdateRepo'),
  checkUpdate: () => ipcRenderer.invoke('app:checkUpdate'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
});
