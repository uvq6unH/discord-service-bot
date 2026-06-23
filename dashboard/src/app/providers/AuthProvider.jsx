import React, { createContext, useContext, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api/index.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { data: user, isLoading: loading, isError } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.me(),
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });

  useEffect(() => {
    if (loading) return;
    if (isError || (user && !user.loggedIn)) {
      window.location.href = '/login';
    }
  }, [loading, isError, user]);

  return (
    <AuthContext.Provider value={{ user: user ?? null, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
