import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { memberService } from '../services/member.service.js';

export function useMembers(guildId) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceTimer = useRef(null);

  const handleSearch = (value) => {
    setSearch(value);
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  };

  useEffect(() => {
    return () => clearTimeout(debounceTimer.current);
  }, []);

  const { data, isLoading: loading, isError, error } = useQuery({
    queryKey: ['members', guildId, page, debouncedSearch],
    queryFn: () => memberService.fetchMembers(guildId, page, debouncedSearch),
    enabled: !!guildId,
    placeholderData: (prev) => prev,
  });

  return {
    members: data?.members ?? [],
    total: data?.total ?? 0,
    pageCount: data?.pageCount ?? 0,
    loading,
    isError,
    error: error?.message ?? null,
    page,
    setPage,
    search,
    handleSearch,
  };
}
