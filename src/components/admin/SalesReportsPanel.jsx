import { useCallback, useEffect, useState } from 'react';
import { fetchOrdersList } from '../../api/adminApi';
import useAuth from '../../hooks/useAuth';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import { friendlyApiErrorMessage } from '../../utils/apiBaseUrl';
import { orderId } from '../../utils/orderDisplay';
import OrdersManagementPanel from '../shared/OrdersManagementPanel';

function mergeOrderFromPatch(existing, updated) {
  if (!updated) return existing;
  const prevDirect =
    existing?.directSale && typeof existing.directSale === 'object' ? existing.directSale : {};
  const nextDirect =
    updated?.directSale && typeof updated.directSale === 'object' ? updated.directSale : {};
  return { ...existing, ...updated, directSale: { ...prevDirect, ...nextDirect } };
}

export default function SalesReportsPanel() {
  const axiosPrivate = useAxiosPrivate();
  const { auth } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reloadOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchOrdersList(axiosPrivate, { limit: 250, page: 1 });
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      setOrders([]);
      setError(friendlyApiErrorMessage(err, 'Could not load orders.'));
    } finally {
      setLoading(false);
    }
  }, [axiosPrivate]);

  useEffect(() => {
    reloadOrders();
  }, [reloadOrders]);

  return (
    <OrdersManagementPanel
      orders={orders}
      loading={loading}
      error={error}
      currentUser={{ id: auth?.userId, name: auth?.user }}
      axiosPrivate={axiosPrivate}
      onOrdersReload={reloadOrders}
      onOrderUpdated={(updated) => {
        const id = orderId(updated);
        if (!id) return;
        setOrders((prev) =>
          prev.map((o) => (orderId(o) === id ? mergeOrderFromPatch(o, updated) : o)),
        );
      }}
      eyebrow="Report Management"
      title="Report Management"
      subtitle=""
      showKpis={false}
      showShopFilter
      showSalespersonFilter
      showTypeTabs={false}
      showStatusTabs={false}
      lockStatusToAccepted
      showCommissionSummary
      commissionPerUnit={3000}
      showHeroSummary={false}
      showHeroFilters={false}
      showTotalAmountMade
      totalAmountLabel="Total amount made"
      tableWrapClassName="admin-orders-table-wrap--report"
      singleTableVerticalScroll
      showReceiptActions
    />
  );
}
