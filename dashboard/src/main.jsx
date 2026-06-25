import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import App from './App.jsx';
import Login from './domains/core/pages/Login.jsx';
import { AuthProvider } from './app/providers/AuthProvider.jsx';
import { GuildProvider } from './app/providers/GuildProvider.jsx';
import { LanguageProvider } from './shared/context/LanguageContext.jsx';
import './design/index.css';

import { getQueryClient } from './app/services/queryClient.js';

const queryClient = getQueryClient();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={
            <AuthProvider>
              <GuildProvider>
                <App />
              </GuildProvider>
            </AuthProvider>
          } />
        </Routes>
      </BrowserRouter>
      <Toaster
        theme="dark"
        position="bottom-right"
        richColors
        offset={24}
        toastOptions={{
          style: {
            zIndex: 9999,
          },
        }}
      />
      </LanguageProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
