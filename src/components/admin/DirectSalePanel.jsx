import { useCallback, useEffect, useMemo, useState } from 'react';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import useAuth from '../../hooks/useAuth';
import { fetchProductsList } from '../../api/productsApi';
import { fetchStaffList, searchWholesalers } from '../../api/adminApi';
import { fetchWarehouseProducts, fetchWarehouses, warehouseId } from '../../api/warehouseApi';
import {
  confirmRetailDirectSale,
  confirmWholesaleDirectSale,
  createWholesalerForDirectSale,
  previewWholesaleDirectSale,
} from '../../api/directSaleApi';
import { fetchPricingCatalog } from '../../api/pricingApi';
import { buildPricingCatalogLookup } from '../../utils/inventoryPricingDisplay';
import { pricingCapacitiesMatch } from '../../utils/pricingCatalogMatch';
import { emitOrderCreated } from '../../utils/orderCreatedEvents';
import { notifyProductCatalogUpdated } from '../../utils/productCatalogEvents';
import { getUserIdFromAccessToken } from '../../utils/jwtUser';
import { formatMoneyXaf } from '../../utils/formatMoneyXaf';
import MoneyXaf from '../MoneyXaf';
import { friendlySaleErrorMessage, isRequestTimeoutError } from '../../utils/saleErrorMessage';
import { normalizeDirectSalePaymentMethod } from '../../utils/directSalePaymentMethod';
import useTransactionMethods from '../../hooks/useTransactionMethods';
import {
  applyProductToSaleRow,
  buildPurchaseLinesFromRows,
  completeSaleRowCount,
  emptySaleUnitRow,
  isSaleRowComplete,
  normalizeSelectedImes,
  productImeList,
  refreshSaleRowCatalogPrices,
  countSaleRowsForPool,
  imeOwnerMap,
  saleRowPoolImeList,
  saleRowPoolStock,
  saleRowSelectedImeColors,
  saleRowVariantProducts,
  cartAllUnitRows,
  cartGrandTotal,
  cartItemsForApi,
  lineUnitCount,
  saleRowsGrandTotal,
  saleRowQuantity,
  saleRowQuantityOrNull,
  validateRowImeSelection,
} from '../../utils/directSaleCart';
import { downloadDirectSaleReceipt } from '../../utils/directSaleReceiptExport';
import {
  buildReceiptPayloadFromSaleForm,
  printDirectSaleReceipt,
} from '../../utils/directSaleReceiptPrint';
import { isProductTravelling } from '../../utils/productTravelRoute';
import DirectSaleImePickerModal from './DirectSaleImePickerModal';
import DirectSalePricingTab from './DirectSalePricingTab';
import ExchangePanel from './ExchangePanel';
import BusinessLocationSelect from '../BusinessLocationSelect';
import './WarehouseDashboard.css';
import './DirectSalePanel.css';
import './DirectSalePricingTab.css';
import './AddProductForm.css';

function productStableId(p) {
  return String(p?._id ?? p?.id ?? '');
}

function productModelName(p) {
  return String(p?.product_name || 'Product').trim() || 'Product';
}

function productBrandName(p) {
  return String(p?.brand || '').trim() || 'Other';
}

function productModelKey(p) {
  const model = productModelName(p).toLowerCase();
  const brand = productBrandName(p).toLowerCase();
  return `${brand}::${model}`;
}

function capacityLabel(value) {
  const raw = String(value || '').trim();
  return raw || 'Unspecified';
}

function normalizePaymentMethod(value, methods = null) {
  return normalizeDirectSalePaymentMethod(value, methods);
}

function userStableId(user) {
  return String(user?._id ?? user?.id ?? '').trim();
}

function userRole(user) {
  return String(user?.role || '').trim().toLowerCase();
}

function parseMoneyInput(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return null;
  return n;
}

function buyerLabel(u) {
  return String(u?.name || u?.businessName || u?.tel || 'Account').slice(0, 80);
}

function normalizeCmPhone(raw) {
  return String(raw || '').replace(/\s/g, '');
}

function isValidCmPhone(raw) {
  const v = normalizeCmPhone(raw);
  return /^(?:\+237|00237)?\d{9}$/.test(v);
}

function isValidEmail(raw) {
  const v = String(raw || '').trim();
  if (!v) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function formatRetailPhoneDisplay(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  let local = digits;
  if (local.startsWith('00237')) local = local.slice(5);
  else if (local.startsWith('237') && local.length >= 12) local = local.slice(3);
  if (local.length > 9) local = local.slice(-9);
  if (local.length !== 9) {
    const trimmed = String(raw || '').trim();
    if (trimmed.startsWith('+')) return trimmed;
    return trimmed ? `+237${trimmed.replace(/\D/g, '')}` : '';
  }
  return `+237${local}`;
}

function locationOptionLabel(w, kind = 'shop') {
  const name = String(w?.name || (kind === 'warehouse' ? 'Warehouse' : 'Shop')).trim();
  const city = String(w?.city || '').trim();
  return city ? `${name} (${city})` : name;
}

const DEFAULT_HANDOVER_CITY = 'Douala';

function filterSellableProducts(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  return list.filter(
    (p) => !isProductTravelling(p) && Math.max(0, Number(p?.stock) || 0) > 0,
  );
}

function shopDirectSaleFlowKey(contextShop) {
  if (!contextShop) return '';
  const id = warehouseId(contextShop);
  return id ? `wache-direct-sale-flow:${id}` : '';
}

function readShopDirectSaleFlow(contextShop) {
  const key = shopDirectSaleFlowKey(contextShop);
  if (!key) return null;
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeShopDirectSaleFlow(contextShop, snapshot) {
  const key = shopDirectSaleFlowKey(contextShop);
  if (!key) return;
  try {
    sessionStorage.setItem(key, JSON.stringify(snapshot));
  } catch {
    /* ignore storage errors */
  }
}

function clearShopDirectSaleFlow(contextShop) {
  const key = shopDirectSaleFlowKey(contextShop);
  if (!key) return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore storage errors */
  }
}

export default function DirectSalePanel({
  onRecorded,
  requireLocationAssignment = false,
  contextShop = null,
  contextShopProducts = null,
  onEnsureSalesTab,
}) {
  const axiosPrivate = useAxiosPrivate();
  const { auth } = useAuth();
  const { paymentOptions, labelForMethod, transactionMethods } = useTransactionMethods();
  const shopOnlyMode = Boolean(contextShop);
  const savedShopFlow = shopOnlyMode ? readShopDirectSaleFlow(contextShop) : null;

  const [products, setProducts] = useState([]);
  const [loadErr, setLoadErr] = useState('');
  const [loadingList, setLoadingList] = useState(true);

  const [step, setStep] = useState(savedShopFlow?.step || 'start');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [saleType, setSaleType] = useState(savedShopFlow?.saleType || '');
  const [paymentMethod, setPaymentMethod] = useState('cash');

  const [saleRows, setSaleRows] = useState([emptySaleUnitRow()]);

  const [buyerResults, setBuyerResults] = useState([]);
  const [buyerSearching, setBuyerSearching] = useState(false);
  const [buyerSearchErr, setBuyerSearchErr] = useState('');
  const [selectedBuyer, setSelectedBuyer] = useState(null);
  const [showCreateBuyerForm, setShowCreateBuyerForm] = useState(false);
  const [creatingBuyer, setCreatingBuyer] = useState(false);
  const [createBuyerErr, setCreateBuyerErr] = useState('');
  const [createBuyerForm, setCreateBuyerForm] = useState({
    name: '',
    businessName: '',
    businessAddress: 'Douala',
    tel: '',
    whatsappNumber: '',
    password: '',
    email: '',
  });

  const [receiptPreview, setReceiptPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [warningRowIds, setWarningRowIds] = useState([]);
  const [lastPrintableReceipt, setLastPrintableReceipt] = useState(null);
  const [imePickerRowId, setImePickerRowId] = useState(null);

  const [mainWarehouses, setMainWarehouses] = useState([]);
  const [subWarehouses, setSubWarehouses] = useState([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsErr, setLocationsErr] = useState('');
  const [assignedLocationId, setAssignedLocationId] = useState('');
  const [staffOptions, setStaffOptions] = useState([]);
  const [staffOptionsLoading, setStaffOptionsLoading] = useState(false);
  const [assignedHandledById, setAssignedHandledById] = useState('');
  const [panelTab, setPanelTab] = useState(() => {
    const saved = savedShopFlow?.panelTab || 'sale';
    if (!requireLocationAssignment && saved === 'exchange') return 'sale';
    return saved;
  });
  const [pricingCatalog, setPricingCatalog] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetchPricingCatalog(axiosPrivate)
      .then((rows) => {
        if (!cancelled) setPricingCatalog(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setPricingCatalog([]);
      });
    return () => {
      cancelled = true;
    };
  }, [axiosPrivate]);

  const pricingLookup = useMemo(() => buildPricingCatalogLookup(pricingCatalog), [pricingCatalog]);

  const salePriceOptions = useMemo(
    () => ({ pricingCatalog, pricingLookup, saleType }),
    [pricingCatalog, pricingLookup, saleType],
  );

  useEffect(() => {
    if (!saleType) return;
    setSaleRows((prev) => {
      let changed = false;
      const next = prev.map((row) => {
        if (!String(row?.productId || '').trim()) return row;
        const updated = refreshSaleRowCatalogPrices(row, products, salePriceOptions);
        if (
          updated.wholesaleUnitPrice !== row.wholesaleUnitPrice ||
          updated.unitPrice !== row.unitPrice
        ) {
          changed = true;
        }
        return updated;
      });
      return changed ? next : prev;
    });
  }, [pricingCatalog, products, salePriceOptions, saleType]);

  const resolvedPaymentMethod = useMemo(
    () => normalizePaymentMethod(paymentMethod, transactionMethods),
    [paymentMethod, transactionMethods],
  );

  useEffect(() => {
    if (!paymentOptions.length) return;
    const current = normalizePaymentMethod(paymentMethod, transactionMethods);
    if (!paymentOptions.some((opt) => opt.value === current)) {
      setPaymentMethod(paymentOptions[0].value);
    }
  }, [paymentOptions, paymentMethod, transactionMethods]);

  const imePickerRow = useMemo(
    () => saleRows.find((r) => r.rowId === imePickerRowId) || null,
    [imePickerRowId, saleRows],
  );
  // Merge every color variant of the selected storage into one pseudo-product so
  // the picker lists all IMEs for that capacity regardless of color.
  const imePickerProduct = useMemo(() => {
    if (!imePickerRow) return null;
    const pool = saleRowVariantProducts(imePickerRow, products);
    const primary =
      products.find((p) => productStableId(p) === imePickerRow.productId) || pool[0] || null;
    if (!pool.length) return primary;
    const codes = saleRowPoolImeList(imePickerRow, products);
    return {
      ...(primary || {}),
      product_name: imePickerRow.productName || primary?.product_name || 'Product',
      imeCodes: codes,
      IME: '',
    };
  }, [products, imePickerRow]);
  const imePickerColorByCode = useMemo(() => {
    if (!imePickerRow) return {};
    const owners = imeOwnerMap(saleRowVariantProducts(imePickerRow, products));
    const map = {};
    for (const [ime, owner] of owners.entries()) {
      const c = String(owner?.color || '').trim();
      if (c) map[ime] = c;
    }
    return map;
  }, [products, imePickerRow]);

  const staffUserId = useMemo(
    () => String(auth?.userId || getUserIdFromAccessToken(auth?.accessToken) || '').trim(),
    [auth?.accessToken, auth?.userId],
  );

  useEffect(() => {
    if (!assignedHandledById && staffUserId) setAssignedHandledById(staffUserId);
  }, [assignedHandledById, staffUserId]);

  useEffect(() => {
    if (!shopOnlyMode || !savedShopFlow) return;
    if (savedShopFlow.step === 'purchase' && savedShopFlow.saleType) {
      onEnsureSalesTab?.();
    }
  }, [onEnsureSalesTab, savedShopFlow, shopOnlyMode]);

  const shopSaleProducts = useMemo(() => {
    if (!shopOnlyMode || !Array.isArray(contextShopProducts)) return [];
    return filterSellableProducts(contextShopProducts);
  }, [shopOnlyMode, contextShopProducts]);

  const loadCatalog = useCallback(async () => {
    if (shopOnlyMode) {
      setProducts(shopSaleProducts);
      setLoadErr('');
      setLoadingList(false);
      return;
    }
    if (requireLocationAssignment) {
      if (!assignedLocationId) {
        setProducts([]);
        setLoadErr('');
        setLoadingList(false);
        return;
      }
      setLoadErr('');
      setLoadingList(true);
      try {
        const data = await fetchWarehouseProducts(axiosPrivate, assignedLocationId);
        setProducts(filterSellableProducts(data?.products || []));
      } catch (e) {
        setProducts([]);
        setLoadErr(e?.response?.data?.message || e?.message || 'Could not load location inventory.');
      } finally {
        setLoadingList(false);
      }
      return;
    }
    setLoadErr('');
    setLoadingList(true);
    try {
      const rows = await fetchProductsList();
      setProducts(filterSellableProducts(Array.isArray(rows) ? rows : []));
    } catch (e) {
      setProducts([]);
      setLoadErr(e?.message || 'Could not load products.');
    } finally {
      setLoadingList(false);
    }
  }, [
    shopOnlyMode,
    shopSaleProducts,
    requireLocationAssignment,
    assignedLocationId,
    axiosPrivate,
  ]);

  useEffect(() => {
    if (shopOnlyMode) {
      setProducts(shopSaleProducts);
      setLoadErr('');
      setLoadingList(false);
      return;
    }
    loadCatalog().catch(() => {});
  }, [shopOnlyMode, shopSaleProducts, loadCatalog]);

  useEffect(() => {
    if (!requireLocationAssignment) return undefined;
    let cancelled = false;
    setLocationsLoading(true);
    setLocationsErr('');
    fetchWarehouses(axiosPrivate)
      .then((data) => {
        if (cancelled) return;
        const mains = Array.isArray(data?.mainWarehouses) ? data.mainWarehouses : [];
        const subs = Array.isArray(data?.subWarehouses) ? data.subWarehouses : [];
        setMainWarehouses(mains);
        setSubWarehouses(
          [...subs].sort((a, b) =>
            locationOptionLabel(a).localeCompare(locationOptionLabel(b), undefined, {
              sensitivity: 'base',
            }),
          ),
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setMainWarehouses([]);
        setSubWarehouses([]);
        setLocationsErr(
          err?.response?.data?.message || err?.message || 'Could not load warehouses and shops.',
        );
      })
      .finally(() => {
        if (!cancelled) setLocationsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [axiosPrivate, requireLocationAssignment]);

  const assignedLocation = useMemo(() => {
    const all = [...mainWarehouses, ...subWarehouses];
    return all.find((w) => warehouseId(w) === assignedLocationId) || null;
  }, [assignedLocationId, mainWarehouses, subWarehouses]);

  useEffect(() => {
    if (!requireLocationAssignment) return undefined;
    let cancelled = false;
    setStaffOptionsLoading(true);
    fetchStaffList(axiosPrivate)
      .then((rows) => {
        if (cancelled) return;
        setStaffOptions(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (cancelled) return;
        setStaffOptions([]);
      })
      .finally(() => {
        if (!cancelled) setStaffOptionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [axiosPrivate, requireLocationAssignment]);

  const assignableStaffOptions = useMemo(() => {
    if (!requireLocationAssignment) return [];
    const selectedShopId = String(assignedLocationId || '').trim();
    const myId = String(staffUserId || '').trim();
    const byShop = (staffOptions || [])
      .filter((user) => userRole(user) === 'salesman')
      .filter((user) => {
        const assignedShops = Array.isArray(user?.assignedShops) ? user.assignedShops : [];
        if (!selectedShopId) return false;
        return assignedShops.some((shop) => {
          const sid = String(shop?._id ?? shop?.id ?? shop ?? '').trim();
          return sid === selectedShopId;
        });
      })
      .sort((a, b) =>
        String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' }),
      )
      .map((user) => ({
        id: userStableId(user),
        label: user?.name || 'Salesperson',
      }));
    const mine = myId ? [{ id: myId, label: 'Admin (you)' }] : [];
    return [...mine, ...byShop.filter((u) => u.id && u.id !== myId)];
  }, [assignedLocationId, requireLocationAssignment, staffOptions, staffUserId]);

  useEffect(() => {
    if (!requireLocationAssignment) return;
    if (!assignableStaffOptions.length) {
      if (staffUserId) setAssignedHandledById(staffUserId);
      return;
    }
    const exists = assignableStaffOptions.some((opt) => opt.id === assignedHandledById);
    if (!exists) setAssignedHandledById(assignableStaffOptions[0].id);
  }, [assignableStaffOptions, assignedHandledById, requireLocationAssignment, staffUserId]);

  const saleAssignmentPayload = useMemo(() => {
    const contextShopId = contextShop ? warehouseId(contextShop) : '';
    const handledById = String(assignedHandledById || staffUserId || '').trim();
    if (contextShopId) {
      return { assignedWarehouseId: contextShopId, handledById };
    }
    if (!requireLocationAssignment || !assignedLocationId) return {};
    return { assignedWarehouseId: assignedLocationId, handledById };
  }, [assignedHandledById, assignedLocationId, requireLocationAssignment, contextShop, staffUserId]);

  useEffect(() => {
    if (step !== 'purchase' || saleType !== 'wholesale') return undefined;
    const q = customerName.trim();
    if (!q) {
      setBuyerResults([]);
      setSelectedBuyer(null);
      setBuyerSearchErr('');
      return undefined;
    }
    if (selectedBuyer && buyerLabel(selectedBuyer) === q) return undefined;
    const timer = setTimeout(() => {
      setBuyerSearching(true);
      setBuyerSearchErr('');
      searchWholesalers(axiosPrivate, q)
        .then((rows) => setBuyerResults(Array.isArray(rows) ? rows : []))
        .catch((err) => {
          setBuyerResults([]);
          setBuyerSearchErr(
            err?.response?.data?.message || err?.message || 'Could not search vendor accounts.',
          );
        })
        .finally(() => setBuyerSearching(false));
    }, 220);
    return () => clearTimeout(timer);
  }, [axiosPrivate, customerName, saleType, selectedBuyer, step]);

  const purchaseLines = useMemo(
    () => buildPurchaseLinesFromRows(saleRows, products),
    [saleRows, products],
  );

  const cartUnits = useMemo(() => cartAllUnitRows(purchaseLines), [purchaseLines]);
  const cartTotal = useMemo(() => cartGrandTotal(purchaseLines), [purchaseLines]);
  const purchaseTotal = useMemo(() => saleRowsGrandTotal(saleRows), [saleRows]);
  const readyRowCount = useMemo(() => completeSaleRowCount(saleRows), [saleRows]);

  const receiptTotal = receiptPreview?.totalPrice ?? cartTotal;
  const receiptUnits = useMemo(
    () => cartUnits.map((row, idx) => ({ ...row, rowNumber: idx + 1 })),
    [cartUnits],
  );

  const validateSaleStock = useCallback(() => {
    // Group rows by their storage pool (all colors of one capacity count together).
    const pools = new Map();
    for (const row of saleRows) {
      if (!isSaleRowComplete(row)) continue;
      const poolProducts = saleRowVariantProducts(row, products);
      const key = poolProducts.length
        ? poolProducts.map((p) => productStableId(p)).sort().join('|')
        : String(row.productId);
      if (!pools.has(key)) {
        pools.set(key, { count: 0, row, poolProducts });
      }
      pools.get(key).count += saleRowQuantity(row);
    }
    for (const { count, row, poolProducts } of pools.values()) {
      const stock = poolProducts.length
        ? poolProducts.reduce((sum, p) => sum + Math.max(0, Number(p?.stock) || 0), 0)
        : Number(products.find((p) => productStableId(p) === row.productId)?.stock) || 0;
      if (stock > 0 && count > stock) {
        return `Only ${stock} unit(s) in stock for ${row.productName || 'this product'}.`;
      }
    }
    return '';
  }, [products, saleRows]);

  const validateDuplicateImes = useCallback(() => {
    const seen = new Set();
    for (const row of saleRows) {
      if (!isSaleRowComplete(row)) continue;
      for (const ime of normalizeSelectedImes(row)) {
        if (seen.has(ime)) return `Duplicate IME on the form: ${ime}`;
        seen.add(ime);
      }
    }
    return '';
  }, [saleRows]);

  const validateImeSelections = useCallback(() => {
    for (const row of saleRows) {
      if (!isSaleRowComplete(row)) continue;
      const product = products.find((p) => productStableId(p) === row.productId);
      const err = validateRowImeSelection(row, product, products);
      if (err) return err;
    }
    return '';
  }, [products, saleRows]);

  const validateSalePrices = useCallback(() => {
    for (const row of saleRows) {
      if (!isSaleRowComplete(row)) continue;
      const entered = parseMoneyInput(row.unitPrice);
      const wholesale = Number(row?.wholesaleUnitPrice) || 0;
      if (entered == null && wholesale <= 0) {
        return 'No saved vendor price found for one or more selected products. Set a valid sale price.';
      }
    }
    return '';
  }, [saleRows]);

  const belowWholesaleRows = useMemo(() => {
    if (saleType !== 'wholesale') return [];
    return saleRows
      .map((row, idx) => ({ row, index: idx }))
      .filter(({ row }) => isSaleRowComplete(row))
      .filter(({ row }) => {
        const wholesalePrice = Number(row?.wholesaleUnitPrice) || 0;
        const salePriceRaw = Number(row?.unitPrice);
        const salePrice = Number.isFinite(salePriceRaw) && salePriceRaw > 0 ? salePriceRaw : wholesalePrice;
        return Number.isFinite(salePrice) && Number.isFinite(wholesalePrice) && salePrice < wholesalePrice;
      });
  }, [saleRows, saleType]);

  const validatePhoneRows = useCallback(() => {
    if (requireLocationAssignment && !assignedLocationId) {
      return 'Select a warehouse or shop to assign this sale to.';
    }
    if (!readyRowCount) return 'Add at least one product with a quantity.';
    const stockErr = validateSaleStock();
    if (stockErr) return stockErr;
    const imePickErr = validateImeSelections();
    if (imePickErr) return imePickErr;
    const imeErr = validateDuplicateImes();
    if (imeErr) return imeErr;
    const priceErr = validateSalePrices();
    if (priceErr) return priceErr;
    return '';
  }, [
    assignedLocationId,
    readyRowCount,
    requireLocationAssignment,
    validateDuplicateImes,
    validateImeSelections,
    validateSalePrices,
    validateSaleStock,
  ]);

  const updateSaleRow = (rowId, patch) => {
    setSaleRows((prev) => prev.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)));
    setReceiptPreview(null);
    setFormErr('');
    setWarningRowIds([]);
  };

  const addSaleRow = () => {
    setSaleRows((prev) => [...prev, emptySaleUnitRow()]);
    setReceiptPreview(null);
    setFormErr('');
    setWarningRowIds([]);
  };

  const removeSaleRow = (rowId) => {
    setSaleRows((prev) => {
      if (prev.length <= 1) return [emptySaleUnitRow()];
      return prev.filter((row) => row.rowId !== rowId);
    });
    setReceiptPreview(null);
    setFormErr('');
    setWarningRowIds([]);
  };

  const onRowQuantityChange = (rowId, rawValue) => {
    const trimmed = String(rawValue ?? '').trim();
    const row = saleRows.find((r) => r.rowId === rowId);

    if (trimmed === '') {
      updateSaleRow(rowId, { quantity: '', selectedImes: [] });
      return;
    }

    if (!/^\d+$/.test(trimmed)) return;

    const qty = Math.floor(Number(trimmed));
    if (!Number.isFinite(qty) || qty < 1) return;

    if (!row?.productId) {
      updateSaleRow(rowId, { quantity: qty, selectedImes: [] });
      return;
    }

    const poolStock = saleRowPoolStock(row, products);
    const fallbackStock =
      Number(products.find((p) => productStableId(p) === row.productId)?.stock) || 0;
    const stock = poolStock > 0 ? poolStock : fallbackStock;
    const used = countSaleRowsForPool(saleRowVariantProducts(row, products).map(productStableId), saleRows, rowId);
    if (stock > 0 && used + qty > stock) {
      setFormErr(`Only ${stock} unit(s) in stock for ${row.productName || 'this product'}.`);
      return;
    }
    const trimmedImes = normalizeSelectedImes(row).slice(0, qty);
    updateSaleRow(rowId, { quantity: qty, selectedImes: trimmedImes });
  };

  const onRowUnitPriceChange = (rowId, rawValue) => {
    const trimmed = String(rawValue ?? '').trim();
    if (trimmed === '') {
      updateSaleRow(rowId, { unitPrice: '' });
      return;
    }
    const parsed = parseMoneyInput(trimmed);
    if (parsed == null) return;
    updateSaleRow(rowId, { unitPrice: parsed });
  };

  const applyRowImeSelection = (rowId, selectedImes) => {
    const row = saleRows.find((r) => r.rowId === rowId);
    const clean = selectedImes.filter(Boolean);
    const colors = saleRowSelectedImeColors({ ...row, selectedImes: clean }, products);
    updateSaleRow(rowId, {
      selectedImes: clean,
      color: colors.length === 1 ? colors[0] : '',
      colorOptions: colors,
    });
  };

  const clearSaleForm = () => {
    if (shopOnlyMode) clearShopDirectSaleFlow(contextShop);
    setStep('start');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setSaleType('');
    setPaymentMethod('cash');
    setSaleRows([emptySaleUnitRow()]);
    setBuyerResults([]);
    setSelectedBuyer(null);
    setBuyerSearchErr('');
    setReceiptPreview(null);
    setFormErr('');
    setWarningRowIds([]);
    setImePickerRowId(null);
    setAssignedLocationId('');
    setAssignedHandledById(staffUserId || '');
  };

  const resetSale = () => {
    clearSaleForm();
    setOkMsg('');
    setLastPrintableReceipt(null);
  };

  const shopReceiptName = useMemo(() => {
    if (contextShop?.name) {
      const city = String(contextShop?.city || '').trim();
      return city ? `${contextShop.name} (${city})` : contextShop.name;
    }
    return assignedLocation ? locationOptionLabel(assignedLocation) : '';
  }, [assignedLocation, contextShop]);

  const buildCurrentReceiptPayload = useCallback(
    (orderRef = '') =>
      buildReceiptPayloadFromSaleForm({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() ? formatRetailPhoneDisplay(customerPhone) : '',
        customerEmail: customerEmail.trim(),
        buyerName: buyerLabel(selectedBuyer),
        purchaseLines: receiptPreview?.lines || purchaseLines,
        unitRows: receiptUnits,
        grandTotal: receiptTotal,
        deliveryCity: DEFAULT_HANDOVER_CITY,
        shopName: shopReceiptName,
        saleType,
        paymentMethod: resolvedPaymentMethod,
        orderRef,
        soldAt: new Date().toISOString(),
      }),
    [
      customerEmail,
      customerName,
      customerPhone,
      purchaseLines,
      receiptPreview?.lines,
      receiptTotal,
      receiptUnits,
      saleType,
      resolvedPaymentMethod,
      selectedBuyer,
      shopReceiptName,
    ],
  );

  const chooseSaleType = (type) => {
    setFormErr('');
    setOkMsg('');
    setLastPrintableReceipt(null);
    setSaleType(type);
    setPaymentMethod('cash');
    setWarningRowIds([]);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setSelectedBuyer(null);
    setBuyerResults([]);
    setBuyerSearchErr('');
    setSaleRows([emptySaleUnitRow()]);
    setShowCreateBuyerForm(false);
    setCreatingBuyer(false);
    setCreateBuyerErr('');
    setCreateBuyerForm({
      name: '',
      businessName: '',
      businessAddress: 'Douala',
      tel: '',
      whatsappNumber: '',
      password: '',
      email: '',
    });
    setAssignedLocationId('');
    setReceiptPreview(null);
    setStep('purchase');
    setPanelTab('sale');
    onEnsureSalesTab?.();
    if (shopOnlyMode) {
      writeShopDirectSaleFlow(contextShop, {
        panelTab: 'sale',
        step: 'purchase',
        saleType: type,
      });
    }
  };

  const validateCustomerDetails = () => {
    const name = customerName.trim();
    if (!name) {
      setFormErr('Enter or select a customer name.');
      return false;
    }
    if (saleType === 'retail') {
      const phone = customerPhone.trim();
      if (phone && !isValidCmPhone(phone)) {
        setFormErr('Enter a valid phone number (+237 and 9 digits) or leave blank.');
        return false;
      }
      const email = customerEmail.trim();
      if (email && !isValidEmail(email)) {
        setFormErr('Enter a valid email address or leave blank.');
        return false;
      }
    }
    if (saleType === 'wholesale' && !selectedBuyer) {
      setFormErr('Select a vendor account from the list.');
      return false;
    }
    if (requireLocationAssignment && !String(assignedHandledById || '').trim()) {
      setFormErr('Select who this sale should be assigned to.');
      return false;
    }
    const normalizedPayment = normalizePaymentMethod(paymentMethod, transactionMethods);
    if (!paymentOptions.some((opt) => opt.value === normalizedPayment)) {
      setFormErr('Select a valid payment method.');
      return false;
    }
    return true;
  };

  const confirmBelowWholesalePricing = () => {
    if (saleType !== 'wholesale' || !belowWholesaleRows.length) return true;
    const warningIds = belowWholesaleRows.map(({ row }) => row.rowId).filter(Boolean);
    const details = belowWholesaleRows
      .slice(0, 4)
      .map(({ row, index }) => {
        const sale = formatMoneyXaf(Number(row.unitPrice) || 0);
        const wholesale = formatMoneyXaf(Number(row.wholesaleUnitPrice) || 0);
        return `Row ${index + 1}: ${row.productName || 'Product'} (${row.capacity || '—'}) ${sale} < ${wholesale}`;
      })
      .join('\n');
    const extra =
      belowWholesaleRows.length > 4 ? `\n...and ${belowWholesaleRows.length - 4} more row(s).` : '';
    const ok = window.confirm(
      `Warning: You are selling below vendor price.\n\n${details}${extra}\n\nPress OK to proceed or Cancel to review the highlighted rows.`,
    );
    if (ok) {
      setWarningRowIds([]);
      return true;
    }
    setWarningRowIds(warningIds);
    setStep('purchase');
    setFormErr('Rows highlighted: sale price is below vendor price.');
    return false;
  };

  const applyCreatedVendor = (created, payload) => {
    const normalized = {
      _id: created?.id || created?._id || '',
      id: created?.id || created?._id || '',
      name: created?.name || payload.name,
      businessName: created?.businessName || payload.businessName,
      tel: created?.tel || payload.tel,
    };
    setSelectedBuyer(normalized);
    setCustomerName(buyerLabel(normalized));
    setBuyerResults([]);
    setShowCreateBuyerForm(false);
    setStep('purchase');
    setSaleType('wholesale');
    setPanelTab('sale');
    onEnsureSalesTab?.();
    if (shopOnlyMode) {
      writeShopDirectSaleFlow(contextShop, {
        panelTab: 'sale',
        step: 'purchase',
        saleType: 'wholesale',
      });
    }
    setCreateBuyerForm({
      name: '',
      businessName: '',
      businessAddress: 'Douala',
      tel: '',
      whatsappNumber: '',
      password: '',
      email: '',
    });
    setOkMsg('Vendor account created successfully.');
  };

  const recoverVendorAfterCreateIssue = async (payload) => {
    const queries = [payload.name, payload.tel, payload.businessName].filter(Boolean);
    for (const query of queries) {
      const found = await searchWholesalers(axiosPrivate, query);
      const match = found.find((row) => {
        const nameMatch =
          String(row?.name || '').trim().toLowerCase() === payload.name.toLowerCase();
        const telMatch = String(row?.tel || '').trim() === String(payload.tel || '').trim();
        return nameMatch || telMatch;
      });
      if (match?._id || match?.id) return match;
    }
    return null;
  };

  const handleCreateWholesalerSubmit = async () => {
    if (creatingBuyer) return;
    setCreateBuyerErr('');
    const payload = {
      name: String(createBuyerForm.name || '').trim(),
      businessName: String(createBuyerForm.businessName || '').trim(),
      businessAddress: String(createBuyerForm.businessAddress || '').trim(),
      tel: String(createBuyerForm.tel || '').trim(),
      whatsappNumber: String(createBuyerForm.whatsappNumber || '').trim(),
      password: String(createBuyerForm.password || ''),
      email: String(createBuyerForm.email || '').trim(),
    };
    if (
      !payload.name ||
      !payload.businessName ||
      !payload.businessAddress ||
      !payload.tel ||
      !payload.whatsappNumber ||
      !payload.password
    ) {
      setCreateBuyerErr('Fill all required vendor fields.');
      return;
    }

    setCreatingBuyer(true);
    try {
      const data = await createWholesalerForDirectSale(axiosPrivate, payload);
      const created = data?.user || data?.data?.user || data?.data || data || {};
      applyCreatedVendor(created, payload);
    } catch (err) {
      const status = Number(err?.response?.status);
      const timedOut = isRequestTimeoutError(err);
      const duplicate = status === 409;
      if (timedOut || duplicate) {
        try {
          const recovered = await recoverVendorAfterCreateIssue(payload);
          if (recovered) {
            applyCreatedVendor(recovered, payload);
            return;
          }
        } catch {
          /* fall through to user-facing message */
        }
      }
      if (timedOut) {
        setCreateBuyerErr(
          'The server took longer than expected. The vendor may already exist — search for their name in the vendor field above.',
        );
      } else {
        setCreateBuyerErr(
          err?.response?.data?.message || err?.message || 'Could not create vendor account.',
        );
      }
    } finally {
      setCreatingBuyer(false);
    }
  };

  const loadReceiptPreview = async () => {
    if (!validateCustomerDetails()) return;
    const rowErr = validatePhoneRows();
    if (rowErr) {
      setFormErr(rowErr);
      return;
    }
    if (!confirmBelowWholesalePricing()) return;

    setPreviewLoading(true);
    setFormErr('');
    try {
      const data = await previewWholesaleDirectSale(axiosPrivate, {
        items: cartItemsForApi(purchaseLines),
        handledById: staffUserId,
        paymentMethod: resolvedPaymentMethod,
        ...saleAssignmentPayload,
      });
      setReceiptPreview(data);
      setStep('receipt');
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        (err?.response?.status === 404
          ? 'Receipt preview is not available on the server yet. Redeploy the latest API, or contact support.'
          : null) ||
        err?.message ||
        'Could not build receipt.';
      setFormErr(typeof msg === 'string' ? msg : 'Could not build receipt.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const performRetailConfirm = async () => {
    setFormErr('');
    setOkMsg('');
    if (!validateCustomerDetails() || !staffUserId) {
      if (!staffUserId) setFormErr('You must be signed in to record a sale.');
      return;
    }
    const rowErr = validatePhoneRows();
    if (rowErr) {
      setFormErr(rowErr);
      return;
    }

    setSubmitting(true);
    try {
      const data = await confirmRetailDirectSale(axiosPrivate, {
        saleType: 'retail',
        paymentMethod: resolvedPaymentMethod,
        buyerUserId: staffUserId,
        items: cartItemsForApi(buildPurchaseLinesFromRows(saleRows, products)),
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() ? formatRetailPhoneDisplay(customerPhone) : '',
        customerEmail: customerEmail.trim(),
        handledById: staffUserId,
        deliveryLocationKey: DEFAULT_HANDOVER_CITY,
        ...saleAssignmentPayload,
      });
      const orderIds = Array.isArray(data?.orderIds) ? data.orderIds : data?.orderId ? [data.orderId] : [];
      const ref =
        String(data?.batchOrderRef || '').trim() ||
        (orderIds[0] ? String(orderIds[0]).slice(-8) : '');
      setLastPrintableReceipt(
        buildReceiptPayloadFromSaleForm({
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerEmail: customerEmail.trim(),
          purchaseLines: buildPurchaseLinesFromRows(saleRows, products),
          unitRows: cartUnits.map((row, idx) => ({ ...row, rowNumber: idx + 1 })),
          grandTotal: cartTotal,
          deliveryCity: DEFAULT_HANDOVER_CITY,
          shopName: shopReceiptName,
          saleType: 'retail',
          paymentMethod: resolvedPaymentMethod,
          orderRef: ref,
          soldAt: new Date().toISOString(),
        }),
      );
      setOkMsg(
        `Retail sale recorded. ${data?.soldImeCount || 0} IME(s) sold · Receipt ref ${ref || '—'}.`,
      );
      try {
        emitOrderCreated('buy');
      } catch {
        /* ignore */
      }
      notifyProductCatalogUpdated();
      await onRecorded?.();
      await loadCatalog().catch(() => {});
      clearSaleForm();
    } catch (err) {
      setFormErr(
        friendlySaleErrorMessage(err, 'Could not complete the direct sale.'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const proceedRetailToReceipt = async () => {
    setFormErr('');
    if (!validateCustomerDetails() || !staffUserId) {
      if (!staffUserId) setFormErr('You must be signed in to record a sale.');
      return;
    }
    const rowErr = validatePhoneRows();
    if (rowErr) {
      setFormErr(rowErr);
      return;
    }
    setStep('receipt');
  };

  const handleWholesaleConfirm = async () => {
    if (!selectedBuyer || !purchaseLines.length || !cartUnits.length) {
      setFormErr('Complete the sales details before confirming.');
      return;
    }
    if (!confirmBelowWholesalePricing()) return;
    setSubmitting(true);
    setFormErr('');
    setOkMsg('');
    try {
      const buyerId = String(selectedBuyer?._id ?? selectedBuyer?.id ?? '').trim();
      const data = await confirmWholesaleDirectSale(axiosPrivate, {
        saleType: 'wholesale',
        paymentMethod: resolvedPaymentMethod,
        buyerUserId: buyerId,
        items: cartItemsForApi(purchaseLines),
        customerName: customerName.trim(),
        handledById: staffUserId,
        deliveryLocationKey: DEFAULT_HANDOVER_CITY,
        ...saleAssignmentPayload,
      });
      const orderIds = Array.isArray(data?.orderIds) ? data.orderIds : data?.orderId ? [data.orderId] : [];
      const ref =
        String(data?.batchOrderRef || '').trim() ||
        (orderIds[0] ? String(orderIds[0]).slice(-8) : '');
      setLastPrintableReceipt(buildCurrentReceiptPayload(ref));
      setOkMsg(
        `Sale confirmed. ${data?.soldImeCount || 0} IME(s) sold · Receipt ref ${ref || '—'} · Total ${formatMoneyXaf(data?.totalPrice)}.`,
      );
      try {
        emitOrderCreated('buy');
      } catch {
        /* ignore */
      }
      notifyProductCatalogUpdated();
      await onRecorded?.();
      await loadCatalog().catch(() => {});
      clearSaleForm();
    } catch (err) {
      setFormErr(friendlySaleErrorMessage(err, 'Could not confirm sale.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadReceipt = () => {
    downloadDirectSaleReceipt({
      customerName: customerName.trim(),
      buyerName: buyerLabel(selectedBuyer),
      purchaseLines: receiptPreview?.lines || purchaseLines,
      unitRows: receiptUnits,
      grandTotal: receiptTotal,
      deliveryCity: DEFAULT_HANDOVER_CITY,
      fileNameBase: `wholesale-receipt-${customerName.trim() || 'customer'}`,
    });
  };

  const handlePrintReceipt = (payload = null) => {
    try {
      printDirectSaleReceipt(payload || buildCurrentReceiptPayload());
    } catch (err) {
      setFormErr(err?.message || 'Could not open print dialog. Allow pop-ups and try again.');
    }
  };

  const inStockCount = products.filter((p) => Number(p?.stock) > 0).length;
  const productsByBrand = useMemo(() => {
    const byBrand = new Map();
    for (const p of products) {
      const id = productStableId(p);
      if (!id) continue;
      const brand = productBrandName(p);
      const modelKey = productModelKey(p);
      const modelName = productModelName(p);
      const capacity = capacityLabel(p?.capacity);
      const stock = Math.max(0, Number(p?.stock) || 0);
      if (!byBrand.has(brand)) byBrand.set(brand, new Map());
      const models = byBrand.get(brand);
      if (!models.has(modelKey)) {
        models.set(modelKey, {
          modelKey,
          modelName,
          brand,
          capacitiesMap: new Map(),
        });
      }
      const model = models.get(modelKey);
      const capacityKey = capacity;
      if (!model.capacitiesMap.has(capacityKey)) {
        model.capacitiesMap.set(capacityKey, {
          value: capacity,
          capacity,
          label: capacity,
          totalStock: stock,
          variants: [p],
        });
      } else {
        const row = model.capacitiesMap.get(capacityKey);
        row.totalStock += stock;
        row.variants.push(p);
      }
    }
    const groups = [...byBrand.entries()].sort(([a], [b]) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    );
    const mapped = groups.map(([brand, models]) => {
      const items = [...models.values()]
        .map((entry) => ({
          modelKey: entry.modelKey,
          modelName: entry.modelName,
          brand: entry.brand,
          capacities: [...entry.capacitiesMap.values()].sort((a, b) =>
            a.label.localeCompare(b.label, undefined, { sensitivity: 'base', numeric: true }),
          ),
        }))
        .sort((a, b) => a.modelName.localeCompare(b.modelName, undefined, { sensitivity: 'base' }));
      return { brand, items };
    });
    return mapped;
  }, [products]);
  const modelLookup = useMemo(() => {
    const map = new Map();
    productsByBrand.forEach((group) => {
      group.items.forEach((model) => {
        map.set(model.modelKey, model);
      });
    });
    return map;
  }, [productsByBrand]);
  const onRowModelChange = (rowId, modelKey) => {
    const selectedModel = modelLookup.get(modelKey);
    setSaleRows((prev) =>
      prev.map((row) => {
        if (row.rowId !== rowId) return row;
        if (!selectedModel) {
          return {
            ...row,
            modelKey: '',
            productId: '',
            variantIds: [],
            productName: '',
            brand: '',
            capacity: '',
            color: '',
            colorOptions: [],
            wholesaleUnitPrice: 0,
            unitPrice: 0,
            selectedImes: [],
          };
        }
        return {
          ...row,
          modelKey,
          productId: '',
          variantIds: [],
          productName: selectedModel.modelName,
          brand: selectedModel.brand,
          capacity: '',
          color: '',
          colorOptions: [],
          wholesaleUnitPrice: 0,
          unitPrice: 0,
          selectedImes: [],
        };
      }),
    );
    setFormErr('');
    setReceiptPreview(null);
    setWarningRowIds([]);
  };
  const onRowCapacityChange = (rowId, selectedCapacity) => {
    const row = saleRows.find((r) => r.rowId === rowId);
    const modelKey = String(row?.modelKey || '').trim();
    const model = modelLookup.get(modelKey);
    if (!model) {
      setFormErr('Select product model first.');
      return;
    }
    const capacityOption = (model.capacities || []).find(
      (opt) => String(opt.value) === String(selectedCapacity),
    );
    if (!capacityOption) {
      updateSaleRow(rowId, {
        productId: '',
        variantIds: [],
        capacity: '',
        color: '',
        colorOptions: [],
        wholesaleUnitPrice: 0,
        unitPrice: 0,
        selectedImes: [],
      });
      return;
    }
    const rowQty = saleRowQuantityOrNull(row) || 0;
    // Keep every color variant of this storage in the row's pool; IMEs across all
    // colors are pickable and the color is resolved from the chosen IMEs.
    const variants = (Array.isArray(capacityOption.variants) ? capacityOption.variants : []).filter(
      (variant) => productStableId(variant),
    );
    const variantIds = variants.map(productStableId);
    const poolStock = variants.reduce((sum, v) => sum + Math.max(0, Number(v?.stock) || 0), 0);
    const usedInPool = countSaleRowsForPool(variantIds, saleRows, rowId);
    if (poolStock <= usedInPool) {
      setFormErr('No stock available for this capacity.');
      return;
    }
    if (rowQty > 0 && usedInPool + rowQty > poolStock) {
      setFormErr(
        `Only ${poolStock} unit(s) in stock for ${model.modelName || 'this product'} (${capacityOption.capacity || 'selected capacity'}).`,
      );
      return;
    }
    const primaryProduct = [...variants].sort((a, b) => {
      const aStock = Math.max(0, Number(a?.stock) || 0);
      const bStock = Math.max(0, Number(b?.stock) || 0);
      return bStock - aStock;
    })[0];
    const priceVariant =
      variants.find((v) => pricingCapacitiesMatch(v?.capacity, capacityOption.capacity)) ||
      primaryProduct;
    const poolColors = [
      ...new Set(variants.map((v) => String(v?.color || '').trim()).filter(Boolean)),
    ];
    setSaleRows((prev) =>
      prev.map((entry) => {
        if (entry.rowId !== rowId) return entry;
        const applied = applyProductToSaleRow(
          { ...entry, modelKey, capacity: capacityOption.capacity || entry.capacity },
          priceVariant,
          salePriceOptions,
        );
        return {
          ...applied,
          modelKey,
          variantIds,
          capacity: capacityOption.capacity || applied.capacity,
          color: poolColors.length === 1 ? poolColors[0] : '',
          colorOptions: [],
        };
      }),
    );
    setFormErr('');
    setReceiptPreview(null);
    setWarningRowIds([]);
  };
  const showWholesaleMatches =
    saleType === 'wholesale' &&
    step === 'purchase' &&
    customerName.trim() &&
    (!selectedBuyer || buyerLabel(selectedBuyer) !== customerName.trim());
  const isWholesale = saleType === 'wholesale';

  function renderPhoneRowsTable() {
    return (
      <section className="add-card bulk-add-table-wrap admin-direct-sale-phone-table">
        <div className="bulk-add-table-head">
          <h4>
            {readyRowCount} unit{readyRowCount === 1 ? '' : 's'} ready
            {saleRows.filter(isSaleRowComplete).length < saleRows.length
              ? ` · ${saleRows.length - saleRows.filter(isSaleRowComplete).length} row(s) incomplete`
              : ''}
          </h4>
          <button type="button" className="btn-reset admin-direct-sale-plus-btn" onClick={addSaleRow}>
            + Add row
          </button>
        </div>
        <p className="admin-direct-sale-hint">
          Select product model first, then choose capacity. Retail sales use the retail price from Pricing;
          vendor sales use the vendor price.
        </p>
        <div className="bulk-add-table-scroll">
          <table className="bulk-add-table admin-direct-sale-phone-grid">
            <thead>
              <tr>
                <th>#</th>
                <th>Product</th>
                <th>Brand</th>
                <th>Capacity</th>
                <th>Color</th>
                <th>{saleType === 'wholesale' ? 'Vendor price' : 'Retail price'}</th>
                <th>Qty</th>
                <th>IME</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {saleRows.map((row, index) => {
                const product =
                  products.find((p) => productStableId(p) === row.productId) || null;
                const selectedModelKey =
                  String(row.modelKey || '').trim() || (product ? productModelKey(product) : '');
                const selectedModel = selectedModelKey ? modelLookup.get(selectedModelKey) : null;
                const rowReady = isSaleRowComplete(row);
                const selectedImeCount = normalizeSelectedImes(row).length;
                const rowQty = saleRowQuantityOrNull(row);
                const poolImeCount = row.productId
                  ? saleRowPoolImeList(row, products).length
                  : 0;
                const imeRegisteredCount =
                  poolImeCount || (product ? productImeList(product).length : 0);
                const needsImeAttention = Boolean(
                  row.productId &&
                    rowQty != null &&
                    imeRegisteredCount > 0 &&
                    selectedImeCount < rowQty,
                );
                return (
                  <tr
                    key={row.rowId}
                    className={[
                      rowReady ? 'bulk-add-row--ready' : '',
                      warningRowIds.includes(row.rowId) ? 'admin-direct-sale-row--below-wholesale' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <td data-label="Row">{index + 1}</td>
                    <td data-label="Product">
                      <select
                        className="admin-direct-sale-product-select"
                        value={selectedModelKey}
                        onChange={(e) => onRowModelChange(row.rowId, e.target.value)}
                      >
                        <option value="">Select product model…</option>
                        {productsByBrand.map((group) => (
                          <optgroup key={group.brand} label={group.brand}>
                            {group.items.map((model) => {
                              return (
                                <option key={model.modelKey} value={model.modelKey}>
                                  {model.modelName}
                                </option>
                              );
                            })}
                          </optgroup>
                        ))}
                      </select>
                    </td>
                    <td data-label="Brand">
                      <input value={row.brand} readOnly placeholder="—" tabIndex={-1} />
                    </td>
                    <td data-label="Capacity">
                      <select
                        value={row.capacity || ''}
                        onChange={(e) => onRowCapacityChange(row.rowId, e.target.value)}
                        disabled={!selectedModel}
                      >
                        <option value="">
                          {selectedModel ? 'Select capacity…' : 'Select model first'}
                        </option>
                        {(selectedModel?.capacities || []).map((option) => (
                          <option key={`${selectedModel.modelKey}-${option.value}`} value={option.value}>
                            {option.label} · {option.totalStock} available
                          </option>
                        ))}
                      </select>
                    </td>
                    <td data-label="Color">
                      {Array.isArray(row.colorOptions) && row.colorOptions.length > 1 ? (
                        <select
                          value={row.color || ''}
                          onChange={(e) => updateSaleRow(row.rowId, { color: e.target.value })}
                          aria-label={`${row.colorOptions.length} colors in this line`}
                          title="Colors of the selected IMEs"
                        >
                          <option value="">{row.colorOptions.length} colors</option>
                          {row.colorOptions.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={row.color}
                          readOnly
                          placeholder={row.productId && !normalizeSelectedImes(row).length ? 'Pick IME first' : '—'}
                          tabIndex={-1}
                        />
                      )}
                    </td>
                    <td data-label={saleType === 'wholesale' ? 'Vendor price' : 'Retail price'}>
                      <input
                        type="number"
                        min={1}
                        step="any"
                        value={row.unitPrice === '' || row.unitPrice == null ? '' : row.unitPrice}
                        onChange={(e) => onRowUnitPriceChange(row.rowId, e.target.value)}
                        disabled={!row.productId}
                        aria-label={`Sale price for row ${index + 1}`}
                        placeholder={saleType === 'wholesale' ? 'Vendor price' : 'Retail price'}
                        title={
                          row.productId
                            ? saleType === 'wholesale'
                              ? `Vendor price from Pricing: ${formatMoneyXaf(row.wholesaleUnitPrice || row.unitPrice || 0)}`
                              : `Retail price from Pricing: ${formatMoneyXaf(row.unitPrice || 0)}`
                            : 'Select model and capacity first'
                        }
                      />
                    </td>
                    <td data-label="Quantity">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={
                          row.quantity === '' || row.quantity == null ? '' : row.quantity
                        }
                        onChange={(e) => onRowQuantityChange(row.rowId, e.target.value)}
                        disabled={!row.productId}
                        aria-label={`Quantity for row ${index + 1}`}
                        placeholder="Qty"
                      />
                    </td>
                    <td
                      data-label="IME"
                      className={`admin-direct-sale-ime-cell ${needsImeAttention ? 'admin-direct-sale-ime-cell--beep' : ''}`}
                    >
                      {!row.productId ? (
                        <span className="admin-direct-sale-ime-hint">Select model and capacity first</span>
                      ) : (
                        (() => {
                          const registered = poolImeCount
                            ? saleRowPoolImeList(row, products)
                            : productImeList(product);
                          const picked = normalizeSelectedImes(row);
                          const qty = saleRowQuantityOrNull(row);
                          if (qty == null) {
                            return (
                              <span className="admin-direct-sale-ime-hint">Enter quantity first</span>
                            );
                          }
                          if (!registered.length) {
                            return (
                              <span className="admin-direct-sale-ime-hint">
                                {shopOnlyMode
                                  ? 'No IME registered on this stock line. Ask admin to add IME codes in inventory.'
                                  : 'No IME available for this product'}
                              </span>
                            );
                          }
                          return (
                            <button
                              type="button"
                              className="admin-direct-sale-ime-btn"
                              onClick={() => setImePickerRowId(row.rowId)}
                            >
                              {picked.length > 0
                                ? `${picked.length}/${qty} IME${qty === 1 ? '' : 's'} selected`
                                : `Select IME (${qty})`}
                            </button>
                          );
                        })()
                      )}
                    </td>
                    <td data-label="Remove">
                      <button
                        type="button"
                        className="bulk-add-remove"
                        onClick={() => removeSaleRow(row.rowId)}
                        disabled={saleRows.length <= 1 && !row.productId}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="admin-direct-sale-purchase-total">
          <span>{isWholesale ? 'Sales total' : 'Total'}</span>
          <strong>
            <MoneyXaf value={purchaseTotal} />
          </strong>
          <span className="admin-direct-sale-hint">
            {readyRowCount} unit{readyRowCount === 1 ? '' : 's'} ·{' '}
            {saleRows.filter(isSaleRowComplete).length} line
            {saleRows.filter(isSaleRowComplete).length === 1 ? '' : 's'}
          </span>
        </div>
      </section>
    );
  }

  function renderUnitTable(rows, options = {}) {
    const {
      emptyMessage,
      editable = false,
      onRemoveRow,
      onAddRow,
      addDisabled = false,
      showPrice = isWholesale,
    } = options;

    if (!rows.length && !editable) {
      return emptyMessage ? <p className="admin-direct-sale-hint">{emptyMessage}</p> : null;
    }

    return (
      <div className="admin-direct-sale-unit-table">
        <div className="sales-table-wrap">
          <table className="sales-table admin-direct-sale-ime-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Product</th>
                <th>Brand</th>
                <th>Capacity</th>
                <th>Color</th>
                <th>IME</th>
                {showPrice ? (
                  <th className="fit-numeric-cell">Unit price</th>
                ) : null}
                {editable ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={showPrice ? (editable ? 8 : 7) : editable ? 7 : 6} className="admin-direct-sale-empty-row">
                    No units yet — use &ldquo;Add row&rdquo; below.
                  </td>
                </tr>
              ) : null}
              {rows.map((row, idx) => (
                <tr key={row.rowId || `${row.ime || 'unit'}-${idx}`}>
                  <td>{row.rowNumber ?? idx + 1}</td>
                  <td>{row.productName || '—'}</td>
                  <td>{row.brand || '—'}</td>
                  <td>{row.capacity || '—'}</td>
                  <td>{row.color || '—'}</td>
                  <td>{row.ime || '—'}</td>
                  {showPrice ? (
                    <td className="fit-numeric-cell">
                      <MoneyXaf value={row.unitPrice} />
                    </td>
                  ) : null}
                  {editable && onRemoveRow ? (
                    <td>
                      <button
                        type="button"
                        className="admin-direct-sale-row-btn admin-direct-sale-row-btn--remove"
                        onClick={() => onRemoveRow(row)}
                      >
                        Remove
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editable && onAddRow ? (
          <button
            type="button"
            className="admin-direct-sale-row-btn admin-direct-sale-row-btn--add"
            onClick={onAddRow}
            disabled={addDisabled}
          >
            + Add row
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="wh-dash-wrap admin-direct-sale-wrap">
      <section className="wh-hero admin-direct-sale-hero">
        <div className="wh-hero__inner">
          <p className="admin-direct-sale-hero__eyebrow">In-Shop sales</p>
          <h2>Record a direct sale</h2>
          <p>
            {shopOnlyMode
              ? 'Only products currently in your shop inventory can be sold here. For anything else, request stock from general inventory on the Dashboard.'
              : 'Add each phone on its own row in the sales form, then review the receipt with the total amount due before confirming.'}
          </p>
        </div>
      </section>

      {loadingList ? (
        <section className="admin-direct-sale-state">
          <p>Loading product catalog…</p>
        </section>
      ) : null}

      {!loadingList ? (
        <section className="wh-panel admin-direct-sale-panel">
          <div className="admin-direct-sale-subtabs" role="tablist" aria-label="Direct sale sections">
            <button
              type="button"
              role="tab"
              aria-selected={panelTab === 'sale'}
              className={`admin-direct-sale-subtab ${panelTab === 'sale' ? 'is-active' : ''}`}
              onClick={() => setPanelTab('sale')}
            >
              Record sale
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={panelTab === 'pricing'}
              className={`admin-direct-sale-subtab ${panelTab === 'pricing' ? 'is-active' : ''}`}
              onClick={() => setPanelTab('pricing')}
            >
              Pricing
            </button>
            {requireLocationAssignment ? (
              <button
                type="button"
                role="tab"
                aria-selected={panelTab === 'exchange'}
                className={`admin-direct-sale-subtab ${panelTab === 'exchange' ? 'is-active' : ''}`}
                onClick={() => setPanelTab('exchange')}
              >
                Exchange
              </button>
            ) : null}
          </div>

          {panelTab === 'pricing' ? (
            <DirectSalePricingTab isAdmin={requireLocationAssignment} />
          ) : null}

          {panelTab === 'exchange' && requireLocationAssignment ? <ExchangePanel /> : null}

          {panelTab === 'sale' ? (
          <>
          {loadErr ? (
            <p className="admin-direct-sale-alert admin-direct-sale-alert--error">{loadErr}</p>
          ) : (
          <>
          <div className="admin-direct-sale-steps" aria-label="Sale progress">
            <span className={step === 'start' ? 'is-active' : step !== 'start' ? 'is-done' : ''}>
              1. Customer
            </span>
            <span className={step === 'purchase' ? 'is-active' : step === 'receipt' ? 'is-done' : ''}>
              2. Sales
            </span>
            {isWholesale ? (
              <span className={step === 'receipt' ? 'is-active' : ''}>3. Receipt</span>
            ) : (
              <span className="is-muted">3. Receipt</span>
            )}
          </div>

          {okMsg ? (
            <div className="admin-direct-sale-alert admin-direct-sale-alert--ok admin-direct-sale-alert--with-action">
              <p>{okMsg}</p>
              {lastPrintableReceipt ? (
                <button
                  type="button"
                  className="admin-direct-sale-btn admin-direct-sale-btn--ghost admin-direct-sale-btn--compact"
                  onClick={() => handlePrintReceipt(lastPrintableReceipt)}
                >
                  Print receipt
                </button>
              ) : null}
            </div>
          ) : null}
          {formErr ? (
            <div className="admin-direct-sale-error-modal" role="alertdialog" aria-modal="true">
              <div className="admin-direct-sale-error-modal__card">
                <h4>Sale could not continue</h4>
                <p>{formErr}</p>
                <button
                  type="button"
                  className="admin-direct-sale-btn admin-direct-sale-btn--primary"
                  onClick={() => setFormErr('')}
                >
                  OK
                </button>
              </div>
            </div>
          ) : null}

          {step === 'start' ? (
            <div className="admin-direct-sale-step">
              <h3>Customer</h3>
              <p className="admin-direct-sale-hint">What type of sale is this?</p>
              <div className="admin-direct-sale-type-row">
                <button
                  type="button"
                  className="admin-direct-sale-btn admin-direct-sale-btn--primary"
                  onClick={() => chooseSaleType('retail')}
                >
                  Retail
                </button>
                <button
                  type="button"
                  className="admin-direct-sale-btn admin-direct-sale-btn--secondary"
                  onClick={() => chooseSaleType('wholesale')}
                >
                  Vendor
                </button>
              </div>
            </div>
          ) : null}

          {step === 'purchase' ? (
            <form
              className="admin-direct-sale-step"
              onSubmit={(e) => {
                e.preventDefault();
                if (!isWholesale) proceedRetailToReceipt();
              }}
            >
              <div className="admin-direct-sale-step-head">
                <h3>{isWholesale ? 'Vendor sales' : 'Retail sales'}</h3>
                <button type="button" className="admin-direct-sale-link-btn" onClick={resetSale}>
                  Start over
                </button>
              </div>

              <div className="admin-direct-sale-section">
                <h4 className="admin-direct-sale-section__title">Customer details</h4>
                <label className="admin-direct-sale-field">
                  <span>{isWholesale ? 'Vendor name' : 'Customer name'}</span>
                  <input
                    value={customerName}
                    onChange={(e) => {
                      setCustomerName(e.target.value);
                      setSelectedBuyer(null);
                      setReceiptPreview(null);
                    }}
                    placeholder={
                      isWholesale ? 'Start typing a vendor name…' : 'Full name of the buyer'
                    }
                    maxLength={120}
                    autoComplete="off"
                    autoFocus
                  />
                </label>

                {!isWholesale ? (
                  <>
                    <label className="admin-direct-sale-field">
                      <span>Phone (optional)</span>
                      <input
                        type="tel"
                        value={customerPhone}
                        onChange={(e) => {
                          setCustomerPhone(e.target.value);
                          setReceiptPreview(null);
                        }}
                        placeholder="+237677184257"
                        autoComplete="tel"
                      />
                    </label>
                    <label className="admin-direct-sale-field">
                      <span>Email (optional)</span>
                      <input
                        type="email"
                        value={customerEmail}
                        onChange={(e) => {
                          setCustomerEmail(e.target.value);
                          setReceiptPreview(null);
                        }}
                        placeholder="customer@example.com"
                        autoComplete="email"
                      />
                    </label>
                  </>
                ) : null}

                {isWholesale && buyerSearching ? (
                  <p className="admin-direct-sale-hint">Searching vendor accounts…</p>
                ) : null}
                {isWholesale && buyerSearchErr ? (
                  <p className="admin-direct-sale-alert admin-direct-sale-alert--error">{buyerSearchErr}</p>
                ) : null}
                {showWholesaleMatches && !buyerSearching && !buyerSearchErr && buyerResults.length === 0 ? (
                  <p className="admin-direct-sale-hint">
                    No vendor accounts found starting with &ldquo;{customerName.trim()}&rdquo;.
                  </p>
                ) : null}
                {isWholesale ? (
                  <div className="admin-direct-sale-create-buyer">
                    <button
                      type="button"
                      className="admin-direct-sale-link-btn"
                      onClick={() => {
                        setCreateBuyerErr('');
                        setShowCreateBuyerForm((open) => !open);
                        if (!showCreateBuyerForm) {
                          const seed = customerName.trim();
                          setCreateBuyerForm((prev) => ({
                            ...prev,
                            name: seed || prev.name,
                            businessName: seed || prev.businessName,
                          }));
                        }
                      }}
                    >
                      {showCreateBuyerForm ? 'Close account form' : 'Add vendor account'}
                    </button>
                    {showCreateBuyerForm ? (
                      <div className="admin-direct-sale-create-buyer__form">
                        <label className="admin-direct-sale-field">
                          <span>Vendor name</span>
                          <input
                            value={createBuyerForm.name}
                            onChange={(e) => setCreateBuyerForm((f) => ({ ...f, name: e.target.value }))}
                            maxLength={120}
                            required
                          />
                        </label>
                        <label className="admin-direct-sale-field">
                          <span>Business name</span>
                          <input
                            value={createBuyerForm.businessName}
                            onChange={(e) =>
                              setCreateBuyerForm((f) => ({ ...f, businessName: e.target.value }))
                            }
                            maxLength={160}
                            required
                          />
                        </label>
                        <label className="admin-direct-sale-field">
                          <span>Business city</span>
                          <BusinessLocationSelect
                            value={createBuyerForm.businessAddress}
                            onChange={(e) =>
                              setCreateBuyerForm((f) => ({ ...f, businessAddress: e.target.value }))
                            }
                            mode="required"
                          />
                        </label>
                        <label className="admin-direct-sale-field">
                          <span>Telephone</span>
                          <input
                            value={createBuyerForm.tel}
                            onChange={(e) => setCreateBuyerForm((f) => ({ ...f, tel: e.target.value }))}
                            placeholder="677184257"
                            maxLength={20}
                            required
                          />
                        </label>
                        <label className="admin-direct-sale-field">
                          <span>WhatsApp</span>
                          <input
                            value={createBuyerForm.whatsappNumber}
                            onChange={(e) =>
                              setCreateBuyerForm((f) => ({ ...f, whatsappNumber: e.target.value }))
                            }
                            placeholder="677184257"
                            maxLength={20}
                            required
                          />
                        </label>
                        <label className="admin-direct-sale-field">
                          <span>Password</span>
                          <input
                            type="password"
                            value={createBuyerForm.password}
                            onChange={(e) =>
                              setCreateBuyerForm((f) => ({ ...f, password: e.target.value }))
                            }
                            minLength={8}
                            required
                          />
                        </label>
                        <label className="admin-direct-sale-field">
                          <span>Email (optional)</span>
                          <input
                            type="email"
                            value={createBuyerForm.email}
                            onChange={(e) => setCreateBuyerForm((f) => ({ ...f, email: e.target.value }))}
                            maxLength={160}
                          />
                        </label>
                        {createBuyerErr ? (
                          <p className="admin-direct-sale-alert admin-direct-sale-alert--error">
                            {createBuyerErr}
                          </p>
                        ) : null}
                        <div className="admin-direct-sale-create-buyer__actions">
                          <button
                            type="button"
                            className="admin-direct-sale-btn admin-direct-sale-btn--primary"
                            disabled={creatingBuyer}
                            onClick={() => void handleCreateWholesalerSubmit()}
                          >
                            {creatingBuyer ? 'Creating…' : 'Create vendor'}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {isWholesale && buyerResults.length > 0 && showWholesaleMatches ? (
                  <ul className="admin-direct-sale-buyer-list">
                    {buyerResults.map((u) => {
                      const id = String(u?._id ?? u?.id ?? '').trim();
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            className="admin-direct-sale-buyer-option"
                            onClick={() => {
                              setSelectedBuyer(u);
                              setCustomerName(buyerLabel(u));
                              setBuyerResults([]);
                            }}
                          >
                            <strong>{u.name || '—'}</strong>
                            <span>{u.businessName || u.tel || id}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {isWholesale && selectedBuyer ? (
                  <p className="admin-direct-sale-alert admin-direct-sale-alert--ok">
                    Selected: {buyerLabel(selectedBuyer)}
                  </p>
                ) : null}
              </div>

              <div className="admin-direct-sale-section admin-direct-sale-section--purchase">
                <h4 className="admin-direct-sale-section__title">Sales</h4>

                {requireLocationAssignment ? (
                  <div className="admin-direct-sale-subsection admin-direct-sale-subsection--location">
                    <h5 className="admin-direct-sale-subsection__title">Assign sale to</h5>
                    <label className="admin-direct-sale-field">
                      <span>Shop</span>
                      <select
                        value={assignedLocationId}
                        onChange={(e) => {
                          setAssignedLocationId(e.target.value);
                          setAssignedHandledById(staffUserId || '');
                          setSaleRows([emptySaleUnitRow()]);
                          setImePickerRowId(null);
                          setReceiptPreview(null);
                          setFormErr('');
                        }}
                        disabled={locationsLoading}
                      >
                        <option value="">
                          {locationsLoading ? 'Loading shops…' : 'Select shop…'}
                        </option>
                        {subWarehouses.length > 0 ? (
                          <optgroup label="Shops">
                            {subWarehouses.map((w) => {
                              const id = warehouseId(w);
                              if (!id) return null;
                              return (
                                <option key={id} value={id}>
                                  {locationOptionLabel(w, 'shop')}
                                </option>
                              );
                            })}
                          </optgroup>
                        ) : null}
                      </select>
                    </label>
                    {locationsErr ? (
                      <p className="admin-direct-sale-alert admin-direct-sale-alert--error">{locationsErr}</p>
                    ) : null}
                    {!locationsLoading && !locationsErr && mainWarehouses.length === 0 && subWarehouses.length === 0 ? (
                      <p className="admin-direct-sale-hint">
                        No shops found. Add them under the Warehouses tab first.
                      </p>
                    ) : null}
                    {assignedLocation ? (
                      <p className="admin-direct-sale-alert admin-direct-sale-alert--ok">
                        Sale will be assigned to{' '}
                        <strong>{locationOptionLabel(assignedLocation)}</strong>
                      </p>
                    ) : null}
                    {assignedLocation ? (
                      <label className="admin-direct-sale-field">
                        <span>Salesperson</span>
                        <select
                          value={assignedHandledById}
                          onChange={(e) => setAssignedHandledById(e.target.value)}
                          disabled={staffOptionsLoading || assignableStaffOptions.length === 0}
                        >
                          {assignableStaffOptions.length === 0 ? (
                            <option value={staffUserId || ''}>
                              {staffOptionsLoading ? 'Loading staff…' : 'No salesperson assigned to this shop'}
                            </option>
                          ) : null}
                          {assignableStaffOptions.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                ) : null}

                <div className="admin-direct-sale-subsection">
                  <h5 className="admin-direct-sale-subsection__title">Quantity</h5>
                  <p className="admin-direct-sale-hint">
                    {shopOnlyMode
                      ? `${inStockCount} product${inStockCount === 1 ? '' : 's'} in shop inventory with stock.`
                      : `${inStockCount} products with stock available.`}
                  </p>
                  {shopOnlyMode && inStockCount === 0 ? (
                    <p className="admin-direct-sale-alert admin-direct-sale-alert--error">
                      No stock at this shop right now. Use Dashboard → General inventory to request products.
                    </p>
                  ) : null}
                  {renderPhoneRowsTable()}
                </div>
              </div>

              <div className="admin-direct-sale-actions">
                <label className="admin-direct-sale-field admin-direct-sale-field--payment-last">
                  <span>Transaction method</span>
                  <select
                    value={paymentMethod}
                    onChange={(e) => {
                      setPaymentMethod(e.target.value);
                      setFormErr('');
                    }}
                  >
                    {paymentOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="admin-direct-sale-btn admin-direct-sale-btn--ghost"
                  onClick={() => setStep('start')}
                >
                  Back
                </button>
                {isWholesale ? (
                  <button
                    type="button"
                    className="admin-direct-sale-btn admin-direct-sale-btn--primary"
                    disabled={
                      !readyRowCount ||
                      previewLoading ||
                      (requireLocationAssignment && (!assignedLocationId || !assignedHandledById))
                    }
                    onClick={() => loadReceiptPreview()}
                  >
                    {previewLoading ? 'Preparing receipt…' : 'Continue to receipt'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="admin-direct-sale-btn admin-direct-sale-btn--primary"
                    disabled={
                      !readyRowCount ||
                      (requireLocationAssignment && (!assignedLocationId || !assignedHandledById))
                    }
                    onClick={() => proceedRetailToReceipt()}
                  >
                    Proceed to receipt
                  </button>
                )}
              </div>
            </form>
          ) : null}

          {step === 'receipt' ? (
            <div className="admin-direct-sale-step">
              <div className="admin-direct-sale-step-head">
                <h3>Receipt</h3>
                <button
                  type="button"
                  className="admin-direct-sale-link-btn"
                  onClick={() => setStep('purchase')}
                >
                  Back to sales
                </button>
              </div>

              <article className="admin-direct-sale-receipt">
                <header className="admin-direct-sale-receipt__head">
                  <p className="admin-direct-sale-receipt__brand">Wache Electronics</p>
                  <h4>{isWholesale ? 'Direct vendor sale receipt' : 'Direct retail sale receipt'}</h4>
                  <p className="admin-direct-sale-receipt__meta">
                    {new Date().toLocaleString('fr-CM')}
                  </p>
                </header>

                <div className="admin-direct-sale-receipt__party">
                  <p>
                    <span>Customer</span>
                    <strong>{customerName.trim()}</strong>
                  </p>
                  {!isWholesale && customerPhone.trim() ? (
                    <p>
                      <span>Phone</span>
                      <strong>{formatRetailPhoneDisplay(customerPhone)}</strong>
                    </p>
                  ) : null}
                  {!isWholesale && customerEmail.trim() ? (
                    <p>
                      <span>Email</span>
                      <strong>{customerEmail.trim()}</strong>
                    </p>
                  ) : null}
                  {isWholesale ? (
                    <p>
                      <span>Vendor account</span>
                      <strong>{buyerLabel(selectedBuyer)}</strong>
                    </p>
                  ) : null}
                  <p>
                    <span>Transaction method</span>
                    <strong>{labelForMethod(paymentMethod)}</strong>
                  </p>
                  {requireLocationAssignment && assignedLocation ? (
                    <p>
                      <span>Assigned to</span>
                      <strong>{locationOptionLabel(assignedLocation)}</strong>
                    </p>
                  ) : null}
                </div>

                <div className="admin-direct-sale-receipt__lines">
                  <h5>Line items</h5>
                  <div className="sales-table-wrap">
                    <table className="sales-table admin-direct-sale-receipt-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Qty</th>
                          <th className="fit-numeric-cell">Unit price</th>
                          <th className="fit-numeric-cell">Line total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(receiptPreview?.lines || purchaseLines).map((line, idx) => {
                          const qty = lineUnitCount(line);
                          return (
                          <tr key={line.id || `${line.productId}-${idx}`}>
                            <td>
                              {line.productName}
                              {line.brand ? ` · ${line.brand}` : ''}
                            </td>
                            <td>{qty}</td>
                            <td className="fit-numeric-cell">
                              <MoneyXaf value={line.unitPrice} />
                            </td>
                            <td className="fit-numeric-cell">
                              <MoneyXaf value={line.lineTotal ?? (line.unitPrice || 0) * qty} />
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="admin-direct-sale-receipt__units">
                  <h5>Units & IME codes</h5>
                  {renderUnitTable(receiptUnits, {
                    editable: true,
                    onRemoveRow: (row) => {
                      if (row.rowId) removeSaleRow(row.rowId);
                    },
                    onAddRow: null,
                  })}
                  {!cartUnits.length ? (
                    <p className="admin-direct-sale-hint">
                      All units were removed. Go back to sales to add products.
                    </p>
                  ) : null}
                </div>

                <footer className="admin-direct-sale-receipt__total">
                  <span>Amount due</span>
                  <strong>
                    <MoneyXaf value={receiptTotal} />
                  </strong>
                </footer>
              </article>

              <div className="admin-direct-sale-actions">
                <button
                  type="button"
                  className="admin-direct-sale-btn admin-direct-sale-btn--ghost"
                  onClick={handleDownloadReceipt}
                >
                  Download receipt
                </button>
                <button
                  type="button"
                  className="admin-direct-sale-btn admin-direct-sale-btn--ghost"
                  onClick={() => handlePrintReceipt()}
                >
                  Print receipt
                </button>
                <button
                  type="button"
                  className="admin-direct-sale-btn admin-direct-sale-btn--primary"
                  disabled={submitting || !cartUnits.length}
                  onClick={() => (isWholesale ? handleWholesaleConfirm() : performRetailConfirm())}
                >
                  {submitting
                    ? 'Confirming…'
                    : isWholesale
                      ? 'Accept sale & mark IMEs sold out'
                      : 'Confirm retail sale'}
                </button>
              </div>
            </div>
          ) : null}
          </>
          )}
          </>
          ) : null}
        </section>
      ) : null}

      <DirectSaleImePickerModal
        open={Boolean(imePickerRowId)}
        onClose={() => setImePickerRowId(null)}
        onApply={(imes) => {
          if (imePickerRowId) applyRowImeSelection(imePickerRowId, imes);
        }}
        row={imePickerRow}
        product={imePickerProduct}
        saleRows={saleRows}
        imeColorByCode={imePickerColorByCode}
      />
    </div>
  );
}
