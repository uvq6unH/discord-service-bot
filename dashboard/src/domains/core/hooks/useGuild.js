import { useGuild as useGuildContext } from '../../../shared/hooks/useGuild.js';

export function useGuild() {
  return useGuildContext();
}
