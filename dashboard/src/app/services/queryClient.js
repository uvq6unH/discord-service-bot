import { QueryClient } from '@tanstack/react-query';

let _queryClient = null;

export function getQueryClient() {
  if (!_queryClient) {
    _queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          retry: 1,
          refetchOnWindowFocus: false,
        },
      },
    });
  }
  return _queryClient;
}

export function destroyQueryClient() {
  if (_queryClient) {
    _queryClient.clear();
    _queryClient = null;
  }
}
