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
        if (e.target === e.currentTarget) onClose();
      }}
      onContextMenu={(e) => e.preventDefault()}
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
                onClick={() => {
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
