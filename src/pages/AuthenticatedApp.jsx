import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import WholesaleAccountPendingNotice from '../components/WholesaleAccountPendingNotice';
import Footer from '../components/Footer';
import ProductList from '../components/ProductList';
import OrderFeedbackModal from '../components/OrderFeedbackModal';
import CheckoutBlockingOverlay from '../components/CheckoutBlockingOverlay';
import PreorderRequestModal from '../components/PreorderRequestModal';
import Unauthorized from '../components/Unauthorized';
import useAuth from '../hooks/useAuth';
import useLogout from '../hooks/useLogout';
import useOrdersApi from '../hooks/useOrdersApi';
import useWholesaleAccess from '../hooks/useWholesaleAccess';
import { fetchProductsList, fetchVendorShopCatalog } from '../api/productsApi';
import { fetchShopPricingImages } from '../api/pricingApi';
import useAxiosPrivate from '../hooks/useAxiosPrivate';
import { coerceBusinessLocation } from '../data/businessLocations';
import { findVendorListingProduct, mergeCatalogProducts, mergeVendorCatalogProducts, buildVendorPlatformStockMap, resolveProductForOrder, resolveVendorListingProduct } from '../utils/mergeCatalogProducts';
import { buildWholesaleShopCatalog, productHasVendorShopCatalogImage } from '../utils/productCatalogImage';
import { clearAuthSnapshot } from '../api/authSnapshot';
import { clearRole, clearSession } from '../api/session';
import { clearAccessToken } from '../api/tokenStore';
import { redirectToLoginFast } from '../utils/authRedirect';
import { subscribeProductCatalogUpdated } from '../utils/productCatalogEvents';
import { MIN_BUY_QUANTITY } from '../constants/wholesaleOrderLimits';
import {
  fetchServerCartSummary,
  postCartItem,
  putCartItemQty,
  deleteCartItemLine,
  clearServerCart,
} from '../api/cartApi';
import { getUserIdFromAccessToken } from '../utils/jwtUser';
import { isNetworkOrTimeoutError, INTERNET_CONNECTION_RETRY_MESSAGE } from '../utils/apiBaseUrl';

const AdminDashboard = lazy(() => import('./AdminDashboard'));
const SalesPage = lazy(() => import('./SalesPage'));
const CartPage = lazy(() => import('./CartPage'));
const NotificationsPage = lazy(() => import('./NotificationsPage'));

function PageFallback() {
  return null;
}

const PRODUCT_IMAGE_ROTATE_MIN_MS = 10 * 1000;
const PRODUCT_IMAGE_ROTATE_MAX_MS = 15 * 1000;

function randomImageRotateMs() {
  const span = PRODUCT_IMAGE_ROTATE_MAX_MS - PRODUCT_IMAGE_ROTATE_MIN_MS;
  return PRODUCT_IMAGE_ROTATE_MIN_MS + Math.floor(Math.random() * (span + 1));
}

function productStableId(p) {
  return String(p?._id ?? p?.id ?? '');
}

function productsSignature(rows = []) {
  const normalized = rows
    .map((p) => ({
      id: productStableId(p),
      product_name: p?.product_name ?? '',
      product_type: p?.product_type ?? '',
      brand: p?.brand ?? '',
      capacity: p?.capacity ?? '',
      color: p?.color ?? '',
      country: p?.country ?? '',
      sim: p?.sim ?? '',
      stock: Number(p?.stock) || 0,
      price: Number(p?.price) || 0,
      updatedAt: p?.updatedAt ?? '',
      createdAt: p?.createdAt ?? '',
      imageCount: Array.isArray(p?.images) ? p.images.length : 0,
      primaryImage: p?.primaryImage?.url ?? '',
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(normalized);
}

/** Cart keys look like `productId::buy` or `productId::offer::123` — never send the full key as productId. */
function productIdFromCartLine(item) {
  const fromProduct = String(item?.product?._id ?? item?.product?.id ?? '').trim();
  if (fromProduct) return fromProduct;
  const key = String(item?.id ?? '');
  return key.split('::')[0]?.trim() || '';
}

function serverItemToLocalEntry(row, productsList) {
  const pid =
    row.productId && typeof row.productId === 'object' && row.productId._id != null
      ? String(row.productId._id)
      : row.productId != null
        ? String(row.productId)
        : '';
  const fromCatalog = pid
    ? productsList.find((p) => String(p._id ?? p.id) === pid)
    : null;
  const pop = row.productId && typeof row.productId === 'object' ? row.productId : null;
  const product =
    fromCatalog ||
    (pop
      ? {
          ...pop,
          id: pop._id ?? pop.id,
        }
      : {
          _id: pid || undefined,
          id: pid || undefined,
          product_name: row.productName,
          price: Number(row.productPrice) || 0,
          stock: 0,
          images: Array.isArray(row.images) ? row.images : [],
        });
  const orderType = String(row.orderType || (row.offeredPrice != null ? 'offer' : 'buy'));
  const entry = {
    product,
    qty: Math.max(1, Math.floor(Number(row.quantity) || 1)),
    orderType,
  };
  if (orderType === 'offer') {
    entry.offerAmount = Number(row.offeredPrice) || 0;
  }
  return entry;
}

function serverItemsToCartObject(items, productsList) {
  const next = {};
  for (const row of Array.isArray(items) ? items : []) {
    const key = String(row.lineKey || '').trim();
    if (!key) continue;
    next[key] = serverItemToLocalEntry(row, productsList);
  }
  return next;
}

function humanizeOrderApiMessage(msg) {
  const t = String(msg || '').trim();
  if (!t) return null;
  const low = t.toLowerCase();
  if (low.includes('missing required fields')) {
    if (low.includes('userid')) {
      return 'We could not attach your preorder to your account. Please sign out, sign in again, and try once more.';
    }
    if (low.includes('productid')) {
      return 'The server did not accept the product reference for this preorder. Please try again or contact support.';
    }
    return 'The server could not accept the preorder as sent. Please try again; if the problem continues, contact support.';
  }
  return null;
}

function unionVendorCatalogProducts(primary = [], secondary = []) {
  const byId = new Map();
  const add = (product) => {
    const id = String(product?._id ?? product?.id ?? '').trim();
    if (!id) return;
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, product);
      return;
    }
    const existingHasImage = Boolean(String(existing?.catalogImageUrl || '').trim());
    const nextHasImage = Boolean(String(product?.catalogImageUrl || '').trim());
    if (!existingHasImage && nextHasImage) byId.set(id, product);
  };
  primary.forEach(add);
  secondary.forEach(add);
  return [...byId.values()];
}

function formatCheckoutApiError(err) {
  if (isNetworkOrTimeoutError(err)) {
    return INTERNET_CONNECTION_RETRY_MESSAGE;
  }

  const data = err?.response?.data;
  if (typeof data === 'string' && data.trim()) {
    const raw = data.trim();
    return humanizeOrderApiMessage(raw) || raw;
  }
  if (data && typeof data === 'object') {
    if (typeof data.message === 'string' && data.message.trim()) {
      const m = data.message.trim();
      return humanizeOrderApiMessage(m) || m;
    }
    if (typeof data.error === 'string' && data.error.trim()) {
      const e = data.error.trim();
      return humanizeOrderApiMessage(e) || e;
    }
  }
  if (typeof err?.message === 'string' && err.message.trim()) return err.message.trim();
  const st = Number(err?.response?.status);
  if (st === 500 || st === 502 || st === 503) {
    return 'The server reported an error after receiving your request. If you see the order in your account or sales list, it was saved.';
  }
  if (Number.isFinite(st) && st >= 400) {
    return `The request could not be completed (HTTP ${st}). Please try again or contact support.`;
  }
  return INTERNET_CONNECTION_RETRY_MESSAGE;
}

export default function AuthenticatedApp({ role }) {
  const { auth, setAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const handleLogout = useLogout();
  const { canPlaceOrders } = useWholesaleAccess();
  const ordersApi = useOrdersApi();
  const axiosPrivate = useAxiosPrivate();
  const normalizedRole = String(role || '').toLowerCase();
  const isAdmin = normalizedRole === 'admin';
  const isSalesman = normalizedRole === 'salesman';
  const shopCatalogRole = isAdmin || isSalesman;
  const [cart, setCart] = useState({});
  const [buyNowSubmittingId, setBuyNowSubmittingId] = useState(null);
  /** True while cart checkout API calls are in flight — full-screen block until success/failure. */
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [orderFeedback, setOrderFeedback] = useState(null);
  const [preorderModal, setPreorderModal] = useState(null);
  const [preorderSubmitting, setPreorderSubmitting] = useState(false);
  const [filters, setFilters] = useState({
    brand: [],
    product_type: [],
    capacity: [],
  });
  const [filterText, setFilterText] = useState('');
  const [products, setProducts] = useState([]);
  const [pricingCatalogImages, setPricingCatalogImages] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  /** Set when the catalog request fails; logout/redirect only for 401/403. */
  const [productsFetchError, setProductsFetchError] = useState(null);
  const productsSigRef = useRef('');
  const hasLoadedProductsRef = useRef(false);
  const requestSeqRef = useRef(0);
  const cartServerHydratedUidRef = useRef(null);

  const fetchAndMaybeUpdateProducts = useCallback(async ({
    showLoading = false,
    forceApply = false,
    shopCatalog = false,
  } = {}) => {
    if (!auth?.accessToken) return;
    const reqId = ++requestSeqRef.current;
    if (showLoading || !hasLoadedProductsRef.current) setProductsLoading(true);
    if (showLoading) setProductsFetchError(null);
    try {
      const userCity = coerceBusinessLocation(auth?.businessAddress);
      let inventoryError = null;
      let vendorCatalogError = null;

      const [vendorRows, data, imageRows] = await Promise.all([
        fetchVendorShopCatalog().catch((err) => {
          vendorCatalogError = err;
          return [];
        }),
        fetchProductsList({ shopCatalog }).catch((err) => {
          inventoryError = err;
          return [];
        }),
        fetchShopPricingImages(axiosPrivate).catch(() => []),
      ]);
      if (reqId !== requestSeqRef.current) return;

      const catalogImages = Array.isArray(imageRows) ? imageRows : [];
      setPricingCatalogImages(catalogImages);
      const rows = Array.isArray(data) ? data : [];
      const fromVendor = (Array.isArray(vendorRows) ? vendorRows : []).filter((product) =>
        productHasVendorShopCatalogImage(product),
      );
      const fromClient = buildWholesaleShopCatalog(rows, catalogImages, userCity);
      const combined = unionVendorCatalogProducts(fromVendor, fromClient);
      const stockSource = rows.length ? rows : vendorRows;
      const vendorStockByKey = buildVendorPlatformStockMap(stockSource);
      const merged = mergeVendorCatalogProducts(combined, userCity, vendorStockByKey).filter((product) =>
        productHasVendorShopCatalogImage(product),
      );

      if (reqId !== requestSeqRef.current) return;
      const nextSig = productsSignature(merged);
      const changed = forceApply || nextSig !== productsSigRef.current;
      if (changed) {
        productsSigRef.current = nextSig;
        setProducts(merged.map((p) => ({ ...p, __imageRotateMs: randomImageRotateMs() })));
      }

      const catalogReady = merged.length > 0 || (!inventoryError && !vendorCatalogError);
      if (catalogReady) {
        hasLoadedProductsRef.current = true;
        setProductsFetchError(null);
      } else {
        const primaryErr = inventoryError || vendorCatalogError;
        const status = primaryErr?.response?.status;
        const message =
          primaryErr?.response?.data?.message ||
          primaryErr?.response?.data?.error ||
          primaryErr?.message ||
          'Failed to fetch products.';
        setProductsFetchError({ message, status });
        if (!hasLoadedProductsRef.current) setProducts([]);
      }
    } catch (err) {
      if (reqId !== requestSeqRef.current) return;
      const status = err?.response?.status;
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Failed to fetch products.';
      setProductsFetchError({ message, status });
      if (!hasLoadedProductsRef.current) setProducts([]);
    } finally {
      if (reqId === requestSeqRef.current) setProductsLoading(false);
    }
  }, [auth?.accessToken, auth?.businessAddress, axiosPrivate]);

  useEffect(() => {
    if (!auth?.accessToken) {
      setProductsLoading(false);
      setProducts([]);
      productsSigRef.current = '';
      hasLoadedProductsRef.current = false;
      return;
    }

    const onAdminDashboard = isAdmin && location.pathname.startsWith('/admin');

    if (isSalesman && location.pathname.startsWith('/sales')) {
      setProductsLoading(false);
      return;
    }

    /** Admin dashboard loads inventory separately; fetch shop catalog only on the storefront preview. */
    if (onAdminDashboard) {
      setProductsLoading(false);
      return;
    }

    const shopCatalog = shopCatalogRole;

    const frame = window.requestAnimationFrame(() => {
      fetchAndMaybeUpdateProducts({ showLoading: true, shopCatalog }).catch(() => {});
    });
    return () => window.cancelAnimationFrame(frame);
  }, [auth?.accessToken, role, location.pathname, fetchAndMaybeUpdateProducts, isAdmin, isSalesman, shopCatalogRole]);

  useLayoutEffect(() => {
    if (productsLoading || !productsFetchError) return;
    const status = productsFetchError.status;
    if (status !== 401 && status !== 403) return;
    clearAccessToken();
    clearRole();
    clearSession();
    clearAuthSnapshot();
    setAuth({});
    redirectToLoginFast('Could not load live products. Please sign in again.');
  }, [productsLoading, productsFetchError, setAuth]);

  const retryProductsLoad = () => {
    fetchAndMaybeUpdateProducts({ showLoading: true, forceApply: true, shopCatalog: shopCatalogRole }).catch(
      () => {},
    );
  };

  useEffect(() => {
    if (!auth?.accessToken) return undefined;
    const onAdminDashboard = isAdmin && location.pathname.startsWith('/admin');
    if ((isSalesman && location.pathname.startsWith('/sales')) || onAdminDashboard) return undefined;
    return subscribeProductCatalogUpdated(() => {
      fetchAndMaybeUpdateProducts({ showLoading: false, shopCatalog: shopCatalogRole }).catch(() => {});
    });
  }, [auth?.accessToken, role, location.pathname, fetchAndMaybeUpdateProducts, isAdmin, isSalesman, shopCatalogRole]);

  useEffect(() => {
    const uid = getUserIdFromAccessToken(auth?.accessToken);
    if (!uid) {
      cartServerHydratedUidRef.current = null;
      setCart({});
      return undefined;
    }
    if (productsLoading || !hasLoadedProductsRef.current) return undefined;
    if (cartServerHydratedUidRef.current === uid) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchServerCartSummary();
        if (cancelled) return;
        cartServerHydratedUidRef.current = uid;
        const items = data?.items ?? [];
        setCart((prev) => ({
          ...serverItemsToCartObject(items, products),
          ...prev,
        }));
      } catch {
        if (!cancelled) cartServerHydratedUidRef.current = null;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth?.accessToken, productsLoading, products]);

  const shopListedProducts = useMemo(() => products, [products]);

  const filtered = useMemo(() => {
    let list = shopListedProducts;
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      list = list.filter((p) => (p.product_name || '').toLowerCase().includes(q));
    }
    if (filters.brand?.length) {
      const set = new Set(filters.brand.map((b) => String(b).toLowerCase()));
      list = list.filter((p) => set.has(String(p.brand || '').toLowerCase()));
    }
    if (filters.product_type?.length) {
      const set = new Set(filters.product_type.map((t) => String(t).toLowerCase()));
      list = list.filter((p) => set.has(String(p.product_type || '').toLowerCase()));
    }
    if (filters.capacity?.length) list = list.filter((p) => filters.capacity.includes(p.capacity));
    const minP = filters.minPrice !== undefined && filters.minPrice !== '' ? Number(filters.minPrice) : null;
    const maxP = filters.maxPrice !== undefined && filters.maxPrice !== '' ? Number(filters.maxPrice) : null;
    if (minP != null && !Number.isNaN(minP)) list = list.filter((p) => (Number(p.price) || 0) >= minP);
    if (maxP != null && !Number.isNaN(maxP)) list = list.filter((p) => (Number(p.price) || 0) <= maxP);
    return list;
  }, [filterText, filters, shopListedProducts]);

  const cartItems = Object.entries(cart).map(([id, v]) => ({ id, ...v }));
  const subtotal = cartItems.reduce((s, i) => {
    const unit = String(i.orderType || 'buy') === 'offer'
      ? (Number(i.offerAmount) || 0)
      : (Number(i.product?.price) || 0);
    const q = Math.floor(Number(i.qty) || 0);
    const lineQty =
      String(i.orderType || 'buy') === 'offer'
        ? Math.max(1, q)
        : Math.max(MIN_BUY_QUANTITY, q);
    return s + unit * lineQty;
  }, 0);

  const userCity = coerceBusinessLocation(auth?.businessAddress);

  const addToCart = (id, qty) => {
    const product =
      findVendorListingProduct(products, id) ||
      findVendorListingProduct(filtered, id);
    if (!product) return;
    const orderProduct = resolveProductForOrder(resolveVendorListingProduct(product, id), userCity);
    const fulfillmentId = String(orderProduct._id ?? orderProduct.id);
    const stock = Number(orderProduct.stock) || 0;
    if (stock > 0 && stock < MIN_BUY_QUANTITY) return;
    const key = `${fulfillmentId}::buy`;
    const maxQty = stock > 0 ? stock : Number.MAX_SAFE_INTEGER;
    let persist = null;
    setCart((prev) => {
      const mergedQty = (prev[key]?.qty || 0) + Math.floor(Number(qty) || 0);
      const nextQty = Math.min(maxQty, Math.max(MIN_BUY_QUANTITY, mergedQty));
      persist = {
        lineKey: key,
        productId: fulfillmentId,
        quantity: nextQty,
        orderType: 'buy',
      };
      return { ...prev, [key]: { product: orderProduct, qty: nextQty, orderType: 'buy' } };
    });
    if (persist && auth?.accessToken) {
      queueMicrotask(() => {
        postCartItem(persist).catch((e) => console.error('Cart persist failed', e));
      });
    }
  };

  const addOfferToCart = (product, { offerAmount, quantity }) => {
    const productId = String(product?._id ?? product?.id ?? '');
    if (!productId) return;
    const price = Number(offerAmount) || 0;
    const qty = Math.max(1, Number(quantity) || 1);
    const key = `${productId}::offer::${price}`;
    let persist = null;
    setCart((prev) => {
      const nextQty = (prev[key]?.qty || 0) + qty;
      persist = {
        lineKey: key,
        productId,
        quantity: nextQty,
        orderType: 'offer',
        offeredPrice: price,
      };
      return {
        ...prev,
        [key]: {
          product,
          qty: nextQty,
          orderType: 'offer',
          offerAmount: price,
        },
      };
    });
    if (persist && auth?.accessToken) {
      queueMicrotask(() => {
        postCartItem(persist).catch((e) => console.error('Cart persist failed', e));
      });
    }
  };

  const setCartItemQty = (id, qty) => {
    const key = String(id);
    const nextQtyRaw = Math.max(0, Math.floor(Number(qty) || 0));
    let persist = null;
    setCart((prev) => {
      if (!prev[key]) return prev;
      const isOffer = String(prev[key].orderType || 'buy') === 'offer';
      const stock = Number(prev[key].product?.stock) || 0;

      if (isOffer) {
        if (nextQtyRaw <= 0) {
          persist = { type: 'delete', lineKey: key };
          const copy = { ...prev };
          delete copy[key];
          return copy;
        }
        persist = { type: 'put', lineKey: key, quantity: nextQtyRaw };
        return { ...prev, [key]: { ...prev[key], qty: nextQtyRaw } };
      }

      if (stock > 0 && stock < MIN_BUY_QUANTITY) {
        persist = { type: 'delete', lineKey: key };
        const copy = { ...prev };
        delete copy[key];
        return copy;
      }

      if (nextQtyRaw <= 0) {
        persist = { type: 'delete', lineKey: key };
        const copy = { ...prev };
        delete copy[key];
        return copy;
      }

      if (nextQtyRaw > 0 && nextQtyRaw < MIN_BUY_QUANTITY) {
        persist = { type: 'delete', lineKey: key };
        const copy = { ...prev };
        delete copy[key];
        return copy;
      }

      const capped = stock > 0 ? Math.min(nextQtyRaw, stock) : nextQtyRaw;
      persist = { type: 'put', lineKey: key, quantity: capped };
      return { ...prev, [key]: { ...prev[key], qty: capped } };
    });
    if (persist && auth?.accessToken) {
      queueMicrotask(() => {
        const p = persist;
        if (p.type === 'delete') {
          deleteCartItemLine(p.lineKey).catch((e) => console.error('Cart persist failed', e));
        } else {
          putCartItemQty(p.lineKey, p.quantity).catch((e) => console.error('Cart persist failed', e));
        }
      });
    }
  };

  const removeCartItem = (id) => {
    const key = String(id);
    setCart((prev) => {
      if (!prev[key]) return prev;
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
    if (auth?.accessToken) {
      queueMicrotask(() => {
        deleteCartItemLine(key).catch((e) => console.error('Cart persist failed', e));
      });
    }
  };

  const submitBuy = async (product, qty) => {
    product = resolveProductForOrder(product, userCity);
    if (!canPlaceOrders) {
      setOrderFeedback({
        variant: 'info',
        title: 'Account not active',
        message: 'Your vendor account must be active before placing orders.',
      });
      return;
    }
    const productId = String(product._id ?? product.id);
    const stock = Number(product.stock) || 0;
    const q = Math.floor(Number(qty) || 0);
    if (stock > 0 && stock < MIN_BUY_QUANTITY) {
      setOrderFeedback({
        variant: 'error',
        title: 'Cannot place order',
        message: `This product has fewer than ${MIN_BUY_QUANTITY} units in stock, so it cannot be sold on a buy order.`,
      });
      return;
    }
    if (q < MIN_BUY_QUANTITY) {
      setOrderFeedback({
        variant: 'error',
        title: 'Minimum quantity',
        message: `Vendor buy orders require at least ${MIN_BUY_QUANTITY} units per product.`,
      });
      return;
    }
    setBuyNowSubmittingId(productId);
    try {
      await ordersApi.submitBuyRequest({
        productId,
        productName: product.product_name,
        quantity: q,
      });
      setOrderFeedback({
        variant: 'success',
        title: 'Order sent',
        message: 'Your order was submitted successfully.',
      });
    } catch (err) {
      setOrderFeedback({
        variant: 'error',
        title: 'Could not send order',
        message: formatCheckoutApiError(err),
      });
    } finally {
      setBuyNowSubmittingId(null);
    }
  };

  const submitOffer = async (product, { offerAmount, quantity }) => {
    product = resolveProductForOrder(product, userCity);
    if (!canPlaceOrders) {
      setOrderFeedback({
        variant: 'info',
        title: 'Account not active',
        message: 'Your vendor account must be active before placing orders.',
      });
      throw new Error('inactive');
    }
    const qty = Math.max(1, Math.floor(Number(quantity) || 1));
    const price = Number(offerAmount);
    await ordersApi.submitOfferRequest({
      productId: String(product._id ?? product.id),
      productName: product.product_name,
      quantity: qty,
      offerAmount: price,
    });
    /* Success feedback is shown inside ProductCard offer modal (custom light dialog). */
  };

  const submitPreorder = useCallback(
    async (product, fields) => {
      if (!canPlaceOrders) {
        throw new Error(
          'Your vendor account must be active before submitting requests.',
        );
      }
      const q = Math.max(1, Math.floor(Number(fields.quantity) || 1));
      const userNotes = String(fields.userNotes || '').trim();
      const deliveryAddress = String(fields.deliveryAddress || '').trim();
      try {
        if (product) {
          const productId = String(product._id ?? product.id ?? '').trim();
          if (!productId) {
            throw new Error('Missing catalog product id. Please refresh and try again.');
          }
          await ordersApi.submitPreorderRequest({
            isCustomProduct: false,
            productId,
            quantity: q,
            userNotes,
            deliveryAddress,
          });
        } else {
          await ordersApi.submitPreorderRequest({
            isCustomProduct: true,
            productName: String(fields.productName || '').trim(),
            unitPrice: Number(fields.unitPrice),
            quantity: q,
            userNotes,
            deliveryAddress,
          });
        }
      } catch (err) {
        throw new Error(formatCheckoutApiError(err));
      }
    },
    [canPlaceOrders, ordersApi],
  );

  const checkout = async () => {
    if (!canPlaceOrders) return;
    if (checkoutSubmitting) return;
    try {
      flushSync(() => setCheckoutSubmitting(true));
    } catch {
      setCheckoutSubmitting(true);
    }

    try {
      const checkoutItems = cartItems.map((i) => {
        const isOffer = String(i.orderType || 'buy') === 'offer';
        const raw = Math.floor(Number(i.qty) || 0);
        const qty = isOffer ? Math.max(1, raw) : Math.max(MIN_BUY_QUANTITY, raw);
        return {
          cartKey: i.id,
          name: i.product?.product_name || 'Product',
          qty,
          productId: productIdFromCartLine(i),
          orderType: String(i.orderType || 'buy'),
          offerAmount: Number(i.offerAmount) || 0,
        };
      });

      const buyTooSmall = checkoutItems.filter(
        (ci) => ci.orderType !== 'offer' && ci.qty < MIN_BUY_QUANTITY,
      );
      if (buyTooSmall.length > 0) {
        setOrderFeedback({
          variant: 'error',
          title: 'Minimum quantity',
          message: `Each buy order line must be at least ${MIN_BUY_QUANTITY} units. Update or remove lines below that amount.`,
        });
        return;
      }

      const failures = [];
      for (const item of checkoutItems) {
        if (!item.productId) {
          failures.push({
            item,
            err: new Error('Missing product id for a cart line. Please refresh the page and try again.'),
          });
          continue;
        }
        try {
          if (item.orderType === 'offer') {
            await ordersApi.submitOfferRequest({
              productId: item.productId,
              productName: item.name,
              quantity: item.qty,
              offerAmount: item.offerAmount,
            });
          } else {
            await ordersApi.submitBuyRequest({
              productId: item.productId,
              productName: item.name,
              quantity: item.qty,
              userNotes: '',
            });
          }
        } catch (err) {
          failures.push({ item, err });
        }
      }

      const failedKeys = new Set(failures.map((f) => f.item.cartKey));
      const successCount = checkoutItems.length - failures.length;
      const allOk = failures.length === 0;

      if (successCount === 0) {
        const err = failures[0]?.err;
        setOrderFeedback({
          variant: 'error',
          title: 'Checkout could not be completed',
          message: formatCheckoutApiError(err),
        });
        return;
      }

      try {
        setCart((prev) => {
          const next = { ...prev };
          checkoutItems.forEach((ci) => {
            if (!failedKeys.has(ci.cartKey)) delete next[ci.cartKey];
          });
          return next;
        });
      } catch (e) {
        console.error('Checkout cart update failed after successful submit:', e);
      }

      try {
        if (successCount > 0 && auth?.accessToken) {
          if (allOk) {
            await clearServerCart();
          } else {
            await Promise.all(
              checkoutItems
                .filter((ci) => !failedKeys.has(ci.cartKey))
                .map((ci) => deleteCartItemLine(ci.cartKey).catch(() => {})),
            );
          }
        }
      } catch (e) {
        console.error('Server cart sync after checkout failed:', e);
      }

      if (!allOk) {
        setOrderFeedback({
          variant: 'info',
          title: 'Some items were not submitted',
          message: `${successCount} of ${checkoutItems.length} line(s) were submitted successfully. ${failures.length} line(s) had a problem:\n\n${formatCheckoutApiError(failures[0].err)}`,
        });
      } else {
        setOrderFeedback({
          variant: 'success',
          title: 'Order sent',
          message: 'Your order was submitted successfully.',
        });
      }
    } finally {
      setCheckoutSubmitting(false);
    }
  };

  const onAdminDashboard = isAdmin && location.pathname.startsWith('/admin');
  const onSalesDashboard = isSalesman && location.pathname.startsWith('/sales');
  /** Storefront header — hidden on admin and salesperson dashboard shells. */
  const showStorefrontHeader = !onAdminDashboard && !onSalesDashboard;
  const showAppFooter = !onAdminDashboard && !onSalesDashboard;

  useEffect(() => {
    const lockPageScroll = onAdminDashboard || onSalesDashboard;
    const htmlEl = document.documentElement;
    const bodyEl = document.body;
    const prevHtmlOverflow = htmlEl.style.overflow;
    const prevBodyOverflow = bodyEl.style.overflow;
    const prevHtmlHeight = htmlEl.style.height;
    const prevBodyHeight = bodyEl.style.height;

    if (lockPageScroll) {
      htmlEl.style.overflow = 'hidden';
      bodyEl.style.overflow = 'hidden';
      htmlEl.style.height = '100%';
      bodyEl.style.height = '100%';
    } else {
      htmlEl.style.overflow = '';
      bodyEl.style.overflow = '';
      htmlEl.style.height = '';
      bodyEl.style.height = '';
    }

    return () => {
      htmlEl.style.overflow = prevHtmlOverflow;
      bodyEl.style.overflow = prevBodyOverflow;
      htmlEl.style.height = prevHtmlHeight;
      bodyEl.style.height = prevBodyHeight;
    };
  }, [onAdminDashboard, onSalesDashboard]);

  return (
    <div className="app">
      <CheckoutBlockingOverlay active={checkoutSubmitting} />
      {showStorefrontHeader ? (
        <Header
          cartCount={cartItems.length}
          searchQuery={filterText}
          onSearchChange={setFilterText}
          onSignOut={handleLogout}
          showAdminDashboardLink={isAdmin}
          showSalesDashboardLink={isSalesman}
        />
      ) : null}
      {showStorefrontHeader ? <WholesaleAccountPendingNotice /> : null}
      {showStorefrontHeader && productsFetchError && !productsLoading ? (
        <div className="app-stock-banner app-stock-banner--warn app-stock-banner--with-actions" role="status">
          <span>{productsFetchError.message}</span>
          <span className="app-stock-banner__actions">
            <button type="button" className="app-stock-banner__retry" onClick={retryProductsLoad}>
              Retry
            </button>
          </span>
        </div>
      ) : null}
      <Routes>
        {isSalesman ? (
          <Route
            path="/sales"
            element={
              <Suspense fallback={<PageFallback />}>
                <SalesPage onLogout={handleLogout} />
              </Suspense>
            }
          />
        ) : null}
        {isAdmin ? (
          <Route
            path="/admin"
            element={
              <Suspense fallback={<PageFallback />}>
                <AdminDashboard onLogout={handleLogout} />
              </Suspense>
            }
          />
        ) : (
          <Route path="/admin" element={<Navigate to="/" replace />} />
        )}
        <Route
          path="/"
          element={
            <div className="app-layout app-layout--full" dir="ltr">
              <main className="app-main app-main--stock">
                <ProductList
                  products={filtered.map((p) => ({ ...p, id: p._id ?? p.id }))}
                  userLocation={userCity}
                  searchQuery={filterText}
                  onAddToCart={addToCart}
                  onAddOfferToCart={addOfferToCart}
                  onBuyRequest={submitBuy}
                  buyNowSubmittingProductId={buyNowSubmittingId}
                  onOfferRequest={submitOffer}
                  onPreorderModalOpen={setPreorderModal}
                  cartItems={cartItems}
                  cartSubtotal={subtotal}
                  onUpdateCartQty={setCartItemQty}
                  onRemoveCartItem={removeCartItem}
                  onCheckout={checkout}
                  checkoutSubmitting={checkoutSubmitting}
                  canCheckout={canPlaceOrders}
                  loading={productsLoading}
                />
              </main>
            </div>
          }
        />
        <Route
          path="/cart"
          element={
            <Suspense fallback={<PageFallback />}>
              <CartPage
                items={cartItems}
                subtotal={subtotal}
                onCheckout={checkout}
                checkoutSubmitting={checkoutSubmitting}
                onUpdateQty={setCartItemQty}
                onRemoveItem={removeCartItem}
                canCheckout={canPlaceOrders}
              />
            </Suspense>
          }
        />
        <Route
          path="/notifications"
          element={
            <Suspense fallback={<PageFallback />}>
              <NotificationsPage stickyUnderAppHeader />
            </Suspense>
          }
        />
        <Route path="/account" element={<Navigate to="/" replace />} />
        <Route path="/unauthorized" element={<Unauthorized />} />
        <Route path="*" element={<Navigate to={isAdmin ? '/admin' : isSalesman ? '/sales' : '/'} replace />} />
      </Routes>
      <PreorderRequestModal
        open={preorderModal != null}
        onClose={() => {
          if (!preorderSubmitting) setPreorderModal(null);
        }}
        initialName={preorderModal?.initialName ?? ''}
        initialDeliveryAddress={String(auth?.businessAddress ?? '').trim()}
        catalogNote={
          preorderModal?.product
            ? 'This request is linked to a catalog product that is currently out of stock. You may adjust the name if needed.'
            : undefined
        }
        submitting={preorderSubmitting}
        onSubmit={async (fields) => {
          setPreorderSubmitting(true);
          try {
            await submitPreorder(preorderModal?.product ?? null, fields);
          } finally {
            setPreorderSubmitting(false);
          }
        }}
      />
      <OrderFeedbackModal
        open={orderFeedback != null}
        variant={orderFeedback?.variant ?? 'info'}
        title={orderFeedback?.title ?? ''}
        message={orderFeedback?.message ?? ''}
        onDismiss={() => setOrderFeedback(null)}
      />
      {showAppFooter ? <Footer /> : null}
    </div>
  );
}
