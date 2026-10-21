import './InventoryPanel.css';

export default function InventoryImeCell({ codes = [], maxVisible = 3 }) {
  const list = Array.isArray(codes) ? codes.filter(Boolean) : [];
  if (!list.length) {
    return <span className="wh-inventory-ime-cell wh-inventory-ime-cell--empty">—</span>;
  }

  const visible = list.slice(0, maxVisible);
  const hidden = list.length - visible.length;

  return (
    <span className="wh-inventory-ime-cell" title={list.join('\n')}>
      {visible.map((code) => (
        <code key={code} className="wh-inventory-ime-chip">
          {code}
        </code>
      ))}
      {hidden > 0 ? <span className="wh-inventory-ime-more">+{hidden} more</span> : null}
    </span>
  );
}
