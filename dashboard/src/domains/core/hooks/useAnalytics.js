import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsService } from '../services/analytics.service.js';

export function useAnalytics(guildId) {
  const [range, setRange] = useState('7d');

  const { data, isLoading: loading, isError, error, refetch } = useQuery({
    queryKey: ['analytics', guildId, range],
    queryFn: () => analyticsService.fetchAnalytics(guildId, range),
    enabled: !!guildId,
  });

  return {
    range,
    setRange,
    data: data ?? null,
    loading,
    isError,
    error: error?.message ?? null,
    refetch,
  };
}
