export function normalizeAuthApiBody(body) {
  const inner = body?.data && typeof body.data === 'object' ? body.data : body || {};
  return {
    accessToken: inner.accessToken ?? body?.accessToken,
    user: inner.user ?? body?.user,
    userId: inner.userId ?? body?.userId,
    role: inner.role ?? body?.role ?? inner?.user?.role,
    roles: inner.roles ?? body?.roles,
  };
}

export function stringifyMongoId(value) {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object') return value.$oid ?? value._id ?? null;
  return null;
}

export function pickUserIdFromAuthBody(normalized) {
  return stringifyMongoId(
    normalized?.userId ?? normalized?.user?._id ?? normalized?.user?.id ?? normalized?.user?.userId
  );
}

export function pickAccountStatus(user) {
  return user?.accountStatus ?? user?.account_status ?? undefined;
}
