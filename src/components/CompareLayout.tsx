import type { Annotation, DicomInstance, ViewerTool, WindowLevel } from '../dicom/types';
import { Viewport } from './Viewport';
import { useLocale } from '../i18n/LocaleContext';
import './CompareLayout.css';

type Pane = {
  instance: DicomInstance | null;
  sliceIndex: number;
  sliceCount: number;
  label: string;
  onSliceChange: (index: number) => void;
  measures: Annotation[];
  onMeasuresChange: (m: Annotation[]) => void;
  selectedAnnotationId?: string | null;
  onSelectAnnotation?: (id: string | null) => void;
  pixelsRevision?: number;
  onContextAction?: (action: string) => void;
};

type Props = {
  left: Pane;
  right: Pane;
  leftWl: WindowLevel;
  rightWl: WindowLevel;
  leftZoom: number;
  rightZoom: number;
  leftPan: { x: number; y: number };
  rightPan: { x: number; y: number };
  tool: ViewerTool;
  onLeftWlDelta: (dCenter: number, dWidth: number) => void;
  onRightWlDelta: (dCenter: number, dWidth: number) => void;
  onLeftZoomChange: (z: number) => void;
  onRightZoomChange: (z: number) => void;
  onLeftPanChange: (p: { x: number; y: number }) => void;
  onRightPanChange: (p: { x: number; y: number }) => void;
  useWebGl: boolean;
  invert?: boolean;
  flipH?: boolean;
  flipV?: boolean;
  onWebGlFailed?: () => void;
  syncScroll: boolean;
  onSyncScrollChange: (v: boolean) => void;
  syncWl: boolean;
  onSyncWlChange: (v: boolean) => void;
  syncZoom: boolean;
  onSyncZoomChange: (v: boolean) => void;
};

export function CompareLayout({
  left,
  right,
  leftWl,
  rightWl,
  leftZoom,
  rightZoom,
  leftPan,
  rightPan,
  tool,
  onLeftWlDelta,
  onRightWlDelta,
  onLeftZoomChange,
  onRightZoomChange,
  onLeftPanChange,
  onRightPanChange,
  useWebGl,
  invert = false,
  flipH = false,
  flipV = false,
  onWebGlFailed,
  syncScroll,
  onSyncScrollChange,
  syncWl,
  onSyncWlChange,
  syncZoom,
  onSyncZoomChange,
}: Props) {
  const { t } = useLocale();

  return (
    <div className="compare-root" role="group" aria-label={t('compare.title')}>
      <div className="compare__toolbar">
        <button
          type="button"
          className={`btn btn--ghost btn--sm${syncScroll ? ' btn--active' : ''}`}
          onClick={() => onSyncScrollChange(!syncScroll)}
          title={t('compare.syncScrollTip')}
          aria-pressed={syncScroll}
        >
          {t('compare.syncScroll')}
        </button>
        <button
          type="button"
          className={`btn btn--ghost btn--sm${syncWl ? ' btn--active' : ''}`}
          onClick={() => onSyncWlChange(!syncWl)}
          title={t('compare.syncWlTip')}
          aria-pressed={syncWl}
        >
          {t('compare.syncWl')}
        </button>
        <button
          type="button"
          className={`btn btn--ghost btn--sm${syncZoom ? ' btn--active' : ''}`}
          onClick={() => onSyncZoomChange(!syncZoom)}
          title={t('compare.syncZoomTip')}
          aria-pressed={syncZoom}
        >
          {t('compare.syncZoom')}
        </button>
        <p className="compare__toolbar-hint">{t('compare.sync')}</p>
      </div>

      <div className="compare">
        <div className="compare__pane">
          <div className="compare__badge compare__badge--a">A</div>
          <Viewport
            instance={left.instance}
            sliceIndex={left.sliceIndex}
            sliceCount={left.sliceCount}
            onSliceChange={left.onSliceChange}
            wl={leftWl}
            zoom={leftZoom}
            pan={leftPan}
            tool={tool}
            onWlDelta={onLeftWlDelta}
            onZoomChange={onLeftZoomChange}
            onPanChange={onLeftPanChange}
            useWebGl={useWebGl}
            measures={left.measures}
            onMeasuresChange={left.onMeasuresChange}
            selectedAnnotationId={left.selectedAnnotationId}
            onSelectAnnotation={left.onSelectAnnotation}
            label={left.label}
            pixelsRevision={left.pixelsRevision}
            onContextAction={left.onContextAction}
            invert={invert}
            flipH={flipH}
            flipV={flipV}
            onWebGlFailed={onWebGlFailed}
          />
        </div>
        <div className="compare__pane">
          <div className="compare__badge compare__badge--b">B</div>
          <Viewport
            instance={right.instance}
            sliceIndex={right.sliceIndex}
            sliceCount={right.sliceCount}
            onSliceChange={right.onSliceChange}
            wl={rightWl}
            zoom={rightZoom}
            pan={rightPan}
            tool={
              tool === 'length' ||
              tool === 'probe' ||
              tool === 'angle' ||
              tool === 'roi' ||
              tool === 'arrow'
                ? 'scroll'
                : tool
            }
            onWlDelta={onRightWlDelta}
            onZoomChange={onRightZoomChange}
            onPanChange={onRightPanChange}
            useWebGl={useWebGl}
            measures={right.measures}
            onMeasuresChange={right.onMeasuresChange}
            selectedAnnotationId={right.selectedAnnotationId}
            onSelectAnnotation={right.onSelectAnnotation}
            label={right.label}
            pixelsRevision={right.pixelsRevision}
            onContextAction={right.onContextAction}
            invert={invert}
            flipH={flipH}
            flipV={flipV}
            onWebGlFailed={onWebGlFailed}
          />
        </div>
      </div>
    </div>
  );
}
