import './ContextMenu.css';

export type ContextMenuItem =
  | {
      id: string;
      label: string;
      disabled?: boolean;
      danger?: boolean;
    }
  | { id: string; separator: true };

type Props = {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onSelect: (id: string) => void;
  onClose: () => void;
};

export function ContextMenu({ x, y, items, onSelect, onClose }: Props) {
  return (
    <div
      className="ctx-menu-backdrop"
      role="presentation"
      onPointerDown={(e) => {
        // Dismiss on any button; stop so viewport under the menu does not
        // start pan/WL/draw from the same gesture (click fall-through).
        e.preventDefault();
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <ul
        className="ctx-menu"
        style={{ left: x, top: y }}
        role="menu"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {items.map((item, i) => {
          if ('separator' in item && item.separator) {
            return <li key={`sep-${i}`} className="ctx-menu__sep" role="separator" />;
          }
          if (!('label' in item)) return null;
          return (
            <li key={item.id} role="none">
              <button
                type="button"
                role="menuitem"
                className={`ctx-menu__item${item.danger ? ' ctx-menu__item--danger' : ''}`}
                disabled={item.disabled}
                onPointerDown={(e) => {
                  if (e.button !== 0 || item.disabled) return;
                  e.preventDefault();
                  e.stopPropagation();
                  onSelect(item.id);
                  onClose();
                }}
              >
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
