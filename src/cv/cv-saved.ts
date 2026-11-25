import { createSavedStore, type SavedAddResult } from '../components/features/utils/saved-store.ts';
import { checksum } from '../components/features/utils/share-codec.ts';
import type { CVManualSnapshot } from './cv-types.ts';

export interface CVSavedEntry {
    id: string;
    name: string;
    createdAt: number;
    hash: string;
    snapshot: CVManualSnapshot;
    textConfig: object | null;
    thumb?: string | null;
    bgSwatch?: string;
}

// Hash de IDENTIDAD del CV (djb2 base36, mismo cálculo que el checksum del códec). Solo
// campos que definen el diseño: contenido (ES/EN/DE) + tema + formato + estilos.
function _hash(snapshot: CVManualSnapshot, textConfig: object | null): string {
    return (
        'k' +
        checksum(
            JSON.stringify({
                e: snapshot.cvs.ES,
                n: snapshot.cvs.EN,
                d: snapshot.cvs.DE,
                t: snapshot.currentThemeIndex,
                f: snapshot.currentFormat,
                x: textConfig || null,
            })
        )
    );
}

const store = createSavedStore<CVSavedEntry>({
    lsKey: 'cv-saved-v1',
    idPrefix: 'c',
    max: 25,
    matchDup: (x, inc) => x.hash === inc.hash,
    // El nombre NO se refresca: el auto-nombre pisaría un rename del usuario.
    refreshDup: (ex, inc) => {
        ex.snapshot = inc.snapshot;
        ex.textConfig = inc.textConfig;
        if (inc.thumb) ex.thumb = inc.thumb;
        if (inc.bgSwatch) ex.bgSwatch = inc.bgSwatch;
    },
    // Nunca borra un CV, solo miniaturas: si ni así cabe, add() da persisted:false y el panel avisa (toastSaveQuota).
    quotaFallback: (list, keepId, persist) => {
        for (let i = list.length - 1; i >= 0; i--) {
            const x = list[i];
            if (x && x.id !== keepId && x.thumb) {
                x.thumb = null;
                if (persist(list)) return true;
            }
        }
        const keep = list.find((x) => x && x.id === keepId);
        if (keep) keep.thumb = null;
        return persist(list);
    },
});

type CVSavedInput = {
    name: string;
    snapshot: CVManualSnapshot;
    textConfig?: object | null;
    thumb?: string | null;
    bgSwatch?: string;
};

function _normalize(entry: CVSavedInput): Omit<CVSavedEntry, 'id' | 'createdAt'> | null {
    const snapshot = entry.snapshot;
    if (!snapshot || !snapshot.cvs) return null;
    const textConfig = entry.textConfig || null;
    const bg = entry.bgSwatch || '';
    return {
        name: String(entry.name || 'CV').slice(0, 60),
        hash: _hash(snapshot, textConfig),
        snapshot,
        textConfig,
        thumb: typeof entry.thumb === 'string' && entry.thumb.startsWith('data:') ? entry.thumb : null,
        bgSwatch: /^#[0-9a-fA-F]{6}$/.test(bg) ? bg : '#ffffff',
    };
}

// `ok: false` = lista llena (canAdd lo evita salvo carrera con otra pestaña); `persisted: false` = cuota agotada.
function add(entry: CVSavedInput): SavedAddResult<CVSavedEntry> | null {
    const n = _normalize(entry);
    return n ? store.add(n) : null;
}

function canAdd(entry: Pick<CVSavedInput, 'snapshot' | 'textConfig'>): boolean {
    const n = _normalize({ name: '', ...entry });
    return !!n && store.canAdd(n);
}

export const CVSaved = {
    max: store.max,
    list: store.list,
    get: store.get,
    add,
    canAdd,
    remove: store.remove,
    rename: store.rename,
    reorder: store.reorder,
};
