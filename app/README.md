# Zoom Agricultura — app

App nativa (React Native + Expo) de monitoreo de plagas de suelo. Migración
del prototipo funcional que vive en `../reference/` — leer
`../reference/CONTEXTO.md` antes de tocar nada.

## Stack

- **Expo (React Native)** con Expo Router (navegación por archivos) y TypeScript.
- **Supabase**: Postgres + Auth + Storage. Esquema y políticas de RLS en `../supabase/schema.sql`.
- **react-native-svg** para el mapa de campo y los mapas de densidad (portado del SVG a mano del prototipo).
- **d3-delaunay** para la interpolación tipo Voronoi (misma lógica que el prototipo, sin dependencias de DOM).
- **expo-location** para GPS real, **expo-sqlite** para la cola offline local, **expo-image-picker** para fotos.
- **jszip** + **fast-xml-parser** para procesar el KMZ subido (reemplaza los datos hardcodeados del prototipo).

## Setup

```bash
cd app
npm install
cp .env.example .env   # completar con la URL y anon key del proyecto Supabase
```

Antes de correr la app, crear el proyecto en [supabase.com](https://supabase.com) y
correr `../supabase/schema.sql` en el SQL Editor del proyecto (una sola vez).

```bash
npm run ios       # o android / web
```

## Estructura

```
src/
  app/            # pantallas — convención de Expo Router (cada archivo = una ruta)
    login.tsx
    (app)/        # rutas que requieren sesión
  lib/            # supabase client, auth context, helpers de dominio (roles, etc.)
  theme/          # paleta de colores portada del prototipo
  types/          # tipos de dominio (Usuario, Lote, Punto, Carga, ...)
```

## Estado de la migración

Ver las tasks del repo / `../reference/CONTEXTO.md` para el detalle de qué
falta portar (vista de campo con GPS, mapa de densidad, carga de datos por
punto, exportación PDF/GPX/KML, pipeline real de KMZ, sync offline,
notificaciones push). Por ahora está el scaffold: auth real contra Supabase,
navegación base y modelo de datos.
