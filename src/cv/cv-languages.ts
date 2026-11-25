import { state, applyTextConfig } from './cv-state.ts';
import { updateButtonLabels, renderLanguageIfNeeded } from './cv-data-loader.ts';
import { sourceLang, translateEditedContent } from './cv-translation.ts';
import { setupEditChrome } from './cv-edit-mode.ts';
import { persistManualSnapshot } from './cv-controller.ts';
import type { Lang } from './cv-types.ts';

// El ciclo arranca en el idioma del sitio: en inglés va EN → ES → DE
function getNextLanguage(currentLang: Lang): Lang {
    const site = sourceLang();
    const ciclo: Lang[] = [site, ...(['ES', 'EN', 'DE'] as const).filter((l) => l !== site)];
    return ciclo[(ciclo.indexOf(currentLang) + 1) % ciclo.length] ?? site;
}

function applyLanguageVisibility(nextLang: Lang): void {
    const cvEs = document.getElementById('cv-es');
    const cvEn = document.getElementById('cv-en');
    const cvDe = document.getElementById('cv-de');

    if (!cvEs || !cvEn || !cvDe) return;

    // Tipar la tupla explícitamente: sin la anotación, TS infiere el array como
    // (string | HTMLElement)[][] y pierde qué elemento es el nodo y cuál el código.
    const trees: Array<[HTMLElement, Lang]> = [
        [cvEs, 'ES'],
        [cvEn, 'EN'],
        [cvDe, 'DE'],
    ];
    trees.forEach(([el, code]) => {
        const isActive = nextLang === code;
        if (isActive) {
            el.removeAttribute('hidden');
            el.classList.add('cv-lang-active');
            el.style.removeProperty('display');
        } else {
            el.setAttribute('hidden', '');
            el.classList.remove('cv-lang-active');
            el.style.removeProperty('display');
        }
    });
}

export function applyLanguageMeta(nextLang: Lang): void {
    document.body.classList.remove('lang-es', 'lang-en', 'lang-de');
    document.body.classList.add(`lang-${nextLang.toLowerCase()}`);

    // El idioma del documento debe seguir al de la UI (lectores de
    // pantalla pronuncian según lang; antes quedaba lang="es" fijo).
    document.documentElement.lang = nextLang.toLowerCase();

    const roleTitle = state.activeData?.header?.title?.[nextLang] || state.activeData?.header?.title?.ES || '';
    const folio = document.getElementById(`cv-${nextLang.toLowerCase()}`);
    const rawName = state.activeData?.personal?.name;
    const name =
        folio?.querySelector('.header h1')?.textContent?.trim() ||
        (typeof rawName === 'string' ? rawName : rawName?.[nextLang]) ||
        '';
    const role = folio?.querySelector('.header h2')?.textContent?.trim() || roleTitle;
    document.title = ['CV', name, role].filter(Boolean).join(' - ') + ` (${nextLang})`;
}

// Al guardar lo editado (cv-edit-mode avisa con «cv:guardado»), el título vuelve a leer el nombre y el cargo
document.addEventListener('cv:guardado', () => applyLanguageMeta(state.currentLang));

export async function toggleLanguage() {
    const previousLang = state.currentLang;
    const nextLang = getNextLanguage(previousLang);

    if (state.editMode) {
        // En flujo de edición NO salir de editar.
        // Si salimos del idioma del sitio, consolidar y traducir cambios al resto antes de cambiar.
        if (previousLang === sourceLang() && state.editedElements.size > 0 && !state.isTranslating) {
            await translateEditedContent();
        }

        // Guardado manual de snapshot antes del cambio de idioma (sin salir de editar).
        {
            persistManualSnapshot();
        }
    }

    state.currentLang = nextLang;
    // Lazy-render del idioma destino si todavía no se ha generado.
    renderLanguageIfNeeded(nextLang);
    applyLanguageVisibility(nextLang);
    applyLanguageMeta(nextLang);
    applyTextConfig();

    updateButtonLabels(state.currentLang);

    // El chrome de edición (overlays) vive solo en el árbol activo —
    // re-inyectarlo en el idioma recién mostrado si seguimos editando.
    if (state.editMode) setupEditChrome();
}

// Aplica un idioma concreto a la UI sin alternar. Se usa en el arranque para respetar el idioma
// guardado en preferencias (bug: al recargar en EN/DE volvía a cargar en ES porque el boot solo
// fijaba state.currentLang, sin aplicar la visibilidad/meta/etiquetas del idioma).
export function applyLanguage(lang: Lang): void {
    state.currentLang = lang;
    renderLanguageIfNeeded(lang);
    applyLanguageVisibility(lang);
    applyLanguageMeta(lang);
    applyTextConfig();
    updateButtonLabels(lang);
    if (state.editMode) setupEditChrome();
}

// toggleLanguage se enlaza ahora desde cv-event-bindings.js (sin onclick inline).
