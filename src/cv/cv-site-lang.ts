import { AJUSTE_IDIOMA } from '../components/core/ajustes/ajustes-general.ts';
import { observarAjuste } from '../components/core/ajustes/ajustes-sync.ts';
import { t } from './cv-i18n.ts';
import { cvPanelStore } from './cv-panel-store.ts';
import { state } from './cv-state.ts';
import { sourceLang } from './cv-translation.ts';
import type { Lang } from './cv-types.ts';
import { showToast } from './cv-utils.ts';

// El idioma que tenían los Ajustes al guardarse cv-pref-lang: si cambiaron después, ganan los Ajustes
const SITE_MARK_KEY = 'cv-pref-lang-site';
const RETRY_MS = 300;
let site: Lang = 'ES';
let pending: Lang | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

function readMark(): string | null {
    try {
        return localStorage.getItem(SITE_MARK_KEY);
    } catch {
        return null;
    }
}

export function saveSiteMark(): void {
    try {
        localStorage.setItem(SITE_MARK_KEY, sourceLang());
    } catch {
        /* localStorage no disponible */
    }
}

// «Gana la última elección»: el botón del CV de muestra se recuerda hasta que cambian los Ajustes
export function idiomaDeMuestra(saved: Lang | null): Lang {
    const actual = sourceLang();
    // Sin marca es un cv-pref-lang de antes de seguir a los Ajustes: vale como elegido con el de hoy
    const mark = readMark() ?? actual;
    return saved && mark === actual ? saved : actual;
}

// A mitad de edición, el idioma que se ve es el que el Guardar traduce; un panel abierto se quedaría en el de antes
const busy = (): boolean =>
    state.editMode || state.isTranslating || Object.values(cvPanelStore.snapshot()).some(Boolean);

interface Seguir {
    aplicar: (lang: Lang) => void;
    // Tu CV y el modo completo no se mueven: el idioma lo lleva su botón
    propio: () => boolean;
}

function avisarPropio(lang: Lang): void {
    if (state.currentLang !== lang) showToast(t('toastSiteLangOwnCv'), 'info', 5000);
}

function applyPending({ aplicar, propio }: Seguir): void {
    clearTimeout(timer);
    if (pending === null) return;
    if (busy()) {
        timer = setTimeout(() => applyPending({ aplicar, propio }), RETRY_MS);
        return;
    }
    const lang = pending;
    pending = null;
    // Guardar lo que se editaba lo convierte en tu CV: ya no sigue a los Ajustes
    if (propio()) avisarPropio(lang);
    else aplicar(lang);
}

export function followSiteLang(seguir: Seguir): void {
    site = sourceLang();
    observarAjuste(AJUSTE_IDIOMA, () => {
        const next = sourceLang();
        // pageshow y el storage de clave null repiten el aviso sin que hayan cambiado los Ajustes
        if (next === site) return;
        site = next;
        if (seguir.propio()) {
            avisarPropio(next);
            return;
        }
        pending = next;
        applyPending(seguir);
    });
    // En captura, antes que su handler: el botón es posterior al aplazado y manda él
    document.getElementById('langToggle')?.addEventListener(
        'click',
        () => {
            if (state.isTranslating) return;
            clearTimeout(timer);
            pending = null;
        },
        true
    );
}
