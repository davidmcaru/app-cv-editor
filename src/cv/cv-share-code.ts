import { state, defaultTextConfig, themes, formats, type CVTextConfig } from './cv-state.ts';
import { buildShareSnapshot } from './cv-controller.ts';
import {
    DROP,
    buildShareCode,
    invertKeyMap,
    isObj,
    makeKeyMapper,
    mergeDefaults,
    oneOf,
    parseShareCode,
    prune,
} from '../components/features/utils/share-codec.ts';
import type { Lang } from './cv-types.ts';

// Datos externos (código decodificado sin forma fija): any acotado a este códec.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;

export interface CVSharePayload {
    snapshot: {
        version: number;
        timestamp: number;
        currentLang: Lang;
        currentThemeIndex: number;
        currentFormat: number;
        cvs: { ES: string; EN: string; DE: string };
    };
    textConfig: CVTextConfig;
}

export type CVDecodeResult =
    | { ok: true; payload: CVSharePayload; warnings: string[] }
    | { ok: false; error: string; detail?: string };

const clampInt = (v: unknown, min: number, max: number, def: number): number => {
    const n = typeof v === 'number' ? v : parseInt(String(v), 10);
    return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : def;
};
/** Multiplicador de tamaño: número en rango o null (null = heredar del tema). */
const numOrNull = (v: unknown, min: number, max: number): number | null => {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};
/** Color hex #rgb..#rrggbbaa o null. Rechaza url()/expresiones (anti-inyección CSS). */
const hexOrNull = (v: unknown): string | null => (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : null);
/** Familia CSS segura (solo letras/números/espacios/comillas/comas/guiones) o null. */
const fontOrNull = (v: unknown): string | null =>
    typeof v === 'string' && v.length <= 100 && /^[\w\s,'"-]+$/.test(v) ? v : null;

// Claves cortas desde el día 1: el código va como delta contra los defaults
const KMAP: Record<string, string> = {
    lang: 'l',
    theme: 't',
    format: 'f',
    textConfig: 'x',
    cvs: 'c',
    ES: 'e',
    EN: 'n',
    DE: 'd',
    fontFamily: 'ff',
    lineHeight: 'lh',
    sectionGap: 'sg',
    size: 'z',
    color: 'co',
    sidebarBg: 'sb',
    pageBg: 'pb',
    title: 'ti',
    subtitle: 'su',
    body: 'bo',
    panel: 'pa',
};
const shorten = makeKeyMapper(KMAP);
const expand = makeKeyMapper(invertKeyMap(KMAP));

// Defaults del CV para el delta (SIN cvs: el contenido siempre va entero).
const cvDefaults = (): Loose => ({ lang: 'ES', theme: 0, format: 0, textConfig: defaultTextConfig() });

// Las imágenes base64 embebidas NO se comparten: se quitan del código
const DATA_IMG_RE = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/g;
function stripPhotos(html: string): { html: string; stripped: boolean } {
    let stripped = false;
    const out = html.replace(DATA_IMG_RE, () => {
        stripped = true;
        return '';
    });
    return { html: out, stripped };
}

// ⚠️ Reconstruye un objeto NUEVO leyendo solo claves conocidas: nunca reutiliza el de entrada
// (nunca out[k] = raw[k] con k arbitrario → __proto__/constructor jamás se leen).
function sanitizeTextConfig(x: Loose | undefined): CVTextConfig {
    const src = isObj(x) ? x : {};
    const size = isObj(src.size) ? src.size : {};
    const color = isObj(src.color) ? src.color : {};
    return {
        fontFamily: fontOrNull(src.fontFamily),
        lineHeight: numOrNull(src.lineHeight, 0.8, 3),
        sectionGap: numOrNull(src.sectionGap, 0, 80),
        size: {
            title: numOrNull(size.title, 0.4, 3),
            subtitle: numOrNull(size.subtitle, 0.4, 3),
            body: numOrNull(size.body, 0.4, 3),
            panel: numOrNull(size.panel, 0.4, 3),
        },
        color: {
            title: hexOrNull(color.title),
            subtitle: hexOrNull(color.subtitle),
            body: hexOrNull(color.body),
            panel: hexOrNull(color.panel),
        },
        sidebarBg: hexOrNull(src.sidebarBg),
        pageBg: hexOrNull(src.pageBg),
    };
}

function sanitizeSharePayload(raw: Loose): CVSharePayload | null {
    if (!isObj(raw)) return null;
    const cvs = isObj(raw.cvs) ? raw.cvs : {};
    const str = (v: unknown): string => (typeof v === 'string' ? v : '');
    return {
        snapshot: {
            version: 2,
            timestamp: Date.now(),
            currentLang: oneOf(raw.lang, ['ES', 'EN', 'DE'] as const, 'ES'),
            currentThemeIndex: clampInt(raw.theme, 0, themes.length - 1, 0),
            currentFormat: clampInt(raw.format, 0, formats.length - 1, 0),
            // El HTML se sanea de verdad después (isValidSnapshot + sanitizeCVHTML) al aplicar.
            cvs: { ES: str(cvs.ES), EN: str(cvs.EN), DE: str(cvs.DE) },
        },
        textConfig: sanitizeTextConfig(raw.textConfig as Loose | undefined),
    };
}

/** Genera el código a partir de un snapshot dado + su textConfig. Quita la foto embebida
 * (base64) → `photoStripped`. Lo usa "copiar código" de cada CV guardado (Mis CVs). */
export async function encodeSnapshot(
    snap: {
        currentLang: Lang;
        currentThemeIndex: number;
        currentFormat: number;
        cvs: { ES: string; EN: string; DE: string };
    } | null,
    textConfig: CVTextConfig | null
): Promise<{ code: string; photoStripped: boolean }> {
    if (!snap) throw new Error('sin-cv');
    let photoStripped = false;
    const clean = (html: string): string => {
        const r = stripPhotos(html);
        if (r.stripped) photoStripped = true;
        return r.html;
    };
    const full: Loose = {
        lang: snap.currentLang,
        theme: snap.currentThemeIndex,
        format: snap.currentFormat,
        textConfig: JSON.parse(JSON.stringify(textConfig || defaultTextConfig())),
        cvs: { ES: clean(snap.cvs.ES), EN: clean(snap.cvs.EN), DE: clean(snap.cvs.DE) },
    };
    let delta = prune(full, cvDefaults(), null);
    if (delta === DROP || !isObj(delta)) delta = {};
    const code = await buildShareCode(shorten(delta), 'CVD1', 'CVU1');
    return { code, photoStripped };
}

/** Genera el código del CV actual (snapshot vivo + textConfig actual). */
export async function encodeCurrent(): Promise<{ code: string; photoStripped: boolean }> {
    return encodeSnapshot(buildShareSnapshot(), state.textConfig);
}

/** Decodifica y sanea un código. Nunca confía en el contenido. */
export async function decodeAndSanitize(code: string): Promise<CVDecodeResult> {
    const parsed = await parseShareCode(code, ['CVD1', 'CVU1'], ['CVD1']);
    if (!parsed.ok) return parsed;
    try {
        // Expandir claves cortas y rehidratar sobre los defaults del CV. Estos pasos hacen
        // asignación por corchete → un código forjado PUEDE plantar __proto__ aquí; se tolera
        // porque el siguiente paso (sanitizeSharePayload) construye un objeto NUEVO y no lo lee.
        const merged = mergeDefaults(cvDefaults(), expand(parsed.raw));
        const payload = sanitizeSharePayload(merged);
        if (!payload) return { ok: false, error: 'esquema' };
        return { ok: true, payload, warnings: [] };
    } catch (e) {
        const err = e as { message?: string } | null;
        return { ok: false, error: 'excepcion', detail: String((err && err.message) || e) };
    }
}
