function uniqueCustomersFromOrders(orders) {
  const map = new Map();
  (orders || []).forEach((o) => {
    const uid = String(o?.userId?._id ?? o?.userId ?? o?.userName ?? '').trim();
    const name = o?.userId?.name || o?.userName || o?.businessName || 'Customer';
    const key = uid || `${name}-${o?.tel || o?.userId?.tel || ''}`;
    if (map.has(key)) return;
    map.set(key, {
      name,
      businessName: o?.businessName || o?.userId?.businessName || '—',
      tel: o?.tel || o?.userId?.tel || '—',
      whatsappNumber: o?.whatsappNumber || o?.userId?.whatsappNumber || '—',
      role: 'Vendor',
    });
  });
  return [...map.values()];
}

export default function SalesShopAccounts({ shop, team = [], orders = [] }) {
  const customers = uniqueCustomersFromOrders(orders);

  return (
    <div className="sales-shop-accounts">
      <section className="wh-panel sales-shop-accounts__section">
        <h2>Staff at {shop?.name || 'this shop'}</h2>
        <p>Salespeople assigned to this shop with you.</p>
        {team.length === 0 ? (
          <p className="sales-hint">No other staff listed.</p>
        ) : (
          <div className="sales-table-wrap">
            <table className="sales-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Phone</th>
                  <th>WhatsApp</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {team.map((u) => (
                  <tr key={String(u._id ?? u.id ?? u.name)}>
                    <td>{u.name || '—'}</td>
                    <td>Staff</td>
                    <td>{u.tel || '—'}</td>
                    <td>{u.whatsappNumber || '—'}</td>
                    <td>{u.accountStatus || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="wh-panel sales-shop-accounts__section">
        <h2>Vendor customers ({shop?.city || 'shop area'})</h2>
        <p>Business owners who placed orders routed to this shop city.</p>
        {customers.length === 0 ? (
          <p className="sales-hint">No customer orders for this shop yet.</p>
        ) : (
          <div className="sales-table-wrap">
            <table className="sales-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Business</th>
                  <th>Phone</th>
                  <th>WhatsApp</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={`${c.name}-${c.tel}`}>
                    <td>{c.name}</td>
                    <td>{c.businessName}</td>
                    <td>{c.tel}</td>
                    <td>{c.whatsappNumber}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
