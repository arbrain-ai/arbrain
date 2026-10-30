# Shared - Código Reutilizable

Código compartido entre todas las features del proyecto.

## Estructura

### `components/`
UI components genéricos reutilizables (Button, Card, Input, Modal, etc.)

**Ejemplo:**
```typescript
// shared/components/Button.tsx
export function Button({ children, variant, onClick }: ButtonProps) {
  return <button className={`btn btn-${variant}`} onClick={onClick}>{children}</button>
}
```

### `hooks/`
Custom hooks genéricos (useDebounce, useLocalStorage, useMediaQuery, etc.)

**Ejemplo:**
```typescript
// shared/hooks/useDebounce.ts
export function useDebounce<T>(value: T, delay: number): T {
  // ...
}
```

### `stores/`
Estado global de la aplicación (Zustand)

**Ejemplo:**
```typescript
// shared/stores/appStore.ts
export const useAppStore = create<AppState>((set) => ({
  theme: 'light',
  setTheme: (theme) => set({ theme }),
}))
```

### `types/`
TypeScript types compartidos (api.ts, domain.ts, etc.)

**Ejemplo:**
```typescript
// shared/types/api.ts
export interface ApiResponse<T> {
  data: T
  error?: string
}
```

### `utils/`
Funciones utilitarias genéricas (formatters, validators, helpers, etc.)

**Ejemplo:**
```typescript
// shared/utils/formatters.ts
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount)
}
```

### `lib/`
Configuraciones de librerías externas (supabase.ts, axios.ts, etc.)

**Ejemplo:**
```typescript
// shared/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

### `constants/`
Constantes de la aplicación

**Ejemplo:**
```typescript
// shared/constants/routes.ts
export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
} as const
```

### `assets/`
Imágenes, iconos, fuentes, etc.

## Principios

1. **Genérico**: Solo código verdaderamente reutilizable
2. **Sin lógica de negocio**: La lógica específica va en features/
3. **Bien documentado**: JSDoc en funciones públicas
4. **Type-safe**: Todo tipado con TypeScript
