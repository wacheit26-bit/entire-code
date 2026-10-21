import { useCallback, useEffect, useMemo, useState } from 'react';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import { fetchWarehouses, fetchWarehouseProducts, warehouseId } from '../../api/warehouseApi';
import useAdminAccountRegion from '../../hooks/useAdminAccountRegion';
import {
  createStockRequest,
  fetchStockRequests,
  fetchWarehouseHub,
  fetchWarehouseIncoming,
  fetchWarehouseReadyToTransfer,
  lookupWarehouseByIme,
  receiveStockAtWarehouse,
  transferToShop,
  transferToWarehouse,
  updateStockRequest,
} from '../../api/warehouseHubApi';
import { notifyProductCatalogUpdated } from '../../utils/productCatalogEvents';
import { isUsaWarehouseCity } from '../../utils/warehouseDisplay';
import { bulkBatchTravelRoute, isProductTravelling } from '../../utils/productTravelRoute';
import ProductTravelRoute from '../shared/ProductTravelRoute';
import { downloadShopTransferImeList } from '../../utils/shopTransferImeExport';
import {
  filterShopTransferInventory,
  shopTransferBatchEntry,
  shopTransferBatchKey,
  shopTransferCapacityOptions,
  shopTransferProductNames,
  shopTransferUnitRows,
  countShopInventoryTableRows,
} from '../../utils/shopTransferProducts';
import { buildTransferImeManifest, normalizedImeList, countInventoryUnits, productLineUnitCount, inventoryRowUnitCount } from '../../utils/productIme';
import { mergeInventoryProducts } from '../../utils/mergeInventoryProducts';
import ShopTransferBatchPicker from './ShopTransferBatchPicker';
import WarehouseProductsModal from './WarehouseProductsModal';
import UsaWarehouseInventoryTable from './UsaWarehouseInventoryTable';
import AddInventoryPanel from './AddInventoryPanel';
import './WarehouseDashboard.css';
import './WarehouseHub.css';
import './ShopTransferBatchPicker.css';
import '../shared/ProductTravelRoute.css';

export default function WarehouseHub({ warehouse, onBack }) {
  const axiosPrivate = useAxiosPrivate();
  const whId = warehouseId(warehouse);

  const [hub, setHub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState('menu');
  const [message, setMessage] = useState('');
  const [errMsg, setErrMsg] = useState('');

  const [incoming, setIncoming] = useState(null);
  const [incomingLoading, setIncomingLoading] = useState(false);
  const [readyTransfer, setReadyTransfer] = useState(null);
  const [readyLoading, setReadyLoading] = useState(false);
  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);

  const [transferShopId, setTransferShopId] = useState('');
  const [transferMainId, setTransferMainId] = useState('');
  const [transferWarehouseProductId, setTransferWarehouseProductId] = useState('');
  const [transferWarehouseQty, setTransferWarehouseQty] = useState('');
  const [warehouseTransferProductName, setWarehouseTransferProductName] = useState('');
  const [warehouseTransferCapacity, setWarehouseTransferCapacity] = useState('');
  const [warehouseTransferCheckedKeys, setWarehouseTransferCheckedKeys] = useState([]);
  const [mainWarehouseOptions, setMainWarehouseOptions] = useState([]);
  const [mainWarehousesLoading, setMainWarehousesLoading] = useState(false);
  const [savedTransferBatch, setSavedTransferBatch] = useState([]);
  const [transferring, setTransferring] = useState(false);
  const [receivingBatch, setReceivingBatch] = useState('');
  const [receiving, setReceiving] = useState(false);
  const [selectedIncomingProductIds, setSelectedIncomingProductIds] = useState([]);

  const [requestForm, setRequestForm] = useState({
    productName: '',
    brand: '',
    capacity: '',
    color: '',
    quantity: 1,
    notes: '',
  });
  const [submittingRequest, setSubmittingRequest] = useState(false);

  const [viewStockOpen, setViewStockOpen] = useState(false);
  const [usaCatalog, setUsaCatalog] = useState(null);
  const [usaCatalogLoading, setUsaCatalogLoading] = useState(false);
  const [requestMainId, setRequestMainId] = useState('');
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupResults, setLookupResults] = useState([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupSearched, setLookupSearched] = useState(false);
  const [locationInventory, setLocationInventory] = useState(null);
  const [locationInventoryLoading, setLocationInventoryLoading] = useState(false);

  const { isUsaAccount, isCameroonAccount } = useAdminAccountRegion();

  const loadHub = useCallback(async () => {
    if (!whId) return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchWarehouseHub(axiosPrivate, whId);
      setHub(data);
    } catch (err) {
      setHub(null);
      setError(err?.response?.data?.message || err?.message || 'Failed to load warehouse.');
    } finally {
      setLoading(false);
    }
  }, [axiosPrivate, whId]);

  useEffect(() => {
    loadHub();
  }, [loadHub]);

  const loadLocationInventory = useCallback(async () => {
    if (!whId) return;
    setLocationInventoryLoading(true);
    try {
      const data = await fetchWarehouseProducts(axiosPrivate, whId);
      setLocationInventory(data);
    } catch {
      setLocationInventory({ products: [], totalProducts: 0, totalStock: 0 });
    } finally {
      setLocationInventoryLoading(false);
    }
  }, [axiosPrivate, whId]);

  useEffect(() => {
    if (!whId || loading || error) return;
    loadLocationInventory();
  }, [whId, loading, error, loadLocationInventory]);

  const loadIncoming = useCallback(async () => {
    if (!whId) return;
    setIncomingLoading(true);
    setErrMsg('');
    try {
      const data = await fetchWarehouseIncoming(axiosPrivate, whId);
      setIncoming(data);
    } catch (err) {
      setIncoming(null);
      setErrMsg(err?.response?.data?.message || err?.message || 'Failed to load incoming stock.');
    } finally {
      setIncomingLoading(false);
    }
  }, [axiosPrivate, whId]);

  const loadReadyTransfer = useCallback(async () => {
    if (!whId) return;
    const fromShop = hub?.isShop ?? String(warehouse?.type || '').toLowerCase() === 'sub';
    setReadyLoading(true);
    setErrMsg('');
    try {
      if (fromShop) {
        const data = await fetchWarehouseProducts(axiosPrivate, whId);
        const products = filterShopTransferInventory(data?.products || []);
        setReadyTransfer({ products, batches: [], count: products.length });
      } else {
        const data = await fetchWarehouseReadyToTransfer(axiosPrivate, whId);
        setReadyTransfer(data);
      }
    } catch (err) {
      setReadyTransfer(null);
      setErrMsg(err?.response?.data?.message || err?.message || 'Failed to load stock.');
    } finally {
      setReadyLoading(false);
    }
  }, [axiosPrivate, whId, hub?.isShop, warehouse?.type]);

  const loadUsaCatalog = useCallback(async () => {
    if (!whId) return;
    setUsaCatalogLoading(true);
    setErrMsg('');
    try {
      const data = await fetchWarehouseProducts(axiosPrivate, whId);
      setUsaCatalog(data);
    } catch (err) {
      setUsaCatalog(null);
      setErrMsg(err?.response?.data?.message || err?.message || 'Failed to load USA inventory.');
    } finally {
      setUsaCatalogLoading(false);
    }
  }, [axiosPrivate, whId]);

  const loadMainWarehouses = useCallback(async () => {
    setMainWarehousesLoading(true);
    try {
      const data = await fetchWarehouses(axiosPrivate);
      const mains = Array.isArray(data.mainWarehouses) ? data.mainWarehouses : [];
      const sourceIsShop = hub?.isShop ?? String(warehouse?.type || '').toLowerCase() === 'sub';
      const regionalMains = mains.filter(
        (m) => warehouseId(m) !== whId && !isUsaWarehouseCity(m.city),
      );
      const options = sourceIsShop ? regionalMains : mains.filter((m) => warehouseId(m) !== whId);
      setMainWarehouseOptions(options);
      if (sourceIsShop) {
        const preferredMainId = warehouseId(hub?.parentMain);
        setTransferMainId((prev) => prev || preferredMainId || (options[0] ? warehouseId(options[0]) : ''));
      }
      setRequestMainId((prev) => prev || (regionalMains[0] ? warehouseId(regionalMains[0]) : ''));
    } catch {
      setMainWarehouseOptions([]);
    } finally {
      setMainWarehousesLoading(false);
    }
  }, [axiosPrivate, whId, hub?.isShop, hub?.parentMain, warehouse?.type]);

  const loadRequests = useCallback(async () => {
    if (!whId) return;
    setRequestsLoading(true);
    setErrMsg('');
    try {
      const data = await fetchStockRequests(axiosPrivate, whId);
      setRequests(data);
    } catch (err) {
      setRequests([]);
      setErrMsg(err?.response?.data?.message || err?.message || 'Failed to load requests.');
    } finally {
      setRequestsLoading(false);
    }
  }, [axiosPrivate, whId]);

  const openPanel = (name) => {
    setPanel(name);
    setMessage('');
    setErrMsg('');
    setSavedTransferBatch([]);
    setWarehouseTransferProductName('');
    setWarehouseTransferCapacity('');
    setWarehouseTransferCheckedKeys([]);
    setSelectedIncomingProductIds([]);
    if (name === 'lookup') {
      setLookupResults([]);
      setLookupSearched(false);
      setLookupQuery('');
    }
    if (name === 'incoming') loadIncoming();
    if (name === 'transfer' || name === 'send-warehouse') loadReadyTransfer();
    if (name === 'send-warehouse') loadMainWarehouses();
    if (name === 'requests' || name === 'usa-catalog') {
      if (isUsaWarehouseCity(warehouse?.city ?? hub?.warehouse?.city)) loadMainWarehouses();
    }
    if (name === 'usa-catalog') loadUsaCatalog();
    if (name === 'requests') loadRequests();
  };

  const runImeLookup = async (e) => {
    e?.preventDefault();
    const q = lookupQuery.trim();
    if (q.length < 3) {
      setErrMsg('Enter at least 3 characters of the IME.');
      return;
    }
    setLookupLoading(true);
    setErrMsg('');
    setMessage('');
    try {
      const data = await lookupWarehouseByIme(axiosPrivate, whId, q);
      setLookupResults(Array.isArray(data?.results) ? data.results : []);
      setLookupSearched(true);
    } catch (err) {
      setLookupResults([]);
      setLookupSearched(true);
      setErrMsg(err?.response?.data?.message || err?.message || 'Lookup failed.');
    } finally {
      setLookupLoading(false);
    }
  };

  const runTransfer = async ({ batchCode, productIds, productId, quantity, transferItems }) => {
    if (!transferShopId) {
      setErrMsg('Select a destination Shop.');
      return;
    }
    if (
      !batchCode &&
      !productId &&
      (!productIds || productIds.length === 0) &&
      (!transferItems || transferItems.length === 0)
    ) {
      setErrMsg('Select units to transfer.');
      return;
    }
    if (!whId) {
      setErrMsg('Warehouse not loaded.');
      return;
    }

    const qtyNum = quantity != null && String(quantity).trim() !== '' ? parseInt(quantity, 10) : null;
    if (qtyNum != null && (!Number.isFinite(qtyNum) || qtyNum < 1)) {
      setErrMsg('Quantity must be at least 1.');
      return;
    }

    setTransferring(true);
    setErrMsg('');
    setMessage('');
    try {
      const payload = { destinationSubWarehouse: transferShopId };
      if (batchCode) payload.batchCode = batchCode;
      if (productId) payload.productId = productId;
      if (productIds?.length) payload.productIds = productIds;
      if (transferItems?.length) payload.transferItems = transferItems;
      if (qtyNum != null) payload.quantity = qtyNum;

      const result = await transferToShop(axiosPrivate, whId, payload);
      const manifest = Array.isArray(result?.imeManifest) ? result.imeManifest : [];
      const selectedShop = shops.find((s) => warehouseId(s) === transferShopId);
      const shopName = result?.shop?.name || selectedShop?.name || 'Shop';
      const sourceName = warehouse?.name || hub?.warehouse?.name || (hub?.isShop ? 'Shop' : 'Warehouse');

      if (manifest.length > 0) {
        downloadShopTransferImeList({
          shopName,
          warehouseName: sourceName,
          manifest,
          fileNameBase: `shop-transfer-imes-${shopName}-${new Date().toISOString().slice(0, 10)}`,
        });
      }

      setMessage(
        result?.message ||
          `Stock sent to Shop. Location updated to ${result?.phoneLocation || result?.city || 'Shop region'}.` +
            (manifest.length > 0
              ? ` IME list downloaded (${manifest.length}).`
              : ' No registered IME codes on the transferred units.'),
      );
      setSavedTransferBatch([]);
      notifyProductCatalogUpdated();
      await loadHub();
      await loadReadyTransfer();
    } catch (err) {
      setErrMsg(err?.response?.data?.message || err?.message || 'Transfer failed.');
    } finally {
      setTransferring(false);
    }
  };

  const runTransferToWarehouse = async ({
    batchCode,
    productIds,
    productId,
    quantity,
    transferItems,
  }) => {
    if (!transferMainId) {
      setErrMsg('Select a destination warehouse.');
      return;
    }
    if (
      !batchCode &&
      !productId &&
      (!productIds || productIds.length === 0) &&
      (!transferItems || transferItems.length === 0)
    ) {
      setErrMsg('Select a product.');
      return;
    }
    if (!whId) {
      setErrMsg('Source location not loaded.');
      return;
    }

    const qtyNum = quantity != null && String(quantity).trim() !== '' ? parseInt(quantity, 10) : null;
    if (qtyNum != null && (!Number.isFinite(qtyNum) || qtyNum < 1)) {
      setErrMsg('Quantity must be at least 1.');
      return;
    }

    setTransferring(true);
    setErrMsg('');
    setMessage('');
    try {
      const payload = { destinationMainWarehouse: transferMainId };
      if (batchCode) payload.batchCode = batchCode;
      if (productId) payload.productId = productId;
      if (productIds?.length) payload.productIds = productIds;
      if (transferItems?.length) payload.transferItems = transferItems;
      if (qtyNum != null) payload.quantity = qtyNum;

      const result = await transferToWarehouse(axiosPrivate, whId, payload);
      const manifest = Array.isArray(result?.imeManifest) ? result.imeManifest : [];
      const destWarehouse =
        mainWarehouseOptions.find((m) => warehouseId(m) === transferMainId) ||
        result?.destination;

      if (manifest.length > 0) {
        downloadShopTransferImeList({
          shopName: destWarehouse?.name || 'Warehouse',
          warehouseName: warehouse?.name || hub?.warehouse?.name || 'USA Warehouse',
          manifest,
          fileNameBase: `warehouse-transfer-imes-${destWarehouse?.name || 'dest'}-${new Date().toISOString().slice(0, 10)}`,
        });
      }

      setMessage(
        (result?.message || 'Stock sent to warehouse.') +
          (manifest.length > 0
            ? ` IME list downloaded (${manifest.length}).`
            : ' No registered IME codes on the transferred units.'),
      );
      setWarehouseTransferCheckedKeys([]);
      setWarehouseTransferProductName('');
      setWarehouseTransferCapacity('');
      setTransferWarehouseProductId('');
      setTransferWarehouseQty('');
      setSavedTransferBatch([]);
      notifyProductCatalogUpdated();
      await loadHub();
      await loadReadyTransfer();
    } catch (err) {
      setErrMsg(err?.response?.data?.message || err?.message || 'Transfer failed.');
    } finally {
      setTransferring(false);
    }
  };

  const runSendToWarehouse = async () => {
    if (!transferMainId) {
      setErrMsg('Select a destination warehouse.');
      return;
    }
    if (isShop || canManageUsaWarehouse) {
      const transferItems = savedTransferBatch.map((row) => ({
        productId: row.productId,
        ...(row.ime ? { ime: row.ime } : {}),
      }));
      if (!transferItems.length) {
        setErrMsg('Add at least one unit to the saved transfer batch.');
        return;
      }
      await runTransferToWarehouse({ transferItems });
      return;
    }
    if (!transferWarehouseProductId) {
      setErrMsg('Select a product.');
      return;
    }
    const qtyNum = parseInt(transferWarehouseQty, 10);
    if (!Number.isFinite(qtyNum) || qtyNum < 1) {
      setErrMsg('Enter a valid quantity.');
      return;
    }

    const selectedProduct = readyProducts.find(
      (p) => String(p._id) === String(transferWarehouseProductId),
    );
    if (!selectedProduct) {
      setErrMsg('Selected product is no longer available.');
      return;
    }

    const maxStock = Math.max(0, Number(selectedProduct.stock) || 0);
    const registeredImes = normalizedImeList(selectedProduct);
    const maxQty = registeredImes.length > 0 ? Math.min(maxStock, registeredImes.length) : maxStock;

    if (qtyNum > maxQty) {
      setErrMsg(`Maximum ${maxQty} unit(s) available for this product line.`);
      return;
    }

    await runTransferToWarehouse({
      productId: transferWarehouseProductId,
      quantity: qtyNum,
    });
  };

  const handleReceiveBatch = async (batchCode) => {
    const code = String(batchCode || receivingBatch || '').trim();
    if (!code) {
      setErrMsg('Enter or select a batch code.');
      return;
    }
    setReceiving(true);
    setErrMsg('');
    setMessage('');
    try {
      const result = await receiveStockAtWarehouse(axiosPrivate, whId, { batchCode: code });
      setMessage(result?.message || 'Stock marked as received.');
      notifyProductCatalogUpdated();
      await loadHub();
      await loadIncoming();
      if (panel === 'transfer' || panel === 'send-warehouse') await loadReadyTransfer();
    } catch (err) {
      setErrMsg(err?.response?.data?.message || err?.message || 'Could not update travelling status.');
    } finally {
      setReceiving(false);
    }
  };

  const handleReceiveProducts = async (productIds) => {
    const ids = (Array.isArray(productIds) ? productIds : [productIds])
      .map((id) => String(id || '').trim())
      .filter(Boolean);
    if (!ids.length) {
      setErrMsg('Select at least one product to mark as received.');
      return;
    }
    setReceiving(true);
    setErrMsg('');
    setMessage('');
    try {
      const result = await receiveStockAtWarehouse(axiosPrivate, whId, { productIds: ids });
      setMessage(result?.message || `${ids.length} product(s) marked as received.`);
      setSelectedIncomingProductIds([]);
      notifyProductCatalogUpdated();
      await loadHub();
      await loadIncoming();
      if (panel === 'transfer' || panel === 'send-warehouse') await loadReadyTransfer();
    } catch (err) {
      setErrMsg(err?.response?.data?.message || err?.message || 'Could not update status.');
    } finally {
      setReceiving(false);
    }
  };

  const handleReceiveProduct = async (productId) => {
    await handleReceiveProducts([productId]);
  };

  const sendSavedTransferBatch = () => {
    const transferItems = savedTransferBatch.map((row) => ({
      productId: row.productId,
      ...(row.ime ? { ime: row.ime } : {}),
    }));
    if (!transferItems.length) {
      setErrMsg('Add at least one unit to the saved transfer batch.');
      return;
    }
    runTransfer({ transferItems });
  };

  const handleRequestSubmit = async (e) => {
    e.preventDefault();
    setSubmittingRequest(true);
    setErrMsg('');
    setMessage('');
    try {
      const payload = { ...requestForm };
      if (isUsaWarehouse && isCameroonAccount) {
        if (!requestMainId) {
          setErrMsg('Select your regional warehouse making this request.');
          setSubmittingRequest(false);
          return;
        }
        payload.requestingMain = requestMainId;
        await createStockRequest(axiosPrivate, whId, payload);
        setMessage('Request sent to the USA warehouse.');
      } else if (isMain && !isUsaWarehouse && isCameroonAccount) {
        await createStockRequest(axiosPrivate, whId, payload);
        setMessage('Request sent to the USA warehouse.');
      } else {
        await createStockRequest(axiosPrivate, whId, payload);
        setMessage('Request sent to the main warehouse.');
      }
      setRequestForm({
        productName: '',
        brand: '',
        capacity: '',
        color: '',
        quantity: 1,
        notes: '',
      });
      await loadRequests();
      await loadHub();
    } catch (err) {
      setErrMsg(err?.response?.data?.message || err?.message || 'Could not send request.');
    } finally {
      setSubmittingRequest(false);
    }
  };

  const resolveRequest = async (requestId, status) => {
    setErrMsg('');
    setMessage('');
    try {
      await updateStockRequest(axiosPrivate, requestId, { status });
      setMessage(`Request ${status}.`);
      await loadRequests();
      await loadHub();
    } catch (err) {
      setErrMsg(err?.response?.data?.message || err?.message || 'Update failed.');
    }
  };

  const stats = hub?.stats || {};
  const shops = hub?.shops || [];
  const isMain = hub?.isMain;
  const isShop = hub?.isShop;
  const assignedSalesCount = stats.assignedSalespeopleCount ?? 0;
  const propIsMain = String(warehouse?.type || '').toLowerCase() === 'main';
  const displayIsMain = hub != null ? isMain : propIsMain;
  const displayIsShop = hub != null ? isShop : !propIsMain;
  const noSalespersonAssigned = displayIsShop && hub && assignedSalesCount === 0;
  const readyProducts = readyTransfer?.products || [];
  const warehouseCity = hub?.warehouse?.city ?? warehouse?.city;
  const isUsaWarehouse = isUsaWarehouseCity(warehouseCity);
  const canManageUsaWarehouse = isUsaWarehouse && isUsaAccount;
  const cameroonUsaView = isUsaWarehouse && isCameroonAccount;
  const regionalMainOptions = mainWarehouseOptions.filter((m) => !isUsaWarehouseCity(m.city));

  const incomingProducts = useMemo(
    () => (Array.isArray(incoming?.products) ? incoming.products : []),
    [incoming],
  );

  const toggleIncomingProduct = (productId) => {
    const id = String(productId || '').trim();
    if (!id) return;
    setSelectedIncomingProductIds((prev) =>
      prev.includes(id) ? prev.filter((rowId) => rowId !== id) : [...prev, id],
    );
  };

  const toggleAllIncomingProducts = () => {
    const allIds = incomingProducts.map((p) => String(p._id || '')).filter(Boolean);
    setSelectedIncomingProductIds((prev) => (prev.length === allIds.length ? [] : allIds));
  };

  const selectedWarehouseTransferProduct = useMemo(
    () =>
      readyProducts.find((p) => String(p._id) === String(transferWarehouseProductId)) || null,
    [readyProducts, transferWarehouseProductId],
  );

  const warehouseTransferQtyNum = useMemo(() => {
    const n = parseInt(transferWarehouseQty, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [transferWarehouseQty]);

  const warehouseTransferMaxQty = useMemo(() => {
    if (!selectedWarehouseTransferProduct) return 0;
    const stock = Math.max(0, Number(selectedWarehouseTransferProduct.stock) || 0);
    const imeCount = normalizedImeList(selectedWarehouseTransferProduct).length;
    return imeCount > 0 ? Math.min(stock, imeCount) : stock;
  }, [selectedWarehouseTransferProduct]);

  const warehouseTransferImePreview = useMemo(() => {
    if (!selectedWarehouseTransferProduct || warehouseTransferQtyNum < 1) return [];
    return buildTransferImeManifest(selectedWarehouseTransferProduct, warehouseTransferQtyNum);
  }, [selectedWarehouseTransferProduct, warehouseTransferQtyNum]);

  const warehouseTransferNameOptions = useMemo(
    () => shopTransferProductNames(readyProducts),
    [readyProducts],
  );
  const warehouseTransferCapacityOptions = useMemo(
    () => shopTransferCapacityOptions(readyProducts, warehouseTransferProductName),
    [readyProducts, warehouseTransferProductName],
  );
  const warehouseTransferUnitRows = useMemo(() => {
    const rows = shopTransferUnitRows(
      readyProducts,
      warehouseTransferProductName,
      warehouseTransferCapacity,
    );
    if (canManageUsaWarehouse && !isShop) {
      return rows.filter((row) => Boolean(String(row.ime || '').trim()));
    }
    return rows;
  }, [
    readyProducts,
    warehouseTransferProductName,
    warehouseTransferCapacity,
    canManageUsaWarehouse,
    isShop,
  ]);

  const showWarehouseTransferPicker =
    Boolean(transferMainId) && (canManageUsaWarehouse || (isShop && warehouseTransferProductName));
  const savedWarehouseBatchKeySet = useMemo(
    () => new Set(savedTransferBatch.map((row) => shopTransferBatchKey(row))),
    [savedTransferBatch],
  );

  const toggleWarehouseTransferChecked = (rowKey) => {
    const key = String(rowKey || '');
    if (!key) return;
    setWarehouseTransferCheckedKeys((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key],
    );
  };

  const addCheckedWarehouseUnitsToBatch = () => {
    const toAdd = warehouseTransferUnitRows
      .filter(
        (row) =>
          warehouseTransferCheckedKeys.includes(row.rowKey) &&
          !savedWarehouseBatchKeySet.has(shopTransferBatchKey(row)),
      )
      .map(shopTransferBatchEntry)
      .filter(Boolean);
    if (!toAdd.length) return;
    setSavedTransferBatch((prev) => [...prev, ...toAdd]);
    setWarehouseTransferCheckedKeys([]);
  };

  const removeWarehouseBatchRow = (rowKey) => {
    const key = String(rowKey || '');
    setSavedTransferBatch((prev) => prev.filter((row) => shopTransferBatchKey(row) !== key));
  };

  const canSendToWarehouse =
    Boolean(transferMainId) &&
    (isShop || canManageUsaWarehouse
      ? savedTransferBatch.length > 0
      : Boolean(transferWarehouseProductId) &&
        warehouseTransferQtyNum >= 1 &&
        warehouseTransferQtyNum <= warehouseTransferMaxQty);
  const canOpenSendToWarehousePanel = canManageUsaWarehouse || (isShop && !isUsaWarehouse);

  const usaSendBatchCount = Number(stats.readyToTransferBatchCount) || 0;
  const readyToSendUnits = Number(stats.readyToTransferUnitCount) || 0;
  const unitsAtLocation = Number(stats.availableUnitCount) || 0;

  const locationOnHandProducts = useMemo(() => {
    const list = Array.isArray(locationInventory?.products) ? locationInventory.products : [];
    if (displayIsShop) return filterShopTransferInventory(list);
    return list.filter((p) => !isProductTravelling(p) && productLineUnitCount(p) > 0);
  }, [locationInventory?.products, displayIsShop]);

  const locationInventorySummary = useMemo(() => {
    const unitsFromRows = countInventoryUnits(locationOnHandProducts);
    const units =
      locationInventory?.onHandUnitCount != null &&
      Number.isFinite(Number(locationInventory.onHandUnitCount))
        ? Number(locationInventory.onHandUnitCount)
        : unitsFromRows || unitsAtLocation;

    let productCount;
    if (displayIsShop) {
      productCount = countShopInventoryTableRows(locationInventory?.products || []);
    } else {
      productCount =
        locationInventory?.onHandProductCount != null &&
        Number.isFinite(Number(locationInventory.onHandProductCount))
          ? Number(locationInventory.onHandProductCount)
          : Number(stats.onHandProductCount) || 0;
      if (!productCount && locationOnHandProducts.length) {
        productCount = mergeInventoryProducts(locationOnHandProducts).filter(
          (row) => inventoryRowUnitCount(row) > 0,
        ).length;
      }
    }

    return { productCount, units };
  }, [
    locationOnHandProducts,
    locationInventory?.onHandProductCount,
    locationInventory?.onHandUnitCount,
    stats.onHandProductCount,
    unitsAtLocation,
    displayIsShop,
  ]);

  const usaInventoryUnitCount = useMemo(() => {
    if (unitsAtLocation > 0) return unitsAtLocation;
    const products = Array.isArray(locationInventory?.products) ? locationInventory.products : null;
    if (products) {
      return countInventoryUnits(locationOnHandProducts);
    }
    return Number(stats.inventoryUnitCount) || 0;
  }, [locationInventory, locationOnHandProducts, stats.inventoryUnitCount, unitsAtLocation]);

  return (
    <div className="wh-dash-wrap warehouse-hub">
      {viewStockOpen ? (
        <WarehouseProductsModal warehouse={warehouse} onClose={() => setViewStockOpen(false)} />
      ) : null}

      <section className="wh-panel warehouse-hub__top">
        <button type="button" className="warehouse-hub__back" onClick={onBack}>
          ← All locations
        </button>
        <h2 className="warehouse-hub__title">{warehouse?.name}</h2>
        <p className="warehouse-hub__subtitle">
          {warehouse?.city || 'Other'}
          {warehouse?.address ? ` · ${warehouse.address}` : ''}
          {displayIsMain
            ? ` · Regional main Warehouse${hub ? ` · ${stats.shopCount ?? 0} linked Shop${(stats.shopCount ?? 0) === 1 ? '' : 's'}` : ''}`
            : ` · Retail Shop${hub && assignedSalesCount > 0 ? ` · ${assignedSalesCount} salesperson${assignedSalesCount === 1 ? '' : 's'}` : ''}`}
        </p>
      </section>

      {loading ? <p className="wh-empty">Loading…</p> : null}
      {error ? <p className="wh-error">{error}</p> : null}

      {!loading && !error && hub && panel === 'menu' ? (
        <>
          {noSalespersonAssigned ? (
            <div className="warehouse-hub__notice" role="alert">
              <strong>No salesperson assigned to this Shop</strong>
              <p>
                Retail orders for this location will not reach a salesperson until you assign one in the{' '}
                <strong>Staff</strong> tab (Manage Shops).
              </p>
            </div>
          ) : null}
          {displayIsMain && hub && (stats.shopCount ?? 0) === 0 ? (
            <div className="warehouse-hub__notice warehouse-hub__notice--info" role="status">
              <strong>0 Shops linked to this Warehouse</strong>
              <p>
                Shops can exist in any town without a Warehouse link. Use <strong>Send to Shop</strong> only
                for Shops still linked to this main hub.
              </p>
            </div>
          ) : null}
        <section className="warehouse-hub__actions">
          {cameroonUsaView ? (
            <>
              <button type="button" className="warehouse-hub__action-card" onClick={() => openPanel('usa-catalog')}>
                <h4>USA inventory</h4>
                <p>Browse all products currently at the USA warehouse.</p>
                <span className="warehouse-hub__action-count">{stats.arrivedCount + stats.travellingCount} products</span>
              </button>
              <button type="button" className="warehouse-hub__action-card" onClick={() => openPanel('requests')}>
                <h4>Request from USA</h4>
                <p>Ask the USA warehouse to send stock to your regional main warehouse.</p>
              </button>
            </>
          ) : (
            <>
          {canManageUsaWarehouse || !isUsaWarehouse ? (
          <button type="button" className="warehouse-hub__action-card" onClick={() => openPanel('incoming')}>
            <h4>Receive incoming stock</h4>
            <p>
              Confirm stock sent from another warehouse or shop. Uploads are on hand immediately — no
              receive step needed for new uploads.
            </p>
            {stats.travellingCount > 0 ? (
              <span className="warehouse-hub__action-count">{stats.travellingCount} in transit</span>
            ) : null}
          </button>
          ) : null}

          {isMain && !isUsaWarehouse ? (
            <button type="button" className="warehouse-hub__action-card" onClick={() => openPanel('transfer')}>
              <h4>Send to Shop</h4>
              <p>Move on-hand stock to a Shop — the shop marks it received when it arrives.</p>
              {readyToSendUnits > 0 ? (
                <span className="warehouse-hub__action-count">
                  {readyToSendUnits} unit{readyToSendUnits === 1 ? '' : 's'} ready to send
                </span>
              ) : null}
            </button>
          ) : null}

          {isShop && !isUsaWarehouse ? (
            <button type="button" className="warehouse-hub__action-card" onClick={() => openPanel('transfer')}>
              <h4>Send to another Shop</h4>
              <p>
                Move on-hand stock from this shop to another — the destination shop marks it received
                when it arrives.
              </p>
              {readyToSendUnits > 0 ? (
                <span className="warehouse-hub__action-count">
                  {readyToSendUnits} unit{readyToSendUnits === 1 ? '' : 's'} ready to send
                </span>
              ) : null}
            </button>
          ) : null}

          {canOpenSendToWarehousePanel ? (
            <button
              type="button"
              className="warehouse-hub__action-card"
              onClick={() => openPanel('send-warehouse')}
            >
              <h4>Send to warehouse</h4>
              <p>
                {isShop
                  ? 'Send on-hand stock from this shop back to a regional main warehouse.'
                  : 'Ship on-hand stock to a regional main warehouse — they mark it received on arrival.'}
              </p>
              {canManageUsaWarehouse ? (
                <div className="warehouse-hub__action-counts">
                  {usaSendBatchCount > 0 ? (
                    <span className="warehouse-hub__action-count">
                      {usaSendBatchCount} batch{usaSendBatchCount === 1 ? '' : 'es'} ready to send
                    </span>
                  ) : null}
                  <span className="warehouse-hub__action-count">
                    {usaInventoryUnitCount} unit{usaInventoryUnitCount === 1 ? '' : 's'} in inventory
                  </span>
                </div>
              ) : readyToSendUnits > 0 ? (
                <span className="warehouse-hub__action-count">
                  {readyToSendUnits} unit{readyToSendUnits === 1 ? '' : 's'} ready to send
                </span>
              ) : null}
            </button>
          ) : null}

          {!isUsaWarehouse ? (
          <button type="button" className="warehouse-hub__action-card" onClick={() => openPanel('requests')}>
            <h4>{isMain ? (isCameroonAccount ? 'Shop & USA requests' : 'Shop requests') : 'Request from main'}</h4>
            <p>
              {isMain
                ? isCameroonAccount
                  ? 'Review shop requests and request stock from the USA warehouse.'
                  : 'See product requests submitted by Shops under this region.'
                : 'Ask the main Warehouse to send stock to this Shop.'}
            </p>
            {stats.pendingRequestCount > 0 ? (
              <span className="warehouse-hub__action-count">
                {stats.pendingRequestCount} pending
              </span>
            ) : null}
          </button>
          ) : null}

          {canManageUsaWarehouse ? (
          <button type="button" className="warehouse-hub__action-card" onClick={() => openPanel('requests')}>
            <h4>Warehouse requests</h4>
            <p>Regional main warehouses requesting stock from the USA warehouse.</p>
            {stats.pendingRequestCount > 0 ? (
              <span className="warehouse-hub__action-count">
                {stats.pendingRequestCount} pending
              </span>
            ) : null}
          </button>
          ) : null}

          {canManageUsaWarehouse || (!isUsaWarehouse && !cameroonUsaView) ? (
          <button type="button" className="warehouse-hub__action-card" onClick={() => openPanel('inventory')}>
            <h4>Add inventory</h4>
            <p>
              {warehouse?.city === 'USA'
                ? 'Bulk or single upload with IME codes and cost price (USA Warehouse).'
                : 'Bulk or single upload with IME codes and vendor price. Prices auto-fill from the pricing catalog.'}
            </p>
          </button>
          ) : null}

          {!cameroonUsaView ? (
          <button type="button" className="warehouse-hub__action-card" onClick={() => setViewStockOpen(true)}>
            <h4>Stock & photos</h4>
            <p>View products here and upload photos for on-hand stock.</p>
            <span className="warehouse-hub__action-count">
              {usaInventoryUnitCount} unit{usaInventoryUnitCount === 1 ? '' : 's'} at location
            </span>
          </button>
          ) : null}
            </>
          )}
          <button type="button" className="warehouse-hub__action-card" onClick={() => openPanel('lookup')}>
            <h4>Lookup</h4>
            <p>Search stock at this location by IME or serial number.</p>
          </button>
        </section>

        <section className="warehouse-hub__inventory wh-panel">
          <div className="warehouse-hub__inventory-head">
            <div>
              <h3 className="warehouse-hub__inventory-title">Inventory at this location</h3>
              <p className="warehouse-hub__inventory-lead">
                Click a product name, pick a storage size, then review each unit and its IME.
              </p>
            </div>
            <button
              type="button"
              className="warehouse-hub__inventory-refresh"
              onClick={() => loadLocationInventory()}
              disabled={locationInventoryLoading}
            >
              {locationInventoryLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {locationInventoryLoading && !locationInventory ? (
            <p className="wh-empty">Loading inventory…</p>
          ) : null}

          {locationInventory ? (
            <>
              <div className="warehouse-hub__inventory-summary">
                <span>
                  <strong>{locationInventorySummary.productCount}</strong>{' '}
                  product{locationInventorySummary.productCount === 1 ? '' : 's'}
                </span>
                <span>
                  <strong>{locationInventorySummary.units}</strong> total units
                </span>
              </div>

              {(displayIsShop ? locationOnHandProducts : locationInventory.products || []).length === 0 &&
              !locationInventoryLoading ? (
                <p className="warehouses-empty">No inventory at this location yet.</p>
              ) : (
                <UsaWarehouseInventoryTable
                  products={displayIsShop ? locationOnHandProducts : locationInventory.products || []}
                  loading={locationInventoryLoading}
                  loadingMessage="Loading inventory…"
                  emptyMessage={
                    isUsaWarehouse
                      ? 'No products with IME at the USA warehouse yet.'
                      : 'No products with IME at this location yet.'
                  }
                  idPrefix={isUsaWarehouse ? 'usa-location-inv' : 'wh-location-inv'}
                  showCostPrice={isUsaWarehouse}
                />
              )}
            </>
          ) : null}
        </section>
        </>
      ) : null}

      {panel !== 'menu' && !loading ? (
        <section className="wh-panel warehouse-hub__panel">
          <button type="button" className="warehouse-hub__back" onClick={() => setPanel('menu')}>
            ← Back to actions
          </button>
          {message ? <p className="warehouse-hub__msg warehouse-hub__msg--ok">{message}</p> : null}
          {errMsg ? <p className="warehouse-hub__msg warehouse-hub__msg--err">{errMsg}</p> : null}

          {panel === 'lookup' ? (
            <>
              <h4>IME lookup</h4>
              <p className="warehouses-panel__lead">
                Search products currently at {warehouse?.name || 'this location'} using an IME or serial
                code.
              </p>
              <form className="warehouse-hub__form" onSubmit={runImeLookup}>
                <label>
                  IME / serial
                  <input
                    value={lookupQuery}
                    onChange={(e) => setLookupQuery(e.target.value)}
                    placeholder="Enter IME (min. 3 characters)"
                    autoComplete="off"
                  />
                </label>
                <button type="submit" className="wh-hero__btn" disabled={lookupLoading}>
                  {lookupLoading ? 'Searching…' : 'Search'}
                </button>
              </form>
              {lookupLoading ? <p className="wh-empty">Searching…</p> : null}
              {!lookupLoading && lookupSearched && lookupResults.length === 0 ? (
                <p className="warehouses-empty">No matching IME at this location.</p>
              ) : null}
              {!lookupLoading && lookupResults.length > 0 ? (
                <div className="add-inventory-table-wrap" style={{ marginTop: '1rem' }}>
                  <table className="wh-activity-table add-inventory-table">
                    <thead>
                      <tr>
                        <th>IME</th>
                        <th>Product</th>
                        <th>Status</th>
                        <th>Batch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lookupResults.map((row, idx) => (
                        <tr key={`${row.ime}-${row.productId}-${idx}`}>
                          <td>
                            <code>{row.ime}</code>
                          </td>
                          <td>
                            {row.productName} · {row.brand} · {row.capacity}
                            {row.color ? ` · ${row.color}` : ''}
                          </td>
                          <td>{row.shipmentStatus || '—'}</td>
                          <td>{row.bulkBatchCode || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          ) : null}

          {panel === 'inventory' ? (
            <AddInventoryPanel
              warehouse={{
                ...warehouse,
                city: hub?.warehouse?.city ?? warehouse?.city,
                type: warehouse?.type || (isMain ? 'main' : 'sub'),
                isMain: Boolean(isMain ?? String(warehouse?.type || '').toLowerCase() === 'main'),
              }}
              onProductSaved={async () => {
                notifyProductCatalogUpdated();
                await loadHub();
                await loadLocationInventory();
              }}
            />
          ) : null}

          {panel === 'incoming' ? (
            <>
              <h4>Receive incoming stock</h4>
              <p className="warehouses-panel__lead">
                Mark stock as received only when it was sent from another warehouse or from a main
                warehouse to this shop. Products uploaded directly to a warehouse are already on hand.
              </p>
              <div className="warehouse-hub__form">
                <label>
                  Receive batch by code
                  <input
                    value={receivingBatch}
                    onChange={(e) => setReceivingBatch(e.target.value)}
                    placeholder="e.g. BULK-20260530-ABC123"
                  />
                </label>
                <button
                  type="button"
                  className="wh-hero__btn"
                  disabled={receiving || !receivingBatch.trim()}
                  onClick={() => handleReceiveBatch(receivingBatch)}
                >
                  {receiving ? 'Updating…' : 'Mark batch received'}
                </button>
              </div>
              {incomingLoading ? <p className="wh-empty">Loading…</p> : null}
              {!incomingLoading && incoming ? (
                <>
                  {incoming.batches?.length > 0 ? (
                    <>
                      <div className="wh-section-head">
                        <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Bulk batches</h3>
                      </div>
                      <ul className="warehouse-hub__list">
                        {incoming.batches.map((b) => {
                          const batchRoute = bulkBatchTravelRoute(b, warehouse);
                          return (
                          <li key={b.batchCode || b._id} className="warehouse-hub__list-item">
                            <div>
                              <code className="bulk-batch-code">{b.batchCode}</code>
                              <span
                                className="product-travel-route product-travel-route--block product-travel-route--compact warehouse-hub__tile-meta"
                                title={`From ${batchRoute.from} to ${batchRoute.to}`}
                              >
                                <span className="product-travel-route__from">{batchRoute.from}</span>
                                <span className="product-travel-route__arrow" aria-hidden>
                                  →
                                </span>
                                <span className="product-travel-route__to">{batchRoute.to}</span>
                              </span>
                            </div>
                            {isMain ? (
                              <button
                                type="button"
                                className="wh-hero__btn"
                                style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem' }}
                                disabled={receiving}
                                onClick={() => handleReceiveBatch(b.batchCode)}
                              >
                                {receiving ? '…' : 'Mark received'}
                              </button>
                            ) : null}
                          </li>
                          );
                        })}
                      </ul>
                    </>
                  ) : null}
                  {incomingProducts.length > 0 ? (
                    <>
                      <div className="wh-section-head warehouse-hub__incoming-head">
                        <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Products</h3>
                        <div className="warehouse-hub__incoming-actions">
                          <label className="warehouse-hub__select-all">
                            <input
                              type="checkbox"
                              checked={
                                incomingProducts.length > 0
                                && selectedIncomingProductIds.length === incomingProducts.length
                              }
                              disabled={receiving}
                              onChange={toggleAllIncomingProducts}
                            />
                            Select all
                          </label>
                          <button
                            type="button"
                            className="wh-hero__btn"
                            style={{ padding: '0.4rem 0.85rem', fontSize: '0.78rem' }}
                            disabled={receiving || selectedIncomingProductIds.length === 0}
                            onClick={() => handleReceiveProducts(selectedIncomingProductIds)}
                          >
                            {receiving
                              ? 'Updating…'
                              : `Mark selected received (${selectedIncomingProductIds.length})`}
                          </button>
                        </div>
                      </div>
                      <ul className="warehouse-hub__list">
                        {incomingProducts.map((p) => {
                          const pid = String(p._id || '');
                          const isSelected = selectedIncomingProductIds.includes(pid);
                          return (
                          <li
                            key={p._id}
                            className={`warehouse-hub__list-item warehouse-hub__list-item--stack warehouse-hub__list-item--selectable${isSelected ? ' is-selected' : ''}`}
                          >
                            <label className="warehouse-hub__incoming-check">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={receiving}
                                onChange={() => toggleIncomingProduct(pid)}
                              />
                              <span className="warehouse-hub__incoming-check__body">
                                {p.product_name} · {p.brand} · {p.capacity}
                                {p.bulkBatchCode ? (
                                  <>
                                    {' '}
                                    <code className="bulk-batch-code">{p.bulkBatchCode}</code>
                                  </>
                                ) : null}
                                <ProductTravelRoute
                                  product={p}
                                  className="product-travel-route--block product-travel-route--compact"
                                />
                              </span>
                            </label>
                            <span className="warehouses-status-badge warehouses-status-badge--travelling">
                              in transit
                            </span>
                            <button
                              type="button"
                              className="wh-hero__btn"
                              style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem' }}
                              disabled={receiving}
                              onClick={() => handleReceiveProduct(p._id)}
                            >
                              {receiving ? '…' : 'Mark received'}
                            </button>
                          </li>
                          );
                        })}
                      </ul>
                    </>
                  ) : incomingProducts.length === 0 && !(incoming.batches?.length > 0) ? (
                    <p className="warehouses-empty">
                      No incoming stock in transit. Uploads are on hand immediately at this location.
                    </p>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}

          {panel === 'transfer' && (isMain || isShop) ? (
            <>
              <h4>{isShop ? 'Send stock to another Shop' : 'Send stock to a Shop'}</h4>
              <p className="warehouses-panel__lead">
                {isShop ? (
                  <>
                    Units are taken from <strong>on-hand shop inventory</strong> at{' '}
                    <strong>{hub?.warehouse?.name || warehouse?.name || 'this shop'}</strong> (products
                    marked arrived). Select a destination Shop, then a product and storage. Check units in
                    the table, add them to your transfer batch, and send everything at once.
                  </>
                ) : (
                  <>
                    Select a Shop, then a product and storage. Check units in the table, add them to your
                    transfer batch (you can mix different phone types), and send everything at once.
                  </>
                )}
              </p>

              {isShop && shops.length === 0 ? (
                <div className="warehouse-hub__notice warehouse-hub__notice--info" role="status">
                  <strong>No other shops available</strong>
                  <p>There are no other active shops to receive a transfer from this location.</p>
                </div>
              ) : null}

              {readyLoading ? (
                <p className="wh-empty">
                  Loading {isShop ? 'shop inventory' : 'stock at main warehouse'}…
                </p>
              ) : null}

              {!readyLoading && shops.length > 0 ? (
                <>
                  <ShopTransferBatchPicker
                    shops={shops}
                    shopId={transferShopId}
                    onShopIdChange={setTransferShopId}
                    products={readyProducts}
                    savedBatch={savedTransferBatch}
                    onSavedBatchChange={setSavedTransferBatch}
                    disabled={transferring}
                  />

                  <div className="shop-transfer-picker__send-row">
                    <button
                      type="button"
                      className="wh-hero__btn"
                      disabled={
                        transferring || !transferShopId || savedTransferBatch.length === 0
                      }
                      onClick={sendSavedTransferBatch}
                    >
                      {transferring
                        ? 'Sending…'
                        : `Send saved batch (${savedTransferBatch.length} unit${
                            savedTransferBatch.length === 1 ? '' : 's'
                          }) to Shop`}
                    </button>
                  </div>

                  {readyProducts.length === 0 ? (
                    <p className="warehouses-empty">
                      {isShop
                        ? 'No arrived products in shop inventory yet. Mark incoming stock as received first, then send it to another shop here.'
                        : 'No stock waiting at the main warehouse. Receive incoming stock first, then send it to a Shop here.'}
                    </p>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}

          {panel === 'send-warehouse' && (canManageUsaWarehouse || (isShop && !isUsaWarehouse)) ? (
            <>
              <h4>{isShop ? 'Send stock to main warehouse' : 'Send stock to another warehouse'}</h4>
              <p className="warehouses-panel__lead">
                {isShop
                  ? 'Choose a destination main warehouse, pick a product, select unit rows with IMEs, save them to a transfer batch, then send the batch.'
                  : 'Choose a destination warehouse, filter inventory if needed, tick the units to send (one row per IME), add them to a transfer batch, then send.'}
              </p>

              {readyLoading ? <p className="wh-empty">Loading stock at this warehouse…</p> : null}

              {!readyLoading && readyProducts.length === 0 ? (
                <p className="warehouses-empty">
                  No on-hand stock here yet. Upload inventory first, then send it to another warehouse.
                </p>
              ) : null}

              {!readyLoading && readyProducts.length > 0 ? (
                <div className="warehouse-hub__form warehouse-hub__send-warehouse-form">
                  <label>
                    Destination warehouse
                    <select
                      value={transferMainId}
                      onChange={(e) => {
                        setTransferMainId(e.target.value);
                        setWarehouseTransferProductName('');
                        setWarehouseTransferCapacity('');
                        setWarehouseTransferCheckedKeys([]);
                        setSavedTransferBatch([]);
                        setTransferWarehouseProductId('');
                        setTransferWarehouseQty('');
                      }}
                      disabled={mainWarehousesLoading}
                    >
                      <option value="">Select warehouse…</option>
                      {mainWarehouseOptions.map((m) => (
                        <option key={warehouseId(m)} value={warehouseId(m)}>
                          {m.name} — {m.city || 'Other'}
                        </option>
                      ))}
                    </select>
                  </label>

                  {transferMainId ? (
                    <>
                      <label>
                        {canManageUsaWarehouse ? 'Product filter' : 'Product'}
                        <select
                          value={warehouseTransferProductName}
                          onChange={(e) => {
                            setWarehouseTransferProductName(e.target.value);
                            setWarehouseTransferCapacity('');
                            setWarehouseTransferCheckedKeys([]);
                          }}
                        >
                          {canManageUsaWarehouse ? (
                            <option value="">All products</option>
                          ) : (
                            <option value="">Select product…</option>
                          )}
                          {warehouseTransferNameOptions.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </label>

                      {canManageUsaWarehouse || warehouseTransferProductName ? (
                        <label>
                          {canManageUsaWarehouse ? 'Storage filter' : 'Storage'}
                          <select
                            value={warehouseTransferCapacity}
                            onChange={(e) => {
                              setWarehouseTransferCapacity(e.target.value);
                              setWarehouseTransferCheckedKeys([]);
                            }}
                          >
                            <option value="">All storages</option>
                            {warehouseTransferCapacityOptions.map((cap) => (
                              <option key={cap} value={cap}>
                                {cap}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}

                      {showWarehouseTransferPicker ? (
                        <>
                          <p className="warehouse-hub__tile-meta">
                            {warehouseTransferUnitRows.length} unit row
                            {warehouseTransferUnitRows.length === 1 ? '' : 's'}
                            {warehouseTransferProductName || warehouseTransferCapacity
                              ? ' matching filters'
                              : ' in inventory'}
                          </p>

                          {warehouseTransferUnitRows.length === 0 ? (
                            <p className="warehouses-empty">No units match the current filters.</p>
                          ) : (
                            <div className="warehouse-hub__transfer-table-wrap add-inventory-table-wrap">
                              <table className="wh-activity-table add-inventory-table warehouse-hub__transfer-table">
                                <thead>
                                  <tr>
                                    <th style={{ width: '44px' }}>Pick</th>
                                    <th>Product</th>
                                    <th>Brand</th>
                                    <th>Storage</th>
                                    <th>Color</th>
                                    <th>IME</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {warehouseTransferUnitRows.map((row) => {
                                    const inBatch = savedWarehouseBatchKeySet.has(
                                      shopTransferBatchKey(row),
                                    );
                                    const checked = warehouseTransferCheckedKeys.includes(row.rowKey);
                                    return (
                                      <tr key={row.rowKey} className={inBatch ? 'is-in-batch' : ''}>
                                        <td>
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            disabled={inBatch}
                                            onChange={() => toggleWarehouseTransferChecked(row.rowKey)}
                                            aria-label={`Select ${row.product_name || 'product'} ${row.ime || ''}`}
                                          />
                                        </td>
                                        <td>
                                          <strong>{row.product_name || '—'}</strong>
                                          {inBatch ? (
                                            <span className="shop-transfer-picker__badge">
                                              In saved batch
                                            </span>
                                          ) : null}
                                        </td>
                                        <td>{row.brand || '—'}</td>
                                        <td>{row.capacity || '—'}</td>
                                        <td>{row.color || '—'}</td>
                                        <td>
                                          {row.ime ? (
                                            <code className="shop-transfer-picker__ime">{row.ime}</code>
                                          ) : (
                                            '—'
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}

                          <div className="shop-transfer-picker__table-actions">
                            <button
                              type="button"
                              className="wh-hero__btn"
                              disabled={
                                transferring ||
                                warehouseTransferCheckedKeys.length === 0 ||
                                warehouseTransferUnitRows.length === 0
                              }
                              onClick={addCheckedWarehouseUnitsToBatch}
                            >
                              Add selected to transfer batch
                            </button>
                            <button
                              type="button"
                              className="wh-link"
                              disabled={transferring || warehouseTransferCheckedKeys.length === 0}
                              onClick={() => setWarehouseTransferCheckedKeys([])}
                            >
                              Clear selection
                            </button>
                          </div>
                        </>
                      ) : null}

                      {(isShop || canManageUsaWarehouse) && savedTransferBatch.length > 0 ? (
                        <section className="shop-transfer-picker__saved">
                          <div className="shop-transfer-picker__saved-head">
                            <h3>Saved transfer batch</h3>
                            <span>
                              {savedTransferBatch.length} unit
                              {savedTransferBatch.length === 1 ? '' : 's'}
                            </span>
                          </div>
                          <ul className="shop-transfer-picker__saved-list">
                            {savedTransferBatch.map((row) => (
                              <li key={shopTransferBatchKey(row)}>
                                <div>
                                  <strong>{row.product_name}</strong>
                                  <span className="shop-transfer-picker__meta">
                                    {[row.brand, row.capacity, row.color].filter(Boolean).join(' · ')}
                                    {row.ime ? ` · IME: ${row.ime}` : ''}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className="wh-link"
                                  disabled={transferring}
                                  onClick={() => removeWarehouseBatchRow(shopTransferBatchKey(row))}
                                >
                                  Remove
                                </button>
                              </li>
                            ))}
                          </ul>
                          <button
                            type="button"
                            className="wh-link shop-transfer-picker__clear-batch"
                            disabled={transferring}
                            onClick={() => setSavedTransferBatch([])}
                          >
                            Clear saved batch
                          </button>
                        </section>
                      ) : null}
                    </>
                  ) : null}

                  <button
                    type="button"
                    className="wh-hero__btn"
                    disabled={transferring || !canSendToWarehouse}
                    onClick={runSendToWarehouse}
                  >
                    {transferring
                      ? 'Sending…'
                      : isShop || canManageUsaWarehouse
                        ? canSendToWarehouse
                          ? `Send saved batch (${savedTransferBatch.length} unit${savedTransferBatch.length === 1 ? '' : 's'}) to warehouse`
                          : 'Send saved batch to warehouse'
                        : canSendToWarehouse
                          ? `Send ${warehouseTransferQtyNum} unit${warehouseTransferQtyNum === 1 ? '' : 's'} to warehouse`
                          : 'Send to warehouse'}
                  </button>
                </div>
              ) : null}
            </>
          ) : null}

          {panel === 'usa-catalog' ? (
            <>
              <h4>USA warehouse inventory</h4>
              <p className="warehouses-panel__lead">
                Read-only view of USA warehouse stock. Click a product name, pick a storage size, then
                review each unit and its IME. Submit a request if you need stock sent to a regional main
                warehouse.
              </p>
              {usaCatalogLoading ? <p className="wh-empty">Loading inventory…</p> : null}
              {!usaCatalogLoading ? (
                <UsaWarehouseInventoryTable
                  products={usaCatalog?.products || []}
                  loading={false}
                  emptyMessage="No products with IME at the USA warehouse yet."
                  idPrefix="usa-catalog-inv"
                />
              ) : null}
            </>
          ) : null}

          {panel === 'requests' ? (
            <>
              {cameroonUsaView ? (
                <>
                  <h4>Request stock from USA warehouse</h4>
                  <p className="warehouses-panel__lead">
                    Choose your regional main warehouse and describe the stock you need from the USA
                    warehouse.
                  </p>
                  <form className="warehouse-hub__form" onSubmit={handleRequestSubmit}>
                    <label>
                      Your regional warehouse
                      <select
                        value={requestMainId}
                        onChange={(e) => setRequestMainId(e.target.value)}
                        required
                        disabled={mainWarehousesLoading}
                      >
                        <option value="">Select warehouse…</option>
                        {regionalMainOptions.map((m) => (
                          <option key={warehouseId(m)} value={warehouseId(m)}>
                            {m.name} — {m.city || 'Other'}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Product / model
                      <input
                        required
                        value={requestForm.productName}
                        onChange={(e) =>
                          setRequestForm((f) => ({ ...f, productName: e.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Brand
                      <input
                        value={requestForm.brand}
                        onChange={(e) => setRequestForm((f) => ({ ...f, brand: e.target.value }))}
                      />
                    </label>
                    <label>
                      Capacity
                      <input
                        value={requestForm.capacity}
                        onChange={(e) =>
                          setRequestForm((f) => ({ ...f, capacity: e.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Color
                      <input
                        value={requestForm.color}
                        onChange={(e) => setRequestForm((f) => ({ ...f, color: e.target.value }))}
                      />
                    </label>
                    <label>
                      Quantity
                      <input
                        type="number"
                        min={1}
                        value={requestForm.quantity}
                        onChange={(e) =>
                          setRequestForm((f) => ({ ...f, quantity: e.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Notes
                      <textarea
                        rows={2}
                        value={requestForm.notes}
                        onChange={(e) => setRequestForm((f) => ({ ...f, notes: e.target.value }))}
                      />
                    </label>
                    <button type="submit" className="wh-hero__btn" disabled={submittingRequest}>
                      {submittingRequest ? 'Sending…' : 'Send request to USA'}
                    </button>
                  </form>
                </>
              ) : isShop ? (
                <>
                  <h4>Request stock from main warehouse</h4>
                  <p className="warehouses-panel__lead">
                    Submit a request to {hub?.parentMain?.name || 'the regional main warehouse'}.
                  </p>
                  <form className="warehouse-hub__form" onSubmit={handleRequestSubmit}>
                    <label>
                      Product / model
                      <input
                        required
                        value={requestForm.productName}
                        onChange={(e) =>
                          setRequestForm((f) => ({ ...f, productName: e.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Brand
                      <input
                        value={requestForm.brand}
                        onChange={(e) => setRequestForm((f) => ({ ...f, brand: e.target.value }))}
                      />
                    </label>
                    <label>
                      Capacity
                      <input
                        value={requestForm.capacity}
                        onChange={(e) =>
                          setRequestForm((f) => ({ ...f, capacity: e.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Color
                      <input
                        value={requestForm.color}
                        onChange={(e) => setRequestForm((f) => ({ ...f, color: e.target.value }))}
                      />
                    </label>
                    <label>
                      Quantity
                      <input
                        type="number"
                        min={1}
                        value={requestForm.quantity}
                        onChange={(e) =>
                          setRequestForm((f) => ({ ...f, quantity: e.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Notes
                      <textarea
                        rows={2}
                        value={requestForm.notes}
                        onChange={(e) => setRequestForm((f) => ({ ...f, notes: e.target.value }))}
                      />
                    </label>
                    <button type="submit" className="wh-hero__btn" disabled={submittingRequest}>
                      {submittingRequest ? 'Sending…' : 'Send request'}
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <h4>
                    {isUsaWarehouse
                      ? 'Requests from regional warehouses'
                      : isCameroonAccount
                        ? 'Shop requests & request from USA'
                        : 'Requests from Shops'}
                  </h4>
                  <p className="warehouses-panel__lead">
                    {isUsaWarehouse
                      ? 'Only regional main warehouses can request stock from the USA warehouse — not Shops.'
                      : isCameroonAccount
                        ? 'Review shop requests for this region or request stock from the USA warehouse.'
                        : 'Shops under this region have requested stock from this main Warehouse.'}
                  </p>
                  {isMain && !isUsaWarehouse && isCameroonAccount ? (
                    <form className="warehouse-hub__form" onSubmit={handleRequestSubmit}>
                      <h5 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>Request from USA warehouse</h5>
                      <label>
                        Product / model
                        <input
                          required
                          value={requestForm.productName}
                          onChange={(e) =>
                            setRequestForm((f) => ({ ...f, productName: e.target.value }))
                          }
                        />
                      </label>
                      <label>
                        Brand
                        <input
                          value={requestForm.brand}
                          onChange={(e) => setRequestForm((f) => ({ ...f, brand: e.target.value }))}
                        />
                      </label>
                      <label>
                        Capacity
                        <input
                          value={requestForm.capacity}
                          onChange={(e) =>
                            setRequestForm((f) => ({ ...f, capacity: e.target.value }))
                          }
                        />
                      </label>
                      <label>
                        Quantity
                        <input
                          type="number"
                          min={1}
                          value={requestForm.quantity}
                          onChange={(e) =>
                            setRequestForm((f) => ({ ...f, quantity: e.target.value }))
                          }
                        />
                      </label>
                      <button type="submit" className="wh-hero__btn" disabled={submittingRequest}>
                        {submittingRequest ? 'Sending…' : 'Request from USA'}
                      </button>
                    </form>
                  ) : null}
                </>
              )}
              {requestsLoading ? <p className="wh-empty">Loading requests…</p> : null}
              {!requestsLoading && requests.length === 0 ? (
                <p className="warehouses-empty">No requests yet.</p>
              ) : null}
              {!requestsLoading && requests.length > 0 ? (
                <ul className="warehouse-hub__list">
                  {requests.map((r) => {
                    const rid = String(r._id);
                    const requesterName =
                      r.requestingMain?.name ||
                      r.requestingShop?.name ||
                      r.requestingMain?.city ||
                      r.requestingShop?.city ||
                      'Requester';
                    const pending = r.status === 'pending';
                    const isWarehouseRequest = Boolean(r.requestingMain);
                    const servingMainId = String(r.servingMain?._id || r.servingMain || '');
                    const canResolve =
                      pending &&
                      isMain &&
                      ((isUsaWarehouse && isWarehouseRequest) ||
                        (!isUsaWarehouse && Boolean(r.requestingShop) && servingMainId === String(whId)));
                    return (
                      <li key={rid} className="warehouse-hub__list-item">
                        <div>
                          <strong>
                            {r.productName}
                            {r.brand ? ` · ${r.brand}` : ''}
                          </strong>
                          <span className="warehouse-hub__tile-meta">
                            {isMain
                              ? isWarehouseRequest
                                ? `From warehouse ${requesterName}`
                                : `From shop ${requesterName}`
                              : r.servingMain?.name
                                ? `To ${r.servingMain.name}`
                                : ''}{' '}
                            · Qty {r.quantity} · {r.status}
                          </span>
                        </div>
                        {canResolve ? (
                          <div className="warehouse-hub__row-actions">
                            <button
                              type="button"
                              className="wh-hero__btn"
                              style={{ padding: '0.35rem 0.65rem', fontSize: '0.72rem' }}
                              onClick={() => resolveRequest(rid, 'approved')}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="wh-hero__btn"
                              style={{
                                padding: '0.35rem 0.65rem',
                                fontSize: '0.72rem',
                                background: '#fee2e2',
                                color: '#b91c1c',
                              }}
                              onClick={() => resolveRequest(rid, 'rejected')}
                            >
                              Reject
                            </button>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
