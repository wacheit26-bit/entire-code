export function notificationQueryForRole(role, userId) {
  if (role === 'admin') return { audience: 'admin' };
  if (role === 'salesman') return { audience: 'salesman' };
  if (userId) return { userId: String(userId) };
  return null;
}

export async function fetchNotifications(client, params) {
  const res = await client.get('/notifications', { params });
  const data = Array.isArray(res.data?.data) ? res.data.data : [];
  return { data, unreadCount: Number(res.data?.unreadCount) || 0 };
}

export async function patchNotificationRead(client, id) {
  const safe = encodeURIComponent(String(id));
  await client.patch(`/notifications/${safe}/read`);
}

export async function patchNotificationsMarkAllRead(client, body) {
  await client.patch('/notifications/mark-all-read', body);
}
