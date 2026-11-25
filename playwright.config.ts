import { defineConfig, devices } from '@playwright/test';

// Los tests corren contra el servidor de desarrollo (algunos importan módulos sueltos, que el build no sirve), en un
// puerto propio para no reutilizar por error otro servidor que haya en el 5173. Antes, los navegadores:
// `npx playwright install chromium webkit`.
const PUERTO = 4791;

export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    // Un reintento en local: un fallo por carga del equipo sale como «flaky» y no como fallo, y sigue diciendo cuál fue
    retries: process.env.CI ? 2 : 1,
    workers: process.env.CI ? 1 : 2,
    reporter: process.env.CI ? 'github' : 'list',

    use: {
        baseURL: `http://localhost:${PUERTO}`,
        // Los tests dan por hecho el castellano: el idioma de la app, sin elegir, es el del navegador
        locale: 'es-ES',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },

    projects: [
        {
            name: 'Desktop Chrome',
            use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
        },
        {
            name: 'Mobile Safari',
            use: { ...devices['iPhone 13'] },
        },
    ],

    webServer: {
        command: `npm run dev -- --port ${PUERTO} --strictPort`,
        url: `http://localhost:${PUERTO}`,
        reuseExistingServer: false,
        timeout: 60000,
    },
});
