# Features - Arquitectura Feature-First

Cada feature es **autocontenida** y contiene toda la lógica relacionada.

## Estructura Estándar

Usa `.template/` como base para nuevas features:

```bash
cp -r src/features/.template src/features/mi-nueva-feature
```

## Features Actuales

### `auth/`
Autenticación y gestión de sesiones con Supabase.
- Login/Signup con Email/Password
- Gestión de sesión
- Protección de rutas

### `dashboard/`
Dashboard principal de la aplicación.
- Navegación principal
- Widgets y stats
- Layout del dashboard

## Principios Feature-First

1. **Colocalización**: Todo relacionado vive junto
2. **Autocontenido**: Cada feature debe funcionar independientemente
3. **No dependencias circulares**: Features no importan de otras features
4. **Usar `shared/`**: Para código reutilizable entre features

## Ejemplo: Agregar nueva feature "profile"

```bash
# 1. Copiar template
cp -r src/features/.template src/features/profile

# 2. Crear componentes
# src/features/profile/components/ProfileCard.tsx
# src/features/profile/components/EditProfileForm.tsx

# 3. Crear hooks
# src/features/profile/hooks/useProfile.ts

# 4. Crear services
# src/features/profile/services/profileService.ts

# 5. Crear types
# src/features/profile/types/Profile.ts

# 6. Crear store (si necesario)
# src/features/profile/store/profileStore.ts
```

## Reglas de Oro

- ✅ **Sí**: `features/auth/components/LoginForm.tsx` importa de `shared/components/Button.tsx`
- ❌ **No**: `features/auth/` importa de `features/dashboard/`
- ✅ **Sí**: Cada feature tiene su propio store local (Zustand)
- ❌ **No**: Estado global innecesario
