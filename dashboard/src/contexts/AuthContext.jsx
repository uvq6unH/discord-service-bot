import React, { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { data: user, isLoading: loading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const me = await api.me();
      if (!me.loggedIn) {
        window.location.href = '/login';
        return null;
      }
      return me;
    },
    retry: false,
  });

  return (
    <AuthContext.Provider value={{ user: user ?? null, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
