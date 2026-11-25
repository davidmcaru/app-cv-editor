import { state, applyTextConfig, saveTextConfig, type CVTextGroups } from './cv-state.ts';
import { cvPanelStore } from './cv-panel-store.ts';
import { startEditing, saveManualSnapshot, cancelEditMode } from './cv-edit-mode.ts';
import { rgbToHex } from './cv-utils.ts';
import { t } from './cv-i18n.ts';
import { enhanceSelect } from '../components/widgets/searchable-select/searchable-select.ts';
import { enhanceColorFields } from '../components/widgets/color-field/color-field.ts';

type Group = 'title' | 'subtitle' | 'body' | 'panel';
const GROUPS: Group[] = ['title', 'subtitle', 'body', 'panel'];

// El tamaño se MUESTRA en puntos absolutos para poder comparar unos
// grupos con otros (título vs subtítulos vs cuerpo). Internamente se sigue guardando un
// MULTIPLICADOR (null = default del tema); el número visible es `BASE_PX · scale`.
// BASE_PX = tamaño representativo del grupo (su elemento principal en cv-layout.css).
// STEP = paso del stepper: 1pt en título/subtítulos, 0.5pt en cuerpo/cuerpo-panel.
const BASE_PX: Record<Group, number> = { title: 32, subtitle: 16, body: 13, panel: 13 };
const STEP: Record<Group, number> = { title: 1, subtitle: 1, body: 0.5, panel: 0.5 };

/** Redondea `px` al paso del grupo (evita decimales sueltos al derivar de un multiplicador). */
function roundToStep(px: number, g: Group): number {
    const s = STEP[g];
    return parseFloat((Math.round(px / s) * s).toFixed(1));
}

const SIZE_INPUT_IDS: Record<Group, string> = {
    title: 'textSizeTitle',
    subtitle: 'textSizeSubtitle',
    body: 'textSizeBody',
    panel: 'textSizePanel',
};
const COLOR_IDS: Record<Group, string> = {
    title: 'textColorTitle',
    subtitle: 'textColorSubtitle',
    body: 'textColorBody',
    panel: 'textColorPanel',
};
const DEFAULT_COLORS: Record<Group, string> = {
    title: '#2d3436',
    subtitle: '#b38f00',
    body: '#555555',
    panel: '#ffffff', // el cuerpo del panel lateral es blanco por defecto
};

// Nodo REPRESENTATIVO de cada grupo (los primeros selectores de cada grupo de override en
// cv-layout.css), con alternativas por si el usuario borró el nodo en un CV muy editado.
const GROUP_PROBE: Record<Group, string[]> = {
    title: ['.header h1'],
    subtitle: ['.header h2', '.sidebar-section h3', '.main-section h3'],
    body: ['.profile-text', '.job-details li', '.main-section p'],
    panel: ['.contact-info div', '.sidebar-section li'],
};

/** Color EFECTIVO del grupo cuando no hay override (null = sigue al tema): el computado del
 * nodo sonda en el árbol activo. Es la única fuente correcta para los 12 temas — cada uno
 * define su --accent-color y los oscuros colorean título/cuerpo POR ELEMENTO. */
function effectiveGroupColor(g: Group): string {
    const container = document.getElementById('cv-' + state.currentLang.toLowerCase());
    if (container) {
        for (const sel of GROUP_PROBE[g]) {
            const node = container.querySelector<HTMLElement>(sel);
            if (!node) continue;
            const hex = rgbToHex(getComputedStyle(node).color);
            if (hex) return hex;
        }
    }
    return DEFAULT_COLORS[g];
}

interface TextDraft {
    fontFamily: string | null;
    size: CVTextGroups<number | null>;
    color: CVTextGroups<string | null>;
}

let draft: TextDraft | null = null;
let initialized = false;

function captureStyleDraft(): TextDraft {
    return {
        fontFamily: state.textConfig.fontFamily,
        size: { ...state.textConfig.size },
        color: { ...state.textConfig.color },
    };
}

const fontSelectEl = () => document.getElementById('textFontSelect') as HTMLSelectElement | null;
const sizeInput = (g: Group) => document.getElementById(SIZE_INPUT_IDS[g]) as HTMLInputElement | null;
const colorInput = (g: Group) => document.getElementById(COLOR_IDS[g]) as HTMLInputElement | null;

function syncControls(): void {
    const fontSelect = fontSelectEl();
    if (fontSelect) {
        fontSelect.value = state.textConfig.fontFamily || "'Roboto', sans-serif";
        fontSelect.dispatchEvent(new CustomEvent('edt-ss:sync'));
    }
    GROUPS.forEach((g) => {
        const scale = state.textConfig.size[g];
        const px = typeof scale === 'number' ? BASE_PX[g] * scale : BASE_PX[g];
        const input = sizeInput(g);
        if (input) input.value = String(roundToStep(px, g));
        const colInput = colorInput(g);
        if (colInput) colInput.value = state.textConfig.color[g] || effectiveGroupColor(g);
    });
}

function onFontChange(): void {
    const fontSelect = fontSelectEl();
    if (!fontSelect) return;
    state.textConfig.fontFamily = fontSelect.value || null;
    applyTextConfig();
}

function onSizeInput(g: Group): void {
    const input = sizeInput(g);
    if (!input) return;
    const px = parseFloat(input.value);
    if (!Number.isFinite(px)) return;
    // Tamaño base del grupo = default del tema → guardar null (no fija la custom property).
    // Resto → multiplicador px/base (lo que consumen los calc() de cv-layout.css).
    state.textConfig.size[g] = px === BASE_PX[g] ? null : px / BASE_PX[g];
    applyTextConfig();
}

function onColorInput(g: Group): void {
    const c = colorInput(g);
    if (!c) return;
    state.textConfig.color[g] = c.value || null;
    applyTextConfig();
}

function resetTypographySection(): void {
    state.textConfig.fontFamily = null;
    state.textConfig.size = { title: null, subtitle: null, body: null, panel: null };
    applyTextConfig();
    saveTextConfig();
    syncControls();
}

function resetColorsSection(): void {
    state.textConfig.color = { title: null, subtitle: null, body: null, panel: null };
    applyTextConfig();
    saveTextConfig();
    syncControls();
}

function init(): void {
    if (initialized) return;
    const fontSelect = fontSelectEl();
    if (!fontSelect) return;
    fontSelect.addEventListener('change', onFontChange);
    GROUPS.forEach((g) => {
        sizeInput(g)?.addEventListener('input', () => onSizeInput(g));
        colorInput(g)?.addEventListener('input', () => onColorInput(g));
    });
    // Progressive enhancement de los controles compartidos.
    enhanceSelect(fontSelect, { searchPlaceholder: t('phFontSearch') });
    const panel = document.getElementById('textPanel');
    if (panel) {
        enhanceColorFields(panel);
        panel.querySelectorAll<HTMLElement>('[data-text-reset]').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (btn.dataset.textReset === 'typography') resetTypographySection();
                else if (btn.dataset.textReset === 'colors') resetColorsSection();
            });
        });
    }

    const saveBtn = document.getElementById('textSaveBtn');
    const cancelBtn = document.getElementById('textCancelBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveTextPanel);
    if (cancelBtn) cancelBtn.addEventListener('click', cancelTextPanel);
    initialized = true;
}

export function openTextPanel(): void {
    init();
    const panel = document.getElementById('textPanel');
    if (!panel) return;

    // Entrar en edición si no lo estábamos; snapshot de estilos SOLO en esa transición.
    // En MÓVIL la entrada es la MISMA mecánica (datos genéricos, baseline, autosave,
    // Guardar persiste / Cancelar revierte) — lo único que cv-edit-mode NO habilita ahí
    // es la edición de TEXTO inline.
    if (!state.editMode) {
        if (!startEditing()) return; // mutex ocupado → reintentar luego
        draft = captureStyleDraft();
    }

    syncControls();
    panel.hidden = false;
    panel.classList.add('open');
    // El closer de exclusión mutua solo OCULTA el panel: no saca de edición (abrir
    // Config/Diseño no debe descartar lo que estás editando). El Escape global en
    // cambio SÍ es un Cancelar de verdad (revierte y sale de edición) — sin él,
    // Escape dejaba edit-mode activo sin panel y Descargar oculto.
    cvPanelStore.setCloser('text', hideTextPanel);
    cvPanelStore.setEscapeCloser('text', cancelTextPanel);
    cvPanelStore.setOpen('text', true);
}

/** Solo oculta el panel (closer del store); NO sale de edición. */
function hideTextPanel(): void {
    const panel = document.getElementById('textPanel');
    if (panel) {
        panel.classList.remove('open');
        panel.hidden = true;
    }
    cvPanelStore.setOpen('text', false);
}

export function saveTextPanel(): void {
    draft = null;
    saveTextConfig();
    saveManualSnapshot(); // async: traduce, persiste y sale de edición
    hideTextPanel();
}

export function cancelTextPanel(): void {
    if (draft) {
        state.textConfig.fontFamily = draft.fontFamily;
        state.textConfig.size = { ...draft.size };
        state.textConfig.color = { ...draft.color };
        applyTextConfig();
        draft = null;
    }
    cancelEditMode();
    hideTextPanel();
}

export function toggleTextPanel(): void {
    const panel = document.getElementById('textPanel');
    if (!panel || panel.hidden) openTextPanel();
    else hideTextPanel();
}
