import { createContext, useEffect, useState } from 'react';
import { saveAuthSnapshot } from '../api/authSnapshot';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [auth, setAuth] = useState({});
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Persist profile fields for refresh (do not clear here on mount — auth starts empty before PersistLogin rehydrates).
  useEffect(() => {
    if (auth?.accessToken) saveAuthSnapshot(auth);
  }, [auth]);

  return (
    <AuthContext.Provider value={{ auth, setAuth, isLoggingOut, setIsLoggingOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
