import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BUSINESS_LOCATIONS,
  BUSINESS_LOCATION_LABELS,
  normalizeBusinessLocations,
} from '../data/businessLocations';
import {
  BUSINESS_CITIES_UPDATED_EVENT,
  fetchBusinessCities,
} from '../api/businessCitiesApi';

/**
 * Dropdown for business or delivery city.
 * Values are loaded from the server city registry with a local fallback.
 *
 * @param {'optional' | 'required'} [props.mode] — optional = may leave empty; required = must choose (default).
 */
export default function BusinessLocationSelect({
  id,
  name,
  value,
  onChange,
  className = '',
  disabled = false,
  mode = 'required',
  emptyOptionLabel = '— Select —',
  placeholderOptionLabel = 'Select a city',
}) {
  const optional = mode === 'optional';
  const isRequired = !optional;
  const [locations, setLocations] = useState(BUSINESS_LOCATIONS);

  const loadLocations = useCallback(async () => {
    try {
      const cities = await fetchBusinessCities();
      const next = normalizeBusinessLocations(cities);
      setLocations(next);
    } catch {
      setLocations([...BUSINESS_LOCATIONS]);
    }
  }, []);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onCitiesUpdated = () => {
      loadLocations();
    };
    window.addEventListener(BUSINESS_CITIES_UPDATED_EVENT, onCitiesUpdated);
    return () => {
      window.removeEventListener(BUSINESS_CITIES_UPDATED_EVENT, onCitiesUpdated);
    };
  }, [loadLocations]);

  const locationLabels = useMemo(() => {
    const labels = {};
    for (const city of locations) {
      labels[city] = BUSINESS_LOCATION_LABELS[city] || city;
    }
    return labels;
  }, [locations]);

  return (
    <select
      id={id}
      name={name}
      className={className}
      value={value}
      onChange={onChange}
      disabled={disabled}
      required={isRequired}
      aria-required={isRequired ? true : undefined}
    >
      {optional ? (
        <option value="">{emptyOptionLabel}</option>
      ) : (
        <option value="" disabled>
          {placeholderOptionLabel}
        </option>
      )}
      {locations.map((loc) => (
        <option key={loc} value={loc}>
          {locationLabels[loc]}
        </option>
      ))}
    </select>
  );
}
