# TypeScript Migration Guide

## Tình trạng hiện tại

`tsconfig.json` đang ở **loose mode** — `allowJs: true`, `checkJs: false`, `strict: false`.
Điều này có nghĩa là TypeScript đang hoạt động nhưng chưa enforce rules.

`src/types.ts` đã có đầy đủ types cho toàn app.

## Thứ tự migrate

### Bước 1 — Bắt đầu từ types và api (không có JSX)
```bash
# Rename
mv src/api.js src/api.ts
```

Sau đó import types vào api.ts:
```ts
import type { DiscordUser, Guild, GuildConfig, GuildData, MembersResponse, InviteUrlResponse, StatusResponse } from './types';

export const api = {
  me: (): Promise<DiscordUser> => apiFetch('/auth/me').then(r => r.json()),
  guilds: (): Promise<Guild[]> => apiFetch('/api/guilds').then(r => r.json()),
  // ...
};
```

### Bước 2 — Contexts
```bash
mv src/contexts/AuthContext.jsx src/contexts/AuthContext.tsx
mv src/contexts/GuildContext.jsx src/contexts/GuildContext.tsx
```

Import types từ `../types`:
```ts
import type { AuthContextValue, GuildContextValue } from '../types';
const AuthContext = createContext<AuthContextValue | null>(null);
```

### Bước 3 — Components
```bash
mv src/components/ui.jsx src/components/ui.tsx
mv src/components/ServerRail.jsx src/components/ServerRail.tsx
mv src/components/PluginNav.jsx src/components/PluginNav.tsx
mv src/components/ErrorBoundary.jsx src/components/ErrorBoundary.tsx
```

### Bước 4 — Pages (thứ tự bất kỳ)
```bash
for f in src/pages/*.jsx; do mv "$f" "${f%.jsx}.tsx"; done
```

### Bước 5 — Bật strict mode
Sau khi tất cả files là `.tsx`/`.ts`, update tsconfig.json:
```json
{
  "compilerOptions": {
    "strict": true,
    "checkJs": false,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

Chạy `npm run typecheck` và fix từng lỗi.

## Lệnh hữu ích

```bash
# Kiểm tra lỗi type (không build)
npm run typecheck

# Xem lỗi chi tiết với file
npx tsc --noEmit 2>&1 | head -50

# Check một file cụ thể
npx tsc --noEmit src/api.ts
```

## Những lỗi phổ biến sẽ gặp

### 1. `Object is possibly undefined`
```ts
// Trước
const guild = selectedGuild;
guild.id // ← lỗi vì guild có thể null

// Sau  
const guild = selectedGuild;
if (!guild) return null;
guild.id // ← OK
```

### 2. `useContext` trả về `null`
```ts
// Trước
export function useGuild() {
  return useContext(GuildContext); // type: GuildContextValue | null
}

// Sau
export function useGuild(): GuildContextValue {
  const ctx = useContext(GuildContext);
  if (!ctx) throw new Error('useGuild phải dùng trong GuildProvider');
  return ctx;
}
```

### 3. Event handlers
```ts
// Trước
onChange={e => updateConfig({ prefix: e.target.value })}

// Sau
onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateConfig({ prefix: e.target.value })}
```
