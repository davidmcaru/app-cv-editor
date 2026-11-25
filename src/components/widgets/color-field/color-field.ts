type CFColorInput = HTMLInputElement & { _cfHex?: HTMLInputElement };

const isHex = (v: string): boolean => /^#[0-9a-fA-F]{6}$/.test(v);

const norm = (v: string): string => {
    v = (v || '').trim();
    if (v && v[0] !== '#') v = '#' + v;
    return v.toLowerCase();
};

/** Envuelve UN `<input type=color>` con su campo hex. Idempotente. */
export function enhanceColorField(input: HTMLInputElement): void {
    if (input.dataset.cfEnhanced) return;
    input.dataset.cfEnhanced = '1';

    const field = document.createElement('span');
    field.className = 'cf-field';
    input.parentNode?.insertBefore(field, input);

    const hex = document.createElement('input');
    hex.type = 'text';
    hex.className = 'cf-hex';
    hex.maxLength = 7;
    hex.spellcheck = false;
    hex.setAttribute('aria-label', 'Color hexadecimal');
    hex.value = input.value;
    field.appendChild(hex);

    field.appendChild(input);
    input.classList.add('cf-swatch');

    function setColor(v: string): void {
        v = norm(v);
        if (!isHex(v)) return;
        if (input.value.toLowerCase() !== v) {
            input.value = v;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        hex.value = v;
    }

    input.addEventListener('input', () => {
        hex.value = input.value;
    });
    input.addEventListener('change', () => {
        hex.value = input.value;
    });
    hex.addEventListener('input', () => {
        const v = norm(hex.value);
        if (isHex(v)) setColor(v);
    });
    hex.addEventListener('blur', () => {
        hex.value = input.value;
    });
    hex.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') hex.blur();
    });

    (input as CFColorInput)._cfHex = hex; // referencia para el sync periódico
}

/** Envuelve todos los `<input type=color>` de `root` (o el documento) sin envolver aún. */
export function enhanceColorFields(root: ParentNode = document): void {
    root.querySelectorAll<HTMLInputElement>('input[type="color"]:not([data-cf-enhanced])').forEach(enhanceColorField);
}

// Sync ligero: la app cambia input.value SIN disparar eventos (cargar prefs, cancelar…).
// Mantiene el campo Hex al día sin acoplarse al código de la app.
let syncTimer = 0;

function syncLoop(): void {
    document.querySelectorAll('input[type="color"][data-cf-enhanced]').forEach((input) => {
        const el = input as CFColorInput;
        const h = el._cfHex;
        if (h && h.value !== el.value && document.activeElement !== h) h.value = el.value;
    });
}

/** Arranca el refresco periódico del hex (idempotente). */
export function startColorFieldSync(intervalMs = 350): void {
    if (syncTimer) return;
    syncTimer = window.setInterval(syncLoop, intervalMs);
}
