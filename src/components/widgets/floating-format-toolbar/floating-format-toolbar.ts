export type FormatCommand = 'bold' | 'italic' | 'underline';

export interface FloatingFormatToolbarOptions {
    commands?: FormatCommand[];
    /**
     * Restringe la toolbar a selecciones dentro de este contenedor (evita que
     * aparezca en otros contenteditable de la página). Elemento o getter (útil si
     * el contenedor cambia, p. ej. el árbol de idioma activo). Default: cualquier
     * [contenteditable] del documento.
     */
    root?: HTMLElement | (() => HTMLElement | null) | null;
    debounceMs?: number;
    // Getter y no valor: se lee cada vez que la barra aparece, así sigue al idioma de la app sin rehacerla
    labels?: () => Partial<Record<FormatCommand | 'toolbar', string>>;
}

export interface FloatingFormatToolbar {
    activate: () => void;
    deactivate: () => void;
    destroy: () => void;
}

const CMD_LABEL: Record<FormatCommand, { html: string; title: string; cls: string }> = {
    bold: { html: '<b>B</b>', title: 'Negrita', cls: 'fmt-bold' },
    italic: { html: '<i>I</i>', title: 'Cursiva', cls: 'fmt-italic' },
    underline: { html: '<u>U</u>', title: 'Subrayado', cls: 'fmt-underline' },
};

export function createFloatingFormatToolbar(options: FloatingFormatToolbarOptions = {}): FloatingFormatToolbar {
    const commands = options.commands || ['bold', 'italic', 'underline'];
    const debounceMs = typeof options.debounceMs === 'number' ? options.debounceMs : 120;

    let toolbar: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let composing = false;
    let controller: AbortController | null = null;

    const resolveRoot = (): HTMLElement | Document => {
        const r = typeof options.root === 'function' ? options.root() : options.root;
        return r || document;
    };

    function build(): HTMLElement {
        if (toolbar) return toolbar;
        const el = document.createElement('div');
        el.className = 'floating-format-toolbar';
        el.setAttribute('role', 'toolbar');
        el.setAttribute('aria-label', 'Formato de texto');

        commands.forEach((cmd, i) => {
            if (i > 0) {
                const sep = document.createElement('div');
                sep.className = 'fmt-separator';
                el.appendChild(sep);
            }
            const meta = CMD_LABEL[cmd];
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `fmt-btn ${meta.cls}`;
            btn.innerHTML = meta.html;
            btn.title = meta.title;
            btn.setAttribute('aria-label', meta.title);
            btn.dataset.command = cmd;
            // mousedown/touchend + preventDefault: aplica sin perder la selección.
            const apply = (e: Event) => {
                e.preventDefault();
                e.stopPropagation();
                applyFormat(cmd);
            };
            btn.addEventListener('mousedown', apply);
            btn.addEventListener('touchend', apply);
            el.appendChild(btn);
        });

        document.body.appendChild(el);
        toolbar = el;
        return el;
    }

    function applyLabels(bar: HTMLElement): void {
        const labels = options.labels ? options.labels() : {};
        bar.setAttribute('aria-label', labels.toolbar || 'Formato de texto');
        bar.querySelectorAll<HTMLElement>('.fmt-btn').forEach((btn) => {
            const cmd = btn.dataset.command as FormatCommand;
            const text = labels[cmd] || CMD_LABEL[cmd].title;
            btn.title = text;
            btn.setAttribute('aria-label', text);
        });
    }

    function applyFormat(command: FormatCommand): void {
        try {
            document.execCommand('styleWithCSS', false, 'false');
        } catch (_e) {
            /* algunos navegadores no lo soportan; execCommand sigue funcionando */
        }
        document.execCommand(command, false);
        updateState();
    }

    function updateState(): void {
        if (!toolbar) return;
        toolbar.querySelectorAll<HTMLElement>('.fmt-btn').forEach((btn) => {
            const cmd = btn.dataset.command;
            let active = false;
            try {
                active = !!cmd && document.queryCommandState(cmd);
            } catch (_e) {
                /* queryCommandState no disponible → sin estado activo */
            }
            btn.classList.toggle('active', active);
        });
    }

    function editableFromSelection(sel: Selection): Element | null {
        const anchor = sel.anchorNode;
        const anchorEl =
            anchor && anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement : (anchor as Element | null);
        const editable = anchorEl && anchorEl.closest ? anchorEl.closest('[contenteditable="true"]') : null;
        if (!editable) return null;
        const root = resolveRoot();
        if (root !== document && root instanceof HTMLElement && !root.contains(editable)) return null;
        return editable;
    }

    function show(): void {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return hide();
        if (!editableFromSelection(sel)) return hide();

        const bar = build();
        applyLabels(bar);
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        const isTouch = window.matchMedia('(pointer: coarse)').matches;

        let top = isTouch ? rect.bottom + window.scrollY + 10 : rect.top + window.scrollY - bar.offsetHeight - 10;
        let left = rect.left + window.scrollX + rect.width / 2 - bar.offsetWidth / 2;

        const vw = window.innerWidth;
        if (left < 8) left = 8;
        if (left + bar.offsetWidth > vw - 8) left = vw - bar.offsetWidth - 8;

        if (!isTouch && top < window.scrollY + 8) {
            top = rect.bottom + window.scrollY + 10;
            bar.classList.add('below');
        } else if (isTouch && top + bar.offsetHeight > window.scrollY + window.innerHeight - 8) {
            top = rect.top + window.scrollY - bar.offsetHeight - 10;
            bar.classList.remove('below');
        } else if (isTouch) {
            bar.classList.add('below');
        } else {
            bar.classList.remove('below');
        }

        bar.style.top = top + 'px';
        bar.style.left = left + 'px';
        bar.classList.add('visible');
        updateState();
    }

    function hide(): void {
        if (toolbar) toolbar.classList.remove('visible');
    }

    function onOutsideDismiss(e: Event): void {
        const target = e.target as HTMLElement | null;
        if (
            toolbar &&
            !toolbar.contains(target) &&
            !(target && target.closest && target.closest('[contenteditable="true"]'))
        ) {
            hide();
        }
    }

    return {
        activate() {
            if (controller) return; // idempotente
            controller = new AbortController();
            const { signal } = controller;
            document.addEventListener(
                'selectionchange',
                () => {
                    if (composing) return; // no tapar la ventana de candidatos IME
                    clearTimeout(timer ?? undefined);
                    timer = setTimeout(show, debounceMs);
                },
                { signal }
            );
            document.addEventListener('compositionstart', () => (composing = true), { signal });
            document.addEventListener('compositionend', () => (composing = false), { signal });
            document.addEventListener('mousedown', onOutsideDismiss, { signal });
            document.addEventListener('touchstart', onOutsideDismiss, { passive: true, signal });
            window.addEventListener('scroll', hide, { passive: true, signal });
            window.addEventListener('resize', hide, { signal });
        },
        deactivate() {
            if (controller) {
                controller.abort();
                controller = null;
            }
            clearTimeout(timer ?? undefined);
            hide();
        },
        destroy() {
            this.deactivate();
            if (toolbar) {
                toolbar.remove();
                toolbar = null;
            }
        },
    };
}
