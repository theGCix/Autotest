# Cloud + Local-first — Puesta en marcha

La app sigue funcionando 100% offline por defecto (`sync.enabled: false`).
Esto activa la sincronización entre las tablets sin que dejen de poder
trabajar sin Internet.

## 1. Crear el proyecto en Supabase

1. https://supabase.com → New project.
2. SQL Editor → pega el contenido de `supabase/schema.sql` → Run.
3. Project Settings → API: copia **Project URL** y **anon public key**.

## 2. Crear una cuenta técnica por tablet

Authentication → Users → Add user (una por tablet, no por operario):

```
tablet01@tops-conocimiento.local   (contraseña fuerte)
tablet02@tops-conocimiento.local   (contraseña fuerte)
```

Esto es lo que permite que RLS distinga "tablet autenticada" de
"cualquiera en Internet"; el operario sigue entrando con su código+PIN
como siempre, eso no cambia.

## 3. Configurar cada tablet

Esta app no tiene build step (no hay Vite/Webpack), así que el navegador
**no puede leer un `.env` directamente**. En su lugar, el `.env` es la
fuente de verdad y un script genera `data/sync-config.js` a partir de él:

```bash
cp .env.example .env      # una vez por tablet
# edita .env con los datos reales de esa tablet
python3 tools/gen_sync_config.py
```

Esto sobrescribe `data/sync-config.js` (no lo edites a mano: se pierde
al volver a generar). El `.gitignore` ya excluye `.env` y
`data/sync-config.js` para que no queden credenciales en el repositorio.

Para una segunda tablet: guarda otro archivo (por ejemplo `.env.tab02`)
con su propio `deviceEmail`/`devicePassword`/`TOPS_DEVICE_ID`, y genera
con `python3 tools/gen_sync_config.py .env.tab02` justo antes de copiar
los archivos a esa tablet.

Recarga la app. El indicador junto al botón ⋮ muestra el estado:
**Local** (sync apagada) → **Sincronizando…** → **Sincronizado** /
**Pendiente (n)** / **Sin conexión**.

## 4. Qué pasa sin Internet

Todo sigue igual que antes: se guarda en `localStorage` de inmediato y
la evaluación nunca se bloquea. Los cambios quedan en una "bandeja de
salida" local y se envían solos cuando vuelve la conexión (o al tocar
**Sincronizar ahora** en el menú ⋮).

## 5. Lo que falta para producción (siguiente etapa)

Esta primera versión cubre el motor de sincronización y el esquema de
base de datos. Para el despliegue final en planta, según el documento
de arquitectura, todavía falta:

- **Kiosk Mode** en las tablets Android (fuera del alcance de este
  código: se configura a nivel de dispositivo/MDM).
- **Panel de administración separado** (hoy la gestión vive dentro de
  la misma PWA; el documento sugiere una interfaz distinta para
  supervisores/PC, no solo la tablet).
- **Versionado de evaluaciones** (`Evaluación Seguridad v1.0 → v1.1`)
  cuando cambien preguntas ya usadas en evaluaciones pasadas.
- **Rotación/expiración de contraseña de cuenta técnica** y revisión
  de si conviene una VLAN/Wi-Fi dedicada para las tablets (capa de
  red, no de aplicación).
- Pruebas de carga con datos reales antes de apagar `sync.enabled`
  en producción.
