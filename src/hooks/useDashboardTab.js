import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Keeps the active dashboard section in the URL (?tab=…) so browser refresh
 * returns to the same tab instead of the default.
 */
export default function useDashboardTab(validTabIds, defaultTab = 'dashboard', paramName = 'tab') {
  const validSet = useMemo(() => new Set(validTabIds), [validTabIds]);
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = useMemo(() => {
    const candidate = String(searchParams.get(paramName) || '').trim();
    if (candidate && validSet.has(candidate)) return candidate;
    return defaultTab;
  }, [searchParams, validSet, defaultTab, paramName]);

  const setTab = useCallback(
    (nextTab) => {
      const id = String(nextTab || '').trim();
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (!id || id === defaultTab) {
            next.delete(paramName);
          } else if (validSet.has(id)) {
            next.set(paramName, id);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams, defaultTab, paramName, validSet],
  );

  return [tab, setTab];
}
