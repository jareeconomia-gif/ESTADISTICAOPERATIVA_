# Estadística Operativa — versión productiva

Esta versión conserva la interfaz del `index.html` original y la convierte en una aplicación web multiusuario con servidor y base de datos compartida.

## Qué incluye

- Inicio de sesión validado en el servidor.
- Contraseñas cifradas con `scrypt`; ya no aparecen en el HTML.
- Sesiones mediante cookie `HttpOnly` y `SameSite=Strict`.
- Base de datos SQLite compartida para registros, catálogos, proyectos y actividad.
- Permisos por rol: responsable, autorizador, directivo y administrador.
- Validación de las transiciones del flujo de aprobación en el servidor.
- Bitácora de accesos y cambios.
- Respaldos automáticos diarios, conservando los 14 más recientes.
- Descarga manual de respaldo para el administrador.
- Migración opcional de registros que todavía existan en `localStorage` del navegador anterior.
- Dockerfile y configuración para publicar en Render con disco persistente.

## Ejecutar en Windows

1. Instala Node.js 22 o superior.
2. Descomprime la carpeta completa.
3. Abre `INICIAR_APP_WINDOWS.bat`.
4. La aplicación se abrirá en `http://localhost:3000`.

También puedes abrir una terminal dentro de la carpeta y ejecutar:

```bash
npm start
```

No necesita instalar paquetes adicionales.

## Credenciales iniciales

Los usuarios se conservan como estaban en el index original.

- Responsables y autorizadores: contraseña inicial `Volumetria2026`.
- Administrador `edgar.montenegro`: contraseña inicial `Admin2026`.

Cada usuario debe entrar y usar el botón **Contraseña** para cambiarla antes de operar con información real.

## Publicar en Render

El archivo `render.yaml` ya solicita un servicio Docker y un disco persistente en `/data`.

1. Sube esta carpeta a un repositorio privado de GitHub.
2. En Render selecciona **New → Blueprint**.
3. Conecta el repositorio.
4. Render detectará `render.yaml` y creará la aplicación con almacenamiento persistente.

La URL pública utilizará HTTPS. No publiques la aplicación sin cambiar las contraseñas iniciales.

## Publicar en Replit

La carpeta incluye `.replit`. Importa el ZIP como proyecto Node.js y presiona **Run**. Para uso corporativo permanente, verifica que el despliegue tenga almacenamiento persistente para la carpeta `data`.

## Archivos importantes

- `public/index.html`: interfaz original adaptada al backend.
- `server.js`: API, autenticación, permisos, base de datos y respaldos.
- `data/estadistica-operativa.sqlite`: base de datos creada al iniciar.
- `backups/`: respaldos automáticos locales.
- `.env.example`: variables disponibles para producción.

## Recomendaciones antes de usarla oficialmente

- Cambiar todas las contraseñas iniciales.
- Publicarla exclusivamente por HTTPS.
- Usar un disco persistente y descargar respaldos periódicos.
- Limitar el acceso mediante VPN, red corporativa o proveedor de identidad cuando TI lo requiera.
- Realizar una prueba con una cuenta de cada rol antes de cargar datos oficiales.
