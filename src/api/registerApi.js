export const REGISTER_PATH =
  (import.meta.env.VITE_REGISTER_PATH && String(import.meta.env.VITE_REGISTER_PATH).trim()) ||
  '/register';

export async function postRegisterUser(client, body) {
  const res = await client.post(REGISTER_PATH, body);
  return res.data;
}
