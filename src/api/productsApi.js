import { axiosPrivate } from './axios';
import { getActiveApiBaseUrl } from '../utils/apiBaseUrl';
import { getAccessToken, setAccessToken } from './tokenStore';

function normalizeProductsResponse(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.products)) return body.products;
  if (Array.isArray(body?.result)) return body.result;
  return [];
}

function apiOrigin() {
  try {
    const base = getActiveApiBaseUrl();
    if (base === '/api') return window.location.origin;
    return new URL(base).origin;
  } catch {
    return '';
  }
}

/** Backend may return relative paths; browsers need absolute URLs for <img src>. */
export function resolveAssetUrl(url) {
  if (url == null || typeof url !== 'string') return url;
  const t = url.trim();
  if (!t) return t;
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith('//')) return `https:${t}`;
  const origin = apiOrigin();
  if (!origin) return t;
  return `${origin}${t.startsWith('/') ? '' : '/'}${t}`;
}

function resolveAssetUrlInternal(url) {
  return resolveAssetUrl(url);
}

export function normalizeProductRecord(product) {
  if (!product || typeof product !== 'object') return product;
  const next = { ...product };
  if (Array.isArray(next.images)) {
    next.images = next.images.map((img) =>
      img && typeof img === 'object' && img.url != null
        ? { ...img, url: resolveAssetUrlInternal(img.url) }
        : img,
    );
  }
  if (next.primaryImage && typeof next.primaryImage === 'object' && next.primaryImage.url != null) {
    next.primaryImage = { ...next.primaryImage, url: resolveAssetUrlInternal(next.primaryImage.url) };
  }
  if (next.catalogImageUrl != null && String(next.catalogImageUrl).trim()) {
    next.catalogImageUrl = resolveAssetUrlInternal(next.catalogImageUrl);
  }
  return next;
}

export async function fetchProductsList({ shopCatalog = false } = {}) {
  let token = getAccessToken();
  if (!token && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('wache_access_token');
      if (raw) {
        setAccessToken(raw);
        token = raw;
      }
    } catch {
      /* ignore */
    }
  }
  if (!token) {
    throw new Error('No access token');
  }

  const params = {
    page: 1,
    limit: shopCatalog ? 5000 : 500,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  };
  if (shopCatalog) params.catalog = 'shop';

  const res = await axiosPrivate.get('/products', { params, timeout: 60000 });
  const body = res.data;
  if (body && typeof body === 'object' && body.success === false) {
    const err = new Error(String(body.message || body.error || 'Error fetching products'));
    err.response = { data: body, status: res.status };
    throw err;
  }
  const raw = normalizeProductsResponse(body);
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeProductRecord);
}

/** Vendor / wholesaler shop — pricing rows with images joined to inventory (name + capacity). */
export async function fetchVendorShopCatalog({ limit = 1000 } = {}) {
  const res = await axiosPrivate.get('/products/vendor-shop', {
    params: { limit },
    timeout: 60000,
  });
  const body = res.data;
  if (body && typeof body === 'object' && body.success === false) {
    const err = new Error(String(body.message || body.error || 'Error fetching vendor shop products'));
    err.response = { data: body, status: res.status };
    throw err;
  }
  const raw = normalizeProductsResponse(body);
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeProductRecord);
}

export async function deleteProductById(client, productId) {
  const id = encodeURIComponent(String(productId || '').trim());
  if (!id) throw new Error('Missing product id');
  const res = await client.delete(`/products/${id}`);
  return res?.data;
}

/**
 * Admin: bulk-create products at a regional main warehouse (no images — photos added at warehouse on arrival).
 * POST /api/products/bulk — JSON { mainWarehouse, products: [...] }
 */
export async function bulkCreateProducts(client, { mainWarehouse, uploadWarehouse, products }) {
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('Add at least one product row');
  }
  const mainId = String(mainWarehouse || '').trim();
  const uploadId = String(uploadWarehouse || '').trim();
  if (!mainId && !uploadId) {
    throw new Error('Select a warehouse for this bulk upload');
  }

  const res = await client.post(
    '/products/bulk',
    {
      ...(mainId ? { mainWarehouse: mainId } : {}),
      ...(uploadId ? { uploadWarehouse: uploadId } : {}),
      products,
    },
    { timeout: 180000 },
  );
  return res?.data;
}

/** Upload product photos after stock is received at a warehouse. POST /api/products/:id/images */
export async function addProductImages(client, productId, imageFiles) {
  const id = encodeURIComponent(String(productId || '').trim());
  if (!id) throw new Error('Missing product id');
  const files = (Array.isArray(imageFiles) ? imageFiles : []).filter((f) => f instanceof File);
  if (!files.length) throw new Error('Select at least one image');

  const fd = new FormData();
  files.forEach((file) => fd.append('images', file));

  const res = await client.post(`/products/${id}/images`, fd, { timeout: 120000 });
  return res?.data?.data ?? res?.data;
}

function normalizeUpdateProductResponse(body) {
  if (!body || typeof body !== 'object') return body;
  if (body.data && typeof body.data === 'object') return body.data;
  return body;
}

/**
 * Set which existing catalog image is primary (cover). Uses PATCH …/images/primary with JSON body.
 */
export async function setProductPrimaryImage(client, productId, publicId) {
  const id = encodeURIComponent(String(productId || '').trim());
  if (!id) throw new Error('Missing product id');
  const pid = String(publicId || '').trim();
  if (!pid) throw new Error('Missing image publicId');

  const res = await client.patch(
    `/products/${id}/images/primary`,
    { publicId: pid },
    { timeout: 60000, headers: { 'Content-Type': 'application/json' } },
  );
  return normalizeUpdateProductResponse(res?.data);
}

/**
 * Admin: update an existing product. PATCH `{BASE_URL}/products/:id`
 * Uses JSON when there are no new image files; multipart when new images are appended.
 * `options.primaryNewImageIndex` — optional 0-based index among new files in this request.
 */
export async function updateProduct(
  client,
  productId,
  fields,
  newImageFiles = [],
  options = {},
) {
  const id = encodeURIComponent(String(productId || '').trim());
  if (!id) throw new Error('Missing product id');

  const { primaryNewImageIndex } = options;

  const files = Array.isArray(newImageFiles) ? newImageFiles.filter((f) => f instanceof File) : [];
  const payload = {
    product_type: fields.product_type,
    product_name: String(fields.product_name || '').trim(),
    brand: String(fields.brand || '').trim().toUpperCase(),
    phoneLocation: fields.phoneLocation,
    capacity: String(fields.capacity || '').trim().toUpperCase(),
    country: String(fields.country || '').trim(),
    sim: String(fields.sim || '').trim(),
    color: String(fields.color || '').trim(),
    stock: Math.max(0, Math.floor(Number(fields.stock) || 0)),
    price: Math.max(0, Number(fields.wholesalePrice ?? fields.price) || 0),
    description: String(fields.description || '').trim(),
  };

  if (fields.retailPrice != null && fields.retailPrice !== '') {
    payload.retailPrice = Math.max(0, Number(fields.retailPrice) || 0);
  }
  if (fields.costPrice != null && fields.costPrice !== '') {
    payload.costPrice = Math.max(0, Number(fields.costPrice) || 0);
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'batteryHealth')) {
    const text = String(fields.batteryHealth ?? '').trim();
    payload.batteryHealth = text === '' ? null : Math.round(Number(text));
  }
  if (fields.priceMin != null && fields.priceMin !== '') {
    payload.priceMin = Math.max(0, Number(fields.priceMin) || 0);
  }
  if (fields.priceMax != null && fields.priceMax !== '') {
    payload.priceMax = Math.max(0, Number(fields.priceMax) || 0);
  }
  if (fields.imeCodes != null) {
    const codes = Array.isArray(fields.imeCodes)
      ? fields.imeCodes.map((s) => String(s).trim()).filter(Boolean)
      : String(fields.imeCodes || '')
          .split(/[\n,;]+/)
          .map((s) => s.trim())
          .filter(Boolean);
    if (codes.length) {
      payload.imeCodes = codes;
      payload.IME = codes[0];
    }
  }

  if (files.length > 0) {
    const fd = new FormData();
    Object.entries(payload).forEach(([k, v]) => {
      if (v !== undefined && v !== null) fd.append(k, typeof v === 'number' ? String(v) : v);
    });
    files.forEach((img) => fd.append('images', img));
    if (primaryNewImageIndex != null && Number.isFinite(Number(primaryNewImageIndex))) {
      fd.append('primaryImageIndex', String(Math.max(0, Math.floor(Number(primaryNewImageIndex)))));
    }
    const res = await client.patch(`/products/${id}`, fd, {
      timeout: 120000,
    });
    return normalizeUpdateProductResponse(res?.data);
  }

  const res = await client.patch(`/products/${id}`, payload, { timeout: 60000 });
  return normalizeUpdateProductResponse(res?.data);
}
