import { createContext, useContext } from 'react';
import useNotificationsInbox from '../hooks/useNotificationsInbox';

const NotificationInboxContext = createContext(null);

export function NotificationInboxProvider({ children }) {
  const value = useNotificationsInbox();
  return <NotificationInboxContext.Provider value={value}>{children}</NotificationInboxContext.Provider>;
}

export function useNotificationInboxOptional() {
  return useContext(NotificationInboxContext);
}

export function useNotificationInbox() {
  const ctx = useContext(NotificationInboxContext);
  if (!ctx) throw new Error('useNotificationInbox must be used within provider');
  return ctx;
}
