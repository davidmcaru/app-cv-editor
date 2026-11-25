import { cvPanelStore } from './cv-panel-store.ts';
import { openConfigPanel, restoreStylesFromMenu, reiniciarTodo } from './cv-config-panel.ts';
import { openMyCvsPanel } from './cv-mycvs-panel.ts';
import { downloadPDF } from './cv-download.ts';

function masPanel(): HTMLElement | null {
    return document.getElementById('cvMasPanel');
}

function _syncToggleExpanded(expanded: boolean): void {
    const toggle = document.getElementById('cvMasToggle');
    if (toggle) toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

export function openMasPanel(): void {
    const panel = masPanel();
    if (!panel) return;
    panel.hidden = false;
    panel.classList.add('open');
    cvPanelStore.setCloser('mas', closeMasPanel);
    cvPanelStore.setOpen('mas', true);
    _syncToggleExpanded(true);
}

export function closeMasPanel(): void {
    const panel = masPanel();
    if (!panel) return;
    panel.classList.remove('open');
    panel.hidden = true;
    cvPanelStore.setOpen('mas', false);
    _syncToggleExpanded(false);
}

export function toggleMasPanel(): void {
    const panel = masPanel();
    if (!panel || panel.hidden) openMasPanel();
    else closeMasPanel();
}

// Acciones de las filas (data-mas-action). Config abre un panel (la exclusión mutua del
// store cierra "Más" sola); las demás son acciones sueltas → cerrar "Más" antes.
const ROW_ACTIONS: Record<string, () => void> = {
    config: () => openConfigPanel(),
    mycvs: () => openMyCvsPanel(),
    download: () => {
        closeMasPanel();
        downloadPDF();
    },
    'reset-styles': () => {
        closeMasPanel();
        restoreStylesFromMenu();
    },
    'reset-all': () => {
        closeMasPanel();
        reiniciarTodo();
    },
};

let _wired = false;
export function initMasPanel(): void {
    if (_wired) return;
    const panel = masPanel();
    if (!panel) return;
    panel.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const row = target.closest<HTMLElement>('[data-mas-action]');
        if (!row) return;
        const fn = ROW_ACTIONS[row.dataset.masAction || ''];
        if (fn) fn();
    });
    document.addEventListener('click', (e) => {
        if (!cvPanelStore.isOpen('mas')) return;
        const target = e.target as HTMLElement;
        if (target.closest('#cvMasPanel') || target.closest('#cvMasToggle')) return;
        closeMasPanel();
    });
    _wired = true;
}
