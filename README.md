# BOAG Dashboard

Paquete listo para publicarse desde GitHub hacia Render. La aplicación se conserva como sitio estático y también incluye un servidor Node sin dependencias como alternativa.

## Subir a GitHub

1. Descomprime `BOAG_DASH_GITHUB_RENDER.zip`.
2. Crea un repositorio nuevo en GitHub.
3. En **Add file > Upload files**, sube **todos los archivos y carpetas que están dentro** de `BOAG_DASH_GITHUB_RENDER`.
4. Confirma que en la raíz del repositorio aparezcan `index.html`, `public`, `render.yaml`, `package.json` y `server.js`.
5. Guarda con **Commit changes**.

> No subas el ZIP cerrado como único archivo: GitHub no lo descomprime automáticamente.

## Publicar en Render — recomendado

1. En Render selecciona **New > Blueprint**.
2. Conecta el repositorio de GitHub.
3. Render detectará `render.yaml` y creará el sitio estático `boag-dashboard`.
4. Pulsa **Apply**. La carpeta publicada será `public`.

## Publicar manualmente como Static Site

- Build Command: `bash build.sh`
- Publish Directory: `public`

## Alternativa: Render Web Service

El mismo paquete puede ejecutarse como servicio Node:

- Build Command: `npm run build`
- Start Command: `npm start`
- Health Check Path: `/health`

## GitHub Pages

Como `index.html` también está en la raíz, puedes activar **Settings > Pages > Deploy from a branch**, seleccionar `main` y la carpeta `/ (root)`.

## Importante sobre los datos

La aplicación guarda registros, usuarios y carga financiera en el navegador mediante almacenamiento local. Publicarla en Render hace accesible la interfaz, pero no convierte los datos en una base compartida entre computadoras. Las credenciales del prototipo están dentro del código del frontend y no equivalen a autenticación segura de producción.
