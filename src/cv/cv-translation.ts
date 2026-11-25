import { state } from './cv-state.ts';
import { confirmDialog, showToast } from './cv-utils.ts';
import { t } from './cv-i18n.ts';
import {
    createTranslationConsent,
    enlacePolitica,
    translateViaMyMemory,
} from '../components/features/translate/mymemory.ts';
import { AJUSTE_TRADUCCION_CV } from '../components/core/ajustes/ajustes-cv.ts';
import { AJUSTE_IDIOMA } from '../components/core/ajustes/ajustes-general.ts';
import { leerAjuste, escribirAjuste } from '../components/core/ajustes/ajustes-sync.ts';
import type { Lang } from './cv-types.ts';

const TRANSLATION_TIMEOUT_MS = 8000;
const LANGS: Lang[] = ['ES', 'EN', 'DE'];

// El texto libre del CV viaja por GET a un tercero: nada sale sin el permiso de Ajustes › CV Editor.
// El diálogo es de elección OBLIGATORIA: un dismiss guardaría «No, nunca» sin que nadie lo decidiera.
const _consent = createTranslationConsent({
    read: () => leerAjuste(AJUSTE_TRADUCCION_CV),
    // ⚠️ Por escribirAjuste y no a mano: el panel de Ajustes abierto seguiría marcando «Preguntar»
    write: (eleccion) => escribirAjuste(AJUSTE_TRADUCCION_CV, eleccion),
    confirm: () =>
        confirmDialog(t('dlgTranslateConsentMsg'), {
            okLabel: t('lblTranslateYes'),
            cancelLabel: t('lblTranslateNo'),
            dismissible: false,
            content: enlacePolitica(t('dlgTranslateConsentPolicy')),
        }),
});

// ensure() solo mira al empezar: retirado en Ajustes a mitad, lo que falta ya no sale
const _retirado = (): boolean => leerAjuste(AJUSTE_TRADUCCION_CV) === 'denied';

export function sourceLang(): Lang {
    return leerAjuste(AJUSTE_IDIOMA) === 'en' ? 'EN' : 'ES';
}

export async function translateEditedContent() {
    if (state.editedElements.size === 0) return;

    // Guard: evitar dos ciclos de traducción simultáneos.
    if (state.isTranslating) {
        return;
    }

    // Solo viaja lo editado en el idioma del sitio: lo retocado en los otros es a mano y no pisa el original
    const source = sourceLang();
    const cvSource = document.getElementById(`cv-${source.toLowerCase()}`);
    const pendientes = [...state.editedElements].filter((el) => !!cvSource && cvSource.contains(el));
    if (pendientes.length === 0) {
        state.editedElements.clear();
        return;
    }

    const consent = await _consent.ensure();
    if (!consent) {
        // Sin permiso no se traduce: los otros idiomas conservan su contenido previo.
        state.editedElements.clear();
        return;
    }

    state.isTranslating = true;
    const textBtn = document.getElementById('textToggle');
    const textIcon = textBtn ? textBtn.querySelector('i') : null;
    if (textIcon) textIcon.className = 'fas fa-spinner fa-spin';

    const destinos = LANGS.filter((l) => l !== source).map((lang) => ({
        lang,
        tree: document.getElementById(`cv-${lang.toLowerCase()}`),
    }));
    const fallidos = new Set<HTMLElement>();

    for (const element of pendientes) {
        // Leer SOLO el texto del span dedicado, excluyendo hijos de control como el
        // botón "×" de borrar o los bullets. Espeja la lógica de
        // updateElementText al ESCRIBIR el resultado.
        const rawText = getEditableText(element);
        if (!rawText.trim()) continue;

        // Se prefiere el id estable; el path posicional es solo el respaldo
        const translateId = element.dataset.translateId;
        const pathToElement = translateId ? null : getElementPath(element, cvSource!);

        const findInTree = (tree: Element | null): Element | null => {
            if (!tree) return null;
            if (translateId) {
                return tree.querySelector(`[data-translate-id="${CSS.escape(translateId)}"]`);
            }
            return findElementByPath(pathToElement, tree);
        };

        // Campos de contacto (enlaces): DATO REAL (email/teléfono/usuario), idéntico en los
        // 3 idiomas → copia VERBATIM, nunca traducir ni enviar al servicio externo.
        if (element.matches && element.matches('[data-editable-link]')) {
            for (const { tree } of destinos) {
                const twin = findInTree(tree);
                if (twin) updateElementText(twin, rawText);
            }
            continue;
        }

        // El "• " de los items de lista vive DENTRO del texto editable (cv-data-loader lo
        // embebe en .list-text): enviarlo dispara placeholders XLIFF en la TM de MyMemory
        // Y además el bullet se perdía al reemplazar el span.
        // Se quita antes de enviar y se re-añade al escribir.
        const bullet = /^•\s*/.test(rawText) ? '• ' : '';
        const text = bullet ? rawText.replace(/^•\s*/, '') : rawText;

        for (const { lang, tree } of destinos) {
            if (_retirado()) break;
            const traducido = await translateViaMyMemory(text, source.toLowerCase(), lang.toLowerCase(), {
                timeoutMs: TRANSLATION_TIMEOUT_MS,
            });
            // ⚠️ Un fallo no escribe nada: antes se copiaba el original y el inglés acababa en castellano
            if (traducido === null) {
                fallidos.add(element);
                continue;
            }
            const twin = findInTree(tree);
            if (twin) updateElementText(twin, bullet + traducido);
        }
    }

    // Lo que falló vuelve a la cola: el siguiente Guardar lo reintenta
    state.editedElements.clear();
    if (!_retirado()) fallidos.forEach((el) => state.editedElements.add(el));
    state.isTranslating = false;
    if (textIcon) textIcon.className = 'fas fa-font';
    if (state.editedElements.size > 0) {
        showToast(t('toastTranslatePartial', { count: state.editedElements.size }), 'warn', 6000);
    }
}

/** Un salto del camino posicional: qué hijo del padre era el elemento. */
interface PathStep {
    tagName: string;
    index: number;
    className: string;
}

function getElementPath(element: Element, container: Element): PathStep[] {
    const path: PathStep[] = [];
    let current: Element | null = element;

    while (current && current !== container) {
        const parent: HTMLElement | null = current.parentElement;
        if (!parent) break;

        const siblings = Array.from(parent.children);
        const index = siblings.indexOf(current);
        path.unshift({ tagName: current.tagName, index: index, className: current.className });
        current = parent;
    }

    return path;
}

function findElementByPath(path: PathStep[] | null, container: Element | null): Element | null {
    let current: Element | null = container;

    for (const step of path || []) {
        if (!current) return null;
        const children = Array.from(current.children);
        current = children[step.index] || null;
    }

    return current;
}

/**
 * Lee el texto editable de un elemento excluyendo hijos de control.
 * Espeja las ramas de updateElementText al ESCRIBIR: prefiere el span dedicado
 * (.tag-text / .list-text / .item-title + .item-content) y, si no hay ninguno pero
 * sí un botón de borrado, toma solo el primer nodo de texto. Como último recurso usa
 * el textContent completo (elementos sin controles internos, p.ej. spans simples).
 */
function getEditableText(element: Element): string {
    const tagText = element.querySelector('.tag-text');
    if (tagText) return tagText.textContent || '';

    const listText = element.querySelector('.list-text');
    if (listText) return listText.textContent || '';

    const itemTitle = element.querySelector('.item-title');
    const itemContent = element.querySelector('.item-content');
    if (itemTitle || itemContent) {
        return [itemTitle?.textContent || '', itemContent?.textContent || ''].join(' ').trim();
    }

    const deleteBtn = element.querySelector('.btn-delete-tag, .btn-delete-item');
    if (deleteBtn) {
        // Tiene botón de control pero no span dedicado: solo el primer nodo de texto.
        const firstText = element.childNodes[0];
        return firstText ? firstText.textContent || '' : '';
    }

    return element.textContent || '';
}

function updateElementText(element: Element, newText: string): void {
    const deleteBtn = element.querySelector('.btn-delete-tag, .btn-delete-item');
    const tagText = element.querySelector('.tag-text');
    const listText = element.querySelector('.list-text');
    const itemTitle = element.querySelector('.item-title');
    const itemContent = element.querySelector('.item-content');

    if (tagText) {
        tagText.textContent = newText;
    } else if (listText) {
        listText.textContent = newText;
    } else if (itemContent) {
        // Par título+contenido (job-detail): la lectura los unió con un espacio.
        // Escribimos la traducción en el contenido para no volcar la "×" ni duplicar.
        itemContent.textContent = newText;
    } else if (itemTitle) {
        itemTitle.textContent = newText;
    } else if (deleteBtn) {
        // Tiene botón pero no span específico: escribir SOLO en el primer nodo de texto
        // (espeja la lectura de getEditableText, que también toma childNodes[0]).
        const firstNode = element.childNodes[0];
        if (firstNode) firstNode.textContent = newText;
    } else {
        element.textContent = newText;
    }
}

export function markAsEdited(element: HTMLElement): void {
    if (state.editMode && !state.isTranslating) {
        state.editedElements.add(element);
    }
}
