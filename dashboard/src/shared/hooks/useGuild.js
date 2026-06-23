import { useContext } from 'react';
import { GuildContext } from '../context/GuildContext.js';

export function useGuild() {
  const ctx = useContext(GuildContext);
  if (!ctx) {
    throw new Error('useGuild must be used inside <GuildProvider>');
  }
  return ctx;
}
