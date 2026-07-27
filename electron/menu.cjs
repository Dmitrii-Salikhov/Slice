const { Menu, app } = require('electron');

/**
 * @param {(command: string, payload?: unknown) => void} send
 */
function buildAppMenu(send) {
  const isMac = process.platform === 'darwin';

  /** @type {Electron.MenuItemConstructorOptions[]} */
  const fileSubmenu = [
    {
      label: 'Load Study…',
      accelerator: 'CmdOrCtrl+O',
      click: () => send('open-study'),
    },
    {
      label: 'New Study',
      accelerator: 'CmdOrCtrl+N',
      click: () => send('new-study'),
    },
    { type: 'separator' },
    {
      label: 'Open Folder…',
      accelerator: 'CmdOrCtrl+Shift+O',
      click: () => send('open-folder'),
    },
    {
      label: 'Open DICOM Files…',
      click: () => send('open-files'),
    },
    {
      label: 'Open ZIP…',
      accelerator: 'CmdOrCtrl+Shift+Z',
      click: () => send('open-zip'),
    },
    {
      label: 'Open CD/DVD…',
      accelerator: 'CmdOrCtrl+Shift+M',
      click: () => send('open-media'),
    },
    {
      label: 'PACS…',
      accelerator: 'CmdOrCtrl+Shift+P',
      click: () => send('open-pacs'),
    },
    { type: 'separator' },
    {
      label: 'Export JPEG…',
      accelerator: 'CmdOrCtrl+E',
      click: () => send('export-jpeg'),
    },
    {
      label: 'Export PNG…',
      accelerator: 'CmdOrCtrl+Shift+E',
      click: () => send('export-png'),
    },
    { type: 'separator' },
    isMac ? { role: 'close' } : { role: 'quit' },
  ];

  /** @type {Electron.MenuItemConstructorOptions[]} */
  const toolsSubmenu = [
    { label: 'Scroll', accelerator: '1', click: () => send('tool', 'scroll') },
    { label: 'Window/Level', accelerator: '2', click: () => send('tool', 'wl') },
    { label: 'Zoom', accelerator: '3', click: () => send('tool', 'zoom') },
    { label: 'Pan', accelerator: '4', click: () => send('tool', 'pan') },
    { label: 'Crosshair', accelerator: '5', click: () => send('tool', 'crosshair') },
    { label: 'Length', accelerator: '6', click: () => send('tool', 'length') },
    { label: 'Angle', accelerator: '7', click: () => send('tool', 'angle') },
    { label: 'ROI', accelerator: '8', click: () => send('tool', 'roi') },
    { label: 'Arrow', accelerator: '9', click: () => send('tool', 'arrow') },
    { label: 'Probe', accelerator: '0', click: () => send('tool', 'probe') },
    { type: 'separator' },
    { label: 'Clear Measurements', click: () => send('clear-measures') },
  ];

  /** @type {Electron.MenuItemConstructorOptions[]} */
  const viewSubmenu = [
    { label: 'Stack', accelerator: 'CmdOrCtrl+1', click: () => send('view-mode', 'single') },
    { label: 'Compare', accelerator: 'CmdOrCtrl+2', click: () => send('view-mode', 'compare') },
    { label: 'MPR', accelerator: 'CmdOrCtrl+3', click: () => send('view-mode', 'mpr') },
    { type: 'separator' },
    { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', click: () => send('zoom-reset') },
    {
      label: 'Toggle Cine',
      accelerator: 'CmdOrCtrl+Space',
      click: () => send('cine-toggle'),
    },
    { type: 'separator' },
    { label: 'Previous Slice', accelerator: 'PageUp', click: () => send('slice-delta', -1) },
    { label: 'Next Slice', accelerator: 'PageDown', click: () => send('slice-delta', 1) },
    { label: 'First Slice', accelerator: 'Home', click: () => send('slice-home') },
    { label: 'Last Slice', accelerator: 'End', click: () => send('slice-end') },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  ];

  /** @type {Electron.MenuItemConstructorOptions[]} */
  const presetsSubmenu = [
    { label: 'Soft Tissue', accelerator: 'F1', click: () => send('preset', 'soft') },
    { label: 'Lung', accelerator: 'F2', click: () => send('preset', 'lung') },
    { label: 'Bone', accelerator: 'F3', click: () => send('preset', 'bone') },
    { label: 'Brain', accelerator: 'F4', click: () => send('preset', 'brain') },
    { label: 'Abdomen', accelerator: 'F5', click: () => send('preset', 'abdomen') },
  ];

  /** @type {Electron.MenuItemConstructorOptions[]} */
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    { label: 'File', submenu: fileSubmenu },
    { label: 'Tools', submenu: toolsSubmenu },
    { label: 'View', submenu: viewSubmenu },
    { label: 'Presets', submenu: presetsSubmenu },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates',
          click: () => send('check-updates'),
        },
        { type: 'separator' },
        {
          label: 'About Slice',
          click: () => send('about'),
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

function installAppMenu(send) {
  Menu.setApplicationMenu(buildAppMenu(send));
}

module.exports = { buildAppMenu, installAppMenu };
