/** Shared app command ids (native menu + renderer hotkeys). */

export type AppCommandId =
  | 'open-study'
  | 'new-study'
  | 'open-folder'
  | 'open-files'
  | 'open-zip'
  | 'open-media'
  | 'open-pacs'
  | 'export-jpeg'
  | 'export-png'
  | 'export-dicom'
  | 'export-series'
  | 'cancel-load'
  | 'tool'
  | 'clear-measures'
  | 'view-mode'
  | 'zoom-reset'
  | 'cine-toggle'
  | 'slice-delta'
  | 'slice-home'
  | 'slice-end'
  | 'preset'
  | 'about'
  | 'reset-view';

export type ViewerToolId =
  | 'scroll'
  | 'wl'
  | 'zoom'
  | 'pan'
  | 'crosshair'
  | 'length'
  | 'angle'
  | 'roi'
  | 'arrow'
  | 'probe';

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}
