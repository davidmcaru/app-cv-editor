import { defineConfig } from 'vite';

// `base: './'`: el build usa rutas relativas, así que funciona servido desde la raíz de un dominio o desde una
// subcarpeta (GitHub Pages, por ejemplo) sin tocar nada.
export default defineConfig({
    base: './',
    build: {
        target: 'es2022',
        // Las licencias de lo de terceros que va dentro (Font Awesome, html-to-image), en un archivo junto al build: las
        // piden en cada copia que se publica, y al minificar se pierden los avisos que traen en su código
        license: { fileName: 'THIRD-PARTY-LICENSES.md' },
    },
});
