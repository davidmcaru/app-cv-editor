import { cancelPendingWrite, setItemDebounced } from '../components/core/storage/debounced-storage.ts';
import type { CVData, Lang } from './cv-types.ts';
import { DEFAULT_PROFILE, type ProfileId } from './cv-profiles.ts';

import type { AppMode as CVMode } from '../components/core/app-mode/app-mode.ts';

export type { CVMode };
export type { ProfileId };

export interface CVEditBaseline {
    currentLang: Lang;
    currentThemeIndex: number;
    currentFormat: number;
    isOwnerView: boolean;
    downloadEnabled: boolean;
    hasManualSnapshot: boolean;
    cvs: { ES: string; EN: string; DE: string };
}

export interface CVPreEditContext {
    isOwnerView: boolean;
    downloadEnabled: boolean;
    hasManualSnapshot: boolean;
    snapshotRaw: string | null;
}

export interface StateChange {
    key: string;
    value: unknown;
    prevValue: unknown;
}

export type StateSubscriber = (change: StateChange) => void;

/** Los 4 grupos de texto configurables:
 * Título (nombre) · Subtítulos (encabezados + acentos) · Cuerpo (contenido principal) ·
 * Panel (cuerpo del panel lateral: contacto, skills, competencias, idiomas). */
export interface CVTextGroups<T> {
    title: T;
    subtitle: T;
    body: T;
    panel: T;
}

/** Config de texto/maquetación configurable.
 * null en cualquier campo = usar el valor por defecto del tema (no se aplica la custom
 * property). `size` son multiplicadores (1 = default). */
export interface CVTextConfig {
    fontFamily: string | null; // familia CSS (panel Textos)
    lineHeight: number | null; // interlineado (panel Config)
    sectionGap: number | null; // px entre secciones del CV (panel Config)
    size: CVTextGroups<number | null>; // multiplicador de tamaño por grupo (panel Textos)
    color: CVTextGroups<string | null>; // color de texto por grupo (panel Textos)
    sidebarBg: string | null; // color del panel izquierdo (panel Config)
    pageBg: string | null; // fondo del folio: cualquier color (color-field del panel Config); null = el de la plantilla
}

/** Config de texto en su estado por defecto (todo al valor del tema). */
export function defaultTextConfig(): CVTextConfig {
    return {
        fontFamily: null,
        lineHeight: null,
        sectionGap: null,
        size: { title: null, subtitle: null, body: null, panel: null },
        color: { title: null, subtitle: null, body: null, panel: null },
        sidebarBg: null,
        pageBg: null,
    };
}

export interface CVState {
    currentThemeIndex: number;
    currentLang: Lang;
    currentFormat: number;
    textConfig: CVTextConfig;
    editMode: boolean;
    isTranslating: boolean;
    currentEditingLink: HTMLElement | null;
    currentImageElement: HTMLElement | null;
    originalCVState: string | null;
    editedElements: Set<HTMLElement>;
    downloadEnabled: boolean;
    isOwnerView: boolean;
    hasManualSnapshot: boolean;
    editBaseline: CVEditBaseline | null;
    preEditContext: CVPreEditContext | null;
    activeData: CVData | null;
    baseData: CVData | null;
    /** Índice en `themes` del tema por defecto del CV CARGADO, fijado al
     *  cargar el perfil. NO se puede derivar de `activeData.meta` en cualquier momento: al
     *  entrar en edición `activeData` pasa a ser la plantilla genérica (default navy), así
     *  que "Restablecer estilos" te cambiaría el color sin haberlo pedido. */
    defaultThemeIndex: number;
    lastSavedAt: number | null;
    cvMode: CVMode;
    activeProfile: ProfileId;
    _editingMutex: boolean;
    _editAbortController: AbortController | null;
    _linkEditorPreviouslyFocused?: HTMLElement | null;
}

// Constantes de configuración (inmutables)
export const themes: string[] = [
    'theme-navy',
    'theme-blue',
    'theme-red',
    'theme-green',
    'theme-purple',
    'theme-gold',
    'theme-dark-ocean',
    'theme-dark-slate',
    'theme-dark-forest',
    'theme-dark-burgundy',
    'theme-dark-cosmos',
    'theme-dark-gold',
];
export const themeNames: string[] = [
    'Navy',
    'Azul',
    'Rojo',
    'Verde',
    'Violeta',
    'Oro',
    'Dark Ocean',
    'Dark Slate',
    'Dark Forest',
    'Dark Burgundy',
    'Dark Cosmos',
    'Dark Gold',
];
export const formats: string[] = ['', 'format-harvard', 'format-minimal', 'format-ats'];
export const formatNames: Record<Lang, string[]> = {
    ES: ['Moderno', 'Harvard', 'Minimal', 'ATS'],
    EN: ['Modern', 'Harvard', 'Minimal', 'ATS'],
    DE: ['Modern', 'Harvard', 'Minimal', 'ATS'],
};

// Estado mutable compartido (objeto para que los imports lo vean actualizado).
// Envuelto en Proxy para notificar a subscribers en cada mutación.
const _stateRaw: CVState = {
    currentThemeIndex: 0,
    defaultThemeIndex: 0,
    currentLang: 'ES',
    currentFormat: 0,
    textConfig: defaultTextConfig(),
    editMode: false,
    isTranslating: false,
    currentEditingLink: null,
    currentImageElement: null,
    originalCVState: null,
    editedElements: new Set<HTMLElement>(),
    downloadEnabled: false,
    isOwnerView: true,
    hasManualSnapshot: false,
    editBaseline: null,
    preEditContext: null,
    activeData: null, // se asigna en cv-data-loader.ts
    baseData: null, // ídem; después lo actualiza loadBaseData() en cada carga de base
    lastSavedAt: null, // timestamp del último snapshot persistido
    cvMode: 'showcase', // set en boot por _detectCVMode()
    activeProfile: DEFAULT_PROFILE, // solo aplica realmente si cvMode === 'full'
    _editingMutex: false, // guarda contra entradas concurrentes a edit-mode
    _editAbortController: null, // AbortController para listeners de edición
};

const _subscribers = new Set<StateSubscriber>();

export function subscribeState(fn: StateSubscriber): () => void {
    if (typeof fn !== 'function') return () => {};
    _subscribers.add(fn);
    return () => {
        _subscribers.delete(fn);
    };
}

function notifyStateChange(key: string, value: unknown, prevValue: unknown): void {
    if (typeof key === 'string' && key.startsWith('_')) return;
    if (Object.is(value, prevValue)) return;
    _subscribers.forEach((fn) => {
        try {
            fn({ key, value, prevValue });
        } catch (err) {
            console.warn('[state] subscriber error:', err);
        }
    });
}

export const state: CVState = new Proxy(_stateRaw, {
    set(target, key, value) {
        const k = key as keyof CVState;
        const prev = target[k];
        (target as unknown as Record<string | symbol, unknown>)[k as string] = value;
        notifyStateChange(String(key), value, prev);
        return true;
    },
}) as CVState;

interface CvHistoryHooks {
    record: () => void;
    absorb: () => void;
    init: () => void;
}
let _cvHistoryHooks: CvHistoryHooks | null = null;
export function registerCvHistoryHooks(hooks: CvHistoryHooks): void {
    _cvHistoryHooks = hooks;
}
export function commitHistory(): void {
    if (_cvHistoryHooks) _cvHistoryHooks.record();
}
export function absorbHistory(): void {
    if (_cvHistoryHooks) _cvHistoryHooks.absorb();
}
export function rebaselineHistory(): void {
    if (_cvHistoryHooks) _cvHistoryHooks.init();
}

// Helper compartido por cv-controller y cv-edit-mode para aplicar
// las clases de tema y formato al body de forma consistente.
export function applyThemeAndFormatClasses(): void {
    themes.forEach((themeClass) => {
        if (themeClass) document.body.classList.remove(themeClass);
    });
    formats.forEach((formatClass) => {
        if (formatClass) document.body.classList.remove(formatClass);
    });

    const themeClass = themes[state.currentThemeIndex];
    if (themeClass) document.body.classList.add(themeClass);

    const formatClass = formats[state.currentFormat];
    if (formatClass) document.body.classList.add(formatClass);
}

function setVarStr(el: HTMLElement, name: string, value: string | null): void {
    if (value) el.style.setProperty(name, value);
    else el.style.removeProperty(name);
}

function setVarNum(el: HTMLElement, name: string, value: number | null): void {
    if (typeof value === 'number') el.style.setProperty(name, String(value));
    else el.style.removeProperty(name);
}

export function applyTextConfig(): void {
    const c = state.textConfig;
    document.querySelectorAll<HTMLElement>('.cv-container').forEach((el) => {
        setVarStr(el, '--cv-font-family', c.fontFamily);
        setVarNum(el, '--cv-line-height', c.lineHeight);
        setVarNum(el, '--cv-section-gap', c.sectionGap);
        setVarNum(el, '--cv-scale-title', c.size.title);
        setVarNum(el, '--cv-scale-subtitle', c.size.subtitle);
        setVarNum(el, '--cv-scale-body', c.size.body);
        setVarNum(el, '--cv-scale-panel', c.size.panel);
        setVarStr(el, '--cv-color-title', c.color.title);
        setVarStr(el, '--cv-color-subtitle', c.color.subtitle);
        setVarStr(el, '--cv-color-body', c.color.body);
        setVarStr(el, '--cv-color-panel', c.color.panel);
        setVarStr(el, '--sidebar-bg', c.sidebarBg);
        setVarStr(el, '--cv-page-bg', c.pageBg);
    });
}

/** Descarta SOLO la personalización de color (panel, fondo y colores de texto) y la
 * persiste. Lo llama el design picker al confirmar un diseño: "elegir un diseño resetea
 * los colores". Tamaño/tipografía/interlineado se mantienen. */
export function resetColorConfig(): void {
    state.textConfig.color = { title: null, subtitle: null, body: null, panel: null };
    state.textConfig.sidebarBg = null;
    state.textConfig.pageBg = null;
    applyTextConfig();
    saveTextConfig();
}

const TEXT_CONFIG_KEY = 'cv-pref-text-config';

export function saveTextConfig(): void {
    setItemDebounced(TEXT_CONFIG_KEY, JSON.stringify(state.textConfig));
}

function numOrNull(v: unknown, fallback: number | null = null): number | null {
    return typeof v === 'number' && v > 0 ? v : fallback;
}

function strOrNull(v: unknown): string | null {
    return typeof v === 'string' && v ? v : null;
}

/** Lee la config de texto guardada y la aplica. Se llama en el boot. Migra el formato
 * del 3b (`textScale` global único) a los 3 grupos de tamaño del 3c. */
export function loadTextConfig(): void {
    try {
        const raw = window.localStorage.getItem(TEXT_CONFIG_KEY);
        if (!raw) return;
        const p = JSON.parse(raw) as Record<string, unknown>;
        const cfg = defaultTextConfig();
        cfg.fontFamily = strOrNull(p.fontFamily);
        cfg.lineHeight = numOrNull(p.lineHeight);
        cfg.sectionGap = numOrNull(p.sectionGap);
        // Migración 3b→3c: la escala global antigua siembra los grupos.
        const legacyScale = numOrNull(p.textScale);
        const size = p.size as Record<string, unknown> | undefined;
        cfg.size.title = numOrNull(size?.title, legacyScale);
        cfg.size.subtitle = numOrNull(size?.subtitle, legacyScale);
        cfg.size.body = numOrNull(size?.body, legacyScale);
        cfg.size.panel = numOrNull(size?.panel, legacyScale);
        const color = p.color as Record<string, unknown> | undefined;
        cfg.color.title = strOrNull(color?.title);
        cfg.color.subtitle = strOrNull(color?.subtitle);
        cfg.color.body = strOrNull(color?.body);
        cfg.color.panel = strOrNull(color?.panel);
        cfg.sidebarBg = strOrNull(p.sidebarBg);
        cfg.pageBg = strOrNull(p.pageBg);
        state.textConfig = cfg;
        applyTextConfig();
    } catch (_e) {
        /* JSON inválido → ignorar */
    }
}

export function clearTextConfig(): void {
    cancelPendingWrite(TEXT_CONFIG_KEY);
    try {
        window.localStorage.removeItem(TEXT_CONFIG_KEY);
    } catch (_e) {
        /* almacenamiento no disponible */
    }
}

export const GLOBAL_PREF_KEYS = {
    theme: 'cv-pref-theme',
    format: 'cv-pref-format',
    lang: 'cv-pref-lang',
} as const;

export type GlobalPrefKind = keyof typeof GLOBAL_PREF_KEYS;

export interface GlobalPreferences {
    theme: number | null;
    format: number | null;
    lang: Lang | null;
}

/**
 * Lee preferencias guardadas en localStorage. Devuelve `null` para los valores
 * no presentes/inválidos. NO aplica nada al state — el caller decide.
 */
export function loadGlobalPreferences(): GlobalPreferences {
    const out: GlobalPreferences = { theme: null, format: null, lang: null };
    try {
        const t = window.localStorage.getItem(GLOBAL_PREF_KEYS.theme);
        if (t !== null) {
            const n = parseInt(t, 10);
            if (Number.isInteger(n) && n >= 0 && n < themes.length) out.theme = n;
        }
        const f = window.localStorage.getItem(GLOBAL_PREF_KEYS.format);
        if (f !== null) {
            const n = parseInt(f, 10);
            if (Number.isInteger(n) && n >= 0 && n < formats.length) out.format = n;
        }
        const l = window.localStorage.getItem(GLOBAL_PREF_KEYS.lang);
        if (l === 'ES' || l === 'EN' || l === 'DE') out.lang = l;
    } catch (_e) {}
    return out;
}

/**
 * Guarda una clave de preferencia global. El caller debe haber comprobado las
 * reglas de persistencia condicional (cvMode + presencia de snapshot).
 */
export function saveGlobalPreference(kind: GlobalPrefKind, value: string | number): void {
    const key = GLOBAL_PREF_KEYS[kind];
    if (!key) return;
    try {
        window.localStorage.setItem(key, String(value));
    } catch (_e) {}
}
