import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  TRANSACTION_METHODS_UPDATED_EVENT,
  fetchTransactionMethods,
} from '../api/transactionMethodsApi';

const DEFAULT_METHODS = [
  { name: 'Cash', value: 'cash' },
  { name: 'MoMo', value: 'momo' },
  { name: 'Bank transfer', value: 'bank transfer' },
  { name: 'Other', value: 'other' },
];

export default function useTransactionMethods() {
  const [methods, setMethods] = useState([...DEFAULT_METHODS]);

  const reloadTransactionMethods = useCallback(async () => {
    try {
      const rows = await fetchTransactionMethods();
      setMethods(rows.length ? rows : [...DEFAULT_METHODS]);
    } catch {
      setMethods([...DEFAULT_METHODS]);
    }
  }, []);

  useEffect(() => {
    reloadTransactionMethods();
  }, [reloadTransactionMethods]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onUpdated = () => {
      reloadTransactionMethods();
    };
    window.addEventListener(TRANSACTION_METHODS_UPDATED_EVENT, onUpdated);
    return () => {
      window.removeEventListener(TRANSACTION_METHODS_UPDATED_EVENT, onUpdated);
    };
  }, [reloadTransactionMethods]);

  const valueSet = useMemo(() => new Set(methods.map((m) => m.value)), [methods]);

  const paymentOptions = useMemo(
    () => methods.map((m) => ({ value: m.value, label: m.name })),
    [methods],
  );

  const isValidTransactionMethod = useCallback(
    (value) => valueSet.has(String(value || '').trim().toLowerCase()),
    [valueSet],
  );

  const labelForMethod = useCallback(
    (value) => {
      const key = String(value || '').trim().toLowerCase();
      const match = methods.find((m) => m.value === key);
      return match?.name || 'Cash';
    },
    [methods],
  );

  return {
    transactionMethods: methods,
    paymentOptions,
    reloadTransactionMethods,
    isValidTransactionMethod,
    labelForMethod,
  };
}
