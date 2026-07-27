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
}: Props) {
  const { t } = useLocale();

  return (
    <div className="compare" role="group" aria-label={t('compare.title')}>
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
          tool={tool === 'length' || tool === 'probe' || tool === 'angle' || tool === 'roi' || tool === 'arrow' ? 'scroll' : tool}
          onWlDelta={onRightWlDelta}
          onZoomChange={onRightZoomChange}
          onPanChange={onRightPanChange}
          useWebGl={useWebGl}
          measures={right.measures}
          onMeasuresChange={right.onMeasuresChange}
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
  );
}
