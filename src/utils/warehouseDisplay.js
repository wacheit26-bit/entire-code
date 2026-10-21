export function isUsaWarehouseCity(city) {
  return String(city || '').trim().toUpperCase() === 'USA';
}

/** In-transit stock count label (uploads are on hand / arrived, not travelling). */
export function formatUsaUploadedLabel(travellingCount) {
  const count = Number(travellingCount) || 0;
  return count === 0 ? 'none in transit' : `${count} in transit`;
}
