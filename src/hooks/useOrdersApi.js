import { useCallback } from 'react';
import useAxiosPrivate from './useAxiosPrivate';
import useAuth from './useAuth';
import { postOrderRequest } from '../api/ordersApi';
import { MIN_BUY_QUANTITY } from '../constants/wholesaleOrderLimits';
import { emitOrderCreated } from '../utils/orderCreatedEvents';
import { getUserIdFromAccessToken } from '../utils/jwtUser';
import { ORDER_USER_NOTES_MAX_LENGTH } from '../constants/serverOrderLimits';

/** Server expects userId on POST /orders; it may only be present in the JWT after refresh. */
function resolveUserIdForOrder(auth) {
  const direct = String(auth?.userId ?? '').trim();
  if (direct) return direct;
  const fromJwt = getUserIdFromAccessToken(auth?.accessToken);
  return fromJwt != null && fromJwt !== '' ? String(fromJwt).trim() : '';
}

function apiMessageFromOrderError(err) {
  const d = err?.response?.data;
  if (typeof d === 'string') return d;
  if (d && typeof d === 'object') return String(d.message ?? d.error ?? d.msg ?? '');
  return '';
}

/**
 * Buy orders target salesman notifications by city. Some backends return 4xx when no salesperson
 * is active in that city even though the order row was saved (or should count as submitted).
 * Same as 5xx/notification failures: treat as submitted so the user sees success.
 */
function messageIndicatesNoSalespersonNotifyIssue(low) {
  if (!low) return false;
  if (low.includes('no active salesperson') || low.includes('no active salesman')) return true;
  if (low.includes('no active sales person')) return true;
  const city = /bamenda|yaound[eé]|douala/;
  if (city.test(low) && low.includes('salesperson') && (low.includes('no active') || low.includes('there is no'))) {
    return true;
  }
  if (city.test(low) && (low.includes('no salesman') || low.includes('no salesperson'))) return true;
  return false;
}

/**
 * Some APIs return 5xx or { message: "Failed to create order" } after the order row is saved
 * (e.g. notification step fails). Treat as success so the client matches the database.
 */
function orderPostErrorLikelyPersisted(err) {
  const st = Number(err?.response?.status);
  if (st === 401 || st === 403) return false;
  if (Number.isFinite(st) && st >= 500 && st <= 504) return true;

  const low = apiMessageFromOrderError(err).toLowerCase().trim();
  if (low.includes('failed to create order') || low.includes('failed to create the order')) {
    return true;
  }

  // 4xx: "no salesperson in Bamenda" style — backend rejected notify routing; order still submitted
  if (Number.isFinite(st) && st >= 400 && st < 500 && messageIndicatesNoSalespersonNotifyIssue(low)) {
    return true;
  }

  return false;
}

/**
 * @param {object} params
 * @param {boolean} params.isCustomProduct - false = catalog preorder (paybackend: productId + preorder)
 * @param {string} [params.productId] - required when !isCustomProduct
 * @param {number} params.quantity
 * @param {string} [params.userNotes]
 * @param {string} [params.deliveryAddress]
 * @param {string} [params.productName] - custom display name (min 2 chars server-side)
 * @param {number} [params.unitPrice] - maps to customProduct.targetPriceMin / targetPriceMax
 */
export default function useOrdersApi() {
  const client = useAxiosPrivate();
  const { auth } = useAuth();

  const postOrderWithNotifications = useCallback(
    async (baseBody, audience) => {
      const emitOrderType = baseBody?.orderType;
      const { __skipPersistedErrorGuess, ...rest } = baseBody;
      const body = { ...rest, notifyAudience: audience };

      const onSuccess = () => {
        try {
          emitOrderCreated(emitOrderType);
        } catch (notifyErr) {
          console.warn('Order created but notification hook failed:', notifyErr);
        }
      };

      try {
        const res = await postOrderRequest(client, body);
        onSuccess();
        return res;
      } catch (err) {
        if (!__skipPersistedErrorGuess && orderPostErrorLikelyPersisted(err)) {
          console.warn(
            '[orders] Order POST returned an error but treating as success (likely already saved):',
            err?.response?.status,
            err?.response?.data,
          );
          try {
            onSuccess();
          } catch (e) {
            console.warn('Order success follow-up failed:', e);
          }
          return {};
        }
        throw err;
      }
    },
    [client],
  );

  const submitBuyRequest = useCallback(
    async ({ productId, productName, quantity, userNotes }) => {
      const q = Math.floor(Number(quantity) || 0);
      if (q < MIN_BUY_QUANTITY) {
        throw new Error(
          `Vendor buy orders require at least ${MIN_BUY_QUANTITY} units per product.`,
        );
      }
      return postOrderWithNotifications(
        {
          userId: resolveUserIdForOrder(auth),
          productId,
          productName,
          orderType: 'buy',
          quantity: q,
          userNotes: String(userNotes || '').trim(),
        },
        'salesman',
      );
    },
    [postOrderWithNotifications, auth],
  );

  const submitOfferRequest = useCallback(
    ({ productId, productName, quantity, offerAmount }) =>
      postOrderWithNotifications(
        {
          userId: resolveUserIdForOrder(auth),
          productId,
          productName,
          orderType: 'offer',
          quantity: Math.max(1, Number(quantity) || 1),
          offeredPrice: Number(offerAmount),
        },
        'admin',
      ),
    [postOrderWithNotifications, auth],
  );

  const submitPreorderRequest = useCallback(
    async (params) => {
      const q = Math.max(1, Math.floor(Number(params.quantity) || 1));
      const userId = resolveUserIdForOrder(auth);
      if (!userId) {
        throw new Error(
          'Your account could not be identified. Please sign out, sign in again, and retry the preorder.',
        );
      }

      const notes = String(params.userNotes || '')
        .trim()
        .slice(0, ORDER_USER_NOTES_MAX_LENGTH);
      const delivery = String(params.deliveryAddress || '')
        .trim()
        .slice(0, 500);

      if (params.isCustomProduct) {
        const name = String(params.productName || '').trim();
        if (name.length < 2) {
          throw new Error('Product name must be at least 2 characters.');
        }
        const unit = Math.round(Number(params.unitPrice));
        if (!Number.isFinite(unit) || unit <= 0) {
          throw new Error('Enter a valid unit price (whole number, greater than zero).');
        }

        const desc = String(params.description || '').trim().slice(0, 1000);
        const specs = String(params.specifications || '').trim().slice(0, 2000);

        const payload = {
          __skipPersistedErrorGuess: true,
          userId,
          orderType: 'preorder',
          quantity: q,
          isCustomProduct: true,
          customProduct: {
            name,
            description: desc || null,
            specifications: specs || null,
            brand: params.brand || null,
            model: params.model || null,
            targetPriceMin: unit,
            targetPriceMax: unit,
            condition: params.condition || 'new',
          },
          preorderInfo: {
            quantityNeeded: q,
            urgency: params.urgency || 'medium',
            notes: params.preorderInfoNotes != null ? String(params.preorderInfoNotes).trim().slice(0, 1000) : null,
          },
          userNotes: notes || null,
          source: 'web',
        };
        if (delivery) {
          payload.deliveryAddress = delivery;
        }
        return postOrderWithNotifications(payload, 'admin');
      }

      const pid = String(params.productId || '').trim();
      if (!pid) {
        throw new Error('Missing catalog product for this preorder.');
      }

      const payload = {
        __skipPersistedErrorGuess: true,
        userId,
        productId: pid,
        orderType: 'preorder',
        quantity: q,
        userNotes: notes || null,
        source: 'web',
      };
      if (delivery) {
        payload.deliveryAddress = delivery;
      }
      return postOrderWithNotifications(payload, 'admin');
    },
    [postOrderWithNotifications, auth],
  );

  return {
    submitBuyRequest,
    submitOfferRequest,
    submitPreorderRequest,
    isAuthenticated: Boolean(auth?.accessToken),
  };
}
