import { createToaster, type ToastType } from '../components/widgets/toast/toast.ts';
import {
    confirmDialog as sharedConfirmDialog,
    promptDialog as sharedPromptDialog,
} from '../components/widgets/dialog/dialog.ts';
import { t } from './cv-i18n.ts';
import type { CVManualSnapshot } from './cv-types.ts';

const ALLOWED_TAGS = new Set([
    'div',
    'section',
    'article',
    'header',
    'footer',
    'main',
    'aside',
    'nav',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'span',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'strike',
    'del',
    'br',
    'hr',
    'ul',
    'ol',
    'li',
    'a',
    'img',
    'small',
    'sub',
    'sup',
    'mark',
    'q',
    'blockquote',
    'cite',
    'time',
    'figure',
    'figcaption',
]);

const ALLOWED_ATTRS = new Set([
    'class',
    'id',
    'href',
    'src',
    'alt',
    'title',
    'data-editable',
    'data-editable-link',
    'data-editable-list',
    'data-editable-skills',
    'data-editable-job-list',
    'data-image-link',
    'data-image-type',
    'data-image-url',
    'data-translate-id',
    'data-format-index',
    'data-theme-index',
    'data-theme-mode',
    'role',
    'aria-label',
    'aria-selected',
    'aria-disabled',
    'aria-hidden',
    'aria-live',
    'tabindex',
    // `contenteditable` NO va en la allow-list: si sobrevive al
    // sanitizado, un snapshot guardado→recargado dejaría nodos editables fuera del
    // modo edición. enableEditing() lo re-aplica al entrar en edición.
    'draggable',
    'style',
    'target',
    'rel',
]);

const SAFE_URL_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:', 'sms:'];

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
// Nota: la imagen se guarda como base64 (~+33%) y se triplica en los árboles
// ES/EN/DE del snapshot, así que una imagen grande puede superar el cap de ~5 MB de localStorage.
// Se mantiene el límite en 5 MB (preferencia del propietario); si el guardado falla por cuota,
// ahora falla de forma LIMPIA (persistLocalSnapshot devuelve false + toast, no un falso "guardado").
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

// Allow-list de propiedades CSS seguras para el atributo style: sustituye a la
// antigua deny-list, evitable con escapes CSS (`\75rl(`, `image-set(...)`).
const ALLOWED_STYLE_PROPS = new Set([
    'color',
    'background-color',
    'background',
    'text-decoration',
    'text-align',
    'text-transform',
    'font',
    'font-size',
    'font-weight',
    'font-style',
    'font-family',
    'line-height',
    'letter-spacing',
    'width',
    'height',
    'max-width',
    'max-height',
    'min-width',
    'min-height',
    'margin',
    'margin-top',
    'margin-right',
    'margin-bottom',
    'margin-left',
    'padding',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'opacity',
    'display',
    'border',
    'border-color',
    'border-width',
    'border-style',
    'border-radius',
    'gap',
    'flex',
    'flex-direction',
    'align-items',
    'justify-content',
    'white-space',
    'vertical-align',
]);
// Construcciones peligrosas en un valor CSS (incluye escapes con backslash e image-set).
const STYLE_VALUE_BLOCKLIST = /(expression|behavior|javascript:|vbscript:|@import|url\s*\(|image-set|\\|<|>)/i;

/**
 * Devuelve true si la URL es segura (esquema en lista blanca, sin javascript:/data:/vbscript:).
 * Acepta también rutas relativas (`./foo`, `/foo`, `#anchor`, `?query`).
 */
export function isSafeUrl(value: unknown): boolean {
    // `unknown` a propósito: recibe datos NO confiables (snapshots, pegado, código
    // compartido). Tiparlo como string dejaría el guard de abajo como letra muerta.
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (!trimmed) return true; // permitido como "vacío"
    if (trimmed.startsWith('#') || trimmed.startsWith('?') || trimmed.startsWith('/')) return true;
    if (trimmed.startsWith('./') || trimmed.startsWith('../')) return true;
    // Imágenes embebidas del usuario (subida → base64): se permiten SOLO data:image/* de tipos
    // conocidos. NO se permite data:text/html ni data:application/* (posible vector XSS). El
    // archivo ya se valida por tipo y tamaño en validateImageFile antes de convertirse a dataURL.
    // Sin esto, el sanitizador borra el src al restaurar el snapshot y la imagen subida se pierde
    // al recargar la página.
    if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(trimmed)) return true;
    // Detectar esquema explícito
    const colonIdx = trimmed.indexOf(':');
    const slashIdx = trimmed.indexOf('/');
    if (colonIdx === -1 || (slashIdx !== -1 && slashIdx < colonIdx)) {
        // Sin esquema explícito → asumimos relativa
        return true;
    }
    try {
        const url = new URL(trimmed, window.location.origin);
        return SAFE_URL_SCHEMES.includes(url.protocol);
    } catch (_e) {
        return false;
    }
}

/** Sanitiza una URL: devuelve la original si es segura, '#' si no. */
export function safeUrl(value: unknown): string {
    return isSafeUrl(value) ? String(value).trim() : '#';
}

export { escapeHtml, escapeAttr } from '../components/core/utils/escape-html.ts';

/**
 * Limpia un atributo style con allow-list de propiedades.
 * Descarta declaraciones cuya propiedad no esté permitida o cuyo valor contenga
 * construcciones peligrosas (url(), image-set, escapes CSS, expression, etc.).
 */
function sanitizeStyle(value: unknown): string {
    if (typeof value !== 'string' || !value) return '';
    const safe: string[] = [];
    for (const decl of value.split(';')) {
        const idx = decl.indexOf(':');
        if (idx === -1) continue;
        const prop = decl.slice(0, idx).trim().toLowerCase();
        const val = decl.slice(idx + 1).trim();
        if (!prop || !val) continue;
        if (!ALLOWED_STYLE_PROPS.has(prop)) continue;
        if (STYLE_VALUE_BLOCKLIST.test(val)) continue;
        safe.push(`${prop}: ${val}`);
    }
    return safe.join('; ');
}

/**
 * Sanea HTML del CV con whitelist de tags + atributos.
 * Elimina <script>, on* handlers, javascript: URLs, etc.
 */
export function sanitizeCVHTML(html: unknown): string {
    if (typeof html !== 'string' || !html) return '';
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    // Eliminar ENTEROS (con su contenido) los elementos que nunca deben aportar
    // texto al desenvolverse: script/style/iframe/etc. y el chrome de edición serializado en snapshots antiguos
    // (botones ×/+ Añadir; el sanitizador los desenvolvería dejando "×"/"+ Añadir"
    // como texto suelto). El chrome actual (edt-*) tampoco es contenido.
    tpl.content
        .querySelectorAll(
            'script, style, iframe, object, embed, noscript, button, .list-item-controls, .edt-crud-overlay, .edt-addbar'
        )
        .forEach((el) => el.remove());
    sanitizeNode(tpl.content);
    return tpl.innerHTML;
}

function sanitizeNode(root: Node): void {
    // Recorrido seguro: recoger nodos a procesar, luego operar
    // (SHOW_ELEMENT garantiza que todo lo que devuelve el walker es un Element.)
    const toProcess: Element[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
    let node = walker.nextNode();
    while (node) {
        toProcess.push(node as Element);
        node = walker.nextNode();
    }
    for (const el of toProcess) {
        const tag = el.tagName.toLowerCase();
        if (!ALLOWED_TAGS.has(tag)) {
            // Reemplazar elemento por su contenido (no perder texto interno)
            const parent = el.parentNode;
            if (!parent) continue;
            while (el.firstChild) parent.insertBefore(el.firstChild, el);
            parent.removeChild(el);
            continue;
        }
        // Limpiar atributos
        const attrs = Array.from(el.attributes);
        for (const attr of attrs) {
            const name = attr.name.toLowerCase();
            // Eliminar todos los handlers on*
            if (name.startsWith('on')) {
                el.removeAttribute(attr.name);
                continue;
            }
            if (!ALLOWED_ATTRS.has(name)) {
                el.removeAttribute(attr.name);
                continue;
            }
            // Validar URLs
            if (name === 'href' || name === 'src') {
                if (!isSafeUrl(attr.value)) {
                    el.setAttribute(attr.name, '#');
                }
            }
            // Sanear style
            if (name === 'style') {
                const cleaned = sanitizeStyle(attr.value);
                if (cleaned) el.setAttribute('style', cleaned);
                else el.removeAttribute('style');
            }
        }
        // Reforzar rel para enlaces externos con target=_blank
        if (tag === 'a' && el.getAttribute('target') === '_blank') {
            el.setAttribute('rel', 'noopener noreferrer');
        }
    }
}

/** Valida un archivo de imagen subido por el usuario. */
export function validateImageFile(file: File | null | undefined): { ok: boolean; reason?: string } {
    if (!file) return { ok: false, reason: 'no-file' };
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        return { ok: false, reason: t('valImageType', { type: file.type || t('valImageTypeUnknown') }) };
    }
    if (file.size > MAX_IMAGE_BYTES) {
        const mb = (file.size / 1024 / 1024).toFixed(1);
        return { ok: false, reason: t('valImageTooLarge', { mb }) };
    }
    return { ok: true };
}

/** Lo MÍNIMO que isValidSnapshot garantiza: las 3 lenguas como HTML. El snapshot completo
 *  (CVManualSnapshot en cv-types) lleva más campos —tema, formato, idioma, timestamp—,
 *  pero el saneado solo mira estos, así que valida un supertipo a propósito: acepta
 *  también snapshots de otras versiones mientras traigan las 3 lenguas. */
export type CVSnapshotLike = Pick<CVManualSnapshot, 'cvs'>;

/** Valida la estructura mínima de un snapshot del CV. */
export function isValidSnapshot<T>(snapshot: T): snapshot is T & CVSnapshotLike {
    // Type predicate GENÉRICO (`T & CVSnapshotLike`, no `CVSnapshotLike` a secas): estrecha
    // añadiendo la garantía de las 3 lenguas SIN perder los demás campos del tipo de entrada
    // (timestamp, currentLang…). Con el predicado no-genérico, un `Partial<CVManualSnapshot>`
    // validado se quedaba en solo-`cvs` y el caller ya no veía el resto.
    if (!snapshot || typeof snapshot !== 'object') return false;
    const cvs = (snapshot as unknown as Partial<CVSnapshotLike>).cvs;
    if (!cvs || typeof cvs !== 'object') return false;
    return typeof cvs.ES === 'string' && typeof cvs.EN === 'string' && typeof cvs.DE === 'string';
}

/** Sanea las 3 lenguas del snapshot in-place y devuelve el snapshot. */
export function sanitizeSnapshot<T>(snapshot: T): (T & CVSnapshotLike) | null {
    if (!isValidSnapshot(snapshot)) return null;
    snapshot.cvs.ES = sanitizeCVHTML(snapshot.cvs.ES);
    snapshot.cvs.EN = sanitizeCVHTML(snapshot.cvs.EN);
    snapshot.cvs.DE = sanitizeCVHTML(snapshot.cvs.DE);
    return snapshot as T & CVSnapshotLike;
}

/* Thin-wrapper del toast compartido: apilado, pausa al hover, aria-live
   polite + role=alert para errores. CSS: components/widgets/toast/toast.css. */

let _toaster: ReturnType<typeof createToaster> | null = null;

/**
 * Muestra una notificación efímera tipo toast. `warn` se acepta como alias histórico
 * de `warning` (el tipo del componente compartido).
 */
export function showToast(message: string, type: ToastType | 'warn' = 'info', duration = 3000): void {
    if (!_toaster) _toaster = createToaster();
    _toaster.show(message, type === 'warn' ? 'warning' : type, duration);
}

export const confirmDialog = sharedConfirmDialog;
export const promptDialog = sharedPromptDialog;

/** Anuncia un mensaje en la región aria-live del editor (#cvA11yLive). */
export function announceA11y(message: string): void {
    const live = document.getElementById('cvA11yLive');
    if (!live) return;
    // Vaciar y reasignar para forzar el anuncio incluso si el texto no cambia.
    live.textContent = '';
    setTimeout(() => {
        live.textContent = message;
    }, 50);
}

/**
 * 'rgb(24, 20, 16)' → '#181410'. null si no es un rgb()/rgba() OPACO parseable (los
 * input[type=color] y los sanitizadores del saved-store exigen hex-6). Para leer colores
 * EFECTIVOS del tema via getComputedStyle.
 */
export function rgbToHex(rgb: string | null | undefined): string | null {
    const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(rgb || '');
    if (!m) return null;
    if (m[4] !== undefined && parseFloat(m[4]) === 0) return null; // transparente → fallback del caller
    // Los 3 primeros grupos son obligatorios en el patrón: si `m` existe, existen.
    const to2 = (n: string | undefined) =>
        parseInt(n ?? '0', 10)
            .toString(16)
            .padStart(2, '0');
    return `#${to2(m[1])}${to2(m[2])}${to2(m[3])}`;
}

export function debounce<A extends unknown[]>(
    fn: (...args: A) => unknown,
    delay = 300
): (this: unknown, ...args: A) => void {
    let timer: number | null = null;
    return function debounced(this: unknown, ...args: A) {
        if (timer) clearTimeout(timer);
        timer = window.setTimeout(() => {
            timer = null;
            fn.apply(this, args);
        }, delay);
    };
}

const IS_DEV =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.port === '5173');

export function dlog(...args: unknown[]): void {
    if (IS_DEV) console.log(...args);
}

export function dwarn(...args: unknown[]): void {
    if (IS_DEV) console.warn(...args);
}

export function formatTimeAgo(timestamp: number | null | undefined, lang: string = 'ES'): string {
    if (!timestamp) return '';
    const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    const es = { now: 'ahora', s: 's', m: 'min', h: 'h', d: 'd' };
    const labels: Record<string, typeof es> = {
        ES: es,
        EN: { now: 'just now', s: 's', m: 'min', h: 'h', d: 'd' },
        DE: { now: 'gerade', s: 's', m: 'Min', h: 'Std', d: 'T' },
    };
    const l = labels[lang] || es; // fallback a ES ante un idioma desconocido
    if (seconds < 5) return l.now;
    if (seconds < 60) return `${seconds}${l.s}`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} ${l.m}`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ${l.h}`;
    const days = Math.floor(hours / 24);
    return `${days} ${l.d}`;
}

const VALID_LANGS = new Set(['ES', 'EN', 'DE']);
export function normalizeLang(value: unknown, fallback: string = 'ES'): string {
    if (typeof value !== 'string') return fallback;
    const upper = value.trim().toUpperCase();
    return VALID_LANGS.has(upper) ? upper : fallback;
}
