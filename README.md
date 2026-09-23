# TOPS Conocimiento V2.2 — Código fuente

Este proyecto contiene la versión editable de `TOPS_Conocimiento_V2.2_FULL.html`.
Está organizado para abrirlo como carpeta en Visual Studio Code, sin tener que modificar un HTML de más de 150 MB en una sola línea.

## Estructura

- `index.html`: estructura visible de la aplicación.
- `src/styles.css`: colores, tamaños, distribución y diseño responsive.
- `src/app.js`: lógica principal, accesos, Auto test, evaluaciones, documentos y respaldos.
- `src/sync.js`: motor de sincronización cloud + local-first (bandeja de salida, envío a Supabase, traída de datos de otras tablets).
- `src/v19-overrides.js`: reglas de alcance, preguntas y evaluaciones incorporadas desde V1.9.
- `src/v20-compat.js`: compatibilidad con históricos anteriores.
- `data/app-config.js`: configuración, catálogo y banco de preguntas en formato JavaScript legible.
- `data/sync-config.js`: credenciales de sincronización **propias de cada tablet** (Supabase). Ver `supabase/README_SYNC.md`.
- `docs/`: 210 instructivos PDF utilizados por la aplicación.
- `tools/build_full.py`: vuelve a generar un único HTML FULL con todos los PDF embebidos.
- `supabase/schema.sql` y `supabase/README_SYNC.md`: base de datos central y guía de puesta en marcha de la sincronización.

## Cloud + Local-first

Por defecto la app funciona exactamente igual que antes: todo local,
sin depender de Internet. La sincronización entre tablets es opcional
y se activa por dispositivo en `data/sync-config.js`. Guía completa
en `supabase/README_SYNC.md`.


## Abrir y modificar en Visual Studio Code

1. Descomprime el ZIP.
2. En Visual Studio Code selecciona **Archivo → Abrir carpeta**.
3. Abre esta carpeta completa, no solamente `index.html`.
4. Para visualizarla, usa **Live Server** o ejecuta en la terminal:

```bash
python -m http.server 5500
```

5. Abre `http://localhost:5500` en el navegador.

## Dónde realizar cambios

- Textos y estructura de pantallas: `index.html`.
- Apariencia visual: `src/styles.css`.
- Funciones y validaciones: `src/app.js` y `src/v19-overrides.js`.
- Preguntas, documentos, equipos y parámetros: `data/app-config.js`.

En `data/app-config.js`, conserva esta forma:

```javascript
window.TOPS_CONFIG = {
  // configuración
};
```

## Generar nuevamente el HTML único

Después de modificar el proyecto, ejecuta:

```bash
python tools/build_full.py
```

El archivo se creará en:

`dist/TOPS_Conocimiento_V2.2_FULL.html`

Ese archivo vuelve a ser autónomo: incluye configuración, código y los 210 PDF dentro del mismo HTML.
