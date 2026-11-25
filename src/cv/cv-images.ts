import { state } from './cv-state.ts';
import { t } from './cv-i18n.ts';
import { isSafeUrl, safeUrl, validateImageFile, showToast, promptDialog } from './cv-utils.ts';

const imageMenu = (): HTMLElement | null => document.getElementById('imageOptionsMenu');
const fileInput = (): HTMLInputElement | null => document.getElementById('imageFileInput') as HTMLInputElement | null;

export function handleImageClick(event: Event, element: HTMLElement): void {
    // Prevenir navegación del enlace en modo edición
    if (state.editMode) {
        event.preventDefault();
        event.stopPropagation();
    } else {
        return; // Permitir navegación normal
    }

    state.currentImageElement = element;

    if (element.classList.contains('image-hidden')) {
        fileInput()?.click();
        return;
    }

    const menu = imageMenu();
    if (!menu) return;
    const rect = element.getBoundingClientRect();
    const menuHeight = 80; // Altura aproximada del menú
    const viewportHeight = window.innerHeight;

    // Calcular si hay espacio abajo, si no, mostrar arriba
    let topPos;
    if (rect.bottom + menuHeight + 10 > viewportHeight) {
        // No hay espacio abajo, mostrar arriba
        topPos = rect.top - menuHeight - 5;
    } else {
        topPos = rect.bottom + 5;
    }

    menu.style.top = topPos + 'px';
    menu.style.left = Math.max(10, rect.left + rect.width / 2 - 75) + 'px';
    menu.classList.add('visible');

    setTimeout(() => {
        document.addEventListener('click', closeImageMenuOnOutsideClick);
        // Passive; el `removeEventListener('scroll', closeImageMenu, true)` de
        // `closeImageMenu` sigue emparejando porque solo `capture` cuenta para el matching.
        window.addEventListener('scroll', closeImageMenu, { capture: true, passive: true });
    }, 10);
}

function closeImageMenuOnOutsideClick(e: Event): void {
    const menu = imageMenu();
    const target = e.target as HTMLElement;
    if (menu && !menu.contains(target) && !target.closest('.editable-image')) {
        closeImageMenu();
    }
}

export function closeImageMenu(): void {
    imageMenu()?.classList.remove('visible');
    document.removeEventListener('click', closeImageMenuOnOutsideClick);
    window.removeEventListener('scroll', closeImageMenu, true);
}

export function changeImage(): void {
    closeImageMenu();
    fileInput()?.click();
}

export async function editImageLink() {
    closeImageMenu();
    if (!state.currentImageElement) return;

    const currentUrl = state.currentImageElement.dataset.imageUrl || '';
    const newUrl = await promptDialog(t('dlgImageLinkMsg'), {
        defaultValue: currentUrl,
        okLabel: t('lblOk'),
        cancelLabel: t('lblCancel'),
        type: 'url',
        placeholder: 'https://',
    });

    if (newUrl !== null) {
        const trimmed = String(newUrl).trim();
        if (trimmed && !isSafeUrl(trimmed)) {
            showToast(t('toastInvalidUrl'), 'error');
            state.currentImageElement = null;
            return;
        }
        const imageType = state.currentImageElement.dataset.imageType;

        // La foto de perfil se envuelve por el div `.profile-photo-placeholder`; el QR por
        // el propio `<img class="qr-image">`. Cada uno usa su clase de enlace propia
        // (mismo patrón que cv-data-loader.generateImageWithOptionalLink).
        const selector = imageType === 'profile' ? '.profile-photo-placeholder' : '.qr-image';
        const linkClass = imageType === 'profile' ? 'profile-photo-link' : 'qr-image-link';

        if (imageType === 'profile' || imageType === 'qr') {
            document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
                applyImageLink(el, trimmed, linkClass);
            });
        }
    }

    state.currentImageElement = null;
}

/**
 * Aplica el enlace editable a una imagen:
 *  - URL vacía → DESENVUELVE el `<a data-image-link>` si existe (sin dejar href="").
 *  - URL con valor y sin enlace previo → CREA el `<a>` envolviendo la imagen.
 *  - URL con valor y enlace previo → actualiza el href y target/rel según el esquema.
 */
function applyImageLink(imgEl: HTMLElement, rawUrl: string, linkClass: string): void {
    const trimmed = String(rawUrl || '').trim();
    imgEl.dataset.imageUrl = trimmed;

    const parentLink = imgEl.closest('a[data-image-link]');
    const isHttp = trimmed.startsWith('http://') || trimmed.startsWith('https://');
    const safe = safeUrl(trimmed);

    // Sin URL: quitar el enlace por completo (no dejar href="" + target=_blank colgando).
    if (!trimmed) {
        if (parentLink && parentLink.parentNode) {
            parentLink.parentNode.insertBefore(imgEl, parentLink);
            parentLink.remove();
        }
        return;
    }

    let link = parentLink;
    if (!link) {
        link = document.createElement('a');
        link.setAttribute('data-image-link', '');
        if (linkClass) link.className = linkClass;
        if (imgEl.parentNode) {
            imgEl.parentNode.insertBefore(link, imgEl);
            link.appendChild(imgEl);
        }
    }

    link.setAttribute('href', safe);
    if (isHttp) {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
    } else {
        link.removeAttribute('target');
        link.removeAttribute('rel');
    }
}

// Restaura la imagen por defecto definida en cvData (foto perfil o QR).
export function restoreDefaultImage() {
    closeImageMenu();
    if (!state.currentImageElement) return;

    const imageType = state.currentImageElement.dataset.imageType;
    const data = state.activeData || state.baseData;

    // (Aquí había fallbacks a `data.profile.photo` y `data.qr` que NO podían existir:
    // `profile` es el TEXTO del perfil profesional ({ES,EN,DE}) y `qr` solo vive bajo
    // `personal`. Ramas muertas verificadas contra cv-pm/cv-qa.json y los datos
    // embebidos; las destapó el tipado al retirar el @ts-nocheck.)
    if (imageType === 'profile') {
        const defaultSrc = data?.personal?.photo || '';
        if (!defaultSrc) {
            showToast(t('toastNoDefaultPhoto'), 'warn');
            return;
        }
        document.querySelectorAll('.profile-photo-placeholder').forEach((el) => {
            el.classList.remove('image-hidden');
            const img = el.querySelector('img');
            if (img) img.src = defaultSrc;
        });
        showToast(t('toastPhotoRestored'), 'success');
    } else if (imageType === 'qr') {
        const defaultSrc = data?.personal?.qr || '';
        if (!defaultSrc) {
            showToast(t('toastNoDefaultQr'), 'warn');
            return;
        }
        document.querySelectorAll<HTMLImageElement>('.qr-image').forEach((img) => {
            img.classList.remove('image-hidden');
            img.src = defaultSrc;
        });
        showToast(t('toastQrRestored'), 'success');
    }

    state.currentImageElement = null;
}

export function removeImage() {
    closeImageMenu();
    if (!state.currentImageElement) return;

    const imageType = state.currentImageElement.dataset.imageType;

    if (imageType === 'profile') {
        document.querySelectorAll('.profile-photo-placeholder').forEach((el) => {
            el.classList.add('image-hidden');
        });
    } else if (imageType === 'qr') {
        document.querySelectorAll('.qr-image').forEach((el) => {
            el.classList.add('image-hidden');
        });
    }

    state.currentImageElement = null;
}

export function initImageUpload(): void {
    const input = fileInput();
    if (!input) return;
    input.addEventListener('change', function (e) {
        const target = e.target as HTMLInputElement;
        if (!state.currentImageElement || !target.files || !target.files[0]) return;

        const file = target.files[0];

        // Validar tipo y tamaño ANTES de leer el archivo.
        const check = validateImageFile(file);
        if (!check.ok) {
            showToast(check.reason || t('toastInvalidFile'), 'error');
            target.value = '';
            state.currentImageElement = null;
            return;
        }

        const reader = new FileReader();

        reader.onload = function (event) {
            // onload es ASÍNCRONO: releer currentImageElement aquí (no el capturado en el
            // change) mantiene la semántica de siempre, pero ya puede haberse limpiado.
            const current = state.currentImageElement;
            const result = event.target?.result;
            if (!current || typeof result !== 'string') return;
            const imageType = current.dataset.imageType;

            if (imageType === 'profile') {
                document.querySelectorAll('.profile-photo-placeholder').forEach((el) => {
                    el.classList.remove('image-hidden');
                    const img = el.querySelector('img');
                    if (img) img.src = result;
                });
            } else if (imageType === 'qr') {
                document.querySelectorAll<HTMLImageElement>('.qr-image').forEach((img) => {
                    img.classList.remove('image-hidden');
                    img.src = result;
                });
            }

            state.currentImageElement = null;
        };

        reader.readAsDataURL(file);

        // Limpiar el input para permitir seleccionar el mismo archivo de nuevo
        target.value = '';
    });
}

// Solo `cvData` se sigue exponiendo via window porque cv-data-loader/cv-edit-mode
// ya viven con esa convención. Los handlers de menu se enlazan en cv-event-bindings.js.
