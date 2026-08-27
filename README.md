# Inventario TSC

App híbrida PWA de inventario. Funciona:
- **Móviles**: como PWA instalable (pantalla completa, offline)
- **PC**: como página web normal
- **Host**: GitHub Pages actúa como servidor

## Uso

1. Abre la URL de GitHub Pages del repositorio desde el móvil o el PC.
2. En el móvil usa el menú del navegador → "Instalar aplicación" / "Añadir a pantalla de inicio".
3. La app queda instalada como nativa y funciona offline.

## Estructura

```
index.html       - Página principal
styles.css       - Estilos
app.js           - Lógica + registro del Service Worker
manifest.json    - Configuración PWA
sw.js            - Service Worker (caché offline)
icons/           - Íconos de la app
.github/workflows/deploy.yml - Publicación automática a GitHub Pages
```

## URL

La app se publica automáticamente en GitHub Pages cada vez que haces push a `main`.
