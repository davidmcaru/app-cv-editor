import {
    themes,
    themeNames,
    formats,
    formatNames,
    state,
    applyTextConfig,
    saveTextConfig,
    commitHistory,
    type CVTextGroups,
} from './cv-state.ts';
import type { Lang } from './cv-types.ts';
import { LIGHT_THEME_INDEXES, DARK_THEME_INDEXES, THEME_TRAVERSAL_INDEXES, THEME_PREVIEWS } from './cv-constants.ts';
import { cvPanelStore } from './cv-panel-store.ts';
import { isDesktop } from '../components/core/breakpoint/get-bp.ts';
import { setFlipToggle } from '../components/widgets/flip-toggle/flip-toggle.ts';
import { t } from './cv-i18n.ts';

type ThemeMode = 'light' | 'dark';

// Las etiquetas del panel viven en i18n/{es,en,de}.json y las aplica el aplicador
// [data-i18n] compartido (cv-i18n). Aquí solo quedan los textos DINÁMICOS (modo Claro/Oscuro,
// nombre del formato, nombres/aria de las paletas), que se piden con t() en cada render.
// Nombres de tema con clave i18n (los oscuros — Ocean, Slate… — son neutrales y van tal cual).
const THEME_NAME_KEYS: Record<string, string> = {
    Navy: 'themeNavy',
    Azul: 'themeBlue',
    Rojo: 'themeRed',
    Verde: 'themeGreen',
    Violeta: 'themePurple',
    Oro: 'themeGold',
};

function themeDisplayName(raw: string): string {
    const base = normalizeThemeLabel(raw);
    const key = THEME_NAME_KEYS[base];
    return key ? t(key) : base;
}

// Los mapas de cv-constants llevan claves numéricas literales; esto los hace indexables
const THEME_PREVIEW_MAP: Record<number, readonly string[]> = THEME_PREVIEWS;

let pickerInitialized = false;

// Snapshot SOLO de los colores personalizados (para revertir en Cancelar el "la paleta pisa
// el color de panel" del preview en vivo).
interface ColorSnapshot {
    color: CVTextGroups<string | null>;
    sidebarBg: string | null;
    pageBg: string | null;
}

let draftBaseline: { themeIndex: number; format: number; colors: ColorSnapshot } | null = null;

function cloneColors(): ColorSnapshot {
    return {
        color: { ...state.textConfig.color },
        sidebarBg: state.textConfig.sidebarBg,
        pageBg: state.textConfig.pageBg,
    };
}

/** Borra los colores personalizados EN VIVO (sin persistir): así la paleta elegida SE VE en el
 * panel (el color de panel personalizado va inline en .cv-container y, si no, gana y tapa la
 * paleta). "Elegir un diseño resetea los colores". Cancelar los restaura desde el snapshot. */
function clearColorsLive(): void {
    state.textConfig.color = { title: null, subtitle: null, body: null, panel: null };
    state.textConfig.sidebarBg = null;
    state.textConfig.pageBg = null;
    applyTextConfig();
}

function restoreColors(s: ColorSnapshot): void {
    state.textConfig.color = { ...s.color };
    state.textConfig.sidebarBg = s.sidebarBg;
    state.textConfig.pageBg = s.pageBg;
    applyTextConfig();
}

function getPickerElements() {
    return {
        panel: document.getElementById('designPickerPanel'),
        modeToggle: document.getElementById('designModeToggle'),
        formatToggle: document.getElementById('designFormatToggle'),
        themeSwatches: document.getElementById('designThemeSwatches'),
        toggleButton: document.getElementById('designToggle'),
    };
}

export function updateDesignPickerLabels(_lang: string = state.currentLang || 'ES'): void {
    // Etiquetas estáticas: las aplica translateEditorUI vía [data-i18n]. Aquí solo
    // los textos que dependen del ESTADO además del idioma: toggle de modo, botón de formato
    // y los swatches (nombre + aria-label del tema, regenerados con t()).
    syncModeToggle();
    syncFormatToggle();
    renderThemeSwatches();
}

function normalizeThemeLabel(name: string): string {
    return name.replace(/^Dark\s+/i, '');
}

function isDesktopViewport(): boolean {
    // ⚠️ Por --bp y no por innerWidth, que es la regla del proyecto
    return isDesktop();
}

function isTypingTarget(target: EventTarget | null): boolean {
    if (!target || !(target instanceof HTMLElement)) return false;
    const tagName = target.tagName;
    return tagName === 'INPUT' || tagName === 'TEXTAREA' || target.isContentEditable;
}

function cycleTheme(direction: number): void {
    const currentPos = THEME_TRAVERSAL_INDEXES.indexOf(state.currentThemeIndex);
    const safePos = currentPos >= 0 ? currentPos : direction > 0 ? 0 : THEME_TRAVERSAL_INDEXES.length - 1;
    const nextPos = (safePos + direction + THEME_TRAVERSAL_INDEXES.length) % THEME_TRAVERSAL_INDEXES.length;
    applyThemeByIndex(THEME_TRAVERSAL_INDEXES[nextPos] ?? 0);
    clearColorsLive(); // elegir paleta pisa el color de panel personalizado
}

function cycleFormat(direction: number): void {
    const nextIndex = (state.currentFormat + direction + formats.length) % formats.length;
    applyFormatByIndex(nextIndex);
}

function clearThemeClasses(): void {
    themes.forEach((themeClass) => {
        if (themeClass) {
            document.body.classList.remove(themeClass);
        }
    });
}

function applyThemeByIndex(themeIndex: number): void {
    if (!Number.isInteger(themeIndex) || themeIndex < 0 || themeIndex >= themes.length) return;

    clearThemeClasses();

    const nextThemeClass = themes[themeIndex];
    if (nextThemeClass) {
        document.body.classList.add(nextThemeClass);
    }

    state.currentThemeIndex = themeIndex;
    syncThemeUI();
}

function getCurrentMode(): ThemeMode {
    return state.currentThemeIndex >= 6 ? 'dark' : 'light';
}

function mapThemeBetweenModes(targetMode: ThemeMode): number {
    const fromDark = DARK_THEME_INDEXES.includes(state.currentThemeIndex);

    const currentSource = fromDark ? DARK_THEME_INDEXES : LIGHT_THEME_INDEXES;
    const sourcePos = currentSource.indexOf(state.currentThemeIndex);
    const safePos = sourcePos >= 0 ? sourcePos : 0;

    const targetList = targetMode === 'dark' ? DARK_THEME_INDEXES : LIGHT_THEME_INDEXES;
    const boundedPos = Math.max(0, Math.min(targetList.length - 1, safePos));
    return targetList[boundedPos] ?? 0;
}

function setMode(mode: ThemeMode): void {
    const indexes = mode === 'dark' ? DARK_THEME_INDEXES : LIGHT_THEME_INDEXES;
    if (!indexes.includes(state.currentThemeIndex)) {
        applyThemeByIndex(mapThemeBetweenModes(mode));
    }
    renderThemeSwatches(mode);
    syncModeToggle();
}

// El modo es un flip-toggle: is-active = OSCURO
function syncModeToggle(): void {
    const { modeToggle } = getPickerElements();
    if (!modeToggle) return;
    const dark = getCurrentMode() === 'dark';
    setFlipToggle(modeToggle, dark);
    const label = modeToggle.querySelector<HTMLElement>('.edt-flip__label');
    if (label) label.textContent = dark ? t('designModeDark') : t('designModeLight');
}

function toggleMode(): void {
    setMode(getCurrentMode() === 'dark' ? 'light' : 'dark');
    clearColorsLive();
}

function createThemeSwatchButton(themeIndex: number): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cv-design-theme-swatch';
    btn.dataset.themeIndex = String(themeIndex);
    const rawThemeName = themeNames[themeIndex] || '';
    const displayThemeName = themeDisplayName(rawThemeName);
    btn.setAttribute('aria-label', t('ariaSelectTheme', { name: displayThemeName }));
    // Radio dentro del radiogroup: es lo que anuncia la selección única
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', themeIndex === state.currentThemeIndex ? 'true' : 'false');

    const [colorA, colorB] = THEME_PREVIEW_MAP[themeIndex] || ['#2d3436', '#b38f00'];

    btn.innerHTML = `
        <span class="cv-design-theme-swatch-dot" style="background: linear-gradient(135deg, ${colorA}, ${colorB});"></span>
        <span class="cv-design-theme-swatch-label">${displayThemeName}</span>
    `;

    if (themeIndex === state.currentThemeIndex) {
        btn.classList.add('active');
    }

    btn.addEventListener('click', () => {
        applyThemeByIndex(themeIndex);
        clearColorsLive(); // elegir paleta pisa el color de panel personalizado
    });

    return btn;
}

function renderThemeSwatches(mode: ThemeMode = getCurrentMode()): void {
    const { themeSwatches } = getPickerElements();
    if (!themeSwatches) return;

    const indexes = mode === 'dark' ? DARK_THEME_INDEXES : LIGHT_THEME_INDEXES;
    themeSwatches.innerHTML = '';
    indexes.forEach((themeIndex) => {
        themeSwatches.appendChild(createThemeSwatchButton(themeIndex));
    });
}

function syncThemeUI(): void {
    const mode = getCurrentMode();
    syncModeToggle();
    renderThemeSwatches(mode);
}

function clearFormatClasses(): void {
    formats.forEach((formatClass) => {
        if (formatClass) {
            document.body.classList.remove(formatClass);
        }
    });
}

function applyFormatByIndex(formatIndex: number): void {
    if (!Number.isInteger(formatIndex) || formatIndex < 0 || formatIndex >= formats.length) return;

    clearFormatClasses();

    const nextFormatClass = formats[formatIndex];
    if (nextFormatClass) {
        document.body.classList.add(nextFormatClass);
    }

    state.currentFormat = formatIndex;
    syncFormatToggle();
}

/** Formato = un botón que CICLA los 4 (Moderno→Harvard→Minimal→ATS). Muestra el actual;
 * is-active cuando NO es el default (Moderno, índice 0). */
function syncFormatToggle(): void {
    const { formatToggle } = getPickerElements();
    if (!formatToggle) return;
    const lang = (state.currentLang || 'ES') as Lang;
    const names = formatNames[lang] || formatNames.ES;
    const label = formatToggle.querySelector<HTMLElement>('.edt-flip__label');
    if (label) label.textContent = names[state.currentFormat] || names[0] || '';
    const active = state.currentFormat !== 0;
    formatToggle.classList.toggle('is-active', active);
    formatToggle.setAttribute('aria-pressed', active ? 'true' : 'false');
}

/** Restaura el diseño al snapshot tomado al abrir (cierre sin Guardar = Cancelar):
 * tema + formato + colores personalizados (que el preview de la paleta había pisado). */
function revertDesignDraft(): void {
    if (!draftBaseline) return;
    const { themeIndex, format, colors } = draftBaseline;
    draftBaseline = null;
    if (themeIndex !== state.currentThemeIndex) applyThemeByIndex(themeIndex);
    if (format !== state.currentFormat) applyFormatByIndex(format);
    restoreColors(colors);
}

/** Guardar: confirma el draft y cierra. Si el tema cambió, los colores personalizados ya se
 * borraron EN VIVO (clearColorsLive) al elegir la paleta/modo; aquí solo se persisten. */
export function saveDesignPicker(): void {
    const designChanged =
        draftBaseline !== null &&
        (draftBaseline.themeIndex !== state.currentThemeIndex || draftBaseline.format !== state.currentFormat);
    draftBaseline = null;
    if (designChanged) saveTextConfig();
    closeDesignPicker();
    // Commit del historial: guardar Diseño = una entrada. El snapshot del historial
    // captura tema/formato + textConfig; si nada cambió, record() deduplica (sin entrada).
    commitHistory();
}

function handleDesignKeyboardShortcuts(event: KeyboardEvent): void {
    if (!isDesktopViewport()) return;
    if (isTypingTarget(event.target)) return;

    // Gate por panel abierto: las flechas solo actúan como atajo de
    // diseño cuando el panel está VISIBLE. Con el panel cerrado no hacemos nada
    // (ni preventDefault) para que las flechas hagan scroll normal del teclado.
    const { panel } = getPickerElements();
    if (!panel || panel.hidden) return;

    if (event.key === 'ArrowUp') {
        event.preventDefault();
        cycleFormat(-1);
        return;
    }

    if (event.key === 'ArrowDown') {
        event.preventDefault();
        cycleFormat(1);
        return;
    }

    if (event.key === 'ArrowLeft') {
        event.preventDefault();
        cycleTheme(-1);
        return;
    }

    if (event.key === 'ArrowRight') {
        event.preventDefault();
        cycleTheme(1);
    }
}

function initDesignPicker(): void {
    if (pickerInitialized) return;

    const { panel, modeToggle, formatToggle } = getPickerElements();
    if (!panel) return;

    if (modeToggle) modeToggle.addEventListener('click', toggleMode);
    if (formatToggle) formatToggle.addEventListener('click', () => cycleFormat(1));

    const saveBtn = document.getElementById('designSaveBtn');
    const cancelBtn = document.getElementById('designCancelBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveDesignPicker);
    if (cancelBtn) cancelBtn.addEventListener('click', () => closeDesignPicker());

    document.addEventListener('keydown', handleDesignKeyboardShortcuts);

    updateDesignPickerLabels(state.currentLang || 'ES');
    syncThemeUI();
    syncFormatToggle();
    pickerInitialized = true;
}

export function openDesignPicker(): void {
    initDesignPicker();
    const { panel } = getPickerElements();
    if (!panel) return;

    // El snapshot del draft se toma SOLO al pasar de cerrado a abierto: tema + formato + colores
    if (panel.hidden) {
        draftBaseline = { themeIndex: state.currentThemeIndex, format: state.currentFormat, colors: cloneColors() };
    }

    updateDesignPickerLabels(state.currentLang || 'ES');
    syncThemeUI();
    syncFormatToggle();
    panel.hidden = false;
    panel.classList.add('open');
    cvPanelStore.setCloser('design', closeDesignPicker);
    cvPanelStore.setOpen('design', true);
}

export function closeDesignPicker(): void {
    // Cierre sin Guardar (Cancelar, exclusión mutua al abrir otro panel) = restaurar
    // el snapshot del draft. Guardar lo descarta antes de llamar aquí.
    revertDesignDraft();

    const { panel } = getPickerElements();
    if (!panel) return;

    panel.classList.remove('open');
    panel.hidden = true;
    cvPanelStore.setOpen('design', false);
}

export function toggleDesign(): void {
    const { panel } = getPickerElements();
    if (!panel || panel.hidden) {
        openDesignPicker();
    } else {
        closeDesignPicker();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initDesignPicker();
});

// toggleDesign se enlaza desde cv-event-bindings.ts (sin onclick inline).
