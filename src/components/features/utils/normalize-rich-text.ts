function isBold(el: HTMLElement): boolean {
    const tag = el.tagName;
    if (tag === 'B' || tag === 'STRONG') return true;
    const fw = el.style.fontWeight;
    if (!fw) return false;
    if (fw === 'bold' || fw === 'bolder') return true;
    const n = parseInt(fw, 10);
    return Number.isFinite(n) && n >= 600;
}

function isItalic(el: HTMLElement): boolean {
    return el.tagName === 'I' || el.tagName === 'EM' || el.style.fontStyle === 'italic';
}

function isUnderline(el: HTMLElement): boolean {
    return el.tagName === 'U' || (el.style.textDecorationLine || el.style.textDecoration || '').includes('underline');
}

function wrap(node: Node, doc: Document, flags: { b: boolean; i: boolean; u: boolean }): Node {
    let out = node;
    if (flags.u) {
        const u = doc.createElement('u');
        u.appendChild(out);
        out = u;
    }
    if (flags.i) {
        const em = doc.createElement('i');
        em.appendChild(out);
        out = em;
    }
    if (flags.b) {
        const b = doc.createElement('b');
        b.appendChild(out);
        out = b;
    }
    return out;
}

/**
 * Normaliza el HTML de un fragmento editable: cada tramo con formato queda
 * expresado con `<b>/<i>/<u>` semánticos (sin `<span style>`), preservando el
 * resto del markup permitido. Los flags de formato se ACUMULAN por anidamiento.
 */
export function normalizeRichText(html: string): string {
    if (typeof html !== 'string' || !html) return '';
    const doc = document.implementation.createHTMLDocument('');
    const tpl = doc.createElement('template');
    tpl.innerHTML = html;

    function process(node: Node, inherited: { b: boolean; i: boolean; u: boolean }): Node[] {
        if (node.nodeType === Node.TEXT_NODE) {
            if (!node.textContent) return [];
            const text = doc.createTextNode(node.textContent);
            return [wrap(text, doc, inherited)];
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return [];

        const el = node as HTMLElement;
        const tag = el.tagName;

        // Elementos que aportan SOLO formato inline (b/i/u/strong/em, o span sin
        // clase — bare o solo con style): se disuelven en flags y se procesan sus
        // hijos; no se conserva el wrapper. Un <span class="…"> (tag-text, list-text,
        // item-title…) SÍ es estructural y se conserva.
        const spanAttrs = tag === 'SPAN' ? el.getAttributeNames() : [];
        const isFormatSpan = tag === 'SPAN' && spanAttrs.every((a) => a === 'style');
        const inlineFmt = tag === 'B' || tag === 'STRONG' || tag === 'I' || tag === 'EM' || tag === 'U' || isFormatSpan;

        const flags = {
            b: inherited.b || isBold(el),
            i: inherited.i || isItalic(el),
            u: inherited.u || isUnderline(el),
        };

        const childOut: Node[] = [];
        el.childNodes.forEach((child) => childOut.push(...process(child, inlineFmt ? flags : inherited)));

        if (inlineFmt) {
            return childOut;
        }

        const clone = el.cloneNode(false) as HTMLElement;
        childOut.forEach((c) => clone.appendChild(c));
        return [clone];
    }

    const result = doc.createElement('div');
    Array.from(tpl.content.childNodes).forEach((child) =>
        process(child, { b: false, i: false, u: false }).forEach((n) => result.appendChild(n))
    );
    return result.innerHTML;
}
