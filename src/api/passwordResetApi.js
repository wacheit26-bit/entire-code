import axiosPublic from './axios';

export async function postForgotPassword(whatsappNumber) {
  const res = await axiosPublic.post('/auth/forgot-password', {
    whatsappNumber: String(whatsappNumber || '').trim(),
  });
  return res.data;
}

export async function postVerifyResetCode(whatsappNumber, code) {
  const res = await axiosPublic.post('/auth/verify-reset-code', {
    whatsappNumber: String(whatsappNumber || '').trim(),
    code: String(code || '').trim(),
  });
  return res.data;
}

export async function postCompletePasswordReset(whatsappNumber, resetToken, newPassword) {
  const res = await axiosPublic.post('/auth/reset-password', {
    whatsappNumber: String(whatsappNumber || '').trim(),
    resetToken: String(resetToken || '').trim(),
    newPassword: String(newPassword || ''),
  });
  return res.data;
}
