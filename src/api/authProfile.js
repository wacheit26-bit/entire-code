import { pickAccountStatus } from './authResponse';

/** @deprecated Use fetchUserById when the API has no GET /auth/me */
export async function fetchAuthMe(client) {
  const res = await client.get('/auth/me');
  return res.data;
}

/** GET /users/:id — paybackend-style profile (requires JWT; server must allow self-access). */
export async function fetchUserById(client, userId) {
  const id = encodeURIComponent(String(userId || '').trim());
  if (!id) throw new Error('Missing user id');
  const res = await client.get(`/users/${id}`);
  return res.data;
}

export async function fetchOwnProfile(client, userId) {
  const id = String(userId || '').trim();
  if (id) {
    try {
      return await fetchUserById(client, id);
    } catch (err) {
      const status = Number(err?.response?.status || 0);
      if (status !== 400 && status !== 403 && status !== 404) throw err;
    }
  }
  return fetchAuthMe(client);
}

export function accountStatusFromMeResponse(data) {
  const inner = data?.data && typeof data.data === 'object' ? data.data : data || {};
  return pickAccountStatus(inner.user ?? inner);
}

/**
 * Normalize GET /users/:id or /auth/me payloads into editable profile fields.
 * Supports paybackend: { success: true, data: user }.
 */
export function parseMeProfile(data) {
  const inner = data?.data && typeof data.data === 'object' ? data.data : data || {};
  const user = inner.user ?? inner;
  if (!user || typeof user !== 'object') return null;

  let firstName = String(user.firstName ?? user.first_name ?? '').trim();
  let lastName = String(user.lastName ?? user.last_name ?? '').trim();
  const fullName = String(user.name ?? user.username ?? '').trim();
  const parts = fullName.split(/\s+/).filter(Boolean);
  if (!firstName && !lastName && parts.length) {
    if (parts.length > 1) {
      firstName = parts[0];
      lastName = parts.slice(1).join(' ');
    } else {
      firstName = parts[0];
    }
  }

  const rawCode = String(user.phoneCountryCode ?? user.countryCode ?? user.dialCode ?? '').trim();
  const phoneCountryCode =
    rawCode && rawCode.startsWith('+') ? rawCode : rawCode ? `+${rawCode}` : '+237';

  return {
    firstName,
    lastName,
    email: String(user.email ?? '').trim(),
    phone: String(user.tel ?? user.phone ?? user.phoneNumber ?? '').trim(),
    phoneCountryCode,
    whatsappNumber: String(user.whatsappNumber ?? user.whatsapp ?? '').trim(),
    businessName: String(user.businessName ?? user.business_name ?? '').trim(),
    businessAddress: String(user.businessAddress ?? user.business_address ?? user.deliveryAddress ?? user.delivery_address ?? '').trim(),
    language: String(user.language ?? user.locale ?? 'en')
      .toLowerCase()
      .startsWith('fr')
      ? 'fr'
      : 'en',
    timezone: String(user.timezone ?? user.time_zone ?? 'Africa/Douala').trim() || 'Africa/Douala',
    accountStatus: pickAccountStatus(user),
  };
}

export async function patchAuthProfile(client, userId, body) {
  const id = encodeURIComponent(String(userId || '').trim());
  if (!id) throw new Error('Missing user id');
  const res = await client.patch(`/users/${id}`, body);
  return res.data;
}
