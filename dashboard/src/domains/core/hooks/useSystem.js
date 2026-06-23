import { useQuery } from '@tanstack/react-query';
import { systemService } from '../services/system.service.js';

export function useSystem(refetchInterval = 15000) {
  const { data, isLoading: loading, isError, error, refetch } = useQuery({
    queryKey: ['system-status'],
    queryFn: () => systemService.fetchSystemStatus(),
    refetchInterval,
  });

  return {
    status: data ?? null,
    loading,
    isError,
    error: error?.message ?? null,
    refetch,
  };
}
