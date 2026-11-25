import { createHistory } from '../components/core/history/history.ts';
import { state, registerCvHistoryHooks, subscribeState, type CVTextConfig } from './cv-state.ts';
import { buildShareSnapshot, applyCVSnapshotLive } from './cv-controller.ts';
import type { Lang } from './cv-types.ts';

interface CvHistoryEntry {
    currentLang: Lang;
    currentThemeIndex: number;
    currentFormat: number;
    cvs: { ES: string; EN: string; DE: string };
    textConfig: CVTextConfig;
}

// El historial solo está activo cuando hay algo propio que proteger: en el modo completo siempre;
// en el escaparate cuando existe un CV propio (persistido o aplicado en vivo — el mismo flag
// que habilita Compartir/Guardar). En el escaparate snapshot() devuelve null → el motor
// no fija línea base ni graba entradas, y ningún estado de escaparate entra en las pilas.
function historyActive(): boolean {
    return state.cvMode === 'full' || state.hasManualSnapshot;
}

// Snapshot para el historial: contenido + diseño + textConfig. Se EXCLUYE el timestamp
// (buildShareSnapshot pone Date.now() en cada captura → rompería el dedupe y el re-sync)
// y los flags que apply fuerza (downloadEnabled/isOwnerView). textConfig vive en su propia
// clave de localStorage, por eso se captura aparte: si no, los cambios de Config/Textos
// quedarían fuera del deshacer.
function cvSnapshot(): string | null {
    if (!historyActive()) return null; // escaparate → historial inactivo
    const snap = buildShareSnapshot();
    if (!snap) return null;
    const entry: CvHistoryEntry = {
        currentLang: snap.currentLang,
        currentThemeIndex: snap.currentThemeIndex,
        currentFormat: snap.currentFormat,
        cvs: snap.cvs,
        textConfig: state.textConfig,
    };
    return JSON.stringify(entry);
}

// Refleja el estado de las pilas en los botones ↶/↷ (si existen). Deshabilitados también
// durante la edición: el historial opera sobre estados ya confirmados, y mientras editas el
// undo nativo/el Cancelar del modo edición hacen las veces de deshacer.
function updateHistoryButtons(): void {
    const btnUndo = document.getElementById('undoBtn') as HTMLButtonElement | null;
    const btnRedo = document.getElementById('redoBtn') as HTMLButtonElement | null;
    const editing = state.editMode;
    if (btnUndo) btnUndo.disabled = editing || !CvHistory.canUndo();
    if (btnRedo) btnRedo.disabled = editing || !CvHistory.canRedo();
}

export const CvHistory = createHistory<CvHistoryEntry>({
    snapshot: cvSnapshot,
    apply: (entry) => {
        const { textConfig, ...snapshot } = entry;
        // persist:true → el estado deshecho/rehecho sobrevive a un F5. El
        // motor gestiona el guard de re-entrada, así que el persist de aquí no se re-graba.
        applyCVSnapshotLive(snapshot, textConfig, { persist: true });
    },
    onChange: updateHistoryButtons,
    cap: 30,
});

registerCvHistoryHooks(CvHistory);

// Los botones dependen TAMBIÉN del modo edición: re-evaluar su disabled al entrar y salir
subscribeState((change) => {
    if (change.key === 'editMode') updateHistoryButtons();
});

/** Deshacer del CV: no-op durante la edición (manda el undo nativo). Lo usan el botón ↶ y Ctrl+Z. */
export function undoCv(): boolean {
    if (state.editMode) return false;
    return CvHistory.undo();
}

/** Rehacer del CV: no-op durante la edición. Lo usan el botón ↷ y Ctrl+Y / Ctrl+Shift+Z. */
export function redoCv(): boolean {
    if (state.editMode) return false;
    return CvHistory.redo();
}
