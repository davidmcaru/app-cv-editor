import es from '../i18n/es.json';
import en from '../i18n/en.json';
import de from '../i18n/de.json';
import { state, subscribeState } from './cv-state.ts';
import type { Lang } from './cv-types.ts';

const DICTS: Record<Lang, Record<string, string>> = { ES: es, EN: en, DE: de };

/** Traducción de una clave al idioma de la UI (= state.currentLang), con interpolación
 * `{name}` opcional. Fallback: idioma actual → ES → la propia clave (visible = bug). */
export function t(key: string, vars?: Record<string, string | number>): string {
    const dict = DICTS[state.currentLang] || DICTS.ES;
    let out = dict[key] ?? DICTS.ES[key] ?? key;
    if (vars) {
        for (const [name, value] of Object.entries(vars)) {
            out = out.replaceAll(`{${name}}`, String(value));
        }
    }
    return out;
}

/**
 * Aplicador DOM: recorre los elementos anotados y aplica t(clave).
 *  - [data-i18n]        → textContent (en INPUT/TEXTAREA → placeholder).
 *  - [data-i18n-title]  → atributo title.
 *  - [data-i18n-aria]   → aria-label.
 * Solo escribe si la clave EXISTE en el diccionario.
 */
export function translateEditorUI(): void {
    const dict = DICTS[state.currentLang] || DICTS.ES;

    document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        const val = key ? (dict[key] ?? DICTS.ES[key]) : undefined;
        if (val === undefined) return;
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            if (!el.hasAttribute('value')) el.placeholder = val;
        } else {
            // ⚠️ Solo textContent: los iconos van en nodos hermanos <i>/<svg> y innerHTML los borraría
            el.textContent = val;
        }
    });

    document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
        const key = el.getAttribute('data-i18n-title');
        const val = key ? (dict[key] ?? DICTS.ES[key]) : undefined;
        if (val !== undefined) el.setAttribute('title', val);
    });

    document.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => {
        const key = el.getAttribute('data-i18n-aria');
        const val = key ? (dict[key] ?? DICTS.ES[key]) : undefined;
        if (val !== undefined) el.setAttribute('aria-label', val);
    });

    _subscribers.forEach((fn) => {
        try {
            fn();
        } catch (err) {
            console.warn('[cv-i18n] subscriber error:', err);
        }
    });
}

// Refrescos de UI DINÁMICA tras cada aplicación (p.ej. re-render del panel Mis CVs si está
// abierto, swatches del design picker): los módulos se registran aquí en vez de duplicar
// la suscripción al estado.
type UiLangSubscriber = () => void;
const _subscribers = new Set<UiLangSubscriber>();
export function onUiLangApplied(fn: UiLangSubscriber): () => void {
    _subscribers.add(fn);
    return () => {
        _subscribers.delete(fn);
    };
}

// Re-aplicar el chrome al cambiar el idioma del documento (ESP→ENG→DEU). El boot llama a
// translateEditorUI() explícitamente (cv-controller) — esto cubre los cambios posteriores.
subscribeState((change) => {
    if (change.key === 'currentLang') translateEditorUI();
});
