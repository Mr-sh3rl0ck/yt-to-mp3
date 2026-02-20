# YT to MP3

Aplicación web para convertir videos de YouTube a MP3. Frontend estático en **Netlify** + Backend API en **Render** con Docker.

## Estructura

```
yt-to-mp3/
├── client/          # Frontend (Netlify)
│   ├── index.html
│   ├── styles.css
│   ├── script.js
│   └── netlify.toml
├── server/          # Backend API (Render)
│   ├── index.js
│   ├── package.json
│   ├── Dockerfile
│   └── .dockerignore
└── README.md
```

## Setup Local

### Backend
```bash
cd server
npm install
node index.js
# Servidor corriendo en http://localhost:3001
```

> **Nota:** Para desarrollo local necesitas tener `yt-dlp` y `ffmpeg` instalados en tu sistema.
>
> - **yt-dlp:** `pip install yt-dlp` o descarga desde [github.com/yt-dlp/yt-dlp](https://github.com/yt-dlp/yt-dlp)
> - **ffmpeg:** Descarga desde [ffmpeg.org](https://ffmpeg.org/download.html)

### Frontend
Abre `client/index.html` directamente en tu navegador, o usa un servidor local:
```bash
cd client
npx serve .
```

## Despliegue

### Backend → Render
1. Crea un **Web Service** en [render.com](https://render.com)
2. Conecta tu repo de GitHub
3. Configura:
   - **Root Directory:** `server`
   - **Environment:** `Docker`
   - El `Dockerfile` ya está configurado con `yt-dlp` y `ffmpeg`
4. Deploy automático 🚀

### Frontend → Netlify
1. Crea un nuevo sitio en [netlify.com](https://netlify.com)
2. Conecta tu repo de GitHub
3. Configura:
   - **Base directory:** `client`
   - **Publish directory:** `client`
   - No necesita build command
4. **IMPORTANTE:** En `client/script.js`, actualiza la constante `API_BASE` con la URL de tu servicio de Render:
   ```js
   const API_BASE = "https://tu-servicio.onrender.com";
   ```
5. Deploy automático 🚀

## Tech Stack
- **Frontend:** HTML, CSS, JavaScript vanilla
- **Backend:** Node.js, Express, yt-dlp-exec
- **Conversión:** yt-dlp + ffmpeg (en Docker)
