import { useCallback, useState } from 'react';
import { inventoryRowKey, inventoryStorageOptionsForRow } from '../utils/mergeInventoryProducts';

function normText(v) {
  return String(v || '').trim().toLowerCase();
}

/** Shared expand/collapse state for inventory tables (storage picker + unit rows). */
export default function useInventoryRowExpansion() {
  const [inlineStoragePickerKey, setInlineStoragePickerKey] = useState('');
  const [expandedStorageSelection, setExpandedStorageSelection] = useState({
    rowKey: '',
    capacity: '',
  });

  const hideStockColorColumns = Boolean(expandedStorageSelection.rowKey);

  const toggleStorageExpansion = useCallback((row, capacity) => {
    const rowKey = inventoryRowKey(row);
    const cap = String(capacity || '').trim();
    if (!rowKey || !cap) return;
    setExpandedStorageSelection((prev) => {
      if (prev.rowKey === rowKey && normText(prev.capacity) === normText(cap)) {
        return { rowKey: '', capacity: '' };
      }
      return { rowKey, capacity: cap };
    });
  }, []);

  const handleProductSelect = useCallback(
    (row) => {
      const rowKey = inventoryRowKey(row);
      if (!rowKey) return;

      if (expandedStorageSelection.rowKey === rowKey) {
        setExpandedStorageSelection({ rowKey: '', capacity: '' });
        setInlineStoragePickerKey('');
        return;
      }

      const storageOptions = inventoryStorageOptionsForRow(row);
      if (storageOptions.length === 1) {
        setInlineStoragePickerKey('');
        toggleStorageExpansion(row, storageOptions[0]);
        return;
      }
      setInlineStoragePickerKey((prev) => (prev === rowKey ? '' : rowKey));
    },
    [expandedStorageSelection.rowKey, toggleStorageExpansion],
  );

  const handleStorageSelect = useCallback(
    (row, capacity) => {
      const cap = String(capacity || '').trim();
      if (!cap) return;
      toggleStorageExpansion(row, cap);
    },
    [toggleStorageExpansion],
  );

  const isStorageListOpenForRow = useCallback(
    (rowKey, storageOptions) =>
      inlineStoragePickerKey === rowKey && (storageOptions?.length || 0) > 1,
    [inlineStoragePickerKey],
  );

  const isRowExpanded = useCallback(
    (rowKey) => expandedStorageSelection.rowKey === rowKey,
    [expandedStorageSelection.rowKey],
  );

  return {
    inlineStoragePickerKey,
    expandedStorageSelection,
    hideStockColorColumns,
    handleProductSelect,
    handleStorageSelect,
    isStorageListOpenForRow,
    isRowExpanded,
  };
}
