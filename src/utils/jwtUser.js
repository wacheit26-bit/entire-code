function decodeJwtPayload(accessToken) {
  if (!accessToken || typeof accessToken !== 'string') return null;
  try {
    const part = accessToken.split('.')[1];
    if (!part) return null;
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

export function getUserIdFromAccessToken(accessToken) {
  const json = decodeJwtPayload(accessToken);
  if (!json) return null;
  return json?.UserInfo?.userId ?? json?.UserInfo?.id ?? json?.sub ?? json?.userId ?? null;
}

/** Display name from JWT when React auth state was cleared by refresh (e.g. UserInfo.username). */
export function getUsernameFromAccessToken(accessToken) {
  const json = decodeJwtPayload(accessToken);
  if (!json) return null;
  const u = json?.UserInfo;
  return u?.username ?? u?.name ?? u?.user ?? null;
}
