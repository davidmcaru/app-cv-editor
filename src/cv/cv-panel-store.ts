import { createPanelStore } from '../components/core/panel-store/panel-store.ts';

export type PanelName = 'design' | 'profile' | 'config' | 'text' | 'mycvs' | 'mas';
export type PanelFn = ((...args: unknown[]) => unknown) | null;

export type PanelSnapshot = Record<PanelName, boolean>;
export type PanelSubscriber = (snapshot: PanelSnapshot) => void;

const PANEL_NAMES: PanelName[] = ['design', 'profile', 'config', 'text', 'mycvs', 'mas'];

const _store = createPanelStore();
const _mkMap = (): Record<PanelName, PanelFn> => ({
    design: null,
    profile: null,
    config: null,
    text: null,
    mycvs: null,
    mas: null,
});
const _closers = _mkMap();
const _openers = _mkMap();
// Cancelar REAL de cada panel para el Escape global. Textos y Mis CVs registran como
// closer del store uno que SOLO oculta (la exclusión entre paneles no debe descartar
// la edición / el CV cargado); su Cancelar de verdad se registra aquí. Los paneles
// cuyo closer YA es su Cancelar (design/config/mas) no necesitan registrar nada.
const _escapeClosers = _mkMap();

function _snapshot(): PanelSnapshot {
    const active = _store.get();
    return {
        design: active === 'design',
        profile: active === 'profile',
        config: active === 'config',
        text: active === 'text',
        mycvs: active === 'mycvs',
        mas: active === 'mas',
    };
}

export const cvPanelStore = {
    setOpen(name: PanelName, isOpen: boolean): void {
        const active = _store.get();
        if (isOpen) {
            if (active === name) return;
            // Exclusión mutua: al ABRIR un panel, cerrar el que esté abierto (su closer
            // llama a setOpen(other, false), que solo limpia si sigue siendo el activo).
            if (active) {
                const closer = _closers[active as PanelName];
                if (typeof closer === 'function') closer();
            }
            _store.set(name);
        } else {
            if (active !== name) return;
            _store.set(null);
        }
    },
    isOpen(name: PanelName): boolean {
        return _store.get() === name;
    },
    setCloser(name: PanelName, fn: PanelFn): void {
        _closers[name] = fn;
    },
    getCloser(name: PanelName): PanelFn {
        return _closers[name];
    },
    setOpener(name: PanelName, fn: PanelFn): void {
        _openers[name] = fn;
    },
    getOpener(name: PanelName): PanelFn {
        return _openers[name];
    },
    closeIfOpen(name: PanelName): void {
        const closer = _closers[name];
        if (_store.get() === name && typeof closer === 'function') closer();
    },
    /** Cierra TODOS los paneles abiertos. Útil al pulsar un botón que no es un panel (Editar…). */
    closeAll(): void {
        for (const name of PANEL_NAMES) {
            const closer = _closers[name];
            if (_store.get() === name && typeof closer === 'function') closer();
        }
    },
    /** Registra el Cancelar real del panel para el Escape global (ver _escapeClosers). */
    setEscapeCloser(name: PanelName, fn: PanelFn): void {
        _escapeClosers[name] = fn;
    },
    /** Escape global: cierra el panel activo por su Cancelar REAL (escape-closer si el
     *  panel registró uno; si no, su closer normal, que ya revierte). Sin esto, Escape
     *  en Textos dejaba edit-mode activo con el panel cerrado → Descargar oculto
     * . */
    escapeClose(): void {
        const active = _store.get() as PanelName | null;
        if (!active) return;
        const esc = _escapeClosers[active];
        if (typeof esc === 'function') esc();
        else this.closeIfOpen(active);
    },
    onChange(cb: PanelSubscriber): () => void {
        return _store.subscribe(() => {
            cb(_snapshot());
        });
    },
    snapshot: _snapshot,
};
