import { state, themes, applyThemeAndFormatClasses, rebaselineHistory } from './cv-state.ts';
import { initializeCV, updateButtonLabels, loadBaseData } from './cv-data-loader.ts';
import { updateDownloadButtonState, reenterEditModeAfterProfileSwitch } from './cv-edit-mode.ts';
import { normalizeTheme } from './cv-controller.ts';
import { applyLanguageMeta } from './cv-languages.ts';

// El tipo vive en cv-types (lo necesita cv-constants sin ciclo); se re-exporta para no
// tocar los call-sites que ya lo importaban de aquí.
export type { ProfileId } from './cv-types.ts';
import type { ProfileId } from './cv-types.ts';
import { DEFAULT_PROFILE, PROFILE_SOURCES, isProfileId } from './cv-profiles.ts';

const PROFILE_KEY = 'cv-active-profile';

function readStoredProfile(): ProfileId {
    try {
        const stored = window.localStorage.getItem(PROFILE_KEY);
        if (isProfileId(stored)) return stored;
    } catch (_e) {}
    return DEFAULT_PROFILE;
}

function persistProfile(id: ProfileId): void {
    try {
        window.localStorage.setItem(PROFILE_KEY, id);
    } catch (_e) {}
}

export async function applyProfile(id: ProfileId): Promise<void> {
    const url = PROFILE_SOURCES[id];
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        loadBaseData(data);
        state.activeProfile = id;
        if (state.cvMode === 'full') {
            state.downloadEnabled = true;
            state.isOwnerView = false;
            document.body.classList.remove('owner-view');
        } else {
            state.downloadEnabled = false;
            state.isOwnerView = true;
            document.body.classList.add('owner-view');
        }
    } catch (err) {
        console.warn('[cv-profile] Error cargando perfil', id, err);
        return;
    }

    // Aplicar defaults del meta del CV recién cargado (idioma + tema).
    // Replica la lógica de `applyDefaultsFromActiveData` del controller para
    // evitar import circular.
    const meta = (state as unknown as { activeData?: { meta?: { defaultLang?: string; defaultTheme?: string } } })
        .activeData?.meta;
    if (meta) {
        const rawLang = (meta.defaultLang || '').toUpperCase();
        if (rawLang === 'ES' || rawLang === 'EN' || rawLang === 'DE') {
            state.currentLang = rawLang;
        }
        const normalizedTheme = normalizeTheme(meta.defaultTheme);
        const themeIdx = (themes as string[]).indexOf(normalizedTheme);
        if (themeIdx >= 0) {
            state.currentThemeIndex = themeIdx;
            state.defaultThemeIndex = themeIdx; // referencia de "Restablecer estilos" (ver cv-state)
        }
        applyThemeAndFormatClasses();
    }

    // Solo se persiste en el modo completo
    if (state.cvMode === 'full') persistProfile(id);
    initializeCV();
    updateButtonLabels(state.currentLang);
    applyLanguageMeta(state.currentLang);
    updateDownloadButtonState();

    // Rehidratar el snapshot del perfil DESTINO si existe. Cada perfil
    // tiene ahora su propia clave de snapshot; al conmutar de perfil en el modo completo, initializeCV()
    // acaba de repintar el CV desde el JSON base, así que si el usuario ya tenía trabajo
    // guardado para ESTE perfil hay que restaurarlo. Solo fuera de edición: durante una
    // sesión de edición no pisamos el DOM (el re-arme lo hace el bloque de abajo).
    if (!state.editMode) {
        const restore = (window as unknown as { cvRestoreProfileSnapshot?: () => boolean }).cvRestoreProfileSnapshot;
        if (typeof restore === 'function') restore();
    }

    // Cambiar de perfil DURANTE la edición es una feature deliberada en el modo completo (el panel
    // queda activo). Pero initializeCV() acaba de reemplazar todos los nodos editables
    // por otros nuevos sin contenteditable ni listeners, y el baseline sigue apuntando
    // al perfil anterior. Re-armamos edición y re-capturamos el baseline
    // del NUEVO perfil para que Cancelar restaure el perfil correcto.
    if (state.editMode) {
        reenterEditModeAfterProfileSwitch();
    }

    // Re-basar el historial: cada perfil tiene su propia clave de snapshot, así que
    // el deshacer NO debe cruzar perfiles (un undo escribiría contenido del perfil anterior en
    // la clave del nuevo → corrupción). init() fija la línea base al contenido recién cargado y
    // vacía las pilas. Cubre boot y cambio de perfil (applyProfile es el único primitivo de carga).
    rebaselineHistory();
}

export function getInitialProfile(): ProfileId {
    if (state.cvMode === 'full') return readStoredProfile();
    const current = state.activeProfile;
    return isProfileId(current) ? current : DEFAULT_PROFILE;
}
