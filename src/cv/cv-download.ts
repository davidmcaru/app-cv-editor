import { state, formatNames, themeNames } from './cv-state.ts';
import { saveManualSnapshot } from './cv-edit-mode.ts';
import { showToast } from './cv-utils.ts';
import { t } from './cv-i18n.ts';

export async function downloadPDF() {
    if (!state.downloadEnabled) {
        showToast(t('toastDownloadRequiresSave'), 'info');
        return;
    }

    // Si está en modo edición, guardar (y salir de edición) ANTES de imprimir.
    // saveManualSnapshot es async (espera la traducción ES→EN/DE): hay que
    // await-earla para que al llegar a window.print() ya no haya contenteditable ni el
    // chrome de edición visibles en el PDF, y el snapshot esté persistido.
    if (state.editMode) {
        await saveManualSnapshot();
    }

    const formatName = formatNames[state.currentLang][state.currentFormat];
    const themeName = themeNames[state.currentThemeIndex];
    // El cargo del folio que se imprime, con lo editado: activeData es la plantilla de la que partiste
    const cargo = document.querySelector('.cv-container:not([hidden]) .header h2')?.textContent?.trim();
    const roleTitle = (cargo || 'CV').split(/\s+/).slice(0, 2).join('-');
    const fileName = `CV-${roleTitle}-${state.currentLang}-${formatName}-${themeName}`;

    const originalTitle = document.title;
    document.title = fileName;

    // Restaurar título cuando finalice el diálogo de impresión (event-driven, no timeout arbitrario).
    const restoreTitle = () => {
        document.title = originalTitle;
        window.removeEventListener('afterprint', restoreTitle);
    };
    window.addEventListener('afterprint', restoreTitle, { once: true });

    // Fallback de seguridad por si el navegador no dispara afterprint (raro pero posible).
    window.setTimeout(() => {
        if (document.title === fileName) document.title = originalTitle;
    }, 60000);

    // Usar window.print() que genera PDF con texto seleccionable
    window.print();
}

// downloadPDF se enlaza desde cv-event-bindings.js (sin onclick inline).
