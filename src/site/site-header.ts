// Los iconos de toda la app (Font Awesome), del paquete de npm y no de una CDN: así la app no pide nada fuera, salvo la
// traducción cuando se le da permiso
import '@fortawesome/fontawesome-free/css/all.min.css';
import { AJUSTE_IDIOMA, AJUSTE_TEMA } from '../components/core/ajustes/ajustes-general.ts';
import { AJUSTE_TRADUCCION_CV } from '../components/core/ajustes/ajustes-cv.ts';
import { escribirAjuste, leerAjuste, observarAjuste } from '../components/core/ajustes/ajustes-sync.ts';
import type { CampoAjuste } from '../components/core/ajustes/ajustes-contrato.ts';
import { paintToggleButtons, resolveTheme } from '../components/core/theme/theme-core.ts';
import { SITE } from './site.config.ts';

// La cabecera de la app: los Ajustes (idioma, tema y permiso de traducción), el cambio de tema, que lo lleva
// theme-toggle.ts, y el enlace al código. Los textos de la cabecera siguen al idioma de los Ajustes; los del editor, al
// del CV que tienes abierto.

type Idioma = 'es' | 'en';

const TEXTOS: Record<Idioma, Record<string, string>> = {
    es: {
        settings: 'Ajustes',
        source: 'El código, en GitHub',
        language: 'Idioma',
        languageHelp:
            'El de la app y el del CV al abrirla. Lo que escribes se traduce desde él a los otros dos idiomas.',
        theme: 'Tema',
        light: 'Claro',
        dark: 'Oscuro',
        auto: 'Sistema',
        translation: 'Traducción automática',
        translationHelp:
            'Al guardar, lo que has escrito se envía a MyMemory para traducirlo. Nada más sale del navegador.',
        ask: 'Preguntar',
        granted: 'Sí',
        denied: 'No',
    },
    en: {
        settings: 'Settings',
        source: 'Source code on GitHub',
        language: 'Language',
        languageHelp:
            "The app's language, and the CV's when the app opens. Your edits are translated from it into the other two.",
        theme: 'Theme',
        light: 'Light',
        dark: 'Dark',
        auto: 'System',
        translation: 'Automatic translation',
        translationHelp:
            'When you save, what you wrote is sent to MyMemory to be translated. Nothing else leaves your browser.',
        ask: 'Ask',
        granted: 'Yes',
        denied: 'No',
    },
};

// Sin idioma elegido, el del navegador: castellano si lo es, inglés si no. Antes de que arranque el editor, que lo lee
function idiomaInicial(): void {
    try {
        if (localStorage.getItem(AJUSTE_IDIOMA.clave) !== null) return;
        const es = (navigator.language || '').toLowerCase().startsWith('es');
        escribirAjuste(AJUSTE_IDIOMA, es ? 'es' : 'en');
    } catch {
        /* sin localStorage: se queda el de fábrica */
    }
}

function pintaTextos(): void {
    const t = TEXTOS[leerAjuste(AJUSTE_IDIOMA)];
    document.querySelectorAll<HTMLElement>('[data-site-i18n]').forEach((el) => {
        el.textContent = t[el.dataset.siteI18n ?? ''] ?? '';
    });
    document.querySelectorAll<HTMLElement>('[data-site-i18n-label]').forEach((el) => {
        const texto = t[el.dataset.siteI18nLabel ?? ''] ?? '';
        el.setAttribute('aria-label', texto);
        el.setAttribute('title', texto);
    });
    // El botón de tema lo pinta theme-core, que lee de aquí el idioma de la app: <html lang> lleva el del CV
    document.body.dataset.appLang = leerAjuste(AJUSTE_IDIOMA);
    paintToggleButtons(resolveTheme());
}

// Cada grupo de opciones, atado a su ajuste: marca el que hay y guarda el que se elige
function ata<T extends string>(nombre: string, campo: CampoAjuste<T>): () => void {
    const radios = [...document.querySelectorAll<HTMLInputElement>(`input[name="${nombre}"]`)];
    const marca = (): void => {
        const valor = leerAjuste(campo);
        radios.forEach((r) => (r.checked = r.value === valor));
    };
    radios.forEach((r) =>
        r.addEventListener('change', () => {
            if (r.checked) escribirAjuste(campo, r.value);
        })
    );
    observarAjuste(campo, marca);
    marca();
    return marca;
}

function initAjustes(): void {
    const boton = document.getElementById('siteSettingsToggle');
    const panel = document.getElementById('siteSettings');
    if (!boton || !panel) return;
    const abre = (si: boolean): void => {
        panel.hidden = !si;
        boton.setAttribute('aria-expanded', String(si));
        if (si) panel.querySelector<HTMLInputElement>('input:checked')?.focus();
    };
    boton.addEventListener('click', () => abre(panel.hidden));
    document.addEventListener('click', (e) => {
        const dentro = e.target instanceof Node && (panel.contains(e.target) || boton.contains(e.target));
        if (!panel.hidden && !dentro) abre(false);
    });
    panel.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        // ⚠️ Sin parar aquí, el Escape del editor (en document) cerraría también el panel del CV que hubiera abierto
        e.stopPropagation();
        abre(false);
        boton.focus();
    });

    ata('site-idioma', AJUSTE_IDIOMA);
    ata('site-traduccion', AJUSTE_TRADUCCION_CV);
    // El tema también cambia con su botón, que no pasa por los Ajustes: theme-core avisa con `themechange`
    const marcaTema = ata('site-tema', AJUSTE_TEMA);
    window.addEventListener('themechange', marcaTema);
}

idiomaInicial();

function init(): void {
    document.getElementById('siteSource')?.setAttribute('href', SITE.sourceUrl);
    pintaTextos();
    observarAjuste(AJUSTE_IDIOMA, pintaTextos);
    initAjustes();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
