import { toggleLanguage } from './cv-languages.ts';
import { toggleDesign } from './cv-design-picker.ts';
import { closeLinkEditor, saveLinkEdit } from './cv-edit-mode.ts';
import { toggleTextPanel } from './cv-text-panel.ts';
import { toggleConfigPanel } from './cv-config-panel.ts';
import { downloadPDF } from './cv-download.ts';
import { toggleMyCvsPanel } from './cv-mycvs-panel.ts';
import { undoCv, redoCv } from './cv-history.ts';
import { toggleMasPanel } from './cv-mas-panel.ts';
import { handleImageClick, changeImage, editImageLink, restoreDefaultImage, removeImage } from './cv-images.ts';

function bindClick(id: string, handler: EventListener): void {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', handler);
}

// Map de selectores delegados -> handler. Cada entrada recibe (event, button).
// Los añadir/eliminar de items YA NO van por delegación — los gestiona el
// overlay compartido (components/widgets/edit-overlay) con callbacks directos.
const DELEGATED_HANDLERS: Array<[string, (e: Event, btn: HTMLElement) => void]> = [];

function bindDelegatedClicks(rootSelector: string): void {
    const root = document.querySelector(rootSelector);
    if (!root) return;
    root.addEventListener('click', (e) => {
        // En un click el target SIEMPRE es un Element (nunca un nodo de texto): el cast
        // no añade rama nueva, solo le da a TS lo que el modelo de eventos ya garantiza.
        const target = e.target as HTMLElement;
        const img = target.closest<HTMLElement>('.editable-image');
        if (img) {
            handleImageClick(e, img);
            return;
        }
        for (const [selector, handler] of DELEGATED_HANDLERS) {
            const btn = target.closest<HTMLElement>(selector);
            if (btn && root.contains(btn)) {
                handler(e, btn);
                return;
            }
        }
    });
}

export function initCvEventBindings() {
    bindClick('langToggle', toggleLanguage);
    bindClick('configToggle', toggleConfigPanel);
    bindClick('textToggle', toggleTextPanel);
    bindClick('designToggle', toggleDesign);
    bindClick('myCvsToggle', toggleMyCvsPanel);
    bindClick('undoBtn', undoCv); // Deshacer/Rehacer; no-op en edición
    bindClick('redoBtn', redoCv);
    bindClick('cvMasToggle', toggleMasPanel); // "Más"
    bindClick('downloadBtn', downloadPDF);

    const linkPopup = document.getElementById('linkEditorPopup');
    if (linkPopup) {
        const cancelBtn = linkPopup.querySelector('.btn-cancel');
        const saveBtn = linkPopup.querySelector('.btn-save');
        if (cancelBtn) cancelBtn.addEventListener('click', closeLinkEditor);
        if (saveBtn) saveBtn.addEventListener('click', saveLinkEdit);
    }

    // Menú de opciones de imagen — cableado por data-action, NO por índice del DOM
    // (reordenar/insertar un botón recableaba acciones a botones equivocados).
    const imageMenu = document.getElementById('imageOptionsMenu');
    if (imageMenu) {
        const actionHandlers: Record<string, EventListener> = {
            change: changeImage,
            'edit-link': editImageLink,
            restore: restoreDefaultImage,
            remove: removeImage,
        };
        imageMenu.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach((btn) => {
            const action = btn.dataset.action;
            const handler = action ? actionHandlers[action] : undefined;
            if (handler) btn.addEventListener('click', handler);
        });
    }

    // Delegado: cubre los items dinámicos que entran por innerHTML o template
    bindDelegatedClicks('#cv-container');
}
