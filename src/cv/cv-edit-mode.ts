import { state, applyThemeAndFormatClasses, commitHistory } from './cv-state.ts';
import { t } from './cv-i18n.ts';
import { initializeCV, updateButtonLabels, setActiveData, renderLanguageIfNeeded } from './cv-data-loader.ts';
import { cvDataGeneric } from './cv-data-generic.ts';
// Antes llegaban por window.* con guards `typeof === 'function'`
import {
    persistManualSnapshot,
    getManualSnapshotRaw,
    setManualSnapshotRaw,
    clearManualSnapshot,
    startCVAutosave,
    stopCVAutosave,
} from './cv-controller.ts';
import { translateEditedContent, markAsEdited } from './cv-translation.ts';
import { safeUrl, isSafeUrl, showToast, confirmDialog, dlog, announceA11y, sanitizeCVHTML } from './cv-utils.ts';
import { DEFAULT_CV_KEY, DEFAULT_CV_SEQUENCE } from './cv-constants.ts';
import { DEFAULT_PROFILE } from './cv-profiles.ts';
import {
    attachEditOverlay,
    removeEditOverlays,
    EDIT_OVERLAY_ICONS,
} from '../components/widgets/edit-overlay/edit-overlay.ts';
import { isMobile } from '../components/core/breakpoint/get-bp.ts';
import { createFloatingFormatToolbar } from '../components/widgets/floating-format-toolbar/floating-format-toolbar.ts';
import { normalizeRichText } from '../components/features/utils/normalize-rich-text.ts';
import type { CVData, Lang } from './cv-types.ts';

// Toolbar flotante B/I/U: singleton perezoso, scope al árbol de
// idioma activo (no debe dispararse en editables de otros idiomas ocultos).
let _formatToolbar: ReturnType<typeof createFloatingFormatToolbar> | null = null;
function getFormatToolbar() {
    if (!_formatToolbar) {
        _formatToolbar = createFloatingFormatToolbar({
            root: () => document.querySelector('.cv-container:not([hidden])'),
            labels: () => ({
                toolbar: t('fmtToolbar'),
                bold: t('fmtBold'),
                italic: t('fmtItalic'),
                underline: t('fmtUnderline'),
            }),
        });
    }
    return _formatToolbar;
}

// Helper: clona un <template> por id y devuelve el primer elemento.
function cloneTpl(id: string): DocumentFragment | null {
    const tpl = document.getElementById(id);
    if (!(tpl instanceof HTMLTemplateElement)) return null;
    const fragment = tpl.content.cloneNode(true) as DocumentFragment;
    return fragment.firstElementChild ? fragment : null;
}

// Los textos del confirm de reset viven en i18n/{lang}.json (dlgResetEdit*); las
// tablas inline por idioma (y los resetButtonLabels/editButtonLabels muertos) se retiraron.

function captureCvBaseline() {
    const cvEs = document.getElementById('cv-es');
    const cvEn = document.getElementById('cv-en');
    const cvDe = document.getElementById('cv-de');
    if (!cvEs || !cvEn || !cvDe) return null;

    return {
        currentLang: state.currentLang,
        currentThemeIndex: state.currentThemeIndex,
        currentFormat: state.currentFormat,
        isOwnerView: state.isOwnerView,
        downloadEnabled: state.downloadEnabled,
        hasManualSnapshot: state.hasManualSnapshot,
        cvs: {
            ES: cvEs.innerHTML,
            EN: cvEn.innerHTML,
            DE: cvDe.innerHTML,
        },
    };
}

function restoreCvBaseline() {
    if (!state.editBaseline || !state.editBaseline.cvs) return;

    const cvEs = document.getElementById('cv-es');
    const cvEn = document.getElementById('cv-en');
    const cvDe = document.getElementById('cv-de');
    if (!cvEs || !cvEn || !cvDe) return;

    cvEs.innerHTML = state.editBaseline.cvs.ES || cvEs.innerHTML;
    cvEn.innerHTML = state.editBaseline.cvs.EN || cvEn.innerHTML;
    cvDe.innerHTML = state.editBaseline.cvs.DE || cvDe.innerHTML;

    // Marcar los 3 idiomas como YA renderizados: acabamos de inyectar el
    // HTML del baseline en cada contenedor, así que ninguno sigue "pendiente". Si quedara
    // `data-lang-pending`/`cv-lang-pending`, un renderLanguageIfNeeded posterior (toggle de
    // idioma) regeneraría el idioma desde el JSON base y borraría el baseline restaurado.
    [cvEs, cvEn, cvDe].forEach((el) => {
        el.removeAttribute('data-lang-pending');
        el.classList.remove('cv-lang-pending');
    });

    state.currentLang = state.editBaseline.currentLang;
    state.currentThemeIndex = state.editBaseline.currentThemeIndex;
    state.currentFormat = state.editBaseline.currentFormat;

    applyThemeAndFormatClasses();

    // Visibilidad por idioma: usar atributo `hidden` (consistente con cv-controller).
    // (Tupla tipada: sin la anotación TS infiere (string | HTMLElement)[][].)
    const trees: Array<[HTMLElement, Lang]> = [
        [cvEs, 'ES'],
        [cvEn, 'EN'],
        [cvDe, 'DE'],
    ];
    trees.forEach(([el, code]) => {
        const isActive = state.currentLang === code;
        if (isActive) {
            el.removeAttribute('hidden');
            el.classList.add('cv-lang-active');
        } else {
            el.setAttribute('hidden', '');
            el.classList.remove('cv-lang-active');
        }
        el.style.removeProperty('display');
    });

    document.body.classList.remove('lang-es', 'lang-en', 'lang-de');
    document.body.classList.add(`lang-${state.currentLang.toLowerCase()}`);
}

export function updateSaveButtonState() {
    const saveBtn = document.getElementById('textSaveBtn') as HTMLButtonElement | null;
    if (!saveBtn) return;
    const shouldEnable = state.editMode;
    saveBtn.disabled = !shouldEnable;
    saveBtn.setAttribute('aria-disabled', shouldEnable ? 'false' : 'true');
}

export async function saveManualSnapshot() {
    if (!state.editMode) return;

    // Traducir ANTES de persistir: persistiendo primero, el snapshot guardaría los otros idiomas sin
    // traducir y se perderían al recargar. Sea cual sea el idioma a la vista: translateEditedContent solo envía lo
    // editado en el del sitio, y puede resolver sin traducir (sin permiso, o con fallos que deja en la cola).
    if (state.editMode && state.editedElements.size > 0 && !state.isTranslating) {
        await translateEditedContent();
    }

    if (state.editMode) {
        exitEditMode();
    }

    // Persistir PRIMERO y comprobar el resultado: si el guardado falla
    // (p.ej. QuotaExceededError por imágenes base64 triplicadas), NO reportamos éxito
    // ni bloqueamos la UI. persistLocalSnapshot ya muestra el toast de error.
    const persisted = persistManualSnapshot() === true;

    if (!persisted) {
        updateDownloadButtonState();
        updateSaveButtonState();
        return;
    }

    state.hasManualSnapshot = true;
    state.downloadEnabled = true;
    updateDownloadButtonState();
    updateSaveButtonState();

    // Commit del historial: un Guardar de edición/Textos = una entrada de deshacer.
    // Solo tras un persist correcto (arriba se retorna si falló). La traducción ya se esperó
    // antes de persistir, así que la entrada captura los 3 idiomas ya traducidos.
    commitHistory();
    document.dispatchEvent(new CustomEvent('cv:guardado'));
}

// ENTRADA A EDICIÓN
// La entra ahora el panel Textos (cv-text-panel), no un botón que togglea. Este
// helper conserva el mutex anti-doble-click y el anuncio a11y. Devuelve true si
// quedó en edición (o ya lo estaba).
export function startEditing() {
    if (state.editMode) return true;
    if (state._editingMutex) {
        dlog('startEditing: ignorado, transición en curso');
        return false;
    }
    state._editingMutex = true;
    try {
        enterEditMode(); // pone state.editMode = true
        announceA11y(t('a11yEditOn'));
        return true;
    } finally {
        Promise.resolve().then(() => {
            state._editingMutex = false;
        });
    }
}

/* AVISO DESBORDAMIENTO A4 */
// El folio es SIEMPRE una cara A4: en edición
// avisamos cuando el contenido sobresale del folio, porque no saldrá en el PDF.
let _a4Observer: MutationObserver | null = null;

function updateA4OverflowWarning() {
    const warning = document.getElementById('cvA4OverflowWarning');
    if (!warning) return;
    const container = document.querySelector('.cv-container:not([hidden])');
    const overflows = state.editMode && container ? container.scrollHeight > container.clientHeight + 2 : false;
    warning.hidden = !overflows;
}

function startA4OverflowWatch() {
    updateA4OverflowWarning();
    const host = document.getElementById('cv-container');
    if (!host || _a4Observer) return;
    // Event-driven (sin polling): re-evaluar en cada mutación del CV en edición,
    // incluido el cambio de idioma (atributo hidden de los .cv-container).
    _a4Observer = new MutationObserver(() => updateA4OverflowWarning());
    _a4Observer.observe(host, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['hidden'],
    });
}

function stopA4OverflowWatch() {
    if (_a4Observer) {
        _a4Observer.disconnect();
        _a4Observer = null;
    }
    const warning = document.getElementById('cvA4OverflowWarning');
    if (warning) warning.hidden = true;
}

/* CHROME DE EDICIÓN */
// WYSIWYG: los controles de añadir/eliminar NO viven en el flujo del contenido — se
// inyectan como overlays proyectados FUERA de la caja al entrar en edición (sidebar
// hacia la IZQUIERDA del folio, contenido principal hacia la DERECHA) y se retiran
// al salir. Así editar no desplaza ni un píxel respecto a la vista.

const PLUS_ICON =
    '<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';

// Habilita contenteditable + listeners en un nodo recién añadido durante la sesión
// (los templates ya no llevan contenteditable hardcodeado).
function enableNodeEditing(rootEl: HTMLElement): void {
    const signal = state._editAbortController ? state._editAbortController.signal : undefined;
    rootEl.querySelectorAll<HTMLElement>('[data-editable], .tag-text, .list-text').forEach((el) => {
        el.setAttribute('contenteditable', 'true');
        if (!el.hasAttribute('data-editable')) el.setAttribute('data-editable', '');
        el.addEventListener('input', () => markAsEdited(el), signal ? { signal } : undefined);
    });
    if (rootEl.matches && rootEl.matches('li') && !rootEl.querySelector('[data-editable]')) {
        rootEl.setAttribute('contenteditable', 'true');
        rootEl.setAttribute('data-editable', '');
        rootEl.addEventListener('input', () => markAsEdited(rootEl), signal ? { signal } : undefined);
    }
}

function focusAndSelect(el: HTMLElement | null): void {
    if (!el) return;
    el.focus();
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);
}

function attachItemChrome(el: HTMLElement): void {
    if (el.classList.contains('skill-tag')) {
        attachEditOverlay(el, {
            side: 'right',
            actions: [{ id: 'delete', icon: EDIT_OVERLAY_ICONS.close, title: t('tipDeleteSkill'), danger: true }],
            onAction: (_id, host) => deleteSkillTag(host),
        });
        return;
    }
    if (el.matches('.sidebar-section ul.list-clean > li')) {
        attachEditOverlay(el, {
            side: 'left',
            actions: [{ id: 'delete', icon: EDIT_OVERLAY_ICONS.trash, title: t('tipDeleteListItem'), danger: true }],
            onAction: (_id, host) => deleteListItem(host),
        });
        return;
    }
    if (el.matches('ul.job-details > li')) {
        attachEditOverlay(el, {
            side: 'right',
            actions: [{ id: 'delete', icon: EDIT_OVERLAY_ICONS.trash, title: t('tipDeletePoint'), danger: true }],
            onAction: (_id, host) => deleteJobItem(host),
        });
        return;
    }
    if (el.classList.contains('job-item')) {
        const section = el.closest('.main-section');
        const kind = section ? section.getAttribute('data-cv-section') : null;
        const actions = [];
        if (el.querySelector('ul.job-details')) {
            actions.push({ id: 'add-point', icon: PLUS_ICON, title: t('tipAddPoint') });
        }
        actions.push({
            id: 'delete',
            icon: EDIT_OVERLAY_ICONS.trash,
            title: kind === 'education' ? t('tipDeleteEducation') : t('tipDeleteExperience'),
            danger: true,
        });
        attachEditOverlay(el, {
            side: 'right',
            actions,
            onAction: (id, host) => {
                if (id === 'add-point') addJobItem(host);
                else if (kind === 'education') deleteEducationItem(host);
                else deleteExperienceItem(host);
            },
        });
    }
}

/** (Re)inyecta el chrome de edición en el árbol de idioma ACTIVO. */
export function setupEditChrome() {
    if (!state.editMode) return;
    // MÓVIL: sin overlays CRUD — la edición de contenido es
    // solo-escritorio; en móvil la sesión de edición aplica estilos (panel Textos) y
    // conserva el resto de la mecánica (datos genéricos, Guardar/Cancelar, autosave).
    // El guard vive AQUÍ porque también llama cv-languages al cambiar de idioma.
    if (isMobile()) return;
    const tree = document.querySelector('.cv-container:not([hidden])');
    if (!tree) return;
    removeEditOverlays(tree);

    tree.querySelectorAll<HTMLElement>(
        '.skill-tag, .sidebar-section ul.list-clean > li, ul.job-details > li, .main-section .job-item'
    ).forEach((el) => attachItemChrome(el));

    tree.querySelectorAll<HTMLElement>('.sidebar-section').forEach((section) => {
        const skills = section.querySelector<HTMLElement>('.skills-container');
        const list = section.querySelector<HTMLElement>('ul.list-clean');
        if (!skills && !list) return;
        attachEditOverlay(section, {
            side: 'left',
            actions: [{ id: 'add', icon: PLUS_ICON, title: skills ? t('tipAddSkill') : t('tipAddListItem') }],
            onAction: () => (skills ? addSkillTag(skills) : list && addListItem(list)),
        });
    });

    tree.querySelectorAll<HTMLElement>('.main-section[data-cv-section]').forEach((section) => {
        const kind = section.getAttribute('data-cv-section');
        attachEditOverlay(section, {
            side: 'right',
            actions: [
                {
                    id: 'add',
                    icon: PLUS_ICON,
                    title: kind === 'education' ? t('tipAddEducation') : t('tipAddExperience'),
                },
            ],
            onAction: () => (kind === 'education' ? addEducationItem(section) : addExperienceItem(section)),
        });
    });
}

function teardownEditChrome() {
    const host = document.getElementById('cv-container');
    if (host) removeEditOverlays(host);
}

// `editBtn` es opcional — el flujo lo abre ahora el panel Textos
// (cv-text-panel), no un botón que cambia de icono/label. El botón Textos del
// toolbar refleja su estado activo vía cvPanelStore (.is-active), no aquí.
export function enterEditMode(editBtn: HTMLElement | null = null) {
    dlog('--- enterEditMode ---', { isOwnerView: state.isOwnerView });

    // El contexto de entrada se guarda aquí para que Cancelar restaure EXACTAMENTE este punto
    if (!state.preEditContext) {
        state.preEditContext = {
            isOwnerView: state.isOwnerView,
            downloadEnabled: state.downloadEnabled,
            hasManualSnapshot: state.hasManualSnapshot,
            snapshotRaw: getManualSnapshotRaw(),
        };
    }

    if (state.isOwnerView) {
        dlog('Cambiando a datos genéricos...');
        state.isOwnerView = false;
        document.body.classList.remove('owner-view');
        // Regenerar CV con datos genéricos (import ESM; el guard `if (window.…)`
        // sobraba en cuanto deja de depender de que otro módulo ya haya corrido su write).
        setActiveData(cvDataGeneric);
        initializeCV();
    }

    // ⚠️ El modo edición se aplica DESPUÉS de regenerar el CV
    state.editMode = true;
    document.body.classList.add('edit-mode');
    if (editBtn) editBtn.classList.add('active');

    updateDownloadButtonState();

    // Capturar el baseline ANTES de habilitar edición: si se captura
    // después, el HTML guardado ya lleva contenteditable="true" y Cancelar restaura un
    // CV que sigue siendo editable fuera del modo edición.
    const currentCV = document.querySelector('.cv-container:not([hidden]):not([style*="display: none"])');
    if (currentCV) {
        state.originalCVState = currentCV.innerHTML;
    }

    state.editBaseline = captureCvBaseline();

    // ⚠️ Después de capturar el baseline, o el baseline recoge ya el DOM editable
    enableEditing();

    updateSaveButtonState();

    {
        startCVAutosave();
    }

    setupEditChrome(); // se auto-guarda en móvil (sin overlays CRUD)
    if (!isMobile()) getFormatToolbar().activate(); // B/I/U solo donde hay texto editable
    startA4OverflowWatch();
}

// Salir del modo edición (guardar cambios). editBtn opcional.
export function exitEditMode(editBtn: HTMLElement | null = null) {
    state.editMode = false;
    document.body.classList.remove('edit-mode');
    if (editBtn) editBtn.classList.remove('active');
    disableEditing();
    state.originalCVState = null; // Limpiar estado guardado

    {
        stopCVAutosave();
    }

    // ⚠️ Sin traducir aquí: saveManualSnapshot ya la esperó, y lo que falló espera en la cola al siguiente Guardar
    state.editBaseline = null;
    state.preEditContext = null;

    stopA4OverflowWatch();
    updateSaveButtonState();
}

export function resetEditingToInitialState(editBtn: HTMLElement | null = null) {
    if (!state.editMode) return;

    // Confirmación no bloqueante (asincrónica): el flujo continúa solo si el usuario confirma.
    // "Aceptar" verde en todos los confirm.
    confirmDialog(t('dlgResetEditMsg'), {
        title: t('dlgResetEditTitle'),
        icon: 'fa-rotate-left',
        okLabel: t('lblAccept'),
        cancelLabel: t('lblCancel'),
        danger: true,
    }).then((accepted) => {
        if (!accepted) return;

        const hadSnapshot = state.hasManualSnapshot;

        {
            clearManualSnapshot();
        }

        closeLinkEditor();
        state.editMode = false;
        state.editedElements.clear();
        state.downloadEnabled = false;
        state.hasManualSnapshot = false;
        state.editBaseline = null;
        state.preEditContext = null;

        {
            stopCVAutosave();
        }

        if (editBtn) editBtn.classList.remove('active');

        updateDownloadButtonState();
        updateSaveButtonState();

        if (state.cvMode === 'showcase') {
            try {
                if (hadSnapshot) {
                    window.localStorage.setItem(DEFAULT_CV_KEY, DEFAULT_CV_SEQUENCE[0] ?? DEFAULT_PROFILE);
                } else {
                    window.sessionStorage.setItem('cv-skip-rotation', '1');
                }
            } catch (_err) {}
        }

        window.location.reload();
    });
}

/**
 * Re-arma el modo edición tras regenerar el DOM con OTRO perfil.
 * En el modo completo el panel Perfil queda activo durante la edición: al cambiar de perfil se llama a
 * initializeCV(), que reemplaza todos los nodos editables por otros nuevos SIN
 * contenteditable ni listeners, y deja `state.editBaseline` apuntando al perfil viejo.
 * Esta función replica el setup de enterEditMode SOLO en lo que depende del DOM:
 * re-habilita la edición y RE-CAPTURA el baseline para que Cancelar restaure el
 * perfil correcto. No toca preEditContext (el contexto pre-edición no cambió).
 */
export function reenterEditModeAfterProfileSwitch() {
    if (!state.editMode) return;

    enableEditing();
    state.editBaseline = captureCvBaseline();

    const currentCV = document.querySelector('.cv-container:not([hidden]):not([style*="display: none"])');
    if (currentCV) {
        state.originalCVState = currentCV.innerHTML;
    }

    updateSaveButtonState();
}

export function regenerateCVWithData(data: CVData) {
    setActiveData(data);

    initializeCV();

    updateButtonLabels(state.currentLang);
    updateDownloadButtonState();
}

export function updateDownloadButtonState() {
    const downloadBtn = document.getElementById('downloadBtn');
    if (!downloadBtn) return;
    if (state.downloadEnabled) {
        downloadBtn.classList.remove('disabled');
        downloadBtn.removeAttribute('title');
    } else {
        downloadBtn.classList.add('disabled');
        downloadBtn.setAttribute('title', t('tipDownloadDisabled'));
    }
}

export function cancelEditMode() {
    dlog('=== cancelEditMode ===', { editMode: state.editMode });

    if (!state.editMode) return;

    state.editMode = false;
    document.body.classList.remove('edit-mode');

    {
        stopCVAutosave();
    }

    state.editedElements.clear();
    state.originalCVState = null;

    disableEditing();
    stopA4OverflowWatch();

    // Se restaura SIEMPRE al estado capturado al entrar, pase lo que pase en medio
    if (state.preEditContext?.isOwnerView) {
        if (state.editBaseline) {
            state.currentLang = state.editBaseline.currentLang;
            state.currentThemeIndex = state.editBaseline.currentThemeIndex;
            state.currentFormat = state.editBaseline.currentFormat;
        }

        state.isOwnerView = true;
        state.downloadEnabled = false;
        state.hasManualSnapshot = false;
        document.body.classList.add('owner-view');
        if (state.baseData) setActiveData(state.baseData);
        initializeCV();

        {
            setManualSnapshotRaw(state.preEditContext.snapshotRaw || null);
        }
    } else {
        restoreCvBaseline();
        state.isOwnerView = Boolean(state.preEditContext?.isOwnerView);
        state.downloadEnabled = Boolean(state.preEditContext?.downloadEnabled);
        state.hasManualSnapshot = Boolean(state.preEditContext?.hasManualSnapshot);

        {
            setManualSnapshotRaw(state.preEditContext?.snapshotRaw || null);
        }
    }

    state.editBaseline = null;
    state.preEditContext = null;

    updateDownloadButtonState();
    updateSaveButtonState();
    updateButtonLabels(state.currentLang);

    closeLinkEditor();

    dlog('cancelEditMode completado', { editMode: state.editMode });
}

function enableEditing() {
    // Asignar IDs estables paralelos en cv-es / cv-en / cv-de para que la traducción
    // pueda mapear elementos por ID en lugar de por índice posicional.    // forzar render de los idiomas pendientes para que la edición tenga los 3 árboles.
    {
        ['ES', 'EN', 'DE'].forEach((lang) => renderLanguageIfNeeded(lang));
    }
    assignTranslationIds();

    // MÓVIL: hasta aquí. La preparación de los 3 árboles (render + translate-ids) es
    // necesaria para que Guardar persista EN/DE bien, pero la edición de TEXTO inline
    // (contenteditable + listeners + popup de enlaces) es solo-escritorio: el aviso del panel Textos (.cv-sheet-note) remite a escritorio.
    if (isMobile()) return;

    // Un AbortController por sesión de edición: disableEditing() llamaba a
    // state._editAbortController.abort() pero el campo NUNCA se instanciaba (rama muerta),
    // así que los listeners input/click quedaban colgados. Ahora se crea aquí y cada
    // addEventListener recibe { signal } → un único abort() los libera todos.
    state._editAbortController = new AbortController();
    const { signal } = state._editAbortController;

    // Habilitar contenteditable en elementos simples. Los enlaces de contacto quedan FUERA
    // Su único camino de edición es el popup (handleLinkClick). Sin el
    // :not(), en la 2ª sesión (el data-editable estampado abajo persiste en el snapshot) se
    // volvían contenteditable con input→markAsEdited y sus emails/teléfonos acababan enviados
    // al traductor externo.
    document.querySelectorAll<HTMLElement>('[data-editable]:not([data-editable-link])').forEach((el) => {
        el.setAttribute('contenteditable', 'true');
        el.addEventListener('input', () => markAsEdited(el), { signal });
    });

    document.querySelectorAll<HTMLElement>('[data-editable-list] li').forEach((li) => {
        li.setAttribute('contenteditable', 'true');
        li.setAttribute('data-editable', '');
        li.addEventListener('input', () => markAsEdited(li), { signal });
    });

    document.querySelectorAll<HTMLElement>('[data-editable-skills] .skill-tag').forEach((tag) => {
        const tagText = tag.querySelector<HTMLElement>('.tag-text');
        if (tagText) {
            tagText.setAttribute('contenteditable', 'true');
            tagText.setAttribute('data-editable', '');
            tagText.addEventListener('input', () => markAsEdited(tagText), { signal });
        } else {
            tag.setAttribute('contenteditable', 'true');
            tag.setAttribute('data-editable', '');
            tag.addEventListener('input', () => markAsEdited(tag), { signal });
        }
    });

    document.querySelectorAll('[data-editable-link]').forEach((link) => {
        link.setAttribute('data-editable', '');
        link.addEventListener('click', handleLinkClick, { signal });
    });

    // Paste seguro: al pegar en un editable, sanear el HTML del
    // portapapeles ANTES de insertarlo (evita inyectar markup hostil o basura de
    // estilos de otras apps). Delegado en el contenedor con el signal de la sesión.
    const container = document.getElementById('cv-container');
    if (container) {
        container.addEventListener(
            'paste',
            (e) => {
                const target = e.target as HTMLElement | null;
                if (!target || !target.closest || !target.closest('[contenteditable="true"]')) return;
                e.preventDefault();
                const cb = (e as ClipboardEvent).clipboardData;
                const raw = cb ? cb.getData('text/html') || cb.getData('text/plain') : '';
                const clean = normalizeRichText(sanitizeCVHTML(raw));
                document.execCommand('insertHTML', false, clean);
            },
            { signal }
        );

        // Normalizar el formato inline al salir de cada editable (blur): colapsa
        // los <span style="font-weight…"> que genera el navegador a <b>/<i>/<u>
        // semánticos, para que sobrevivan al guardar sin acumular cruft.
        container.addEventListener(
            'focusout',
            (e) => {
                const el = e.target as HTMLElement | null;
                if (!el || !el.matches || !el.matches('[data-editable]')) return;
                const normalized = normalizeRichText(el.innerHTML);
                if (normalized !== el.innerHTML) el.innerHTML = normalized;
            },
            { signal }
        );
    }
}

function disableEditing() {
    // Abortar el controller libera todos los listeners de una sola vez.
    if (state._editAbortController) {
        try {
            state._editAbortController.abort();
        } catch (_err) {}
        state._editAbortController = null;
    }

    document.querySelectorAll('[contenteditable="true"]').forEach((el) => {
        el.setAttribute('contenteditable', 'false');
    });

    document.querySelectorAll('[data-editable-link]').forEach((link) => {
        link.removeEventListener('click', handleLinkClick);
    });

    // Retirar el chrome de edición
    teardownEditChrome();
    getFormatToolbar().deactivate();

    closeLinkEditor();
}

/**
 * Asigna `data-translate-id` paralelos a los elementos editables en cv-es / cv-en / cv-de.
 * Garantiza que la misma posición lógica recibe el mismo ID en los 3 árboles, de forma que
 * la traducción automática puede emparejar nodos sin depender de índices posicionales.
 */
function assignTranslationIds() {
    const cvs = ['cv-es', 'cv-en', 'cv-de']
        .map((id) => document.getElementById(id))
        .filter((el): el is HTMLElement => el !== null);
    if (cvs.length < 2) return;

    // [data-editable-link] va EXPLÍCITO: los enlaces de contacto reciben
    // data-editable DESPUÉS de esta pasada (enableEditing los estampa al final), así que sin
    // el selector propio se quedaban sin data-translate-id y el espejado de saveLinkEdit
    // (texto + href a EN/DE) era un no-op silencioso en la primera sesión de edición.
    const sel =
        '[data-editable], [data-editable-link], [data-editable-list] li, [data-editable-skills] .skill-tag .tag-text';
    const lists = cvs.map((cv) => Array.from(cv.querySelectorAll<HTMLElement>(sel)));
    const minLen = Math.min(...lists.map((l) => l.length));

    for (let i = 0; i < minLen; i += 1) {
        // Si alguno ya tiene ID, lo reusamos; si no, generamos uno nuevo.
        // (Los `?.`/`continue` son ruido para el compilador: `i < minLen` ya garantiza que
        // la posición existe en TODAS las listas. No cambian el flujo.)
        let id = lists[0]?.[i]?.dataset.translateId;
        for (const list of lists) {
            const node = list[i];
            if (!id && node?.dataset.translateId) {
                id = node.dataset.translateId;
            }
        }
        if (!id) id = `tx-${i.toString(36)}-${Date.now().toString(36)}`;
        for (const list of lists) {
            const node = list[i];
            if (node && !node.dataset.translateId) node.dataset.translateId = id;
        }
    }
}

// ESPEJADO ESTRUCTURAL EN LOS 3 ÁRBOLES
// Las ediciones estructurales (añadir/quitar item de lista, skill, punto, experiencia,
// formación) y de enlaces se hacían SOLO en el árbol activo (ES). EN/DE quedaban sin el
// cambio → sus PDFs salían mal. Estos helpers replican la operación en los otros 2 árboles
// mapeando elementos por el `data-translate-id` compartido (que ya asigna assignTranslationIds).
// Si un árbol no tiene el ID correspondiente, se salta ese árbol sin lanzar.

const LANG_TREE_IDS = ['cv-es', 'cv-en', 'cv-de'];

// Genera un nuevo `data-translate-id` único (mismo formato que assignTranslationIds).
let _mirrorIdCounter = 0;
function newTranslateId() {
    _mirrorIdCounter += 1;
    return `tx-new-${_mirrorIdCounter.toString(36)}-${Date.now().toString(36)}`;
}

function getOwnerTree(node: HTMLElement | null): HTMLElement | null {
    return node ? node.closest<HTMLElement>('.cv-container') : null;
}

// Devuelve los otros árboles de idioma (los que NO son `activeTree`).
function getOtherTrees(activeTree: HTMLElement | null): HTMLElement[] {
    return LANG_TREE_IDS.map((id) => document.getElementById(id)).filter(
        (el): el is HTMLElement => el !== null && el !== activeTree
    );
}

function firstTranslateIdWithin(el: HTMLElement | null): string | null {
    if (!el) return null;
    if (el.dataset && el.dataset.translateId) return el.dataset.translateId;
    const inner = el.querySelector<HTMLElement>('[data-translate-id]');
    return inner ? (inner.dataset.translateId ?? null) : null;
}

function findByTranslateId(tree: HTMLElement | null, id: string | null): HTMLElement | null {
    if (!tree || !id) return null;
    return tree.querySelector<HTMLElement>(`[data-translate-id="${CSS.escape(id)}"]`);
}

// Asegura que cada elemento traducible dentro de `root` (o el propio root) tiene un
// `data-translate-id`. Devuelve el mapa id→elemento para reusar los MISMOS ids al clonar.
// Selector espejo del de assignTranslationIds.
const TRANSLATABLE_SEL =
    '[data-editable], [data-editable-link], [data-editable-list] li, [data-editable-skills] .skill-tag .tag-text';
function ensureTranslateIds(root: HTMLElement): HTMLElement[] {
    const nodes: HTMLElement[] = [];
    if (root.matches && root.matches(TRANSLATABLE_SEL)) nodes.push(root);
    nodes.push(...root.querySelectorAll<HTMLElement>(TRANSLATABLE_SEL));
    for (const node of nodes) {
        if (!node.dataset.translateId) node.dataset.translateId = newTranslateId();
    }
    return nodes;
}

/**
 * Espeja el BORRADO de un item estructural (li, .skill-tag, .job-item) a los otros árboles.
 * Mapea por el primer `data-translate-id` del item en el árbol activo y elimina, en cada
 * otro árbol, el ancestro equivalente (`closestSelector`) del elemento con ese id.
 */
function mirrorStructuralRemove(activeItem: HTMLElement, closestSelector: string): void {
    const activeTree = getOwnerTree(activeItem);
    if (!activeTree) return;
    const anchorId = firstTranslateIdWithin(activeItem);
    if (!anchorId) return; // sin ancla no podemos mapear con seguridad → no tocar EN/DE
    for (const tree of getOtherTrees(activeTree)) {
        const match = findByTranslateId(tree, anchorId);
        const item = match ? match.closest(closestSelector) : null;
        if (item) item.remove();
    }
}

/**
 * Espeja el AÑADIDO de un item estructural a los otros árboles.
 * `newItem` ya está en el árbol activo dentro de `activeContainer`. Estrategia:
 *  1. Garantizar ids en los editables del nuevo item (ids compartidos entre árboles).
 *  2. Localizar el contenedor equivalente en cada otro árbol (`resolveContainer`).
 *  3. Clonar el item e insertarlo con `insertClone` (append o insertBefore según el caso).
 * El clon conserva los mismos `data-translate-id` → la traducción y futuros borrados casan.
 */
function mirrorStructuralAdd(
    newItem: HTMLElement,
    activeContainer: HTMLElement,
    resolveContainer: (tree: HTMLElement, activeContainer: HTMLElement, activeTree: HTMLElement) => HTMLElement | null,
    insertClone: (container: HTMLElement, clone: HTMLElement) => void
): void {
    const activeTree = getOwnerTree(newItem);
    if (!activeTree) return;
    ensureTranslateIds(newItem);
    for (const tree of getOtherTrees(activeTree)) {
        const container = resolveContainer(tree, activeContainer, activeTree);
        if (!container) continue; // no hay contenedor equivalente → saltar ese árbol
        const clone = newItem.cloneNode(true) as HTMLElement;
        insertClone(container, clone);
    }
}

/**
 * Resuelve el contenedor equivalente en `tree` a partir del `activeContainer` del árbol
 * activo. Preferencia por robustez:
 *  1. Si el contenedor tiene items con `data-translate-id`, mapear por el PADRE del
 *     primer item con id (mismo contenedor lógico aunque cambie el orden).
 *  2. Fallback: mapear la SECCIÓN por el `data-translate-id` de su `<h3>` y localizar
 *     dentro el contenedor con el mismo selector de clase.
 */
function resolveEquivalentContainer(
    tree: HTMLElement,
    activeContainer: HTMLElement,
    _activeTree: HTMLElement,
    containerSelector: string,
    sectionSelector: string
): HTMLElement | null {
    const someId = firstTranslateIdWithin(activeContainer);
    if (someId) {
        const match = findByTranslateId(tree, someId);
        const container = match ? match.closest<HTMLElement>(containerSelector) : null;
        if (container) return container;
    }
    // (2) Vía la cabecera de la sección.
    const section = activeContainer.closest(sectionSelector);
    const heading = section ? section.querySelector<HTMLElement>('h3[data-translate-id]') : null;
    const headingId = heading ? heading.dataset.translateId : null;
    if (headingId) {
        const otherHeading = findByTranslateId(tree, headingId);
        const otherSection = otherHeading ? otherHeading.closest(sectionSelector) : null;
        if (otherSection) {
            const container = otherSection.querySelector<HTMLElement>(containerSelector);
            if (container) return container;
        }
    }
    return null;
}

/**
 * Resuelve la `ul.job-details` equivalente en `tree` para un job concreto.
 *  1. Vía un item existente con id dentro de la ul.
 *  2. Fallback: mapear el `.job-item` por el id de su `.job-title` y coger su ul.job-details.
 */
function resolveEquivalentJobDetails(tree: HTMLElement, activeUl: HTMLElement): HTMLElement | null {
    const someId = firstTranslateIdWithin(activeUl);
    if (someId) {
        const match = findByTranslateId(tree, someId);
        const ul = match ? match.closest<HTMLElement>('ul.job-details') : null;
        if (ul) return ul;
    }
    const jobItem = activeUl.closest('.job-item');
    const jobTitle = jobItem ? jobItem.querySelector<HTMLElement>('.job-title[data-translate-id]') : null;
    const titleId = jobTitle ? jobTitle.dataset.translateId : null;
    if (titleId) {
        const otherTitle = findByTranslateId(tree, titleId);
        const otherJob = otherTitle ? otherTitle.closest<HTMLElement>('.job-item') : null;
        const ul = otherJob ? otherJob.querySelector<HTMLElement>('ul.job-details') : null;
        if (ul) return ul;
    }
    return null;
}

/**
 * Resuelve la SECCIÓN equivalente (`.main-section`) en `tree` para experiencia/formación,
 * mapeando por el `data-translate-id` de su `<h3>`. Devuelve también el botón "add"
 * correspondiente para insertar el nuevo item ANTES de él (misma UX que en ES).
 */
// Sección equivalente en otro árbol de idioma. Ancla primaria: data-cv-section
// Fallback: heading por translate-id.
function resolveEquivalentSection(tree: HTMLElement, activeSection: HTMLElement | null): HTMLElement | null {
    if (!activeSection) return null;
    const kind = activeSection.getAttribute('data-cv-section');
    if (kind) {
        const byKind = tree.querySelector<HTMLElement>(`.main-section[data-cv-section="${kind}"]`);
        if (byKind) return byKind;
    }
    const heading = activeSection.querySelector<HTMLElement>('h3[data-translate-id]');
    const headingId = heading ? heading.dataset.translateId : null;
    if (!headingId) return null;
    const otherHeading = findByTranslateId(tree, headingId);
    return otherHeading ? otherHeading.closest<HTMLElement>('.main-section') : null;
}

const linkPopup = (): HTMLElement | null => document.getElementById('linkEditorPopup');
const linkTextInput = (): HTMLInputElement | null => document.getElementById('linkText') as HTMLInputElement | null;
const linkUrlInput = (): HTMLInputElement | null => document.getElementById('linkUrl') as HTMLInputElement | null;

function handleLinkClick(e: Event) {
    if (!state.editMode) return;

    e.preventDefault();
    e.stopPropagation();

    state.currentEditingLink = (e.target as HTMLElement).closest<HTMLElement>('[data-editable-link]');
    if (!state.currentEditingLink) return;

    // Guardar el elemento previamente enfocado para devolver el foco al cerrar.
    state._linkEditorPreviouslyFocused = document.activeElement as HTMLElement | null;

    const popup = linkPopup();
    const textInput = linkTextInput();
    const urlInput = linkUrlInput();
    if (!popup || !textInput || !urlInput) return;

    // Rellenar con valores actuales (href puede no existir si el enlace se vació)
    textInput.value = state.currentEditingLink.textContent || '';
    urlInput.value = state.currentEditingLink.getAttribute('href') || '';

    popup.classList.add('visible');

    // Posicionar popup de forma coherente en viewport (todos los formatos)
    const rect = state.currentEditingLink.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    const margin = 12;

    let left = rect.left + rect.width / 2 - popupRect.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - popupRect.width - margin));

    const spaceBelow = window.innerHeight - rect.bottom;
    const needsTopPlacement = spaceBelow < popupRect.height + margin;

    let top;
    if (needsTopPlacement) {
        top = rect.top - popupRect.height - margin;
    } else {
        top = rect.bottom + margin;
    }

    top = Math.max(margin, Math.min(top, window.innerHeight - popupRect.height - margin));

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;

    textInput.focus();
}

export function closeLinkEditor() {
    linkPopup()?.classList.remove('visible');
    state.currentEditingLink = null;

    // Restaurar foco al elemento previo si seguía en el DOM.
    const prev = state._linkEditorPreviouslyFocused;
    state._linkEditorPreviouslyFocused = null;
    if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
        try {
            prev.focus();
        } catch (_e) {}
    }
}

export function saveLinkEdit() {
    if (!state.currentEditingLink) return;

    const textInput = linkTextInput();
    const urlInput = linkUrlInput();
    if (!textInput) return;

    const rawUrl = (urlInput?.value || '').trim();
    if (rawUrl && !isSafeUrl(rawUrl)) {
        showToast(t('toastInvalidUrl'), 'error');
        return;
    }

    const link = state.currentEditingLink;
    link.textContent = textInput.value;

    // Aplicar texto Y href/target/rel al enlace activo y a sus gemelos en los otros idiomas
    // Los campos de contacto son DATO REAL (email, teléfono,
    // usuario, ciudad — iguales en los 3 idiomas, ver pickLang), así que el texto se copia
    // VERBATIM a EN/DE — nunca se traduce ni se envía al servicio externo. Antes se dejaba
    // "para el flujo de traducción", que jamás recibía estos enlaces → EN/DE conservaban el
    // texto de ejemplo.
    applyLinkAttributes(link, rawUrl);

    const activeTree = getOwnerTree(link);
    const linkId = link.dataset.translateId;
    if (activeTree && linkId) {
        for (const tree of getOtherTrees(activeTree)) {
            const twin = findByTranslateId(tree, linkId);
            if (twin) {
                twin.textContent = textInput.value;
                applyLinkAttributes(twin, rawUrl);
            }
        }
    }

    closeLinkEditor();
}

// Aplica href/target/rel a un enlace según la URL. NO toca el textContent.
function applyLinkAttributes(link: HTMLElement | null, rawUrl: string): void {
    if (!link) return;
    if (!rawUrl) {
        // URL vacía = quitar el enlace: sin href="" ni target/rel colgando.
        // El anchor [data-editable-link] es parte de la estructura (icono + texto), así que
        // no lo desenvolvemos; lo dejamos como texto plano sin destino.
        link.removeAttribute('href');
        link.removeAttribute('target');
        link.removeAttribute('rel');
    } else {
        link.setAttribute('href', safeUrl(rawUrl));
        // target=_blank + rel seguro SOLO para http(s). Para mailto:/tel:/relativas,
        // limpiar cualquier target/rel previo que hubiera quedado.
        if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
            link.setAttribute('target', '_blank');
            link.setAttribute('rel', 'noopener noreferrer');
        } else {
            link.removeAttribute('target');
            link.removeAttribute('rel');
        }
    }
}

// GESTIÓN DE PUNTOS DE EXPERIENCIA
// Recibe el .job-item (desde el overlay "Añadir punto") y añade un punto a su lista.
export function addJobItem(jobItem: HTMLElement) {
    if (!state.editMode) return;

    const ul = jobItem.querySelector<HTMLElement>('ul.job-details');
    if (!ul) return;

    const titlePlaceholder = t('phJobItemTitle');
    const contentPlaceholder = t('phJobItemDesc');

    const tpl = cloneTpl('tpl-job-detail');
    const newLi = (tpl?.firstElementChild as HTMLElement | null) ?? document.createElement('li');
    if (!tpl) {
        newLi.innerHTML = `<span class="item-title" data-editable></span> <span class="item-content" data-editable></span>`;
    }
    const titleEl = newLi.querySelector('.item-title');
    const contentEl = newLi.querySelector('.item-content');
    if (titleEl) titleEl.textContent = titlePlaceholder;
    if (contentEl) contentEl.textContent = contentPlaceholder;

    ul.appendChild(newLi);

    // Espejar el nuevo punto a EN/DE ANTES de habilitar edición/chrome
    // (el clon debe llegar limpio a los otros árboles).
    mirrorStructuralAdd(
        newLi,
        ul,
        (tree, activeUl) => resolveEquivalentJobDetails(tree, activeUl),
        (container, clone) => container.appendChild(clone)
    );

    enableNodeEditing(newLi);
    attachItemChrome(newLi);
    focusAndSelect(newLi.querySelector('.item-title'));
}

export function deleteJobItem(li: HTMLElement) {
    if (!state.editMode || !li) return;

    // Espejar el borrado del punto a EN/DE antes de quitarlo de ES.
    mirrorStructuralRemove(li, 'li');
    li.remove();
}

// GESTIÓN DE SKILL TAGS
// Recibe el .skills-container (desde el overlay "+" de la sección del sidebar).
export function addSkillTag(container: HTMLElement) {
    if (!state.editMode || !container) return;

    const tpl = cloneTpl('tpl-skill-tag');
    const newTag = (tpl?.firstElementChild as HTMLElement | null) ?? document.createElement('span');
    if (!tpl) {
        newTag.className = 'skill-tag';
        newTag.innerHTML = `<span class="tag-text" data-editable></span>`;
    }
    const tagText = newTag.querySelector<HTMLElement>('.tag-text');
    if (tagText) tagText.textContent = t('phNewSkill');

    container.appendChild(newTag);

    // Espejar la nueva skill a EN/DE antes del chrome.
    mirrorStructuralAdd(
        newTag,
        container,
        (tree, activeContainer, activeTree) =>
            resolveEquivalentContainer(tree, activeContainer, activeTree, '.skills-container', '.sidebar-section'),
        (c, clone) => c.appendChild(clone)
    );

    enableNodeEditing(newTag);
    attachItemChrome(newTag);
    focusAndSelect(tagText);
}

export function deleteSkillTag(tag: HTMLElement) {
    if (!state.editMode || !tag) return;

    // Espejar el borrado de la skill a EN/DE.
    mirrorStructuralRemove(tag, '.skill-tag');
    tag.remove();
}

// GESTIÓN DE ITEMS DE LISTA (EXPERTISE)
// Recibe el ul.list-clean (desde el overlay "+" de la sección del sidebar).
export function addListItem(ul: HTMLElement) {
    if (!state.editMode || !ul) return;

    const section = ul.closest('.sidebar-section');
    const sectionTitle = section?.querySelector('h3')?.textContent?.trim() || '';

    const isLanguageSection =
        sectionTitle.includes('Idiomas') || sectionTitle.includes('Languages') || sectionTitle.includes('Sprachen');

    let newLi;
    if (isLanguageSection) {
        const tpl = cloneTpl('tpl-list-item-language');
        newLi = (tpl?.firstElementChild as HTMLElement | null) ?? document.createElement('li');
        if (!tpl) {
            newLi.innerHTML = `<strong data-editable></strong> <span data-editable></span>`;
        }
        const strong = newLi.querySelector('strong');
        const span = newLi.querySelector('span[data-editable]');
        if (strong) strong.textContent = t('phNewLanguage');
        if (span) span.textContent = t('phLanguageLevel');
    } else {
        const tpl = cloneTpl('tpl-list-item-generic');
        newLi = (tpl?.firstElementChild as HTMLElement | null) ?? document.createElement('li');
        if (!tpl) {
            newLi.innerHTML = `<span class="list-text" data-editable></span>`;
        }
        const text = newLi.querySelector('.list-text');
        if (text) text.textContent = t('phNewListItem');
    }

    ul.appendChild(newLi);

    // Espejar el nuevo item de lista a EN/DE.
    mirrorStructuralAdd(
        newLi,
        ul,
        (tree, activeContainer, activeTree) =>
            resolveEquivalentContainer(tree, activeContainer, activeTree, 'ul.list-clean', '.sidebar-section'),
        (c, clone) => c.appendChild(clone)
    );

    enableNodeEditing(newLi);
    attachItemChrome(newLi);
    focusAndSelect(newLi.querySelector('[data-editable]'));
}

export function deleteListItem(li: HTMLElement) {
    if (!state.editMode || !li) return;

    // Espejar el borrado del item de lista a EN/DE.
    mirrorStructuralRemove(li, 'li');
    li.remove();
}

// GESTIÓN DE FORMACIÓN
// Recibe la .main-section[data-cv-section="education"] (desde su overlay "+").
export function addEducationItem(section: HTMLElement) {
    if (!state.editMode || !section) return;
    const tpl = cloneTpl('tpl-education-item');
    const newItem = (tpl?.firstElementChild as HTMLElement | null) ?? document.createElement('div');
    if (!tpl) {
        newItem.className = 'job-item';
        newItem.innerHTML = `
        <div class="job-header">
            <span class="job-title" data-editable></span>
            <span class="job-date" data-editable></span>
        </div>
        <div class="job-details" style="margin-left: 0;" data-editable></div>
    `;
    }
    const title = newItem.querySelector<HTMLElement>('.job-title');
    const date = newItem.querySelector('.job-date');
    const details = newItem.querySelector('.job-details');
    if (title) title.textContent = t('phNewDegree');
    if (date) date.textContent = t('phEducationDates');
    if (details) details.textContent = t('phInstitutionCity');
    section.appendChild(newItem);

    // Espejar la nueva formación a EN/DE: al FINAL de la sección
    // equivalente (data-cv-section, ya sin botones-ancla).
    mirrorStructuralAdd(
        newItem,
        section,
        (tree, activeSection) => resolveEquivalentSection(tree, activeSection),
        (eqSection, clone) => eqSection.appendChild(clone)
    );

    enableNodeEditing(newItem);
    attachItemChrome(newItem);
    focusAndSelect(title);
}

export function deleteEducationItem(jobItem: HTMLElement) {
    if (!state.editMode || !jobItem) return;
    // Espejar el borrado de la formación a EN/DE.
    mirrorStructuralRemove(jobItem, '.job-item');
    jobItem.remove();
}

// GESTIÓN DE EXPERIENCIA LABORAL
// Recibe la .main-section[data-cv-section="experience"] (desde su overlay "+").
export function addExperienceItem(section: HTMLElement) {
    if (!state.editMode || !section) return;
    const tpl = cloneTpl('tpl-experience-item');
    const newItem = (tpl?.firstElementChild as HTMLElement | null) ?? document.createElement('div');
    if (!tpl) {
        newItem.className = 'job-item';
        newItem.innerHTML = `
        <div class="job-header">
            <div>
                <span class="job-title" data-editable></span> | <span class="job-company" data-editable></span>
            </div>
            <span class="job-date" data-editable></span>
        </div>
        <ul class="job-details" data-editable-job-list>
            <li><span class="item-title" data-editable></span> <span class="item-content" data-editable></span></li>
        </ul>
    `;
    }
    const title = newItem.querySelector<HTMLElement>('.job-header .job-title');
    const company = newItem.querySelector('.job-company');
    const date = newItem.querySelector('.job-date');
    const detailTitle = newItem.querySelector('.job-details .item-title');
    const detailContent = newItem.querySelector('.job-details .item-content');
    if (title) title.textContent = t('phNewJobTitle');
    if (company) company.textContent = t('phCompany');
    if (date) date.textContent = t('phJobDates');
    if (detailTitle) detailTitle.textContent = t('phResponsibility');
    if (detailContent) detailContent.textContent = t('phTaskDescription');
    section.appendChild(newItem);

    // Espejar la nueva experiencia a EN/DE: al FINAL de la sección
    // equivalente (data-cv-section, ya sin botones-ancla).
    mirrorStructuralAdd(
        newItem,
        section,
        (tree, activeSection) => resolveEquivalentSection(tree, activeSection),
        (eqSection, clone) => eqSection.appendChild(clone)
    );

    enableNodeEditing(newItem);
    attachItemChrome(newItem);
    newItem.querySelectorAll<HTMLElement>('ul.job-details > li').forEach((li) => attachItemChrome(li));
    focusAndSelect(title);
}

export function deleteExperienceItem(jobItem: HTMLElement) {
    if (!state.editMode || !jobItem) return;
    // Espejar el borrado de la experiencia a EN/DE.
    mirrorStructuralRemove(jobItem, '.job-item');
    jobItem.remove();
}

// Exposición mínima en window: solo lo que necesitan otros módulos via lazy lookup.
// El resto se enlaza ahora vía cv-event-bindings.js.
