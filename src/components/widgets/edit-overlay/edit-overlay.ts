export interface EditOverlayAction {
    id: string;
    icon: string;
    title: string;
    danger?: boolean;
}

export interface EditOverlayOptions {
    actions: EditOverlayAction[];
    onAction: (actionId: string, host: HTMLElement) => void;
    side?: 'right' | 'left' | 'below';
}

export interface AddBarItem {
    id: string;
    label: string;
}

export interface AddBarOptions {
    items: AddBarItem[];
    onAdd: (itemId: string) => void;
    label?: string;
}

export const EDIT_OVERLAY_ICONS = {
    grip: '<svg viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    close: '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
} as const;

const OVERLAY_CLASS = 'edt-crud-overlay';
const ADDBAR_CLASS = 'edt-addbar';

/**
 * Inyecta un overlay de acciones proyectado fuera de la caja del host.
 * Idempotente por host (reemplaza el overlay previo). Devuelve función de retirada.
 */
export function attachEditOverlay(host: HTMLElement, options: EditOverlayOptions): () => void {
    const previous = host.querySelector(`:scope > .${OVERLAY_CLASS}`);
    if (previous) previous.remove();

    const overlay = document.createElement('div');
    overlay.className = `${OVERLAY_CLASS} ${OVERLAY_CLASS}--${options.side || 'right'}`;

    for (const action of options.actions) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'edt-crud-btn' + (action.danger ? ' edt-crud-btn--danger' : '');
        btn.innerHTML = action.icon;
        btn.title = action.title;
        btn.setAttribute('aria-label', action.title);
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            options.onAction(action.id, host);
        });
        overlay.appendChild(btn);
    }

    // El host ancla el overlay sin moverse él (posición por CSS, no inline, para
    // no pisar posicionamientos propios del host; ver .edt-crud-host en el CSS).
    host.classList.add('edt-crud-host');
    host.appendChild(overlay);

    return () => {
        overlay.remove();
        host.classList.remove('edt-crud-host');
    };
}

/**
 * Crea la barra "+ Añadir" para insertar AL FINAL de un contenedor (nunca antes
 * del contenido: así no desplaza nada por encima). El caller decide dónde
 * appendearla y puede usarla como ancla de inserción de nuevos ítems.
 */
export function createAddBar(options: AddBarOptions): HTMLElement {
    const bar = document.createElement('div');
    bar.className = ADDBAR_CLASS;
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', options.label || 'Añadir elemento');
    bar.setAttribute('data-edit-addbar', 'true');

    for (const item of options.items) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'edt-add-btn';
        btn.textContent = `+ ${item.label}`;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            options.onAdd(item.id);
        });
        bar.appendChild(btn);
    }

    return bar;
}

export function removeEditOverlays(root: ParentNode): void {
    root.querySelectorAll(`.${OVERLAY_CLASS}, .${ADDBAR_CLASS}`).forEach((el) => el.remove());
    root.querySelectorAll('.edt-crud-host').forEach((el) => el.classList.remove('edt-crud-host'));
}
