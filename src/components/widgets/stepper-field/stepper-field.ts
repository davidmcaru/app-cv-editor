let installed = false;

/** Nº de decimales implícito en el `step` (p.ej. "0.05" → 2) para evitar drift de coma flotante. */
function decimalsOf(step: number): number {
    if (!Number.isFinite(step)) return 0;
    const s = String(step);
    const dot = s.indexOf('.');
    return dot === -1 ? 0 : s.length - dot - 1;
}

function adjust(input: HTMLInputElement, delta: number): void {
    const step = parseFloat(input.step) || 1;
    const min = input.min !== '' ? parseFloat(input.min) : -Infinity;
    const max = input.max !== '' ? parseFloat(input.max) : Infinity;
    const raw = (parseFloat(input.value) || 0) + delta * step;
    const clamped = Math.min(max, Math.max(min, raw));
    const next = parseFloat(clamped.toFixed(decimalsOf(step)));
    if (String(next) === input.value) return;
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

export function enhanceStepperFields(): void {
    if (installed) return;
    installed = true;
    document.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const btn = target.closest<HTMLElement>('[data-stepper-adjust]');
        if (!btn) return;
        const stepper = btn.closest('.edt-stepper');
        const input = stepper?.querySelector<HTMLInputElement>('input[type="number"]');
        if (!input) return;
        const delta = parseFloat(btn.dataset.stepperAdjust || '0');
        if (!delta) return;
        adjust(input, delta);
    });
}
