import { axiosPrivate } from "../api/axios";
import { useEffect } from "react";
import useRefreshToken from "./useRefreshToken";
import { redirectToLoginFast } from "../utils/authRedirect";

function isTabActive() {
    if (typeof document === 'undefined') return true;
    const visible = document.visibilityState === 'visible';
    const focused = typeof document.hasFocus !== 'function' ? true : document.hasFocus();
    return visible && focused;
}

const useAxiosPrivate = () => {
    const refresh = useRefreshToken();

    useEffect(() => {
        // Do not add a request interceptor here: axios.js already sets Authorization from
        // getAccessToken(). A React-auth-based header can be "Bearer undefined" and prevents
        // the real token from being applied (My Account /users requests then 401 → logout).

        const responseIntercept = axiosPrivate.interceptors.response.use(
            response => response,
            async (error) => {
                const prevRequest = error?.config;
                const status = error?.response?.status;
                const isRefreshRequest = prevRequest?.url?.includes('/refresh');
                const msg = String(error?.response?.data?.message || '').toLowerCase();
                /** paybackend returns 403 for expired JWT; axios only retried 401, so lists (e.g. GET /orders) failed for admins. */
                const tokenLikelyExpired =
                  status === 403 &&
                  (msg.includes('token has expired') ||
                    msg.includes('expired token') ||
                    msg === 'invalid or expired token');

                if ((status === 401 || tokenLikelyExpired) && !prevRequest?.sent && !isRefreshRequest) {
                    prevRequest.sent = true;
                    try {
                      const newAccessToken = await refresh();
                      prevRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;
                      return axiosPrivate(prevRequest);
                    } catch {
                      if (!isTabActive()) {
                        redirectToLoginFast('Your session expired. Please sign in again.');
                      }
                      return Promise.reject(error);
                    }
                }
                return Promise.reject(error);
            }
        );

        return () => {
            axiosPrivate.interceptors.response.eject(responseIntercept);
        }
    }, [refresh])

    return axiosPrivate;
}

export default useAxiosPrivate;