import { state, applyTextConfig, saveTextConfig, commitHistory, type CVTextConfig } from './cv-state.ts';
import { CVSaved, type CVSavedEntry } from './cv-saved.ts';
import { encodeSnapshot, decodeAndSanitize } from './cv-share-code.ts';
import {
    buildShareSnapshot,
    applyCVSnapshotLive,
    persistCurrentSnapshot,
    clearCurrentSnapshot,
    getManualSnapshotRaw,
} from './cv-controller.ts';
import { applyProfile, type ProfileId } from './cv-profile-panel.ts';
import { PROFILES, PROFILE_IDS } from './cv-profiles.ts';
import { showToast, confirmDialog, promptDialog, escapeHtml, rgbToHex } from './cv-utils.ts';
import { cvPanelStore } from './cv-panel-store.ts';
import { toJpeg } from 'html-to-image'; // bundleado por npm (antes CDN global)
import { sanitizeCodeInput } from '../components/features/utils/share-codec.ts';
import { uniqueName } from '../components/features/utils/saved-store.ts';
import { copyTextToClipboard } from '../components/core/utils/copy-to-clipboard.ts';
import { freezeDraftFooter, initSavedReorder } from '../components/widgets/saved-panel/saved-panel.ts';
import { t, onUiLangApplied } from './cv-i18n.ts';

// Código de error del decoder → CLAVE i18n.
const ERROR_KEY: Record<string, string> = {
    'sin-codigo': 'toastCodeEmpty',
    formato: 'toastCodeFormat',
    version: 'toastCodeVersion',
    checksum: 'toastCodeChecksum',
    esquema: 'toastCodeSchema',
    excepcion: 'toastCodeRead',
};

interface Baseline {
    hadSnapshot: boolean;
    /** ¿El snapshot de apertura estaba PERSISTIDO en localStorage? (editado ≠ persistido:
     *  un CV cargado/importado como draft no debe persistirse por pulsar Cancelar). */
    wasPersisted: boolean;
    snapshot: ReturnType<typeof buildShareSnapshot>;
    textConfig: CVTextConfig;
    profile: ProfileId;
}

let baseline: Baseline | null = null;
let initialized = false;
let _appliedId: string | null = null;
let _busy = false;

const byId = (id: string): HTMLElement | null => document.getElementById(id);
const isEdited = (): boolean => state.hasManualSnapshot;
const isFull = (): boolean => state.cvMode === 'full';
const hasOwnCV = (): boolean => {
    try {
        return !!getManualSnapshotRaw();
    } catch (_e) {
        return false;
    }
};
// ¿Se puede Compartir / Guardar CV? En el escaparate hace falta ALGO propio: un CV persistido o
// un draft en curso (importado o editado a mano) — si no, no hay nada que compartir/guardar.
// En el modo completo, siempre. (Habilitar con el draft rompe el huevo-y-gallina: guardar es justo lo
// que crea el CV propio, así que no puede exigir tenerlo ya.)
const canActOnOwn = (): boolean => isFull() || hasOwnCV() || isEdited();
const cloneTextConfig = (): CVTextConfig => JSON.parse(JSON.stringify(state.textConfig));

/** Color REAL del folio (swatch fallback de la tarjeta y backgroundColor de la captura):
 * el computado del contenedor activo. Los temas oscuros pintan el fondo vía reglas
 * `body.theme-* .cv-container` que textConfig.pageBg no ve (queda null), y html-to-image
 * APLICA la opción backgroundColor POR ENCIMA del fondo real del clon — pasarle una
 * suposición (antes: pageBg || blanco) machacaba el folio oscuro con blanco. */
function swatchColor(): string {
    const target = byId('cv-' + state.currentLang.toLowerCase());
    if (target) {
        const hex = rgbToHex(getComputedStyle(target).backgroundColor);
        if (hex) return hex;
    }
    const bg = state.textConfig?.pageBg || '';
    return /^#[0-9a-fA-F]{6}$/.test(bg) ? bg : '#ffffff';
}

/** Nombre sugerido: encabezado (h1) del CV activo + sufijo único "(2), (3)…" compartido. */
function suggestName(): string {
    let base = '';
    try {
        const wrap = byId('cv-' + state.currentLang.toLowerCase()) || byId('cv-es');
        const h = wrap?.querySelector('h1, .header h1, h2');
        base = (h?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    } catch (_e) {}
    return uniqueName(
        base,
        CVSaved.list().map((e) => e.name),
        t('lblDefaultCvName')
    );
}

// Miniatura best-effort del folio activo: baja resolución, timeout 15s; si
// la captura falla/tarda, se sigue SIN miniatura (swatch). skipFonts: evita el fetch de
// cada @font-face; a este tamaño la fuente del
// sistema no se aprecia. La foto es data: inline (sin CORS).
async function captureThumb(): Promise<string | null> {
    try {
        // Capturar el contenedor de idioma directamente (NO buscar '.cv-container' dentro:
        // el contenido del snapshot podría traer un nodo con esa clase y secuestrar la captura).
        const target = byId('cv-' + state.currentLang.toLowerCase());
        if (!target) return null;
        // La card muestra ~130px: capturar a ~2× (folio A4 ~794px × 0.3 ≈ 238px) basta
        // para HiDPI y pesa ~4× menos que antes.
        const doCapture = (): Promise<string | null> =>
            toJpeg(target, {
                quality: 0.5,
                pixelRatio: 0.3,
                backgroundColor: swatchColor(),
                skipFonts: true,
                // La escala se resetea SOLO en el clon: la captura va a tamaño completo
                style: { transform: 'none', transformOrigin: 'top left', margin: '0', boxShadow: 'none' },
            });
        return await Promise.race([
            doCapture(),
            new Promise<string | null>((resolve) => setTimeout(() => resolve(null), 15000)),
        ]);
    } catch (_e) {
        return null; // best-effort: sin miniatura, se usa el swatch de color
    }
}

async function copyCode(
    snapshot: CVSavedEntry['snapshot'] | ReturnType<typeof buildShareSnapshot>,
    tc: CVTextConfig | null
): Promise<void> {
    try {
        const { code, photoStripped } = await encodeSnapshot(snapshot, tc);
        // Clipboard con fallback <textarea>/execCommand: helper compartido del widget.
        if (await copyTextToClipboard(code)) showToast(t('toastCodeCopied'), 'success');
        else showToast(t('toastCopyFailed'), 'error');
        if (photoStripped) showToast(t('toastPhotoNotInCode'), 'info', 4000);
    } catch (_e) {
        showToast(t('toastCodeGenerateFailed'), 'error');
    }
}

function render(): void {
    // En el escaparate solo se comparte si hay algo propio (draft o CV persistido); en el modo completo, siempre
    const shareBtn = byId('myCvsShareBtn') as HTMLButtonElement | null;
    if (shareBtn) shareBtn.disabled = !canActOnOwn();
    renderList();
}

// Tarjeta "+ Guardar CV" SIEMPRE anclada en primera posición. En el escaparate se habilita
// cuando hay algo propio que guardar (draft importado/editado o CV persistido); en el modo completo siempre.
function addCardHTML(): string {
    const enabled = canActOnOwn();
    const tip = enabled ? t('tipSaveCurrent') : t('tipSaveCurrentDisabled');
    return `
        <div class="edt-saved-card edt-saved-card--add">
            <button type="button" class="edt-saved-card__apply" data-action="save-current" title="${tip}" aria-label="${tip}"${enabled ? '' : ' disabled'}>
                <span class="edt-saved-card__add-box">
                    <i class="fas fa-plus" aria-hidden="true"></i>
                    <span>${t('lblSaveCvCard')}</span>
                </span>
            </button>
        </div>`;
}

const PROFILE_META = {} as Record<ProfileId, { icon: string; label: string }>;
for (const p of PROFILES) PROFILE_META[p.id] = p;
function profileCardHTML(id: ProfileId): string {
    const esc = escapeHtml;
    const m = PROFILE_META[id];
    // Resaltar el perfil VISIBLE: cede si hay una guardada cargada (_appliedId) — si no,
    // en el modo completo quedaban marcadas las dos a la vez. En el escaparate, además, solo
    // mientras no haya draft (tras importar/editar ya no ves una plantilla).
    const active = !_appliedId && (isFull() || !isEdited()) && state.activeProfile === id;
    const tip = isFull() ? t('tipLoadProfileCv', { id: m.label }) : t('tipLoadProfileTemplate', { id: m.label });
    return `
        <div class="edt-saved-card cv-mycvs-tpl${active ? ' is-applied' : ''}" title="${esc(m.label)}">
            <button type="button" class="edt-saved-card__apply" data-action="profile" data-profile="${id}" title="${esc(tip)}" aria-label="${esc(tip)}">
                <span class="edt-saved-card__add-box">
                    <i class="fas ${m.icon}" aria-hidden="true"></i>
                    <span>${esc(m.label)}</span>
                </span>
            </button>
        </div>`;
}

// Tarjeta cuadrada: miniatura clicable = cargar; acciones al hover
// (arrastrar / copiar código / renombrar / borrar). El nombre va en title/aria-label.
function cardHTML(e: CVSavedEntry): string {
    const esc = escapeHtml;
    // Defensa en el render (además de en add()): la entrada viene de localStorage y podría
    // estar manipulada — solo dataURI de imagen en src y solo hex-6 en el background.
    const thumb = typeof e.thumb === 'string' && e.thumb.startsWith('data:image/') ? e.thumb : null;
    const bg = /^#[0-9a-fA-F]{6}$/.test(e.bgSwatch || '') ? e.bgSwatch : '#fff';
    const media = thumb
        ? `<img class="edt-saved-card__thumb" src="${esc(thumb)}" alt="${esc(e.name)}" loading="lazy">`
        : `<span class="edt-saved-card__swatch" style="background:${esc(bg)}"><i class="fas fa-file-lines" aria-hidden="true"></i></span>`;
    return `
        <div class="edt-saved-card${e.id === _appliedId ? ' is-applied' : ''}" data-id="${esc(e.id)}" title="${esc(e.name)}">
            <button type="button" class="edt-saved-card__apply" data-action="load" data-id="${esc(e.id)}" title="${t('tipLoadThisCv')}" aria-label="${esc(e.name)}">
                ${media}
            </button>
            <div class="edt-saved-card__actions">
                <button type="button" class="edt-saved-card__act edt-saved-card__drag" title="${t('tipReorderDrag')}" aria-label="${t('tipReorderDrag')}"><i class="fas fa-arrows-alt" aria-hidden="true"></i></button>
                <button type="button" class="edt-saved-card__act" data-action="copy" data-id="${esc(e.id)}" title="${t('tipCopyCode')}" aria-label="${t('tipCopyCode')}"><i class="fas fa-copy" aria-hidden="true"></i></button>
                <button type="button" class="edt-saved-card__act edt-saved-card__act--danger" data-action="delete" data-id="${esc(e.id)}" title="${t('tipDelete')}" aria-label="${t('tipDelete')}"><i class="fas fa-trash" aria-hidden="true"></i></button>
            </div>
        </div>`;
}

function renderList(): void {
    const list = byId('myCvsList');
    if (!list) return;
    const showProfiles = isFull() || !hasOwnCV();
    const profiles = showProfiles ? PROFILE_IDS.map(profileCardHTML).join('') : '';
    list.innerHTML = addCardHTML() + profiles + CVSaved.list().map(cardHTML).join('');
}

async function onProfileCardClick(id: ProfileId): Promise<void> {
    if (_busy) return;
    // applyProfile es ASYNC (fetch del JSON del perfil + repintado): bloquear el panel
    // mientras vuela — clicar rápido una guardada en medio dejaba que el applyProfile
    // tardío machacara el CV recién cargado y descuadrara el resaltado.
    _busy = true;
    try {
        if (!isFull()) {
            clearCurrentSnapshot();
            await applyProfile(id);
            clearCurrentSnapshot();
        } else {
            await applyProfile(id);
        }
        _appliedId = null; // el CV visible ya no es una guardada cargada
    } finally {
        _busy = false;
    }
    render();
}

// "Compartir" (barra): genera el código del CV ACTUAL y lo muestra en un diálogo de solo
// lectura: descripción + código seleccionado + Cancelar /
// Copiar. Copiar copia al portapapeles y cierra. No guarda ni toca el draft.
async function shareCurrent(): Promise<void> {
    if (!canActOnOwn()) return; // escaparate sin draft: botón deshabilitado
    try {
        const { code, photoStripped } = await encodeSnapshot(buildShareSnapshot(), cloneTextConfig());
        if (photoStripped) showToast(t('toastPhotoNotInCode'), 'info', 4000);
        const result = (await promptDialog(t('dlgShareMsg'), {
            title: t('dlgShareTitle'),
            icon: 'fa-share-nodes',
            defaultValue: code,
            okLabel: t('lblCopy'),
            cancelLabel: t('lblCancel'),
            okIcon: 'fa-copy',
            // El AZUL de "Añadir por código": un azul lleva al otro.
            okClassName: 'edt-saved-btn edt-saved-btn--blue',
            multiline: true,
            readOnly: true,
        })) as string | null;
        if (result === null) return; // Cancelar / Escape
        // Clipboard con fallback <textarea>/execCommand: helper compartido del widget.
        if (await copyTextToClipboard(code)) showToast(t('toastCodeCopied'), 'success');
        else showToast(t('toastCopyFailed'), 'error');
    } catch (_e) {
        showToast(t('toastCodeGenerateFailed'), 'error');
    }
}

async function saveCurrent(): Promise<void> {
    if (_busy) return;
    if (!canActOnOwn()) return; // escaparate sin draft: tarjeta deshabilitada
    const snapshot = buildShareSnapshot();
    if (!snapshot) {
        showToast(t('toastCaptureFailed'), 'error');
        return;
    }
    const textConfig = cloneTextConfig();
    // Antes de la miniatura: si no cabe, que el usuario no la espere para nada.
    if (!CVSaved.canAdd({ snapshot, textConfig })) {
        showToast(t('toastSavedFull', { max: CVSaved.max }), 'warning', 5000);
        return;
    }
    _busy = true;
    const btn = document.querySelector<HTMLButtonElement>('#myCvsList [data-action="save-current"]');
    const importBtn = byId('myCvsImportBtn') as HTMLButtonElement | null;
    if (btn) {
        btn.disabled = true;
        btn.classList.add('is-loading'); // fondo homogéneo tarjeta+caja mientras genera
        btn.innerHTML = `<span class="edt-saved-card__add-box"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i> <span>${t('lblGenerating')}</span></span>`;
    }
    if (importBtn) importBtn.disabled = true; // sin operaciones cruzadas durante la captura
    const unfreeze = freezeDraftFooter('.cv-design-footer');
    try {
        const thumb = await captureThumb();
        const res = CVSaved.add({
            name: suggestName(),
            snapshot,
            textConfig,
            thumb,
            bgSwatch: swatchColor(),
        });
        if (res && !res.ok) {
            showToast(t('toastSavedFull', { max: CVSaved.max }), 'warning', 5000);
            return;
        }
        if (!res || !res.persisted) {
            showToast(t('toastSaveQuota'), 'error', 5000);
            return;
        }
        showToast(t('toastCvSaved'), 'success');
    } finally {
        _busy = false;
        unfreeze();
        renderList(); // re-crea la tarjeta añadir en su estado correcto (sin spinner)
        if (importBtn) importBtn.disabled = false;
    }
}

// Añadir por código (modal textarea): SOLO aplica EN VIVO como draft — instantáneo, sin guardado automático ni miniatura; para
// conservarlo está la tarjeta "+ Guardar CV". Simetría: Compartir saca código, Añadir
// lo mete, la tarjeta "+" guarda.
async function importByCode(): Promise<void> {
    if (_busy) return;
    // El guard hay que LEVANTARLO, no solo leerlo: la bandera se comprobaba pero nadie la
    // ponía, así que `if (_busy) return` era letra muerta aquí y dos taps seguidos (móvil
    // lento) encolaban dos importaciones — la tardía machacaba a la otra. Cubre toda la
    // operación, prompt incluido: mientras el modal está abierto tampoco debe colarse un
    // guardado ni una carga por detrás.
    _busy = true;
    const unfreeze = freezeDraftFooter('.cv-design-footer');
    try {
        const raw = (await promptDialog(t('dlgImportMsg'), {
            title: t('dlgImportTitle'),
            icon: 'fa-code',
            okLabel: t('lblAdd'),
            cancelLabel: t('lblCancel'),
            placeholder: t('phPasteCode'),
            multiline: true,
        })) as string | null;
        if (raw === null) return;
        // Saneado del pegado (espacios + alfabeto del código + límite): helper compartido.
        const code = sanitizeCodeInput(raw);
        if (!code) {
            showToast(t('toastCodeEmpty'), 'error');
            return;
        }
        const res = await decodeAndSanitize(code);
        if (!res.ok) {
            showToast(t(ERROR_KEY[res.error] || 'toastCodeInvalid'), 'error');
            return;
        }
        applyCVSnapshotLive(res.payload.snapshot, res.payload.textConfig, { persist: false });
        _appliedId = null; // el CV visible ya no es una guardada cargada
        showToast(t('toastCvApplied'), 'success', 3500);
    } finally {
        _busy = false;
        unfreeze(); // restaura el estado REAL de los botones (no un booleano fijo)
        render(); // reflejar el estado resultante (perfiles bloqueados, tarjeta añadir activa)
    }
}

async function loadId(id: string): Promise<void> {
    if (_busy) return; // no cargar encima de un cambio de perfil/guardado en vuelo
    const it = CVSaved.get(id);
    if (!it) return;
    applyCVSnapshotLive(it.snapshot, (it.textConfig as CVTextConfig) || null, { persist: false });
    _appliedId = id; // feedback: resaltar la card cargada — sin toast
    render();
}

async function deleteId(id: string): Promise<void> {
    const ok = await confirmDialog(t('dlgDeleteMsg'), {
        title: t('dlgDeleteTitle'),
        icon: 'fa-trash',
        okLabel: t('lblAccept'), // "Aceptar" verde en todos los confirm
        cancelLabel: t('lblCancel'),
        danger: true,
    });
    if (!ok) return;
    CVSaved.remove(id);
    renderList();
}

function confirmDraft(): void {
    if (_busy) return;
    if (isEdited()) {
        persistCurrentSnapshot();
        saveTextConfig();
        commitHistory();
    }
    hide();
}

async function cancelDraft(): Promise<void> {
    if (_busy) return;
    _appliedId = null; // lo cargado en esta apertura se descarta → quitar el resaltado
    if (baseline) {
        if (baseline.hadSnapshot && baseline.snapshot) {
            // Volver al CV editado de apertura. Solo se RE-persiste si ya estaba persistido
            // al abrir: un draft (cargado/importado sin Guardar) no debe persistirse por
            // pulsar Cancelar.
            applyCVSnapshotLive(baseline.snapshot, baseline.textConfig, { persist: baseline.wasPersisted });
        } else {
            clearCurrentSnapshot();
            await applyProfile(baseline.profile);
            clearCurrentSnapshot();
            state.textConfig = baseline.textConfig;
            applyTextConfig();
        }
    }
    hide();
}

function hide(): void {
    const panel = byId('myCvsPanel');
    if (panel) {
        panel.classList.remove('open');
        panel.hidden = true;
    }
    baseline = null;
    cvPanelStore.setOpen('mycvs', false);
}

function init(): void {
    if (initialized) return;
    const panel = byId('myCvsPanel');
    if (!panel) return;

    byId('myCvsShareBtn')?.addEventListener('click', () => void shareCurrent());
    byId('myCvsImportBtn')?.addEventListener('click', () => void importByCode());
    byId('myCvsCancelBtn')?.addEventListener('click', () => void cancelDraft());
    byId('myCvsSaveConfirmBtn')?.addEventListener('click', confirmDraft);

    panel.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
        if (!btn) return;
        const id = btn.dataset.id || '';
        switch (btn.dataset.action) {
            case 'save-current':
                void saveCurrent();
                break;
            case 'profile':
                void onProfileCardClick(btn.dataset.profile as ProfileId);
                break;
            case 'load':
                void loadId(id);
                break;
            case 'copy':
                {
                    const it = CVSaved.get(id);
                    if (it) void copyCode(it.snapshot, (it.textConfig as CVTextConfig) || null);
                }
                break;
            case 'delete':
                void deleteId(id);
                break;
        }
    });

    // Reordenar arrastrando por el asa: comportamiento compartido del widget saved-panel.
    initSavedReorder({ gridId: 'myCvsList', onReorder: (ids) => CVSaved.reorder(ids) });
    initialized = true;
}

export function openMyCvsPanel(): void {
    init();
    const panel = byId('myCvsPanel');
    if (!panel) return;
    let wasPersisted = false;
    try {
        wasPersisted = !!getManualSnapshotRaw();
    } catch (_e) {}
    baseline = {
        hadSnapshot: isEdited(),
        wasPersisted,
        snapshot: buildShareSnapshot(),
        textConfig: cloneTextConfig(),
        profile: state.activeProfile,
    };
    render();
    panel.hidden = false;
    panel.classList.add('open');
    // El closer de exclusión mutua solo OCULTA (no revierte): abrir otro panel no descarta
    // el CV cargado; para revertir hay que pulsar Cancelar explícitamente. El Escape
    // global sí equivale a Cancelar → registra el Cancelar real.
    cvPanelStore.setCloser('mycvs', hide);
    cvPanelStore.setEscapeCloser('mycvs', () => void cancelDraft());
    cvPanelStore.setOpen('mycvs', true);
}

export function toggleMyCvsPanel(): void {
    const panel = byId('myCvsPanel');
    if (!panel || panel.hidden) openMyCvsPanel();
    else hide();
}

// Las tarjetas se generan con t() en el render — si el panel está abierto al
// cambiar de idioma, re-render para que tooltips/etiquetas se re-traduzcan al momento.
onUiLangApplied(() => {
    const panel = byId('myCvsPanel');
    if (panel && !panel.hidden) render();
});
