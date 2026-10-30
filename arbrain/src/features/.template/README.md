# Feature Template

Esta es la estructura estándar para cada feature en el proyecto.

## Estructura

```
features/[nombre-feature]/
├── components/      # Componentes React específicos de la feature
├── hooks/           # Custom hooks específicos de la feature
├── services/        # API calls y lógica de negocio
├── types/           # TypeScript types/interfaces específicos
└── store/           # Estado local de la feature (Zustand)
```

## Ejemplo de uso

Para crear una nueva feature llamada `dashboard`:

```bash
cp -r src/features/.template src/features/dashboard
```

## Principios

1. **Autocontenido**: Todo lo relacionado con la feature vive aquí
2. **Colocalización**: Componentes, hooks, types juntos
3. **No dependencias circulares**: Features no deben importar de otras features
4. **Usar shared/**: Para código reutilizable entre features

## Ejemplo: Feature "auth"

```
features/auth/
├── components/
│   ├── LoginForm.tsx
│   └── SignupForm.tsx
├── hooks/
│   ├── useAuth.ts
│   └── useSession.ts
├── services/
│   └── authService.ts
├── types/
│   ├── User.ts
│   └── Session.ts
└── store/
    └── authStore.ts
```
