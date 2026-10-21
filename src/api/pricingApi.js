import { resolveAssetUrl } from './productsApi';

const MULTIPART_OPTS = {
  timeout: 120000,
  maxBodyLength: Infinity,
  maxContentLength: Infinity,
};

export const MAX_PRICING_IMAGES = 5;

function normalizePricingResponse(body) {
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body)) return body;
  return [];
}

function normalizePricingImageEntry(img) {
  if (!img || typeof img !== 'object') return null;
  const url = String(img.url || img.imageUrl || '').trim();
  if (!url) return null;
  return {
    url: resolveAssetUrl(url),
    publicId: String(img.publicId || img.imagePublicId || '').trim(),
    isPrimary: Boolean(img.isPrimary),
    alt: String(img.alt || img.imageAlt || '').trim(),
  };
}

export function normalizePricingRow(row) {
  if (!row || typeof row !== 'object') return row;
  const next = { ...row };

  const fromArray = (Array.isArray(next.images) ? next.images : [])
    .map(normalizePricingImageEntry)
    .filter(Boolean);

  if (fromArray.length) {
    next.images = fromArray;
    const primary = fromArray.find((img) => img.isPrimary) || fromArray[0];
    next.imageUrl = primary.url;
    next.imagePublicId = primary.publicId;
    next.imageAlt = primary.alt;
    return next;
  }

  if (next.imageUrl != null && String(next.imageUrl).trim()) {
    next.imageUrl = resolveAssetUrl(next.imageUrl);
    next.images = [
      {
        url: next.imageUrl,
        publicId: String(next.imagePublicId || '').trim(),
        isPrimary: true,
        alt: String(next.imageAlt || '').trim(),
      },
    ];
  } else {
    next.images = [];
  }

  return next;
}

/** Build multipart body — mirrors inventory single-product upload (`images` field). */
export function buildPricingFormData(payload, { imageFiles = null, imageFile = null, clearImage = false } = {}) {
  const fd = new FormData();
  Object.entries(payload || {}).forEach(([key, value]) => {
    if (value == null) fd.append(key, '');
    else fd.append(key, String(value));
  });
  const files = imageFiles || (imageFile instanceof File ? [imageFile] : []);
  files.forEach((file) => {
    if (file instanceof File) fd.append('images', file);
  });
  if (clearImage) fd.append('clearImage', 'true');
  return fd;
}

/** Shared retail pricing catalog — admin read/write, salesperson read-only. */
export async function fetchPricingCatalog(client, { search = '' } = {}) {
  const q = String(search || '').trim();
  const res = await client.get('/pricing', {
    params: q ? { search: q } : {},
    timeout: 30000,
  });
  return normalizePricingResponse(res.data).map(normalizePricingRow);
}

/** @deprecated Use fetchPricingCatalog — same endpoint for admin and sales. */
export async function fetchSalesPricingCatalog(client, options = {}) {
  return fetchPricingCatalog(client, options);
}

/** Image-only pricing rows for shop catalog matching (any logged-in user). */
export async function fetchShopPricingImages(client) {
  const res = await client.get('/pricing/images/shop', { timeout: 30000 });
  const rows = normalizePricingResponse(res.data);
  return rows.map(normalizePricingRow);
}

export async function createPricingEntry(client, payload, { imageFiles = null, imageFile = null } = {}) {
  const res = await client.post('/pricing', payload, {
    timeout: 120000,
    headers: { 'Content-Type': 'application/json' },
  });
  let row = normalizePricingRow(res.data?.data ?? res.data);

  const files = (Array.isArray(imageFiles) ? imageFiles : []).filter((f) => f instanceof File);
  const legacyFile = imageFile instanceof File ? imageFile : null;
  const uploadFiles = files.length ? files : legacyFile ? [legacyFile] : [];

  if (uploadFiles.length) {
    const rowId = row?.id || row?._id;
    if (!rowId) {
      throw new Error('Pricing entry was created but the server did not return an id for the image upload.');
    }
    row = await uploadPricingImages(client, rowId, uploadFiles);
  }

  return row;
}

export async function updatePricingEntry(
  client,
  id,
  payload,
  { imageFiles = null, imageFile = null, clearImage = false, removeImagePublicIds = null } = {},
) {
  const pricingId = encodeURIComponent(String(id));
  const jsonPayload = { ...payload };

  if (clearImage && !(imageFiles?.length || imageFile instanceof File)) {
    jsonPayload.clearImage = true;
  }
  if (Array.isArray(removeImagePublicIds) && removeImagePublicIds.length) {
    jsonPayload.removeImagePublicIds = removeImagePublicIds;
  }

  const res = await client.patch(`/pricing/${pricingId}`, jsonPayload, {
    timeout: 120000,
    headers: { 'Content-Type': 'application/json' },
  });
  let row = normalizePricingRow(res.data?.data ?? res.data);

  const files = (Array.isArray(imageFiles) ? imageFiles : []).filter((f) => f instanceof File);
  const legacyFile = imageFile instanceof File ? imageFile : null;
  const uploadFiles = files.length ? files : legacyFile ? [legacyFile] : [];

  if (uploadFiles.length) {
    row = await uploadPricingImages(client, id, uploadFiles);
  }

  return row;
}

/** Upload up to 5 catalog photos for one pricing row. */
export async function uploadPricingImages(client, id, files) {
  const list = (Array.isArray(files) ? files : [files]).filter((f) => f instanceof File);
  if (!list.length) return null;

  const fd = new FormData();
  list.forEach((file) => fd.append('images', file));
  const res = await client.post(`/pricing/${encodeURIComponent(String(id))}/image`, fd, MULTIPART_OPTS);
  return normalizePricingRow(res.data?.data ?? res.data);
}

/** @deprecated Use uploadPricingImages — kept for older callers. */
export async function uploadPricingImage(client, id, file) {
  return uploadPricingImages(client, id, file instanceof File ? [file] : []);
}

function pricingRowHasAnyImage(row) {
  if (Array.isArray(row?.images) && row.images.some((img) => String(img?.url || '').trim())) return true;
  return Boolean(String(row?.imageUrl || '').trim());
}

export function normalizePricingCatalogOptions(raw) {
  if (!raw || typeof raw !== 'object') {
    return { brands: [], productNamesByBrand: {} };
  }
  const brands = Array.isArray(raw.brands)
    ? [...new Set(raw.brands.map((b) => String(b || '').trim().toUpperCase()).filter(Boolean))]
    : [];
  const productNamesByBrand = {};
  const src = raw.productNamesByBrand;
  if (src && typeof src === 'object') {
    for (const [key, list] of Object.entries(src)) {
      const brand = String(key || '').trim().toUpperCase();
      if (!brand) continue;
      productNamesByBrand[brand] = [
        ...new Set((Array.isArray(list) ? list : []).map((n) => String(n || '').trim()).filter(Boolean)),
      ];
    }
  }
  return { brands, productNamesByBrand };
}

export async function fetchPricingCatalogOptions(client) {
  const res = await client.get('/pricing/catalog-options', { timeout: 30000 });
  return normalizePricingCatalogOptions(res.data?.data);
}

export async function addPricingCatalogBrand(client, brand) {
  const res = await client.post(
    '/pricing/catalog-options/brands',
    { brand: String(brand || '').trim() },
    { timeout: 30000 },
  );
  return normalizePricingCatalogOptions(res.data?.data);
}

export async function addPricingCatalogProductName(client, brand, productName) {
  const res = await client.post(
    '/pricing/catalog-options/product-names',
    {
      brand: String(brand || '').trim(),
      productName: String(productName || '').trim(),
    },
    { timeout: 30000 },
  );
  return normalizePricingCatalogOptions(res.data?.data);
}

export { pricingRowHasAnyImage };
