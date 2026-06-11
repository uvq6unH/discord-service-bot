import React, { createContext, useContext, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';

/**
 * AuthContext
 *
 * Fixes từ review:
 * 1. Redirect KHÔNG còn nằm trong queryFn — side effect trong queryFn
 *    gây TanStack retry vô hạn và double-redirect.
 * 2. Redirect chuyển sang useEffect, chỉ chạy khi data đã settle.
 * 3. Expose user.role cho PermissionGuard.
 */

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { data: user, isLoading: loading, isError } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.me(),   // không redirect trong đây nữa
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 phút — tránh refetch liên tục
  });

  // Redirect chỉ sau khi query đã xong và user chưa login
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
