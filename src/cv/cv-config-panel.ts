import {
    state,
    applyTextConfig,
    saveTextConfig,
    defaultTextConfig,
    clearTextConfig,
    commitHistory,
    applyThemeAndFormatClasses,
    type CVTextConfig,
} from './cv-state.ts';
import { cvPanelStore } from './cv-panel-store.ts';
import { confirmDialog, rgbToHex } from './cv-utils.ts';
import { clearManualSnapshot } from './cv-controller.ts';
import { t } from './cv-i18n.ts';
import { updateDesignPickerLabels } from './cv-design-picker.ts';
import { enhanceColorFields } from '../components/widgets/color-field/color-field.ts';

const DEFAULT_LINE_HEIGHT = 1.4;
const DEFAULT_SECTION_GAP = 24; // px mostrado cuando no hay override (el default real es 30/25 por zona)

// Snapshot de TODA la apariencia al abrir (para que Cancelar revierta también un
// "Restablecer estilos", que resetea el conjunto). Incluye tema y formato PORQUE el
// reset los toca: si el draft solo guardara textConfig, Cancelar dejaría el diseño
// cambiado — "editado ≠ revertible". null = sin draft (cerrado o guardado).
interface ConfigDraft {
    textConfig: CVTextConfig;
    themeIndex: number;
    format: number;
}
let draft: ConfigDraft | null = null;
let initialized = false;

function cloneTextConfig(c: CVTextConfig): CVTextConfig {
    return JSON.parse(JSON.stringify(c)) as CVTextConfig;
}

function captureDraft(): ConfigDraft {
    return {
        textConfig: cloneTextConfig(state.textConfig),
        themeIndex: state.currentThemeIndex,
        format: state.currentFormat,
    };
}

function getEls() {
    return {
        panel: document.getElementById('configPanel'),
        lineHeight: document.getElementById('configLineHeight') as HTMLInputElement | null,
        sectionGap: document.getElementById('configSectionGap') as HTMLInputElement | null,
        sidebarColor: document.getElementById('configSidebarColor') as HTMLInputElement | null,
        pageBgColor: document.getElementById('configPageBgColor') as HTMLInputElement | null,
    };
}

function currentLineHeight(): number {
    return typeof state.textConfig.lineHeight === 'number' ? state.textConfig.lineHeight : DEFAULT_LINE_HEIGHT;
}

/** Color EFECTIVO del panel lateral cuando no hay override (null = sigue al tema): la
 * --sidebar-bg computada del contenedor.
 * Cuando el override es null, applyTextConfig ya quitó la property inline → lo computado
 * es el valor puro del tema. */
function effectiveSidebarColor(): string {
    const container = document.querySelector<HTMLElement>('.cv-container');
    if (container) {
        const v = getComputedStyle(container).getPropertyValue('--sidebar-bg').trim();
        if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
    }
    return '#2d3436';
}

/** Fondo EFECTIVO del folio cuando no hay override (null = sigue a la plantilla): el
 * computado del contenedor. Los temas oscuros lo pintan vía `body.theme-* .cv-container`
 * (invisible para textConfig), así el campo muestra reactivo el fondo de la plantilla
 * aplicada. */
function effectivePageBgColor(): string {
    const container = document.querySelector<HTMLElement>('.cv-container');
    if (container) {
        const hex = rgbToHex(getComputedStyle(container).backgroundColor);
        if (hex) return hex;
    }
    return '#ffffff';
}

function syncControls(): void {
    const { lineHeight, sectionGap, sidebarColor, pageBgColor } = getEls();
    if (lineHeight) lineHeight.value = String(currentLineHeight());
    if (sectionGap)
        sectionGap.value = String(
            typeof state.textConfig.sectionGap === 'number' ? state.textConfig.sectionGap : DEFAULT_SECTION_GAP
        );
    if (sidebarColor) sidebarColor.value = state.textConfig.sidebarBg || effectiveSidebarColor();
    if (pageBgColor) pageBgColor.value = state.textConfig.pageBg || effectivePageBgColor();
}

function onLineHeightInput(): void {
    const { lineHeight } = getEls();
    if (!lineHeight) return;
    const v = parseFloat(lineHeight.value);
    if (!Number.isFinite(v)) return;
    state.textConfig.lineHeight = v;
    applyTextConfig();
}

function onSectionGapInput(): void {
    const { sectionGap } = getEls();
    if (!sectionGap) return;
    const v = parseFloat(sectionGap.value);
    if (!Number.isFinite(v)) return;
    state.textConfig.sectionGap = v;
    applyTextConfig();
}

function onSidebarColorInput(): void {
    const { sidebarColor } = getEls();
    if (!sidebarColor) return;
    state.textConfig.sidebarBg = sidebarColor.value || null;
    applyTextConfig();
}

function onPageBgInput(): void {
    const { pageBgColor } = getEls();
    if (!pageBgColor) return;
    state.textConfig.pageBg = pageBgColor.value || null;
    applyTextConfig();
}

function resetPageSection(): void {
    state.textConfig.sidebarBg = null;
    state.textConfig.pageBg = null;
    applyTextConfig();
    syncControls();
}

function resetSpacingSection(): void {
    state.textConfig.lineHeight = null;
    state.textConfig.sectionGap = null;
    applyTextConfig();
    syncControls();
}

/** Toda la apariencia al default del CV activo, EN DRAFT: paleta y formato incluidos. */
// ⚠️ NO toca contenido ni idioma: «estilos» es apariencia. Y el default de la paleta NO es fijo —
// sale de meta.defaultTheme del CV cargado. El modo claro/oscuro vuelve solo con la paleta
function resetAllStyles(): void {
    state.textConfig = defaultTextConfig();
    resetDesignToActiveDefaults();
    applyTextConfig();
    syncControls();
}

function resetDesignToActiveDefaults(): void {
    state.currentThemeIndex = state.defaultThemeIndex;
    state.currentFormat = 0; // Moderno: los datos no traen defaultFormat
    applyThemeAndFormatClasses();
    updateDesignPickerLabels(state.currentLang);
}

export function restoreStylesFromMenu(): void {
    resetAllStyles();
    saveTextConfig();
    commitHistory();
}

/** Reiniciar todo: descarta estilos guardados + snapshot de edición y recarga la plantilla.
 * Exportado también para la fila "Restaurar" del menú "Más" (móvil). */
export function reiniciarTodo(): void {
    confirmDialog(t('dlgResetAllMsg'), {
        title: t('dlgResetAllTitle'),
        icon: 'fa-rotate-left',
        okLabel: t('lblAccept'), // "Aceptar" verde en todos los confirm
        cancelLabel: t('lblCancel'),
        danger: true,
    }).then((accepted) => {
        if (!accepted) return;
        clearTextConfig();
        // El permiso de traducción NO se toca: es de Ajustes › CV Editor, que es donde se cambia
        clearManualSnapshot();
        window.location.reload();
    });
}

function init(): void {
    if (initialized) return;
    const { panel, lineHeight, sectionGap, sidebarColor, pageBgColor } = getEls();
    if (!panel) return;
    if (lineHeight) lineHeight.addEventListener('input', onLineHeightInput);
    if (sectionGap) sectionGap.addEventListener('input', onSectionGapInput);
    if (sidebarColor) sidebarColor.addEventListener('input', onSidebarColorInput);
    if (pageBgColor) pageBgColor.addEventListener('input', onPageBgInput);
    panel.querySelectorAll<HTMLElement>('[data-config-reset]').forEach((btn) => {
        btn.addEventListener('click', () => {
            if (btn.dataset.configReset === 'colors') resetPageSection();
            else if (btn.dataset.configReset === 'spacing') resetSpacingSection();
        });
    });
    enhanceColorFields(panel);
    const saveBtn = document.getElementById('configSaveBtn');
    const cancelBtn = document.getElementById('configCancelBtn');
    const resetStylesBtn = document.getElementById('configResetStylesBtn');
    const resetAllBtn = document.getElementById('configResetAllBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveConfigPanel);
    if (cancelBtn) cancelBtn.addEventListener('click', () => closeConfigPanel());
    if (resetStylesBtn) resetStylesBtn.addEventListener('click', resetAllStyles);
    if (resetAllBtn) resetAllBtn.addEventListener('click', reiniciarTodo);
    initialized = true;
}

export function openConfigPanel(): void {
    init();
    const { panel } = getEls();
    if (!panel) return;
    if (panel.hidden) {
        // Toda la apariencia (config + diseño), para poder revertir si se cierra sin Guardar
        draft = captureDraft();
    }
    syncControls();
    panel.hidden = false;
    panel.classList.add('open');
    cvPanelStore.setCloser('config', closeConfigPanel);
    cvPanelStore.setOpen('config', true);
}

export function saveConfigPanel(): void {
    draft = null;
    saveTextConfig();
    // Commit del historial: guardar Config = una entrada (el snapshot captura
    // textConfig, que es lo que Config toca). record() deduplica si nada cambió.
    commitHistory();
    const { panel } = getEls();
    if (panel) {
        panel.classList.remove('open');
        panel.hidden = true;
    }
    cvPanelStore.setOpen('config', false);
}

/** Cierre sin Guardar (Cancelar/Escape/click-fuera): revierte toda la apariencia al snapshot
 *  — incluidos paleta y formato, que "Restablecer estilos" también toca. */
export function closeConfigPanel(): void {
    if (draft) {
        state.textConfig = draft.textConfig;
        state.currentThemeIndex = draft.themeIndex;
        state.currentFormat = draft.format;
        applyTextConfig();
        applyThemeAndFormatClasses();
        updateDesignPickerLabels(state.currentLang);
        draft = null;
    }
    const { panel } = getEls();
    if (!panel) return;
    panel.classList.remove('open');
    panel.hidden = true;
    cvPanelStore.setOpen('config', false);
}

export function toggleConfigPanel(): void {
    const { panel } = getEls();
    if (!panel || panel.hidden) openConfigPanel();
    else closeConfigPanel();
}
