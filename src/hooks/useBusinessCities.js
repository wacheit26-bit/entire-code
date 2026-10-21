import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BUSINESS_CITIES_UPDATED_EVENT,
  fetchBusinessCities,
} from '../api/businessCitiesApi';
import { DEFAULT_BUSINESS_LOCATIONS, normalizeBusinessLocations } from '../data/businessLocations';

export default function useBusinessCities() {
  const [cities, setCities] = useState([...DEFAULT_BUSINESS_LOCATIONS]);

  const reloadBusinessCities = useCallback(async () => {
    try {
      const rows = await fetchBusinessCities();
      setCities(normalizeBusinessLocations(rows));
    } catch {
      setCities([...DEFAULT_BUSINESS_LOCATIONS]);
    }
  }, []);

  useEffect(() => {
    reloadBusinessCities();
  }, [reloadBusinessCities]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onUpdated = () => {
      reloadBusinessCities();
    };
    window.addEventListener(BUSINESS_CITIES_UPDATED_EVENT, onUpdated);
    return () => {
      window.removeEventListener(BUSINESS_CITIES_UPDATED_EVENT, onUpdated);
    };
  }, [reloadBusinessCities]);

  const citySet = useMemo(() => new Set(cities), [cities]);

  const isValidBusinessCity = useCallback(
    (value) => citySet.has(String(value || '').trim()),
    [citySet],
  );

  return {
    businessCities: cities,
    reloadBusinessCities,
    isValidBusinessCity,
  };
}
