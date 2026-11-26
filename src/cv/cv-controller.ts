import { markPageReady } from '../components/core/page-fade/page-fade.ts';
import {
    state,
    themes,
    formats,
    applyThemeAndFormatClasses,
    applyTextConfig,
    loadTextConfig,
    saveTextConfig,
    subscribeState,
    loadGlobalPreferences,
    saveGlobalPreference,
    type CVTextConfig,
    type CVMode,
} from './cv-state.ts';
import { detectAppMode } from '../components/core/app-mode/app-mode.ts';
import { registerFlushHandler } from '../components/core/storage/debounced-storage.ts';
import { initializeCV, updateButtonLabels, loadBaseData } from './cv-data-loader.ts';
import {
    updateDownloadButtonState,
    updateSaveButtonState,
    closeLinkEditor,
    saveManualSnapshot,
    reenterEditModeAfterProfileSwitch,
} from './cv-edit-mode.ts';
import { toggleTextPanel } from './cv-text-panel.ts';
import { initImageUpload, closeImageMenu } from './cv-images.ts';
import { toggleLanguage, applyLanguage, applyLanguageMeta } from './cv-languages.ts';
import { followSiteLang, idiomaDeMuestra, saveSiteMark } from './cv-site-lang.ts';
import { sourceLang } from './cv-translation.ts';
import { toggleDesign } from './cv-design-picker.ts';
import { downloadPDF } from './cv-download.ts';
import { initCvEventBindings } from './cv-event-bindings.ts';
import { cvPanelStore } from './cv-panel-store.ts';
import { startColorFieldSync } from '../components/widgets/color-field/color-field.ts';
import { enhanceStepperFields } from '../components/widgets/stepper-field/stepper-field.ts';
import { enhanceCollapsibleSections } from '../components/widgets/collapsible-section/collapsible-section.ts';
import {
    sanitizeCVHTML,
    isValidSnapshot,
    sanitizeSnapshot,
    normalizeLang,
    showToast,
    debounce,
    formatTimeAgo,
    dlog,
    dwarn,
    type CVSnapshotLike,
} from './cv-utils.ts';
import { DEFAULT_CV_KEY, DEFAULT_CV_SEQUENCE, DEFAULT_CV_SOURCES } from './cv-constants.ts';
import { DEFAULT_PROFILE, isProfileId } from './cv-profiles.ts';
import { isDesktop, isMobile } from '../components/core/breakpoint/get-bp.ts';
import { initPanelSheet } from '../components/widgets/panel-sheet/panel-sheet.ts';
import type { CVManualSnapshot, Lang, ProfileId } from './cv-types.ts';

// Importados por su efecto: registran sus bindings en window.*
import './cv-data-generic.ts';
// Historial Deshacer/Rehacer: se registra en cv-state al cargarse. CvHistory.init()
// fija la línea base en boot; undoCv/redoCv los usan el keydown y los botones (cv-event-bindings).
import { CvHistory, undoCv, redoCv } from './cv-history.ts';
// i18n del chrome: aplica [data-i18n] al boot y se re-aplica solo al cambiar de idioma.
import { translateEditorUI, t, onUiLangApplied } from './cv-i18n.ts';
import { initMasPanel } from './cv-mas-panel.ts';

const LOCAL_SNAPSHOT_KEY_PREFIX = 'cv-editor-local-snapshot-v3';
const AUTOSAVE_INTERVAL_MS = 30000;

// Purga la clave FIJA anterior al bump a v3. El bump la dejó huérfana: nadie la
// lee ni la borra, pero sigue ocupando cuota de localStorage (un CV entero en 3 idiomas)
// en todo usuario que editase antes del cambio. Idempotente y barato (removeItem de algo
// que no existe es un no-op), así que no necesita flag de "ya migrado".
function purgeLegacySnapshotKey(): void {
    try {
        window.localStorage.removeItem('cv-editor-local-snapshot-v2');
    } catch (_e) {}
}

// Devuelve la clave del snapshot local para el modo+perfil ACTUAL.
//  - completo:      `...-v3:full:{perfil}` (cada perfil su propio snapshot).
//  - escaparate: `...-v3:showcase` (un único perfil de facto → sin sufijo de perfil).
// Se llama en CADA lectura/escritura/borrado para que el snapshot que se persiste,
// restaura o limpia sea siempre el del contexto vigente. En el escaparate `activeProfile`
// puede no estar aún fijado en boot; no importa, la clave del escaparate lo omite.
function getSnapshotKey() {
    if (CV_MODE === 'full') {
        const profile = isProfileId(state.activeProfile) ? state.activeProfile : DEFAULT_PROFILE;
        return `${LOCAL_SNAPSHOT_KEY_PREFIX}:full:${profile}`;
    }
    return `${LOCAL_SNAPSHOT_KEY_PREFIX}:${CV_MODE}`;
}

export const CV_MODE: CVMode = detectAppMode('cv');

// Aliases reconocidos cuando defaultTheme viene sin prefijo `theme-`.
const THEME_ALIASES: Record<string, string> = {
    oro: 'theme-gold',
    gold: 'theme-gold',
    'theme-oro': 'theme-gold',
    'theme-gold': 'theme-gold',
    'theme-light-gold': 'theme-gold',
};

// Normaliza el valor de defaultTheme al nombre de clase CSS real.
export function normalizeTheme(rawTheme: unknown): string {
    const value = String(rawTheme || '').trim();
    if (!value) return '';
    const lower = value.toLowerCase();
    const alias = THEME_ALIASES[lower];
    if (alias) return alias;
    if (themes.includes(value)) return value;
    const prefixed = lower.startsWith('theme-') ? lower : `theme-${lower}`;
    if (themes.includes(prefixed)) return prefixed;
    return value;
}

function isTypingTarget(target: EventTarget | null): boolean {
    if (!target) return false;
    const el = target as HTMLElement;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

function getLanguageContainer(lang: string): HTMLElement | null {
    const normalized = String(lang || '').toLowerCase();
    return document.getElementById(`cv-${normalized}`);
}

function applyLanguageVisibility(lang: Lang): void {
    const cvEs = getLanguageContainer('ES');
    const cvEn = getLanguageContainer('EN');
    const cvDe = getLanguageContainer('DE');
    if (!cvEs || !cvEn || !cvDe) return;

    // Usar el atributo `hidden` en lugar de style.display=flex/none.
    // `hidden` se respeta nativamente y no contamina inline style del componente.
    // (Tupla tipada: sin la anotación TS infiere (string | HTMLElement)[][].)
    const trees: Array<[HTMLElement, Lang]> = [
        [cvEs, 'ES'],
        [cvEn, 'EN'],
        [cvDe, 'DE'],
    ];
    trees.forEach(([el, code]) => {
        const isActive = lang === code;
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

function applyDefaultsFromActiveData() {
    const meta = state.activeData?.meta;
    if (!meta) return;

    state.currentLang = normalizeLang(meta.defaultLang, state.currentLang || 'ES') as Lang;

    const normalizedTheme = normalizeTheme(meta.defaultTheme);
    const nextThemeIndex = themes.indexOf(normalizedTheme);
    if (nextThemeIndex >= 0) {
        state.currentThemeIndex = nextThemeIndex;
        // Recordar el default del CV CARGADO: "Restablecer estilos" vuelve aquí. No vale
        // releer activeData.meta más tarde — en edición apunta a la plantilla genérica.
        state.defaultThemeIndex = nextThemeIndex;
    }

    applyThemeAndFormatClasses();
}

function buildLocalSnapshot() {
    const cvEs = getLanguageContainer('ES');
    const cvEn = getLanguageContainer('EN');
    const cvDe = getLanguageContainer('DE');
    if (!cvEs || !cvEn || !cvDe) return null;

    return {
        version: 2,
        timestamp: Date.now(),
        currentLang: state.currentLang,
        currentThemeIndex: state.currentThemeIndex,
        currentFormat: state.currentFormat,
        downloadEnabled: state.downloadEnabled,
        isOwnerView: state.isOwnerView,
        cvs: {
            ES: cvEs.innerHTML,
            EN: cvEn.innerHTML,
            DE: cvDe.innerHTML,
        },
    };
}

// Compartir por código: captura el CV actual para codificarlo. Reusa
// buildLocalSnapshot (mismo shape que el snapshot manual) → cv-share-code.encodeCurrent.
export function buildShareSnapshot() {
    return buildLocalSnapshot();
}

export function persistCurrentSnapshot() {
    return persistLocalSnapshot();
}
export function clearCurrentSnapshot() {
    clearLocalSnapshot();
    state.hasManualSnapshot = false;
}

// Devuelve true si el snapshot se persistió correctamente, false si falló
// (p.ej. QuotaExceededError). El caller solo debe reportar éxito y
// bloquear UI cuando esta función devuelve true.
function persistLocalSnapshot() {
    try {
        const snapshot = buildLocalSnapshot();
        if (!snapshot) return false;
        snapshot.downloadEnabled = true;
        snapshot.isOwnerView = false;
        localStorage.setItem(getSnapshotKey(), JSON.stringify(snapshot));
        state.hasManualSnapshot = true;
        state.downloadEnabled = true;
        state.isOwnerView = false;
        state.lastSavedAt = snapshot.timestamp;
        updateSavedIndicator();
        return true;
    } catch (error) {
        console.warn('No se pudo guardar snapshot local del CV:', error);
        showToast(t('toastSnapshotQuota'), 'error');
        return false;
    }
}

function clearLocalSnapshot() {
    // Sin esto, el flush del `pagehide` del reload que sigue re-escribiría lo recién borrado.
    _autosavePending = false;
    try {
        localStorage.removeItem(getSnapshotKey());
    } catch (error) {
        console.warn('No se pudo borrar snapshot local del CV:', error);
    }

    state.hasManualSnapshot = false;
}

function getLocalSnapshotRaw() {
    try {
        return localStorage.getItem(getSnapshotKey());
    } catch (error) {
        console.warn('No se pudo leer snapshot local raw del CV:', error);
        return null;
    }
}

function setLocalSnapshotRaw(rawValue: string | null): void {
    try {
        if (!rawValue) {
            localStorage.removeItem(getSnapshotKey());
            state.hasManualSnapshot = false;
            state.downloadEnabled = false;
            state.lastSavedAt = null;
            updateSavedIndicator();
            return;
        }

        // Parsear + validar + sanear ANTES de escribir en localStorage. `Partial` porque
        // el snapshot viene de fuera (storage, código compartido) y puede ser de una
        // versión antigua: sanitizeSnapshot ya devuelve null si no trae las 3 lenguas.
        const safe = sanitizeSnapshot(JSON.parse(rawValue) as Partial<CVManualSnapshot>);
        if (!safe) {
            dwarn('Snapshot raw inválido, descartado.');
            return;
        }
        localStorage.setItem(getSnapshotKey(), JSON.stringify(safe));

        state.hasManualSnapshot = true;
        state.downloadEnabled = true;
        state.isOwnerView = false;
        state.lastSavedAt = typeof safe.timestamp === 'number' ? safe.timestamp : Date.now();
        updateSavedIndicator();
    } catch (error) {
        console.warn('No se pudo restaurar snapshot local raw del CV:', error);
    }
}

// Núcleo compartido: vuelca un snapshot (objeto) al DOM + estado. Lo usan restoreLocalSnapshot
// (boot, desde localStorage) y applyCVSnapshotLive (panel "Mis CVs", en vivo). El idioma se pasa
// aparte: el boot respeta la preferencia global; el apply en vivo usa el del snapshot.
function _applySnapshotToDOM(snapshot: Partial<CVManualSnapshot> & CVSnapshotLike, lang: Lang): boolean {
    const cvEs = getLanguageContainer('ES');
    const cvEn = getLanguageContainer('EN');
    const cvDe = getLanguageContainer('DE');
    if (!cvEs || !cvEn || !cvDe) return false;

    // Clamp defensivo: el snapshot puede venir de un código compartido (no confiable).
    const nextThemeIndex = Number.isInteger(snapshot.currentThemeIndex)
        ? Math.max(0, Math.min(themes.length - 1, snapshot.currentThemeIndex as number))
        : 0;
    const nextFormat = Number.isInteger(snapshot.currentFormat)
        ? Math.max(0, Math.min(formats.length - 1, snapshot.currentFormat as number))
        : 0;

    state.currentLang = lang;
    state.currentThemeIndex = nextThemeIndex;
    state.currentFormat = nextFormat;
    state.downloadEnabled = Boolean(snapshot.downloadEnabled);
    state.isOwnerView = Boolean(snapshot.isOwnerView);
    state.hasManualSnapshot = true;
    state.lastSavedAt = typeof snapshot.timestamp === 'number' ? snapshot.timestamp : null;

    // SANITIZAR HTML antes de inyectarlo (evita XSS si el snapshot fue manipulado).
    cvEs.innerHTML = sanitizeCVHTML(snapshot.cvs.ES) || cvEs.innerHTML;
    cvEn.innerHTML = sanitizeCVHTML(snapshot.cvs.EN) || cvEn.innerHTML;
    cvDe.innerHTML = sanitizeCVHTML(snapshot.cvs.DE) || cvDe.innerHTML;

    // Marcar los 3 idiomas como YA renderizados. El HTML del snapshot ya los
    // pobló; sin esto, el primer toggle de idioma o la entrada a edición dispararían
    // renderLanguageIfNeeded, que regenera desde el JSON base y BORRA el contenido restaurado.
    [cvEs, cvEn, cvDe].forEach((el) => {
        el.removeAttribute('data-lang-pending');
        el.classList.remove('cv-lang-pending');
    });

    applyThemeAndFormatClasses();
    applyLanguageVisibility(state.currentLang);
    // Clases del body, <html lang> y título: un CV guardado en otro idioma cambia los tres, no solo las clases.
    applyLanguageMeta(state.currentLang);

    if (state.isOwnerView) {
        document.body.classList.add('owner-view');
    } else {
        document.body.classList.remove('owner-view');
    }

    updateButtonLabels(state.currentLang);
    updateDownloadButtonState();
    updateSaveButtonState();
    updateSavedIndicator();
    return true;
}

function restoreLocalSnapshot() {
    try {
        const raw = localStorage.getItem(getSnapshotKey());
        if (!raw) return false;

        const snapshot = JSON.parse(raw) as Partial<CVManualSnapshot>;
        if (!isValidSnapshot(snapshot)) {
            dwarn('Snapshot guardado inválido, ignorado.');
            return false;
        }

        // El idioma visible lo manda la preferencia global, NO el snapshot: si el usuario cambió de
        // idioma DESPUÉS de guardar (editar+guardar en ES, luego pasar a EN/DE y recargar), al recargar
        // debe mantenerse ese idioma. Solo caemos al del snapshot si no hay preferencia guardada.
        const prefLang = loadGlobalPreferences().lang;
        const nextLang = normalizeLang(prefLang || snapshot.currentLang, 'ES') as Lang;
        return _applySnapshotToDOM(snapshot, nextLang);
    } catch (error) {
        console.warn('No se pudo restaurar snapshot local del CV:', error);
        return false;
    }
}

// Panel unificado "Mis CVs": aplica un snapshot decodificado/guardado EN VIVO, sin
// recargar. Sanea (isValidSnapshot + sanitizeSnapshot → sanitizeCVHTML), vuelca al DOM, aplica
// tema/formato/idioma + textConfig, y re-arma la edición si estabas editando. Persiste SOLO si
// `opts.persist` (el "Guardar" del panel; el preview de draft no persiste). No confía en el
// modo/perfil del código → escribe en la clave del contexto actual.
export function applyCVSnapshotLive(
    snapshot: Partial<CVManualSnapshot> | null | undefined,
    textConfig?: CVTextConfig | null,
    opts?: { persist?: boolean } | null
): boolean {
    const options = opts || {};
    try {
        if (!isValidSnapshot(snapshot)) return false;
        const safe = sanitizeSnapshot(JSON.parse(JSON.stringify(snapshot)) as Partial<CVManualSnapshot>);
        if (!safe) return false;
        const lang = normalizeLang(safe.currentLang, state.currentLang || 'ES') as Lang;
        if (!_applySnapshotToDOM(safe, lang)) return false;
        // Un CV cargado por el panel es editable y descargable (no la vista de solo-lectura).
        state.isOwnerView = false;
        state.downloadEnabled = true;
        document.body.classList.remove('owner-view');
        if (textConfig) {
            state.textConfig = textConfig;
            applyTextConfig();
        }
        if (options.persist) {
            persistLocalSnapshot();
            if (textConfig) saveTextConfig();
        }
        updateDownloadButtonState();
        // Si estabas editando, la inyección reemplazó los nodos editables → re-armar edición.
        if (state.editMode) reenterEditModeAfterProfileSwitch();
        return true;
    } catch (error) {
        console.warn('No se pudo aplicar el CV en vivo:', error);
        return false;
    }
}

let _savedIndicatorTimer: number | null = null;
function updateSavedIndicator() {
    const el = document.getElementById('lastSavedIndicator');
    if (!el) return;
    if (!state.lastSavedAt) {
        el.classList.remove('is-visible');
        el.textContent = '';
        return;
    }
    const ago = formatTimeAgo(state.lastSavedAt, state.currentLang);
    el.innerHTML = `<i class="fas fa-check-circle" aria-hidden="true"></i><span>${t('lblSavedIndicator')} ${ago}</span>`;
    el.classList.add('is-visible');
}

function startSavedIndicatorRefresh() {
    if (_savedIndicatorTimer) return;
    _savedIndicatorTimer = window.setInterval(updateSavedIndicator, 30000);
}

let _autosaveTimer: number | null = null;
// Solo mientras un tick del autosave espera sus 800 ms. Guardar por el mero hecho de estar en
// modo edición sacaría del escaparate a quien solo pulsó «Textos» y cambió de pestaña.
let _autosavePending = false;
const _debouncedAutosave = debounce(() => {
    _autosavePending = false;
    if (state.editMode) {
        persistLocalSnapshot();
        updateDownloadButtonState();
        updateSaveButtonState();
        dlog('[autosave] snapshot persistido');
    }
}, 800);

function startAutosave() {
    stopAutosave();
    _autosaveTimer = window.setInterval(() => {
        if (state.editMode) {
            _autosavePending = true;
            _debouncedAutosave();
        }
    }, AUTOSAVE_INTERVAL_MS);
}

function stopAutosave() {
    _autosavePending = false;
    if (_autosaveTimer) {
        clearInterval(_autosaveTimer);
        _autosaveTimer = null;
    }
}

// El autosave difiere la LLAMADA 800 ms: cerrar la pestaña dentro de esa ventana perdía la
// última edición. Cuelga del mismo pagehide/visibilitychange que las escrituras diferidas.
registerFlushHandler(() => {
    if (_autosavePending && state.editMode) persistLocalSnapshot();
});

// Estos handlers eran `window.*` — ahora son exports ESM
// que importan edit-mode/config-panel/languages. Son `function` declaradas (hoisting) a
// PROPÓSITO: si algún día aparece un ciclo de imports hacia este entry, una const-arrow
// exportada sería TDZ en runtime; una function declarada no.
export { startAutosave as startCVAutosave, stopAutosave as stopCVAutosave };

// Devuelve el resultado de persistLocalSnapshot() para que saveManualSnapshot solo
// reporte éxito / bloquee UI cuando el guardado realmente funcionó.
export function persistManualSnapshot(): boolean {
    const ok = persistLocalSnapshot();
    updateDownloadButtonState();
    updateSaveButtonState();
    return ok;
}

export function getManualSnapshotRaw(): string | null {
    return getLocalSnapshotRaw();
}

export function setManualSnapshotRaw(rawValue: string | null): void {
    setLocalSnapshotRaw(rawValue);
    updateDownloadButtonState();
    updateSaveButtonState();
}

// Restaura el snapshot del modo+perfil ACTUAL si existe. Lo usa el
// panel Perfil (modo completo) tras cambiar de perfil: como cada perfil tiene su propia clave,
// al conmutar debemos rehidratar el snapshot del perfil destino (si lo hay), en
// lugar de dejar el CV recién regenerado desde el JSON base. Devuelve true si
// restauró contenido guardado. El caller decide cuándo llamarlo (p.ej. fuera de
// edición) para no pisar una sesión de edición en curso.
// (`window.cvRestoreProfileSnapshot` retirado — cero lectores; restoreLocalSnapshot
//  sigue disponible para cuando el panel Perfil del modo completo lo recupere, vía import.)
export { restoreLocalSnapshot as cvRestoreProfileSnapshot };

export function clearManualSnapshot(): void {
    clearLocalSnapshot();
    updateSaveButtonState();
}

document.addEventListener('DOMContentLoaded', async function () {
    // Revela el editor vía el componente global page-fade (antes cv-preload/cv-ready).
    const revealEditor = () => markPageReady();

    // Fijar el modo en el state lo antes posible (otros módulos pueden leerlo).
    state.cvMode = CV_MODE;

    purgeLegacySnapshotKey(); // Soltar la clave huérfana pre-v3

    const externalSource = document.body.dataset.cvSource;

    if (externalSource) {
        try {
            const response = await fetch(externalSource);
            const data = await response.json();
            loadBaseData(data);
        } catch (err) {
            console.error('Error cargando datos del CV:', err);
        }
        state.isOwnerView = false;
        state.downloadEnabled = true;

        applyDefaultsFromActiveData();
    } else if (state.cvMode === 'full') {
        // Modo completo: el panel "Perfil" gobierna qué CV se carga.
        // Restauramos el perfil persistido y cargamos sus datos. Descarga habilitada.
        const { getInitialProfile } = await import('./cv-profile-panel.ts');
        const initialProfile = getInitialProfile();
        state.activeProfile = initialProfile;
        state.isOwnerView = false;
        state.downloadEnabled = true;
        const sourceUrl = DEFAULT_CV_SOURCES[initialProfile];
        try {
            const response = await fetch(sourceUrl);
            if (response.ok) {
                const data = await response.json();
                loadBaseData(data);
            }
        } catch (err) {
            dwarn('No se pudo cargar el perfil ' + initialProfile + ':', err);
        }
        applyDefaultsFromActiveData();
    } else {
        // Modo escaparate: showcase con descarga deshabilitada salvo snapshot.
        // Comportamiento del perfil:
        //  - Si HAY snapshot guardado: se restaurará más abajo en restoreLocalSnapshot;
        //    el panel Perfil quedará deshabilitado.
        //  - Si NO hay snapshot:
        //      · F5 normal del navegador → alterna de perfil y persiste el siguiente.
        //      · Reset desde la app → setea sessionStorage['cv-skip-rotation']='1'
        //        antes de recargar; aquí lo consumimos sin alternar.
        state.isOwnerView = true;
        state.downloadEnabled = false;
        document.body.classList.add('owner-view');

        const snapshotPresent = (() => {
            try {
                return window.localStorage.getItem(getSnapshotKey()) !== null;
            } catch (_e) {
                return false;
            }
        })();

        let pickedKey: ProfileId = DEFAULT_CV_SEQUENCE[0] ?? DEFAULT_PROFILE;
        try {
            const stored = window.localStorage.getItem(DEFAULT_CV_KEY);
            if (stored && (DEFAULT_CV_SEQUENCE as string[]).includes(stored)) pickedKey = stored as ProfileId;

            if (!snapshotPresent) {
                let skipRotation = false;
                try {
                    skipRotation = window.sessionStorage.getItem('cv-skip-rotation') === '1';
                    if (skipRotation) window.sessionStorage.removeItem('cv-skip-rotation');
                } catch (_e) {}
                if (!skipRotation) {
                    // Se persiste el SIGUIENTE, no este: es lo que hace que cada F5 alterne
                    const idx = DEFAULT_CV_SEQUENCE.indexOf(pickedKey);
                    const next = DEFAULT_CV_SEQUENCE[(idx + 1) % DEFAULT_CV_SEQUENCE.length];
                    try {
                        if (next) window.localStorage.setItem(DEFAULT_CV_KEY, next);
                    } catch (_e) {}
                }
            }
        } catch (_err) {}

        state.activeProfile = pickedKey;

        const sourceUrl = DEFAULT_CV_SOURCES[pickedKey];
        if (sourceUrl) {
            try {
                const response = await fetch(sourceUrl);
                if (response.ok) {
                    const data = await response.json();
                    loadBaseData(data);
                    document.body.dataset.cvDefault = pickedKey;
                }
            } catch (err) {
                dwarn('No se pudo cargar el CV por defecto (' + pickedKey + '), usando embebido:', err);
            }
        }

        applyDefaultsFromActiveData();
    }

    // Reglas:
    //  - Idioma: SIEMPRE persiste (UX).
    //  - Tema/Formato: SOLO persisten cuando el CV cargado es "editable propio":
    //      el escaparate CON snapshot manual guardado (el usuario ya personalizó).
    //    En el resto siempre
    //    gana `meta.defaultTheme` del JSON cargado.
    const hasLocalSnapshot = (() => {
        try {
            return window.localStorage.getItem(getSnapshotKey()) !== null;
        } catch (_e) {
            return false;
        }
    })();
    const canPersistThemeAndFormat = state.cvMode === 'showcase' && hasLocalSnapshot;
    const prefs = loadGlobalPreferences();

    if (state.cvMode === 'showcase' && !hasLocalSnapshot && !externalSource) {
        state.currentLang = idiomaDeMuestra(prefs.lang);
        // Sella la marca de un cv-pref-lang de antes: sin ella, un cambio de los Ajustes no se notaría nunca
        if (prefs.lang) {
            saveGlobalPreference('lang', state.currentLang);
            saveSiteMark();
        }
    } else {
        state.currentLang = prefs.lang ?? sourceLang();
    }
    if (canPersistThemeAndFormat) {
        if (prefs.theme !== null) state.currentThemeIndex = prefs.theme;
        if (prefs.format !== null) state.currentFormat = prefs.format;
    }
    // Para los perfiles dejamos lo que ya puso `applyDefaultsFromActiveData()`
    // (defaultTheme del JSON). NO forzamos índice 0.
    applyThemeAndFormatClasses();

    loadTextConfig();

    // Componentes compartidos de los paneles Config/Textos: steppers
    // numéricos −/+, secciones plegables y refresco del hex de los color-field. Todos
    // idempotentes (listeners delegados a nivel de documento).
    enhanceStepperFields();
    enhanceCollapsibleSections();
    startColorFieldSync();

    // Subscribirse a cambios para auto-guardar siguiendo las reglas anteriores.
    subscribeState((change) => {
        // `change.value` es `unknown` (el store es genérico): normalizar al tipo que
        // corresponde a cada preferencia — saveGlobalPreference persiste con String().
        if (change.key === 'currentLang') {
            saveGlobalPreference('lang', String(change.value));
            saveSiteMark();
            return;
        }
        if (change.key === 'currentThemeIndex' || change.key === 'currentFormat') {
            let snapshotNow = false;
            try {
                snapshotNow = window.localStorage.getItem(getSnapshotKey()) !== null;
            } catch (_e) {}
            const allowNow = state.cvMode === 'showcase' && snapshotNow;
            if (!allowNow) return;
            if (change.key === 'currentThemeIndex') saveGlobalPreference('theme', Number(change.value));
            else saveGlobalPreference('format', Number(change.value));
        }
    });

    initializeCV();

    // Aplicar a la UI el idioma guardado en preferencias (bug: al recargar en EN/DE volvía a ES).
    // initializeCV() renderiza el idioma activo, pero la visibilidad/meta/etiquetas seguían en el
    // idioma por defecto salvo que hubiese snapshot. state.currentLang ya trae prefs.lang. Idempotente.
    applyLanguage(state.currentLang);

    // i18n del chrome: traducir topbar/paneles al idioma vigente. Los cambios
    // posteriores de idioma re-aplican solos (cv-i18n se suscribe a currentLang).
    translateEditorUI();

    // Enlazar listeners (sustituye onclick inline)
    initCvEventBindings();
    followSiteLang({ aplicar: applyLanguage, propio: () => state.cvMode !== 'showcase' || state.hasManualSnapshot });

    const cvSheet = initPanelSheet({
        panelIds: ['designPickerPanel', 'configPanel', 'textPanel', 'myCvsPanel', 'cvMasPanel'],
        isOpen: (p) => !(p as HTMLElement).hidden,
        subscribe: (cb) => cvPanelStore.onChange(cb),
        isMobile,
        handleLabel: () => t('ariaSheetHandle'),
        pinnedTop: '.cv-design-picker-header, .edt-saved-topbar, .cv-sheet-note',
        pinnedBottom: '.cv-design-footer, .cv-text-footer',
        ownScroller: '.edt-saved-grid',
    });
    // Cargar un CV guardado cambia el idioma con Mis CVs abierto: sin esto su asa se queda en el idioma anterior.
    onUiLangApplied(() => cvSheet.refresh());
    initMasPanel(); // filas del menú "Más" (delegación de clics)

    cvPanelStore.onChange((snap) => {
        const designBtn = document.getElementById('designToggle');
        if (designBtn) designBtn.classList.toggle('is-active', snap.design);
        const profileBtn = document.getElementById('profileToggle');
        if (profileBtn) profileBtn.classList.toggle('is-active', snap.profile);
        const configBtn = document.getElementById('configToggle');
        if (configBtn) configBtn.classList.toggle('is-active', snap.config);
        const textBtn = document.getElementById('textToggle');
        // El botón Textos luce activo mientras se edita (aunque el panel se oculte
        // al abrir otro): refleja edición, no solo panel visible.
        if (textBtn) textBtn.classList.toggle('is-active', snap.text || state.editMode);

        // Escritorio: con un panel abierto se oculta la toolbar (el panel la tapa, pero
        // asomaba si el panel era corto).; el CSS que la oculta vive en cv-components.css y solo aplica
        // a ≥1025px. En móvil ya lo hace body.edt-sheet-open (motor de sheet compartido).
        document.body.classList.toggle('cv-panel-open', Object.values(snap).some(Boolean));
    });

    // (El panel "Perfil" ya no existe: los perfiles son tarjetas de "Mis CVs", que decide
    // por sí solo cuáles bloquear en su render() según el estado. Aquí se montaba y se
    // sincronizaba a mano contra funciones que ya eran no-ops.)

    if (!externalSource) {
        restoreLocalSnapshot();
    }

    updateDownloadButtonState();
    updateSaveButtonState();

    // Línea base del historial: el contenido inicial (initializeCV + snapshot
    // restaurado) ya está en el DOM → el primer Ctrl+Z no revierte pasos del arranque.
    // En el escaparate (sin CV propio) queda LATENTE (snapshot() → null): la
    // línea base real se fija en el primer guardado propio.
    CvHistory.init();

    initImageProtection();

    initImageUpload();

    requestAnimationFrame(() => {
        setTimeout(revealEditor, 120);
    });

    startSavedIndicatorRefresh();
    updateSavedIndicator();

    document.addEventListener('click', (e) => {
        const popup = document.getElementById('linkEditorPopup');
        if (!popup) return;
        const target = e.target as HTMLElement;
        if (popup.classList.contains('visible') && !popup.contains(target) && !target.closest('[data-editable-link]')) {
            closeLinkEditor();
        }
    });

    // Escape: cierre por CAPAS.
    // 1) Si hay un popup abierto (editor de enlaces / menú de imagen), Escape cierra
    //    SOLO eso. 2) Si no, cierra el panel activo vía su closer (= Cancelar: los
    //    closers revierten su draft). No roba el Escape mientras se escribe.
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const linkPopup = document.getElementById('linkEditorPopup');
            const imgMenu = document.getElementById('imageOptionsMenu');
            const popupWasOpen =
                Boolean(linkPopup && linkPopup.classList.contains('visible')) ||
                Boolean(imgMenu && imgMenu.classList.contains('visible'));
            closeLinkEditor();
            closeImageMenu();
            // Escape ≡ Cancelar del panel activo: cada panel registra su Cancelar real
            // en el store (escape-closer) y este delega — ver cv-panel-store.escapeClose.
            if (!popupWasOpen && !isTypingTarget(e.target)) cvPanelStore.escapeClose();
            return;
        }

        if (e.ctrlKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            saveManualSnapshot();
            return;
        }

        // Ctrl+P: con descarga habilitada
        // interceptamos y exportamos con nombre dinámico; si no, dejamos la impresión
        // nativa del navegador SIN avisos (el toast anterior era contradictorio: decía
        // "no puedes" mientras el diálogo abría igual; el bloqueo real es imposible).
        if (e.ctrlKey && e.key.toLowerCase() === 'p') {
            if (state.downloadEnabled) {
                e.preventDefault();
                downloadPDF();
            }
            return;
        }

        if (e.ctrlKey && e.key.toLowerCase() === 'e') {
            e.preventDefault();
            toggleTextPanel();
            return;
        }

        if (isTypingTarget(e.target)) return;

        // Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z => Deshacer/Rehacer. Va DESPUÉS
        // del guard isTypingTarget: mientras el cursor está en un campo manda el undo NATIVO
        // del navegador. En modo edición también cede (undoCv/redoCv son no-op ahí).
        {
            const key = e.key.toLowerCase();
            if ((e.ctrlKey || e.metaKey) && !e.altKey && (key === 'z' || key === 'y')) {
                if (e.isComposing || state.editMode) return;
                e.preventDefault();
                if (key === 'y' || e.shiftKey) redoCv();
                else undoCv();
                return;
            }
        }

        if (e.altKey && !e.ctrlKey && e.key.toLowerCase() === 'd') {
            if (isDesktop()) {
                e.preventDefault();
                toggleDesign();
            }
            return;
        }

        if (e.altKey && !e.ctrlKey && e.key.toLowerCase() === 'l') {
            e.preventDefault();
            toggleLanguage();
        }
    });
});

function initImageProtection() {
    document.addEventListener('contextmenu', function (e) {
        if (state.isOwnerView && !state.editMode) {
            const target = e.target as HTMLElement;
            if (target.tagName === 'IMG' && target.closest('.profile-photo-placeholder')) {
                e.preventDefault();
                return false;
            }
        }
    });

    document.addEventListener('dragstart', function (e) {
        if (state.isOwnerView && !state.editMode) {
            const target = e.target as HTMLElement;
            if (target.tagName === 'IMG' && target.closest('.profile-photo-placeholder')) {
                e.preventDefault();
                return false;
            }
        }
    });
}
