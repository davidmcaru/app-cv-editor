// @ts-check
import { test, expect } from '@playwright/test';

const EDITOR_URL = '/';

// Abre "Mis CVs" por la vía visible en el viewport actual: botón de la barra en
// escritorio/tablet; en móvil (≤728) el botón salió de la barra y vive como fila del
// "Más", así que se entra por ahí. OJO: decide con un
// poll, no con isVisible() instantáneo — al cerrarse el panel anterior la toolbar está
// oculta un frame (body.cv-panel-open cae en el subscriber) y un check sin espera
// elegía la vía equivocada para siempre.
async function openMyCvs(page) {
    const panel = page.locator('#myCvsPanel');
    if (await panel.isVisible()) return;
    const toggle = page.locator('#myCvsToggle');
    const masToggle = page.locator('#cvMasToggle');
    let via = null;
    await expect
        .poll(async () => {
            if (await toggle.isVisible()) return (via = 'barra');
            if (await masToggle.isVisible()) return (via = 'mas');
            return null;
        })
        .not.toBeNull();
    if (via === 'barra') {
        await toggle.click();
    } else {
        await masToggle.click();
        await page.locator('#cvMasPanel [data-mas-action="mycvs"]').click();
    }
    await expect(panel).toBeVisible();
}

// Cambia de plantilla vía las tarjetas del panel "Mis CVs" y lo cierra. Las
// plantillas son cards de la cuadrícula (data-action="profile"); en el escaparate solo se
// muestran en "escaparate" (sin CV propio persistido).
async function switchProfile(page, id) {
    await openMyCvs(page);
    await page.locator(`#myCvsList .cv-mycvs-tpl [data-action="profile"][data-profile="${id}"]`).click();
    await page.locator('#myCvsSaveConfirmBtn').click();
    await expect(page.locator('#myCvsPanel')).toBeHidden();
}

test.describe('CV Editor - perfiles', () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies();
    });

    test('panel Mis CVs: los perfiles como tarjetas, el primero activo', async ({ page }) => {
        await page.goto(EDITOR_URL);
        await expect(page.locator('body.page-ready')).toBeVisible();
        await openMyCvs(page);
        const panel = page.locator('#myCvsPanel');
        await expect(panel).toBeVisible();
        await expect(panel.locator('.cv-mycvs-tpl.is-applied [data-profile="lucia"]')).toBeVisible();
        await expect(panel.locator('.cv-mycvs-tpl [data-profile="jonas"]')).toBeVisible();
    });

    test('cambiar de perfil actualiza el CV en caliente', async ({ page }) => {
        await page.goto(EDITOR_URL);
        await expect(page.locator('#cv-es')).toContainText(/Frontend/i);
        await switchProfile(page, 'jonas');
        await expect(page.locator('#cv-es')).toContainText(/Data Engineer/i);
    });

    test('alternar los perfiles aplica el tema de cada uno', async ({ page }) => {
        await page.goto(EDITOR_URL);
        await expect(page.locator('body.page-ready')).toBeVisible();

        await expect(page.locator('body')).toHaveClass(/theme-purple/);

        await switchProfile(page, 'jonas');
        await expect(page.locator('#cv-es')).toContainText(/Data Engineer/i);
        await expect(page.locator('body')).toHaveClass(/theme-dark-ocean/);

        await switchProfile(page, 'lucia');
        await expect(page.locator('#cv-es')).toContainText(/Frontend/i);
        await expect(page.locator('body')).toHaveClass(/theme-purple/);
    });
});

test.describe('CV Editor - arranque', () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies();
    });

    test('arranca con el primer perfil y la descarga habilitada', async ({ page }) => {
        await page.goto(EDITOR_URL);
        await expect(page.locator('body.page-ready')).toBeVisible();
        await expect(page.locator('#cv-es')).toContainText(/Frontend/i);
        await expect(page.locator('#downloadBtn')).not.toHaveClass(/disabled/);
    });

    test('el perfil elegido se mantiene al recargar', async ({ page }) => {
        await page.goto(EDITOR_URL);
        await expect(page.locator('body.page-ready')).toBeVisible();
        await switchProfile(page, 'jonas');
        await expect(page.locator('#cv-es')).toContainText(/Data Engineer/i);
        await page.reload();
        await expect(page.locator('body.page-ready')).toBeVisible();
        await expect(page.locator('#cv-es')).toContainText(/Data Engineer/i);
        await expect(page.locator('#downloadBtn')).not.toHaveClass(/disabled/);
    });
});

test.describe('CV Editor - idiomas', () => {
    test('lazy render: EN/DE pendientes hasta cambio de idioma', async ({ page }) => {
        await page.goto(EDITOR_URL);
        await expect(page.locator('body.page-ready')).toBeVisible();
        const activeChildren = await page.locator('#cv-es').evaluate((el) => el.children.length);
        expect(activeChildren).toBeGreaterThan(0);
        await expect(page.locator('#cv-en')).toHaveAttribute('data-lang-pending', 'EN');
        await expect(page.locator('#cv-de')).toHaveAttribute('data-lang-pending', 'DE');
        await page.locator('#langToggle').click();
        await expect(page.locator('#cv-en')).not.toHaveAttribute('data-lang-pending', 'EN');
    });
});

test.describe('CV Editor - accesibilidad', () => {
    test('aria-live presente', async ({ page }) => {
        await page.goto(EDITOR_URL);
        await expect(page.locator('#cvA11yLive')).toHaveAttribute('aria-live', 'polite');
    });
});

/* Ciclo núcleo editar → guardar → recargar → restaurar */

// Arranque limpio y determinista: storage vacío + consentimiento de traducción DENEGADO
// (sin diálogo de consentimiento ni llamadas a la API externa MyMemory durante los tests).
async function _boot(page, url) {
    await page.goto(url);
    await page.evaluate(() => {
        localStorage.clear();
        localStorage.setItem('cv-translation-consent', 'denied');
    });
    await page.reload();
    await expect(page.locator('body.page-ready')).toBeVisible();
}

// Arranque limpio en ESCRITORIO: estos tests cubren comportamiento de escritorio. En el proyecto
// Mobile Safari se SALTAN: forzar 1440px en un dispositivo táctil es un híbrido irreal que
// no añade cobertura (Desktop Chrome ya los corre) y era flaky bajo la carga de la suite
// (cada ejecución fallaba un subconjunto distinto). La cobertura móvil real (barra + Más +
// sheet arrastrable + T2) la dan los tests que usan bootCleanMobile.
async function bootClean(page, url = EDITOR_URL) {
    test.skip(
        test.info().project.name === 'Mobile Safari',
        'comportamiento de escritorio: cubierto por Desktop Chrome'
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await _boot(page, url);
}

/** Arranque limpio en MÓVIL (390×844): para los tests del chrome móvil. */
async function bootCleanMobile(page, url = EDITOR_URL) {
    await page.setViewportSize({ width: 390, height: 844 });
    await _boot(page, url);
}

// Edita el primer nodo editable del CV activo disparando el flujo real del editor
// (input event → markAsEdited). Evita atajos de teclado (frágiles en Mobile Safari).
async function editFirstEditable(page, newText) {
    await page
        .locator('#cv-es [contenteditable="true"]')
        .first()
        .evaluate((el, text) => {
            el.focus();
            el.textContent = text;
            el.dispatchEvent(new InputEvent('input', { bubbles: true }));
            el.blur();
        }, newText);
}

function readSnapshotRaw(page) {
    return page.evaluate(() => {
        const key = Object.keys(localStorage).find((k) => k.startsWith('cv-editor-local-snapshot-v3'));
        return key ? localStorage.getItem(key) : null;
    });
}

test.describe('CV Editor - ciclo editar/guardar/restaurar', () => {
    test('editar → guardar persiste el snapshot y la recarga lo restaura', async ({ page }) => {
        await bootClean(page);
        await expect(page.locator('#cv-es')).toContainText(/Frontend/i);

        await page.locator('#textToggle').click();
        await expect(page.locator('body.edit-mode')).toBeVisible();
        await expect(page.locator('#textSaveBtn')).toBeEnabled();

        await editFirstEditable(page, 'Nombre E2E Guardado');
        await page.locator('#textSaveBtn').click();

        // Guardar sale de edición y persiste
        await expect(page.locator('body')).not.toHaveClass(/edit-mode/);
        await expect(page.locator('#cv-es')).toContainText('Nombre E2E Guardado');
        await expect(page.locator('#downloadBtn')).not.toHaveClass(/disabled/);
        expect(await readSnapshotRaw(page)).not.toBeNull();

        // La recarga restaura el snapshot del usuario, no el CV de muestra
        await page.reload();
        await expect(page.locator('body.page-ready')).toBeVisible();
        await expect(page.locator('#cv-es')).toContainText('Nombre E2E Guardado');
        await expect(page.locator('#downloadBtn')).not.toHaveClass(/disabled/);
    });

    test('Cancelar restaura el estado previo a la edición sin persistir nada', async ({ page }) => {
        await bootClean(page);
        await expect(page.locator('#cv-es')).toContainText(/Frontend/i);

        await page.locator('#textToggle').click();
        await expect(page.locator('body.edit-mode')).toBeVisible();
        await editFirstEditable(page, 'Texto que debe descartarse');

        await page.locator('#textCancelBtn').click();
        await expect(page.locator('body')).not.toHaveClass(/edit-mode/);

        await expect(page.locator('#cv-es')).toContainText(/Frontend/i);
        await expect(page.locator('#cv-es')).not.toContainText('Texto que debe descartarse');
        expect(await readSnapshotRaw(page)).toBeNull();
    });

    test('un snapshot manipulado en localStorage se sanea al restaurar (sin XSS)', async ({ page }) => {
        await bootClean(page);

        // Forjar un snapshot válido en FORMA pero con payloads XSS en el HTML
        await page.evaluate(() => {
            const malicious = {
                version: 2,
                timestamp: Date.now(),
                currentLang: 'ES',
                currentThemeIndex: 0,
                currentFormat: 0,
                downloadEnabled: true,
                isOwnerView: false,
                cvs: {
                    ES:
                        '<img src="x" onerror="window.__xss=1" />' +
                        '<script>window.__xss=2;</script>' +
                        '<a href="javascript:window.__xss=3">enlace</a>' +
                        '<b>contenido-superviviente</b>',
                    EN: '<b>en</b>',
                    DE: '<b>de</b>',
                },
            };
            localStorage.setItem('cv-editor-local-snapshot-v3:full:lucia', JSON.stringify(malicious));
        });

        await page.reload();
        await expect(page.locator('body.page-ready')).toBeVisible();

        // El contenido legítimo sobrevive; los vectores XSS no
        await expect(page.locator('#cv-es')).toContainText('contenido-superviviente');
        expect(await page.evaluate(() => window.__xss)).toBeUndefined();
        expect(await page.locator('#cv-es script').count()).toBe(0);
        expect(await page.locator('#cv-es [onerror]').count()).toBe(0);
        expect(await page.locator('#cv-es a[href^="javascript:"]').count()).toBe(0);
    });

    test('design picker: Guardar confirma el tema; Cancelar restaura el de apertura', async ({ page }) => {
        await bootClean(page);
        await expect(page.locator('body')).toHaveClass(/theme-purple/);

        // Abrir Diseño y elegir otra paleta (preview en vivo)
        await page.locator('#designToggle').click();
        await expect(page.locator('#designPickerPanel')).toBeVisible();
        await page.locator('#designThemeSwatches .cv-design-theme-swatch:not(.active)').first().click();
        const previewClass = await page.evaluate(() =>
            [...document.body.classList].find((c) => c.startsWith('theme-'))
        );
        expect(previewClass).toBeTruthy();
        expect(previewClass).not.toBe('theme-purple');

        // Guardar → panel cerrado y el tema elegido se queda
        await page.locator('#designSaveBtn').click();
        await expect(page.locator('#designPickerPanel')).toBeHidden();
        await expect(page.locator('body')).toHaveClass(new RegExp(previewClass));

        // Reabrir, cambiar de nuevo y CANCELAR → vuelve al tema confirmado
        await page.locator('#designToggle').click();
        await page.locator('#designThemeSwatches .cv-design-theme-swatch:not(.active)').first().click();
        await expect(page.locator('body')).not.toHaveClass(new RegExp(previewClass));
        await page.locator('#designCancelBtn').click();
        await expect(page.locator('#designPickerPanel')).toBeHidden();
        await expect(page.locator('body')).toHaveClass(new RegExp(previewClass));
    });

    test('design picker: click-fuera NO cierra; Escape y Cancelar cierran descartando el draft', async ({ page }) => {
        await bootClean(page);
        await expect(page.locator('body')).not.toHaveClass(/format-harvard/);

        await page.locator('#designToggle').click();
        await page.locator('#designFormatToggle').click();
        await expect(page.locator('body')).toHaveClass(/format-harvard/);

        // Click fuera NO cierra ni revierte
        await page.locator('#cv-container').click({ position: { x: 5, y: 5 } });
        await expect(page.locator('#designPickerPanel')).toBeVisible();
        await expect(page.locator('body')).toHaveClass(/format-harvard/);

        // Escape SÍ: cierra y descarta el draft (via closer del panel-store)
        await page.keyboard.press('Escape');
        await expect(page.locator('#designPickerPanel')).toBeHidden();
        await expect(page.locator('body')).not.toHaveClass(/format-harvard/);

        // Cancelar también: cierra y descarta
        await page.locator('#designToggle').click();
        await page.locator('#designFormatToggle').click();
        await expect(page.locator('body')).toHaveClass(/format-harvard/);
        await page.locator('#designCancelBtn').click();
        await expect(page.locator('#designPickerPanel')).toBeHidden();
        await expect(page.locator('body')).not.toHaveClass(/format-harvard/);
    });

    test('Escape en Textos = Cancelar REAL: sale de edición y Descargar reaparece', async ({ page }) => {
        await bootClean(page);

        // Entrar a Textos entra en edición; en edición Descargar se oculta por CSS
        // (body.edit-mode .download-btn { display: none }).
        await page.locator('#textToggle').click();
        await expect(page.locator('body')).toHaveClass(/edit-mode/);
        await expect(page.locator('#downloadBtn')).toBeHidden();

        // Escape debe pasar por el Cancelar real del panel (escape-closer), no por el
        // closer de exclusión que solo oculta: si no, quedabas en edit-mode sin panel
        // y sin botón Descargar.
        await page.keyboard.press('Escape');
        await expect(page.locator('#textPanel')).toBeHidden();
        await expect(page.locator('body')).not.toHaveClass(/edit-mode/);
        await expect(page.locator('#downloadBtn')).toBeVisible();
    });

    test('WYSIWYG: entrar en edición no desplaza el contenido ni un píxel', async ({ page }) => {
        await bootClean(page);

        // Entrar en edición (swap a datos genéricos) y medir geometría de referencia.
        // Esperar las webfonts ANTES de medir: bajo carga (suite en paralelo) llegaban
        // tarde y el swap de fuente movía la geometría entre la 1.ª y la 2.ª medición.
        await page.locator('#textToggle').click();
        await expect(page.locator('body.edit-mode')).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const measure = () =>
            page.evaluate(() => {
                const pick = (sel) => {
                    const el = document.querySelector(`#cv-es ${sel}`);
                    if (!el) return null;
                    const r = el.getBoundingClientRect();
                    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
                };
                return {
                    skill: pick('.skill-tag'),
                    li: pick('.sidebar-section ul.list-clean > li'),
                    punto: pick('ul.job-details > li'),
                    job: pick('.job-item'),
                };
            });
        const enEdicion = await measure();

        // Salir con Cancelar y medir lo mismo en vista: DEBE ser idéntico (±1px)
        await page.locator('#textCancelBtn').click();
        await expect(page.locator('body')).not.toHaveClass(/edit-mode/);
        await page.locator('#textToggle').click();
        await expect(page.locator('body.edit-mode')).toBeVisible();
        const otraVez = await measure();
        for (const key of Object.keys(enEdicion)) {
            expect(otraVez[key], `geometría de ${key}`).toEqual(enEdicion[key]);
        }

        // Y en edición NO hay botones DENTRO del contenido (chrome = overlays fuera de flujo)
        expect(await page.locator('#cv-es .skill-tag > button:not(.edt-crud-btn)').count()).toBe(0);
        expect(await page.locator('#cv-es .edt-crud-overlay').count()).toBeGreaterThan(0);
        await page.locator('#textCancelBtn').click();
        // En vista, cero chrome residual
        expect(await page.locator('#cv-es .edt-crud-overlay').count()).toBe(0);
    });

    test('añadir y eliminar ítems vía overlay se espeja a los 3 idiomas', async ({ page }) => {
        // bootClean fuerza escritorio: el panel Textos va a la izquierda y no tapa el
        // overlay de Experiencia (a la derecha).
        await bootClean(page);
        await page.locator('#textToggle').click();
        await expect(page.locator('body.edit-mode')).toBeVisible();

        // Usamos la sección Experiencia: su overlay se proyecta a la DERECHA. Añadir desde el "+".
        const expSection = page.locator('#cv-es .main-section[data-cv-section="experience"]');
        const jobsAntes = await expSection.locator('.job-item').count();
        await expSection.locator('> .edt-crud-overlay .edt-crud-btn').first().click();
        await expect(expSection.locator('.job-item')).toHaveCount(jobsAntes + 1);
        // Espejado a EN y DE
        await expect(page.locator('#cv-en .main-section[data-cv-section="experience"] .job-item')).toHaveCount(
            jobsAntes + 1
        );
        await expect(page.locator('#cv-de .main-section[data-cv-section="experience"] .job-item')).toHaveCount(
            jobsAntes + 1
        );

        // Eliminar esa experiencia desde su overlay (papelera, última acción del overlay del job-item)
        await expSection.locator('.job-item').last().locator('.edt-crud-btn').last().click();
        await expect(expSection.locator('.job-item')).toHaveCount(jobsAntes);
        await expect(page.locator('#cv-en .main-section[data-cv-section="experience"] .job-item')).toHaveCount(
            jobsAntes
        );

        await page.locator('#textCancelBtn').click();
    });

    test('el folio es SIEMPRE A4 en pantalla: no se alarga y avisa del desbordamiento en edición', async ({ page }) => {
        await bootClean(page);

        // Altura del folio activo (A4 en px) antes de desbordar
        const a4Height = await page.locator('#cv-es').evaluate((el) => el.clientHeight);
        // En VISTA el folio recorta (igual que el PDF de 1 cara)
        expect(await page.locator('#cv-es').evaluate((el) => getComputedStyle(el).overflow)).toBe('hidden');

        await page.locator('#textToggle').click();
        await expect(page.locator('body.edit-mode')).toBeVisible();
        await expect(page.locator('#cvA4OverflowWarning')).toBeHidden();
        // En EDICIÓN el desbordamiento se muestra fuera del folio para poder editarlo
        expect(await page.locator('#cv-es').evaluate((el) => getComputedStyle(el).overflow)).toBe('visible');

        // Inyectar contenido de sobra en un editable (flujo real: input event)
        await page
            .locator('#cv-es [contenteditable="true"]')
            .last()
            .evaluate((el) => {
                el.focus();
                el.textContent = 'Relleno de desbordamiento. '.repeat(400);
                el.dispatchEvent(new InputEvent('input', { bubbles: true }));
            });

        // El folio NO se alarga (decisión de producto: A4 exacto, WYSIWYG con el PDF de 1 cara)
        const heightAfter = await page.locator('#cv-es').evaluate((el) => el.clientHeight);
        expect(Math.abs(heightAfter - a4Height)).toBeLessThanOrEqual(2);
        // ...pero el contenido sobrante existe y sobresale del folio
        const scrollHeight = await page.locator('#cv-es').evaluate((el) => el.scrollHeight);
        expect(scrollHeight).toBeGreaterThan(a4Height + 50);

        // El chip de desbordamiento aparece en edición y Cancelar lo retira
        await expect(page.locator('#cvA4OverflowWarning')).toBeVisible();
        await page.locator('#textCancelBtn').click();
        await expect(page.locator('#cvA4OverflowWarning')).toBeHidden();
        // De vuelta en vista, el folio recorta de nuevo
        expect(await page.locator('#cv-es').evaluate((el) => getComputedStyle(el).overflow)).toBe('hidden');
    });

    test('panel Textos: cambiar tipografía persiste tras guardar→recargar', async ({ page }) => {
        await bootClean(page);
        // Toolbar reorganizado: sin Guardar/Cancelar sueltos; con Config y Textos
        await expect(page.locator('#cvToolbar #saveBtn')).toHaveCount(0);
        await expect(page.locator('#configToggle')).toBeVisible();
        await expect(page.locator('#textToggle')).toBeVisible();

        // Textos entra en edición y abre el panel
        await page.locator('#textToggle').click();
        await expect(page.locator('body.edit-mode')).toBeVisible();
        await expect(page.locator('#textPanel')).toBeVisible();

        // Elegir Merriweather en el <select> nativo (fuente de verdad del searchable-select,
        // oculto tras el enhance → set value + change por evaluate, no selectOption)
        await page.locator('#textFontSelect').evaluate((sel) => {
            sel.value = "'Merriweather', serif";
            sel.dispatchEvent(new Event('change', { bubbles: true }));
        });
        expect(
            await page
                .locator('.cv-container:not([hidden])')
                .evaluate((el) => getComputedStyle(el).getPropertyValue('--cv-font-family'))
        ).toContain('Merriweather'); // WebKit normaliza las comillas del custom property

        await page.locator('#textSaveBtn').click();
        await expect(page.locator('body')).not.toHaveClass(/edit-mode/);
        await page.reload();
        await expect(page.locator('body.page-ready')).toBeVisible();
        expect(
            await page
                .locator('.cv-container:not([hidden])')
                .evaluate((el) => getComputedStyle(el).getPropertyValue('--cv-font-family'))
        ).toContain('Merriweather'); // WebKit normaliza las comillas del custom property
    });

    test('panel Textos: tamaño Cuerpo escala en vivo, persiste y Restablecer estilos revierte', async ({ page }) => {
        await bootClean(page);
        const bodySize = () =>
            page.locator('.cv-container:not([hidden]) .profile-text').evaluate((el) => getComputedStyle(el).fontSize);
        const titleSize = () =>
            page.locator('.cv-container:not([hidden]) .header h1').evaluate((el) => getComputedStyle(el).fontSize);
        const base = await bodySize(); // 14px
        const baseTitle = await titleSize(); // 32px

        await page.locator('#textToggle').click();
        await expect(page.locator('#textPanel')).toBeVisible();

        // Subir el tamaño de Cuerpo en PUNTOS (stepper absoluto, base 13pt) → el cuerpo escala.
        await page.locator('#textSizeBody').fill('16');
        await page.locator('#textSizeBody').dispatchEvent('input');
        await expect.poll(async () => parseFloat(await bodySize()) > parseFloat(base)).toBe(true);
        expect(base).toBe('14px');
        const scaled = await bodySize();
        // El grupo Título es independiente: el h1 NO cambia al mover Cuerpo
        expect(await titleSize()).toBe(baseTitle);

        // Guardar + recargar: el tamaño persiste
        await page.locator('#textSaveBtn').click();
        await page.reload();
        await expect(page.locator('body.page-ready')).toBeVisible();
        expect(await bodySize()).toBe(scaled);

        // "Restablecer estilos" (en Config) resetea toda la config de texto EN VIVO → tamaño base.
        await page.locator('#configToggle').click();
        await expect(page.locator('#configPanel')).toBeVisible();
        await page.locator('#configResetStylesBtn').click();
        await expect.poll(bodySize).toBe('14px');
    });

    test('Config: "Restablecer estilos" es draft → Cancelar vuelve al estado de apertura', async ({ page }) => {
        await bootClean(page);
        const bodySize = () =>
            page.locator('.cv-container:not([hidden]) .profile-text').evaluate((el) => getComputedStyle(el).fontSize);
        // Fijar un tamaño de Cuerpo custom y guardarlo → queda como estado persistido.
        await page.locator('#textToggle').click();
        await expect(page.locator('#textPanel')).toBeVisible();
        await page.locator('#textSizeBody').fill('16');
        await page.locator('#textSizeBody').dispatchEvent('input');
        await page.locator('#textSaveBtn').click();
        const customSize = await bodySize();
        expect(parseFloat(customSize)).toBeGreaterThan(14);

        // Abrir Config y "Restablecer estilos": resetea EN VIVO a base…
        await page.locator('#configToggle').click();
        await expect(page.locator('#configPanel')).toBeVisible();
        await page.locator('#configResetStylesBtn').click();
        await expect.poll(bodySize).toBe('14px');

        // …pero Cancelar vuelve al estado de cuando se abrió el panel (el custom), NO al reset.
        await page.locator('#configCancelBtn').click();
        await expect.poll(bodySize).toBe(customSize);
    });

    // "Restablecer estilos" devuelve TODA la apariencia al default del CV activo, incluidos
    // paleta y formato: sin esto no había forma de volver al
    // diseño original conservando el texto ("Restaurar" borra el trabajo y recarga).
    test('"Restablecer estilos" devuelve paleta y formato al default del CV, sin tocar texto ni idioma', async ({
        page,
    }) => {
        await bootClean(page);
        const themeOf = () => page.evaluate(() => document.body.className.match(/theme-[a-z-]+/)?.[0] || '');
        const defaultTheme = await themeOf();
        expect(defaultTheme).toBeTruthy();

        // Ensuciar el diseño: otra paleta + otro formato, y editar el texto.
        await page.locator('#designToggle').click();
        await expect(page.locator('#designPickerPanel')).toBeVisible();
        await page.locator('#designThemeSwatches [role="radio"][aria-checked="false"]').first().click();
        await page.locator('#designFormatToggle').click(); // Moderno → Harvard
        await page.locator('#designSaveBtn').click();
        await expect(page.locator('body')).toHaveClass(/format-harvard/);
        const dirtyTheme = await themeOf();
        expect(dirtyTheme).not.toBe(defaultTheme);

        // Texto propio + idioma distinto: NINGUNO de los dos debe tocarse.
        await page.locator('#textToggle').click();
        await expect(page.locator('body.edit-mode')).toBeVisible();
        await editFirstEditable(page, 'MI TEXTO PROPIO');
        await page.locator('#textSaveBtn').click();
        await expect(page.locator('body')).not.toHaveClass(/edit-mode/);
        await page.locator('#langToggle').click(); // ES → EN
        await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('en');

        // Restablecer estilos + Guardar
        await page.locator('#configToggle').click();
        await expect(page.locator('#configPanel')).toBeVisible();
        await page.locator('#configResetStylesBtn').click();
        await page.locator('#configSaveBtn').click();

        // Paleta y formato vuelven al default del CV…
        await expect.poll(themeOf).toBe(defaultTheme);
        await expect(page.locator('body')).not.toHaveClass(/format-harvard|format-minimal|format-ats/);
        // …el texto sigue siendo el mío (se comprueba en el árbol ES, donde se editó: el
        // test corre con la traducción DENEGADA, así que EN/DE no lo reciben)…
        await expect(page.locator('#cv-es')).toContainText('MI TEXTO PROPIO');
        // …y el idioma NO se toca: es una preferencia del usuario, no un estilo.
        expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
    });

    test('"Restablecer estilos" es draft también para la PALETA: Cancelar la revierte', async ({ page }) => {
        await bootClean(page);
        const themeOf = () => page.evaluate(() => document.body.className.match(/theme-[a-z-]+/)?.[0] || '');

        // Elegir una paleta distinta a la del CV y guardarla → estado de partida.
        await page.locator('#designToggle').click();
        await page.locator('#designThemeSwatches [role="radio"][aria-checked="false"]').first().click();
        await page.locator('#designSaveBtn').click();
        const chosen = await themeOf();

        // Restablecer estilos cambia la paleta EN VIVO…
        await page.locator('#configToggle').click();
        await expect(page.locator('#configPanel')).toBeVisible();
        await page.locator('#configResetStylesBtn').click();
        await expect.poll(themeOf).not.toBe(chosen);

        // …y Cancelar la devuelve. Sin ampliar el draft a tema+formato, esto se quedaba
        // con la paleta reseteada: "editado ≠ revertible".
        await page.locator('#configCancelBtn').click();
        await expect.poll(themeOf).toBe(chosen);
    });

    test('stepper-field compartido: el botón + ajusta el interlineado numérico', async ({ page }) => {
        await bootClean(page);
        await page.locator('#configToggle').click();
        await expect(page.locator('#configPanel')).toBeVisible();
        const num = page.locator('#configLineHeight');
        await num.fill('1.4');
        await num.dispatchEvent('input');
        // Botón + del interlineado (su .edt-stepper contiene #configLineHeight) → +0.05
        await page.locator('.edt-stepper:has(#configLineHeight) [data-stepper-adjust="1"]').click();
        await expect(num).toHaveValue('1.45');
        expect(
            await page
                .locator('.cv-container:not([hidden])')
                .evaluate((el) => getComputedStyle(el).getPropertyValue('--cv-line-height').trim())
        ).toBe('1.45');
    });

    test('panel Config: color de panel aplica --sidebar-bg y elegir un diseño lo resetea', async ({ page }) => {
        await bootClean(page);
        await page.locator('#configToggle').click();
        await expect(page.locator('#configPanel')).toBeVisible();

        // Fijar el color de panel a rojo puro (el <input type=color> queda oculto tras el
        // color-field enhance → set value + input por evaluate)
        await page.locator('#configSidebarColor').evaluate((el) => {
            el.value = '#ff0000';
            el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        const sidebarOverride = () =>
            page.locator('.cv-container:not([hidden])').evaluate((el) => el.style.getPropertyValue('--sidebar-bg'));
        expect(await sidebarOverride()).toBe('#ff0000');

        // Guardar Config (no revierte) y elegir OTRO diseño → resetea los colores
        await page.locator('#configSaveBtn').click();
        await page.locator('#designToggle').click();
        await page.locator('#designThemeSwatches .cv-design-theme-swatch:not(.active)').first().click();
        await page.locator('#designSaveBtn').click();
        // El override de color de panel desaparece (vuelve al color del diseño)
        await expect.poll(sidebarOverride).toBe('');
    });

    test('panel Config: el fondo del folio es un color-field (cualquier color) y persiste', async ({ page }) => {
        await bootClean(page);
        await page.locator('#configToggle').click();
        await expect(page.locator('#configPanel')).toBeVisible();

        // Sin override, el campo muestra el fondo EFECTIVO de la plantilla (blanco en gold).
        await expect(page.locator('#configPageBgColor')).toHaveValue('#ffffff');

        // Elegir un color cualquiera → --cv-page-bg inline y el folio lo pinta.
        await page.locator('#configPageBgColor').evaluate((el) => {
            el.value = '#123456';
            el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        const pageBg = () =>
            page.locator('.cv-container:not([hidden])').evaluate((el) => el.style.getPropertyValue('--cv-page-bg'));
        expect(await pageBg()).toBe('#123456');
        expect(
            await page.locator('.cv-container:not([hidden])').evaluate((el) => getComputedStyle(el).backgroundColor)
        ).toBe('rgb(18, 52, 86)');

        await page.locator('#configSaveBtn').click();
        await page.reload();
        await expect(page.locator('body.page-ready')).toBeVisible();
        expect(await pageBg()).toBe('#123456');
    });

    test('panel Config: con tema OSCURO el campo Fondo es reactivo y su override SÍ se aplica', async ({ page }) => {
        await bootClean(page);
        // Tema oscuro: pinta el folio vía body.theme-dark-*.
        await page.locator('#designToggle').click();
        await expect(page.locator('#designPickerPanel')).toBeVisible();
        await page.locator('#designModeToggle').click();
        await page.locator('#designThemeSwatches .cv-design-theme-swatch:not(.active)').first().click();
        await page.locator('#designSaveBtn').click();
        await expect(page.locator('#designPickerPanel')).toBeHidden();

        const folioBg = () =>
            page.locator('.cv-container:not([hidden])').evaluate((el) => getComputedStyle(el).backgroundColor);
        const themeBg = await folioBg();
        expect(themeBg).not.toBe('rgb(255, 255, 255)');

        // El campo Fondo muestra reactivo el fondo del tema aplicado…
        await page.locator('#configToggle').click();
        await expect(page.locator('#configPanel')).toBeVisible();
        const themeHex = await page.evaluate((rgb) => {
            const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
            const to2 = (n) => parseInt(n, 10).toString(16).padStart(2, '0');
            return `#${to2(m[1])}${to2(m[2])}${to2(m[3])}`;
        }, themeBg);
        await expect(page.locator('#configPageBgColor')).toHaveValue(themeHex);

        // …y elegir otro color SÍ repinta el folio aunque el tema oscuro pinte el suyo.
        await page.locator('#configPageBgColor').evaluate((el) => {
            el.value = '#345678';
            el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await expect.poll(folioBg).toBe('rgb(52, 86, 120)');

        // Reinicio de la sección Página → vuelve al fondo del tema (y el campo lo refleja).
        await page.locator('[data-config-reset="colors"]').click();
        await expect.poll(folioBg).toBe(themeBg);
        await expect(page.locator('#configPageBgColor')).toHaveValue(themeHex);
    });

    test('panel Textos: color de Título aplica --cv-color-title en la columna principal', async ({ page }) => {
        await bootClean(page);
        await page.locator('#textToggle').click();
        await expect(page.locator('#textPanel')).toBeVisible();

        await page.locator('#textColorTitle').evaluate((el) => {
            el.value = '#ff0000';
            el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        // El h1 del header (grupo Título) toma el color override
        const h1Color = await page
            .locator('.cv-container:not([hidden]) .header h1')
            .evaluate((el) => getComputedStyle(el).color);
        expect(h1Color).toBe('rgb(255, 0, 0)');
    });

    test('panel Config: interlineado aplica en vivo SIN entrar en edición y persiste', async ({ page }) => {
        await bootClean(page);
        await page.locator('#configToggle').click();
        await expect(page.locator('#configPanel')).toBeVisible();
        // Config NO entra en modo edición
        await expect(page.locator('body')).not.toHaveClass(/edit-mode/);

        await page.locator('#configLineHeight').fill('1.8');
        await page.locator('#configLineHeight').dispatchEvent('input');
        expect(
            await page
                .locator('.cv-container:not([hidden])')
                .evaluate((el) => getComputedStyle(el).getPropertyValue('--cv-line-height').trim())
        ).toBe('1.8');

        await page.locator('#configSaveBtn').click();
        await page.reload();
        await expect(page.locator('body.page-ready')).toBeVisible();
        expect(
            await page
                .locator('.cv-container:not([hidden])')
                .evaluate((el) => getComputedStyle(el).getPropertyValue('--cv-line-height').trim())
        ).toBe('1.8');
    });

    test('toolbar flotante: negrita sobre la selección sobrevive a guardar→recargar', async ({ page }) => {
        await bootClean(page);
        await page.locator('#textToggle').click();
        await expect(page.locator('body.edit-mode')).toBeVisible();

        // Seleccionar las primeras palabras de un editable y aplicar negrita (flujo real
        // de la toolbar: styleWithCSS=false + execCommand('bold')), luego blur (normaliza)
        await page.evaluate(() => {
            const el = document.querySelector('#cv-es .profile-text[data-editable]');
            el.focus();
            const range = document.createRange();
            range.setStart(el.firstChild, 0);
            range.setEnd(el.firstChild, 12);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            document.execCommand('styleWithCSS', false, 'false');
            document.execCommand('bold', false);
            el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        });

        // Produce <b> semántico (no <span style>)
        expect(await page.locator('#cv-es .profile-text b').count()).toBe(1);

        await page.locator('#textSaveBtn').click();
        await expect(page.locator('body')).not.toHaveClass(/edit-mode/);

        // Sobrevive a recargar (restauración pasa por sanitizeCVHTML, que permite <b>)
        await page.reload();
        await expect(page.locator('body.page-ready')).toBeVisible();
        expect(await page.locator('#cv-es .profile-text b').count()).toBe(1);
        await expect(page.locator('#cv-es .profile-text b')).toHaveText('Ingeniera fr');
    });

    test('paste seguro: el HTML hostil pegado se sanea antes de insertarse', async ({ page }) => {
        await bootClean(page);
        await page.locator('#textToggle').click();
        await expect(page.locator('body.edit-mode')).toBeVisible();

        const result = await page.evaluate(() => {
            window.__xssPaste = 0;
            const el = document.querySelector('#cv-es .profile-text[data-editable]');
            el.textContent = '';
            el.focus();
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            const dt = new DataTransfer();
            dt.setData(
                'text/html',
                '<img src=x onerror="window.__xssPaste=1"><b>NEGRITA</b><script>window.__xssPaste=2</scr' + 'ipt> texto'
            );
            el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
            return {
                xss: window.__xssPaste,
                scripts: el.querySelectorAll('script').length,
                onerror: el.querySelectorAll('[onerror]').length,
                scriptTextLeaked: el.innerHTML.includes('__xssPaste'),
                bold: el.innerHTML.includes('<b>NEGRITA</b>'),
            };
        });

        expect(result.xss).toBe(0);
        expect(result.scripts).toBe(0);
        expect(result.onerror).toBe(0);
        expect(result.scriptTextLeaked).toBe(false);
        expect(result.bold).toBe(true);
    });

    test('cambiar idioma actualiza document.documentElement.lang', async ({ page }) => {
        await bootClean(page);
        expect(await page.evaluate(() => document.documentElement.lang)).toBe('es');
        await page.locator('#langToggle').click();
        await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('en');
        await page.locator('#langToggle').click();
        await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('de');
    });

    test('design picker: paleta como radiogroup + modo/formato como botones', async ({ page }) => {
        await bootClean(page);
        await page.locator('#designToggle').click();
        await expect(page.locator('#designPickerPanel')).toBeVisible();

        // Paleta = radiogroup con 6 temas y exactamente 1 marcado
        await expect(page.locator('#designThemeSwatches')).toHaveAttribute('role', 'radiogroup');
        await expect(page.locator('#designThemeSwatches [role="radio"]')).toHaveCount(6);
        await expect(page.locator('#designThemeSwatches [role="radio"][aria-checked="true"]')).toHaveCount(1);

        // Modo = flip-toggle Claro/Oscuro; Formato = botón que cicla los 4
        await expect(page.locator('#designModeToggle')).toBeVisible();
        await expect(page.locator('#designFormatToggle')).toBeVisible();
        // El formato cicla: 4 clics vuelven al inicio (Moderno, sin clase format-*)
        for (let i = 0; i < 4; i++) await page.locator('#designFormatToggle').click();
        await expect(page.locator('body')).not.toHaveClass(/format-harvard|format-minimal|format-ats/);

        // Elegir otra paleta mueve el aria-checked (y sigue habiendo solo uno)
        await page.locator('#designThemeSwatches [role="radio"][aria-checked="false"]').first().click();
        await expect(page.locator('#designThemeSwatches [role="radio"][aria-checked="true"]')).toHaveCount(1);
        // Cierre explícito
        await page.locator('#designCancelBtn').click();
    });

    test('formato ATS: las competencias no salen con dos viñetas, los idiomas siguen separados', async ({ page }) => {
        await bootClean(page);
        await page.locator('#designToggle').click();
        // Moderno → Harvard → Minimal → ATS
        for (let i = 0; i < 3; i++) await page.locator('#designFormatToggle').click();
        await expect(page.locator('body')).toHaveClass(/format-ats/);

        const separador = (sel) =>
            page
                .locator(sel)
                .first()
                .evaluate((li) => getComputedStyle(li, '::after').content);
        // La competencia ya lleva «• » en su texto; el idioma no, y ahí el separador sí es una viñeta
        expect(await separador('#cv-es .sidebar .list-clean li:has(> .list-text)')).not.toContain('•');
        expect(await separador('#cv-es .sidebar .list-clean li:not(:has(> .list-text))')).toContain('•');
        await page.locator('#designCancelBtn').click();
    });

    test('descargar PDF usa nombre de archivo dinámico en el título y lo restaura', async ({ page }) => {
        await bootClean(page, EDITOR_URL);
        const originalTitle = await page.title();

        // Stub de window.print: captura el título en el momento de imprimir y dispara afterprint
        await page.evaluate(() => {
            window.__printCalls = [];
            window.print = () => {
                window.__printCalls.push(document.title);
                window.dispatchEvent(new Event('afterprint'));
            };
        });

        await page.locator('#downloadBtn').click();

        await expect.poll(() => page.evaluate(() => window.__printCalls.length)).toBe(1);
        const printedTitle = await page.evaluate(() => window.__printCalls[0]);
        // CV-{rol}-{idioma}-{formato}-{tema}
        expect(printedTitle).toMatch(/^CV-.+-ES-/);
        // afterprint restaura el título original (event-driven, sin timeout)
        await expect.poll(() => page.title()).toBe(originalTitle);
    });

    test('el nombre del PDF lleva el cargo que has escrito, no el de la plantilla', async ({ page }) => {
        await bootClean(page);
        await page.locator('#textToggle').click();
        await expect(page.locator('body.edit-mode')).toBeVisible();
        await page.locator('#cv-es .header h2[contenteditable="true"]').evaluate((el) => {
            el.focus();
            el.textContent = 'Product Designer';
            el.dispatchEvent(new InputEvent('input', { bubbles: true }));
            el.blur();
        });
        await page.locator('#textSaveBtn').click();
        await expect(page.locator('body')).not.toHaveClass(/edit-mode/);

        await page.evaluate(() => {
            window.__printCalls = [];
            window.print = () => {
                window.__printCalls.push(document.title);
                window.dispatchEvent(new Event('afterprint'));
            };
        });
        await page.locator('#downloadBtn').click();
        await expect.poll(() => page.evaluate(() => window.__printCalls.length)).toBe(1);
        expect(await page.evaluate(() => window.__printCalls[0])).toMatch(/^CV-Product-Designer-ES-/);
    });

    test('la barra de negrita, cursiva y subrayado habla el idioma del CV', async ({ page }) => {
        await bootClean(page);
        // El idioma, antes de entrar en edición: con el panel Textos abierto el botón no se ve
        await page.locator('#langToggle').click();
        await expect(page.locator('#cv-en')).toBeVisible();
        await page.locator('#textToggle').click();
        await expect(page.locator('body.edit-mode')).toBeVisible();

        await page.locator('#cv-en .profile-text[contenteditable="true"]').evaluate((el) => {
            el.focus();
            const rango = document.createRange();
            rango.selectNodeContents(el);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(rango);
        });
        const barra = page.locator('.floating-format-toolbar.visible');
        await expect(barra).toBeVisible();
        await expect(barra).toHaveAttribute('aria-label', 'Text formatting');
        await expect(barra.locator('.fmt-bold')).toHaveAttribute('title', 'Bold');
        await expect(barra.locator('.fmt-underline')).toHaveAttribute('aria-label', 'Underline');
    });

    // La barra se oculta con visibility y se queda donde apareció: si quedó más allá de los 794 px del folio, al imprimir
    // el navegador encogía el CV entero para que cupiera (al 71 % en una ventana de 1920 px)
    test('al imprimir, la barra de negrita no ocupa sitio: el CV no se encoge tras usarla en el perfil', async ({
        page,
    }) => {
        const erroresConsola = [];
        page.on('console', (msg) => msg.type() === 'error' && erroresConsola.push(msg.text()));
        const peticionesFallidas = [];
        page.on('requestfailed', (req) => {
            if (req.failure()?.errorText === 'net::ERR_ABORTED') return;
            peticionesFallidas.push(`${req.failure()?.errorText} — ${req.url()}`);
        });

        await bootClean(page);
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.locator('#textToggle').click();
        await expect(page.locator('body.edit-mode')).toBeVisible();
        await page.locator('#cv-es .profile-text[contenteditable="true"]').evaluate((el) => {
            el.focus();
            const rango = document.createRange();
            rango.selectNodeContents(el);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(rango);
        });
        const barra = page.locator('.floating-format-toolbar');
        await expect(barra).toHaveClass(/visible/);
        await page.locator('#textSaveBtn').click();
        await expect(page.locator('body')).not.toHaveClass(/edit-mode/);
        await expect(barra).not.toHaveClass(/visible/);
        // Oculta, sigue en la página y más allá del folio: el caso que encogía el PDF
        expect(await barra.evaluate((el) => el.getBoundingClientRect().right)).toBeGreaterThan(794);

        await page.emulateMedia({ media: 'print' });
        await expect(barra).toHaveCSS('display', 'none');
        expect(erroresConsola).toEqual([]);
        expect(peticionesFallidas).toEqual([]);
    });
});

test.describe('CV Editor - Mis CVs unificado', () => {
    const MK_CODE = `async function mkCode(json){const cs=new CompressionStream('deflate-raw');const w=cs.writable.getWriter();w.write(new TextEncoder().encode(json));w.close();const bytes=new Uint8Array(await new Response(cs.readable).arrayBuffer());let bin='';for(const b of bytes)bin+=String.fromCharCode(b);const b64=btoa(bin).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');let h=5381;for(let i=0;i<b64.length;i++)h=((h<<5)+h+b64.charCodeAt(i))>>>0;return 'CVD1.'+b64+'.'+h.toString(36);}`;

    async function currentCode(page) {
        return page.evaluate(async () => {
            const url =
                performance
                    .getEntriesByType('resource')
                    .map((r) => r.name)
                    .find((u) => u.includes('/cv/cv-share-code')) || '/src/cv/cv-share-code.ts';
            const mod = await import(url);
            return (await mod.encodeCurrent()).code;
        });
    }
    async function openPanel(page) {
        await openMyCvs(page);
        await expect(page.locator('#myCvsPanel')).toBeVisible();
    }
    async function fillPrompt(page, value) {
        const prompt = page.locator('.edt-dlg-overlay').filter({ has: page.locator('.edt-dlg__input') });
        await expect(prompt).toBeVisible();
        await prompt.locator('.edt-dlg__input').fill(value);
        await prompt.locator('.edt-dlg__ok').click();
    }
    async function importCode(page, code) {
        await page.locator('#myCvsImportBtn').click();
        await fillPrompt(page, code);
    }
    // Nombres del store (determinista; evita flakiness de visibilidad del panel).
    const storeNames = (page) =>
        page.evaluate(async () => {
            const url =
                performance
                    .getEntriesByType('resource')
                    .map((r) => r.name)
                    .find((u) => u.includes('/cv/cv-saved.') && !u.includes('cv-saved-ui')) || '/src/cv/cv-saved.ts';
            return (await import(url)).CVSaved.list().map((e) => e.name);
        });

    // Cuota simulada y determinista: solo salta para la clave y el tope que el test fije en `window.__cuota`.
    async function simularCuota(page) {
        await page.addInitScript(() => {
            const setItem = Storage.prototype.setItem;
            Storage.prototype.setItem = function (key, value) {
                const cuota = /** @type {any} */ (window).__cuota;
                if (cuota && key === cuota.clave && String(value).length > cuota.tope) {
                    throw new DOMException('cuota simulada', 'QuotaExceededError');
                }
                return setItem.call(this, key, value);
            };
        });
    }

    test('códec round-trip: encode → decode reproduce el CV', async ({ page }) => {
        await bootClean(page);
        const r = await page.evaluate(async () => {
            const url =
                performance
                    .getEntriesByType('resource')
                    .map((x) => x.name)
                    .find((u) => u.includes('/cv/cv-share-code')) || '/src/cv/cv-share-code.ts';
            const mod = await import(url);
            const surl =
                performance
                    .getEntriesByType('resource')
                    .map((x) => x.name)
                    .find((u) => u.includes('/cv/cv-state')) || '/src/cv/cv-state.ts';
            const st = await import(surl);
            st.state.currentThemeIndex = 3;
            st.state.currentFormat = 2;
            const { code } = await mod.encodeCurrent();
            const res = await mod.decodeAndSanitize(code);
            return {
                fmt: /^CVD1\./.test(code) || /^CVU1\./.test(code),
                ok: res.ok,
                theme: res.ok ? res.payload.snapshot.currentThemeIndex : null,
                three:
                    res.ok &&
                    typeof res.payload.snapshot.cvs.EN === 'string' &&
                    res.payload.snapshot.cvs.ES.length > 50,
            };
        });
        expect(r.fmt).toBe(true);
        expect(r.ok).toBe(true);
        expect(r.theme).toBe(3);
        expect(r.three).toBe(true);
    });

    test('códec: prototype pollution bloqueado', async ({ page }) => {
        await bootClean(page);
        const r = await page.evaluate(async (mkSrc) => {
            eval(mkSrc);
            const url =
                performance
                    .getEntriesByType('resource')
                    .map((x) => x.name)
                    .find((u) => u.includes('/cv/cv-share-code')) || '/src/cv/cv-share-code.ts';
            const mod = await import(url);
            // eslint-disable-next-line no-undef
            const code = await mkCode('{"__proto__":{"polluted":true},"t":"999","c":{"e":"<b>x</b>","n":"","d":""}}');
            const res = await mod.decodeAndSanitize(code);
            return {
                ok: res.ok,
                polluted: {}.polluted !== undefined,
                theme: res.ok ? res.payload.snapshot.currentThemeIndex : null,
            };
        }, MK_CODE);
        expect(r.ok).toBe(true);
        expect(r.polluted).toBe(false);
        expect(r.theme).toBe(11);
    });

    test('XSS en un código importado se sanea al aplicar (en vivo)', async ({ page }) => {
        await bootClean(page);
        const code = await page.evaluate(async (mkSrc) => {
            eval(mkSrc);
            // eslint-disable-next-line no-undef
            return await mkCode(
                '{"c":{"e":"<script>window.__xss=1<\\/script><img src=x onerror=\\"window.__xss=1\\"><p>seguro-abc</p>","n":"<p>n</p>","d":"<p>d</p>"}}'
            );
        }, MK_CODE);
        await openPanel(page);
        await importCode(page, code);
        await expect(page.locator('#cv-es')).toContainText('seguro-abc');
        const html = await page.locator('#cv-es').innerHTML();
        expect(html).not.toContain('<script');
        expect(html).not.toContain('onerror');
        expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    });

    test('Compartir abre el diálogo con el código del CV actual y Cancelar cierra', async ({ page }) => {
        await bootClean(page);
        // Compartir requiere un CV propio (en escaparate está deshabilitado): importar uno.
        const code = await currentCode(page);
        await openPanel(page);
        await importCode(page, code);
        await expect(page.locator('#myCvsShareBtn')).toBeEnabled();
        await page.locator('#myCvsShareBtn').click();
        const prompt = page.locator('.edt-dlg-overlay').filter({ has: page.locator('.edt-dlg__input') });
        await expect(prompt).toBeVisible();
        await expect
            .poll(() => prompt.locator('.edt-dlg__input').inputValue())
            .toMatch(/^CV[DU]1\.[A-Za-z0-9_-]+\.[a-z0-9]+$/);
        // Solo lectura: es un código para copiar, no un campo editable.
        await expect(prompt.locator('.edt-dlg__input')).toHaveJSProperty('readOnly', true);
        // El botón Copiar va en el AZUL de "Añadir por código" (paridad de colores).
        await expect(prompt.locator('.edt-dlg__ok')).toHaveClass(/edt-saved-btn--blue/);
        await prompt.locator('.edt-dlg__cancel').click();
        await expect(prompt).toBeHidden();
    });

    test('importar por código SOLO aplica (habilita Guardar/Compartir; NO añade a la lista)', async ({ page }) => {
        test.slow(); // el paso final guarda desde la tarjeta (captura miniatura html-to-image)
        await bootClean(page);
        const code = await currentCode(page);
        await openPanel(page);
        await importCode(page, code);
        // Tras importar (draft): la tarjeta "+ Guardar CV" y Compartir se habilitan.
        await expect(page.locator('#myCvsList .edt-saved-card--add .edt-saved-card__apply')).toBeEnabled();
        await expect(page.locator('#myCvsShareBtn')).toBeEnabled();
        // Opción A: importar NO añade a la lista — guardar es la tarjeta "+".
        expect((await storeNames(page)).length).toBe(0);
        // Guardar ahora sí lo añade (flujo completo importar → guardar).
        await page.locator('#myCvsList .edt-saved-card--add .edt-saved-card__apply').click();
        await expect.poll(async () => (await storeNames(page)).length, { timeout: 45000 }).toBe(1);
    });

    test('Guardar CV (auto-nombre, sin prompt) → tarjeta en la cuadrícula y persiste tras recarga', async ({
        page,
    }) => {
        test.slow(); // captura de miniatura + recarga: lento en Mobile Safari bajo carga de la suite
        await bootClean(page);
        // Editar de verdad (flujo real: textToggle → input → Guardar del panel Textos).
        await page.locator('#textToggle').click();
        await expect(page.locator('body.edit-mode')).toBeVisible();
        await editFirstEditable(page, 'Nombre Guardar CV');
        await page.locator('#textSaveBtn').click();
        await expect(page.locator('body')).not.toHaveClass(/edit-mode/);
        await openPanel(page);
        const addBtn = page.locator('#myCvsList .edt-saved-card--add .edt-saved-card__apply');
        await expect(addBtn).toBeEnabled();
        await addBtn.click();
        // Sin prompt: auto-nombre (encabezado del CV) + miniatura best-effort (spinner en la tarjeta).
        await expect.poll(async () => (await storeNames(page)).length, { timeout: 45000 }).toBe(1);
        const savedName = (await storeNames(page))[0];
        // 1 card de guardado.
        await expect(
            page.locator('#myCvsList .edt-saved-card:not(.edt-saved-card--add):not(.cv-mycvs-tpl)')
        ).toHaveCount(1);
        await expect(page.locator('#myCvsList .edt-saved-card').first()).toHaveClass(/edt-saved-card--add/);
        // Esperar a que el toast desaparezca (en el bottom-sheet móvil tapa la toolbar).
        await expect(page.locator('.edt-toast')).toHaveCount(0, { timeout: 15000 });
        await page.reload();
        await expect(page.locator('body.page-ready')).toBeVisible();
        await openPanel(page);
        await expect(page.locator(`#myCvsList .edt-saved-card[title="${savedName}"]`)).toBeVisible();
    });

    test('cargar desde tarjeta aplica en vivo y resalta .is-applied', async ({ page }) => {
        await bootClean(page);
        // Sembrar una entrada con marcador propio directamente en el store.
        await page.evaluate(async () => {
            const surl =
                performance
                    .getEntriesByType('resource')
                    .map((r) => r.name)
                    .find((u) => u.includes('/cv/cv-controller')) || '/src/cv/cv-controller.ts';
            const ctrl = await import(surl);
            const url =
                performance
                    .getEntriesByType('resource')
                    .map((r) => r.name)
                    .find((u) => u.includes('/cv/cv-saved.') && !u.includes('cv-saved-ui')) || '/src/cv/cv-saved.ts';
            const mod = await import(url);
            const snap = ctrl.buildShareSnapshot();
            snap.cvs.ES = '<div class="header"><h1>MARCADOR-CARGA-555</h1></div>' + snap.cvs.ES;
            mod.CVSaved.add({ name: 'Sembrado', snapshot: snap, textConfig: null });
        });
        await openPanel(page);
        const card = page.locator('#myCvsList .edt-saved-card[title="Sembrado"]');
        await expect(card).toBeVisible();
        await card.locator('.edt-saved-card__apply').click();
        await expect(page.locator('#cv-es')).toContainText('MARCADOR-CARGA-555');
        await expect(page.locator('#myCvsList .edt-saved-card.is-applied')).toBeVisible();
        // Con el draft cargado, Compartir/Guardar se habilitan…
        await expect(page.locator('#myCvsShareBtn')).toBeEnabled();
        // …y clicar una plantillas de perfil la aplica EN DIRECTO, sin modal,
        // re-deshabilitando Guardar/Compartir (vuelves a plantilla limpia, nada propio).
        await page.locator('#myCvsList .cv-mycvs-tpl [data-profile="jonas"]').click();
        await expect(page.locator('#cv-es')).not.toContainText('MARCADOR-CARGA-555');
        expect(await page.locator('.edt-dlg-overlay.active, .edt-dlg-overlay:visible').count()).toBe(0);
        // En la versión completa Compartir y Guardar siguen habilitados: el CV del perfil también es tuyo
        await expect(page.locator('#myCvsShareBtn')).toBeEnabled();
        await expect(page.locator('#myCvsList .edt-saved-card--add .edt-saved-card__apply')).toBeEnabled();
    });

    test('borrar (con cancelar) un CV guardado', async ({ page }) => {
        await bootClean(page);
        // Sembrar dos entradas directamente en el store.
        await page.evaluate(async () => {
            const surl =
                performance
                    .getEntriesByType('resource')
                    .map((r) => r.name)
                    .find((u) => u.includes('/cv/cv-controller')) || '/src/cv/cv-controller.ts';
            const ctrl = await import(surl);
            const url =
                performance
                    .getEntriesByType('resource')
                    .map((r) => r.name)
                    .find((u) => u.includes('/cv/cv-saved.') && !u.includes('cv-saved-ui')) || '/src/cv/cv-saved.ts';
            const mod = await import(url);
            const snap = ctrl.buildShareSnapshot();
            const s2 = JSON.parse(JSON.stringify(snap));
            s2.cvs.ES = '<p>otro</p>' + s2.cvs.ES;
            mod.CVSaved.add({ name: 'CV A', snapshot: snap, textConfig: null });
            mod.CVSaved.add({ name: 'CV B', snapshot: s2, textConfig: null });
        });
        // Verificación por el STORE (determinista; evita flakiness de visibilidad del panel).
        const names = () => storeNames(page);
        await openPanel(page);
        // Cards de guardado.
        const saved = page.locator('#myCvsList .edt-saved-card:not(.edt-saved-card--add):not(.cv-mycvs-tpl)');
        const card = saved.first();
        await card.hover(); // las acciones de la tarjeta aparecen al hover
        // Borrar → Cancelar (queda: siguen las 2).
        await card.locator('button[data-action="delete"]').click();
        await page.locator('.edt-dlg__cancel').last().click();
        await expect.poll(async () => (await names()).length).toBe(2);
        // Borrar → Confirmar (se va una).
        await card.hover();
        await card.locator('button[data-action="delete"]').click();
        await page.locator('.edt-dlg__ok').click();
        await expect.poll(async () => (await names()).length).toBe(1);
        // Sin renombrar: la card no expone esa acción.
        expect(await saved.first().locator('button[data-action="rename"]').count()).toBe(0);
    });

    test('al abrir Añadir código o Borrar, el foco entra solo en el diálogo', async ({ page }) => {
        await bootClean(page);
        await page.evaluate(async () => {
            const surl =
                performance
                    .getEntriesByType('resource')
                    .map((r) => r.name)
                    .find((u) => u.includes('/cv/cv-controller')) || '/src/cv/cv-controller.ts';
            const ctrl = await import(surl);
            const url =
                performance
                    .getEntriesByType('resource')
                    .map((r) => r.name)
                    .find((u) => u.includes('/cv/cv-saved.') && !u.includes('cv-saved-ui')) || '/src/cv/cv-saved.ts';
            const mod = await import(url);
            mod.CVSaved.add({ name: 'Foco', snapshot: ctrl.buildShareSnapshot(), textConfig: null });
        });
        await openPanel(page);
        const dlg = page.locator('.edt-dlg-overlay');

        // Sin Tab ni clic dentro: lo pone el focus-trap compartido.
        await page.locator('#myCvsImportBtn').click();
        await expect(dlg.locator('.edt-dlg__input')).toBeFocused();
        await dlg.locator('.edt-dlg__cancel').click();
        await expect(dlg).toHaveCount(0);

        // Borrar es `danger`: el foco inicial va a Cancelar, para que Enter no borre por accidente.
        const card = page.locator('#myCvsList .edt-saved-card[title="Foco"]');
        await card.hover();
        await card.locator('button[data-action="delete"]').click();
        await expect(dlg.locator('.edt-dlg__cancel')).toBeFocused();
        await dlg.locator('.edt-dlg__cancel').click();
        await expect(dlg).toHaveCount(0);
    });

    test('cargar un CV guardado en inglés pasa a inglés también <html lang> y el título', async ({ page }) => {
        await bootClean(page);
        await page.evaluate(async () => {
            const surl =
                performance
                    .getEntriesByType('resource')
                    .map((r) => r.name)
                    .find((u) => u.includes('/cv/cv-controller')) || '/src/cv/cv-controller.ts';
            const ctrl = await import(surl);
            const url =
                performance
                    .getEntriesByType('resource')
                    .map((r) => r.name)
                    .find((u) => u.includes('/cv/cv-saved.') && !u.includes('cv-saved-ui')) || '/src/cv/cv-saved.ts';
            const mod = await import(url);
            const snap = ctrl.buildShareSnapshot();
            snap.currentLang = 'EN';
            mod.CVSaved.add({ name: 'Guardado-EN', snapshot: snap, textConfig: null });
        });
        expect(await page.evaluate(() => document.documentElement.lang)).toBe('es');
        await expect(page).toHaveTitle(/\(ES\)$/);

        await openPanel(page);
        await page.locator('#myCvsList .edt-saved-card[title="Guardado-EN"] .edt-saved-card__apply').click();
        await expect(page.locator('body')).toHaveClass(/lang-en/);
        await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('en');
        await expect(page).toHaveTitle(/\(EN\)$/);
    });

    test('Cancelar (footer) revierte un CV importado al estado de apertura', async ({ page }) => {
        test.slow();
        await bootClean(page);
        const code = await page.evaluate(async () => {
            const url =
                performance
                    .getEntriesByType('resource')
                    .map((x) => x.name)
                    .find((u) => u.includes('/cv/cv-share-code')) || '/src/cv/cv-share-code.ts';
            const mod = await import(url);
            const surl =
                performance
                    .getEntriesByType('resource')
                    .map((x) => x.name)
                    .find((u) => u.includes('/cv/cv-controller')) || '/src/cv/cv-controller.ts';
            const ctrl = await import(surl);
            const snap = ctrl.buildShareSnapshot();
            snap.cvs.ES = '<div class="header"><h1>MARCADOR-IMPORT-777</h1></div>' + snap.cvs.ES;
            return (await mod.encodeSnapshot(snap, null)).code;
        });
        await openPanel(page);
        await importCode(page, code);
        await expect(page.locator('#cv-es')).toContainText('MARCADOR-IMPORT-777');
        await expect(page.locator('.edt-toast')).toHaveCount(0, { timeout: 15000 });
        await page.locator('#myCvsCancelBtn').click();
        await expect(page.locator('#cv-es')).not.toContainText('MARCADOR-IMPORT-777');
    });

    test('dedupe por hash + tope 25 (store)', async ({ page }) => {
        await bootClean(page);
        const res = await page.evaluate(async () => {
            localStorage.removeItem('cv-saved-v1');
            const surl =
                performance
                    .getEntriesByType('resource')
                    .map((r) => r.name)
                    .find((u) => u.includes('/cv/cv-controller')) || '/src/cv/cv-controller.ts';
            const ctrl = await import(surl);
            const url =
                performance
                    .getEntriesByType('resource')
                    .map((r) => r.name)
                    .find((u) => u.includes('/cv/cv-saved.') && !u.includes('cv-saved-ui')) || '/src/cv/cv-saved.ts';
            const mod = await import(url);
            const snap = ctrl.buildShareSnapshot();
            const a = mod.CVSaved.add({ name: 'A', snapshot: snap, textConfig: null });
            const s2 = JSON.parse(JSON.stringify(snap));
            s2.currentLang = 'EN';
            s2.timestamp = Date.now() + 1;
            const b = mod.CVSaved.add({ name: 'B', snapshot: s2, textConfig: null });
            const dup = mod.CVSaved.list().length;
            for (let i = 0; i < 55; i++) {
                const s = JSON.parse(JSON.stringify(snap));
                s.cvs.ES = '<p>u' + i + '</p>';
                mod.CVSaved.add({ name: 'x' + i, snapshot: s, textConfig: null });
            }
            const otra = JSON.parse(JSON.stringify(snap));
            otra.cvs.ES = '<p>otra</p>';
            return {
                stable: !!a?.entry?.hash && a.entry.hash === b?.entry?.hash,
                dup,
                cap: mod.CVSaved.list().length,
                lleno: !mod.CVSaved.canAdd({ snapshot: otra, textConfig: null }),
                // Llena, la lista se queda como estaba: la PRIMERA guardada sigue ahí.
                primera: mod.CVSaved.list().some((/** @type {{ name: string }} */ x) => x.name === 'A'),
            };
        });
        expect(res.stable).toBe(true);
        expect(res.dup).toBe(1);
        expect(res.cap).toBe(25);
        expect(res.lleno).toBe(true);
        expect(res.primera).toBe(true);
    });

    test('cuota llena: ningún CV guardado se pierde y sale el aviso de almacenamiento', async ({ page }) => {
        test.slow(); // captura de miniatura (html-to-image, hasta 15 s) antes de chocar con la cuota
        await simularCuota(page);
        await bootClean(page, EDITOR_URL); // completo: «+ Guardar CV» habilitado sin editar antes
        const antes = await page.evaluate(async () => {
            const surl =
                performance
                    .getEntriesByType('resource')
                    .map((r) => r.name)
                    .find((u) => u.includes('/cv/cv-controller')) || '/src/cv/cv-controller.ts';
            const ctrl = await import(surl);
            const turl =
                performance
                    .getEntriesByType('resource')
                    .map((r) => r.name)
                    .find((u) => u.includes('/cv/cv-state')) || '/src/cv/cv-state.ts';
            const st = await import(turl);
            const url =
                performance
                    .getEntriesByType('resource')
                    .map((r) => r.name)
                    .find((u) => u.includes('/cv/cv-saved.') && !u.includes('cv-saved-ui')) || '/src/cv/cv-saved.ts';
            const mod = await import(url);
            for (let i = 1; i <= 3; i++) {
                const snap = ctrl.buildShareSnapshot();
                snap.cvs.ES = '<p>semilla-' + i + '</p>' + snap.cvs.ES;
                const textConfig = JSON.parse(JSON.stringify(st.state.textConfig));
                mod.CVSaved.add({ name: 'Semilla ' + i, snapshot: snap, textConfig });
            }
            const raw = localStorage.getItem('cv-saved-v1') || '';
            // Cabe lo guardado pero no un CV más; borrar la Semilla 1 sí le haría sitio, y eso es lo que no debe pasar.
            const tope = raw.length + Math.floor(JSON.stringify(JSON.parse(raw)[0]).length / 2);
            /** @type {any} */ (window).__cuota = { clave: 'cv-saved-v1', tope };
            return raw;
        });
        const textoCuota = await page.evaluate(async () => {
            const url =
                performance
                    .getEntriesByType('resource')
                    .map((r) => r.name)
                    .find((u) => u.includes('/cv/cv-i18n')) || '/src/cv/cv-i18n.ts';
            return (await import(url)).t('toastSaveQuota');
        });
        await openPanel(page);
        await expect(page.locator('.edt-toast')).toHaveCount(0, { timeout: 15000 });
        await page.locator('#myCvsList .edt-saved-card--add .edt-saved-card__apply').click();
        // El primer aviso decide: si la cuota borrase la Semilla 1 para hacer sitio, saldría «CV guardado» (verde).
        const aviso = page.locator('.edt-toast--success, .edt-toast--error').first();
        await expect(aviso).toBeVisible({ timeout: 45000 });
        await expect(aviso).toHaveClass(/edt-toast--error/);
        await expect(aviso).toHaveText(textoCuota);
        expect(await storeNames(page)).toEqual(['Semilla 3', 'Semilla 2', 'Semilla 1']);
        expect(await page.evaluate(() => localStorage.getItem('cv-saved-v1'))).toBe(antes);
        await expect(
            page.locator('#myCvsList .edt-saved-card:not(.edt-saved-card--add):not(.cv-mycvs-tpl)')
        ).toHaveCount(3);
    });

    test('cuota (store): solo suelta miniaturas, y sin quotaFallback no descarta ninguna entrada', async ({ page }) => {
        await simularCuota(page);
        await bootClean(page);
        const res = await page.evaluate(async () => {
            const url =
                performance
                    .getEntriesByType('resource')
                    .map((r) => r.name)
                    .find((u) => u.includes('/cv/cv-saved.') && !u.includes('cv-saved-ui')) || '/src/cv/cv-saved.ts';
            const mod = await import(url);
            const surl =
                performance
                    .getEntriesByType('resource')
                    .map((r) => r.name)
                    .find((u) => u.includes('/utils/saved-store')) || '/src/components/features/utils/saved-store.ts';
            const { createSavedStore } = await import(surl);
            const w = /** @type {any} */ (window);
            const thumb = 'data:image/jpeg;base64,' + 'A'.repeat(20000);
            const cv = (i) => ({
                name: 'M' + i,
                snapshot: { cvs: { ES: '<p>m' + i + '</p>', EN: '', DE: '' } },
                thumb,
            });
            for (let i = 1; i <= 3; i++) mod.CVSaved.add(cv(i));
            // Un CV con miniatura no cabe; sin la de M1 (la más antigua), sí.
            w.__cuota = { clave: 'cv-saved-v1', tope: (localStorage.getItem('cv-saved-v1') || '').length + 10000 };
            const r = mod.CVSaved.add(cv(4));
            // Store sin quotaFallback: no puede descartar G1 para hacer sitio a G4.
            const g = createSavedStore({
                lsKey: 'prueba-saved-v1',
                idPrefix: 'g',
                matchDup: () => false,
                refreshDup: () => {},
            });
            for (let i = 1; i <= 3; i++) g.add({ name: 'G' + i, datos: 'x'.repeat(5000) });
            const antes = localStorage.getItem('prueba-saved-v1') || '';
            w.__cuota = { clave: 'prueba-saved-v1', tope: antes.length + 1000 };
            const rg = g.add({ name: 'G4', datos: 'x'.repeat(5000) });
            return {
                persisted: !!r && r.ok && r.persisted,
                miniaturas: mod.CVSaved.list().map((e) => e.name + ':' + (e.thumb ? 'sí' : 'no')),
                genericoGuardado: rg.ok && rg.persisted,
                generico: g.list().map((e) => e.name),
                genericoIntacto: localStorage.getItem('prueba-saved-v1') === antes,
            };
        });
        expect(res.persisted).toBe(true);
        expect(res.miniaturas).toEqual(['M4:sí', 'M3:sí', 'M2:sí', 'M1:no']);
        expect(res.genericoGuardado).toBe(false);
        expect(res.generico).toEqual(['G3', 'G2', 'G1']);
        expect(res.genericoIntacto).toBe(true);
    });

    test('el botón Mis CVs abre el panel, con todo habilitado', async ({ page }) => {
        await bootClean(page, EDITOR_URL);
        await expect(page.locator('#myCvsToggle')).toBeVisible();
        await openMyCvs(page);
        await expect(page.locator('#myCvsPanel')).toBeVisible();
        // Completo: plantillas de perfil siempre visibles (con la activa resaltada), Compartir y
        // "+ Guardar CV" habilitados desde el arranque (sin necesidad de editar).
        await expect(page.locator('#myCvsList .cv-mycvs-tpl.is-applied [data-profile="lucia"]')).toBeVisible();
        await expect(page.locator('#myCvsList .cv-mycvs-tpl [data-profile="jonas"]')).toBeVisible();
        await expect(page.locator('#myCvsShareBtn')).toBeEnabled();
        await expect(page.locator('#myCvsList .edt-saved-card--add .edt-saved-card__apply')).toBeEnabled();
    });

    test('cargar una guardada quita el resaltado del perfil (sin doble marca)', async ({ page }) => {
        await bootClean(page, EDITOR_URL);
        // Sembrar una entrada en el store.
        await page.evaluate(async () => {
            const surl =
                performance
                    .getEntriesByType('resource')
                    .map((r) => r.name)
                    .find((u) => u.includes('/cv/cv-controller')) || '/src/cv/cv-controller.ts';
            const ctrl = await import(surl);
            const url =
                performance
                    .getEntriesByType('resource')
                    .map((r) => r.name)
                    .find((u) => u.includes('/cv/cv-saved.') && !u.includes('cv-saved-ui')) || '/src/cv/cv-saved.ts';
            const mod = await import(url);
            mod.CVSaved.add({ name: 'Mi-guardada', snapshot: ctrl.buildShareSnapshot(), textConfig: null });
        });
        await openMyCvs(page);
        await expect(page.locator('#myCvsPanel')).toBeVisible();
        // Al cargarla: la guardada queda resaltada y el perfil PIERDE su resaltado.
        await page.locator('#myCvsList .edt-saved-card[title="Mi-guardada"] .edt-saved-card__apply').click();
        await expect(page.locator('#myCvsList .edt-saved-card[title="Mi-guardada"]')).toHaveClass(/is-applied/);
        await expect(page.locator('#myCvsList .cv-mycvs-tpl.is-applied')).toHaveCount(0);
        // Y al volver a clicar un perfil, el resaltado vuelve al perfil (la guardada lo pierde).
        await page.locator('#myCvsList .cv-mycvs-tpl [data-profile="lucia"]').click();
        await expect(page.locator('#myCvsList .cv-mycvs-tpl.is-applied [data-profile="lucia"]')).toBeVisible();
        await expect(page.locator('#myCvsList .edt-saved-card[title="Mi-guardada"]')).not.toHaveClass(/is-applied/);
    });
});

// Cambia a la primera paleta NO activa y guarda el diseño = un commit discreto (1 entrada).
// Devuelve la clase de tema resultante (theme-*).
async function saveThemeChange(page) {
    await page.locator('#designToggle').click();
    await expect(page.locator('#designPickerPanel')).toBeVisible();
    await page.locator('#designThemeSwatches .cv-design-theme-swatch:not(.active)').first().click();
    const themeClass = await page.evaluate(() => [...document.body.classList].find((c) => c.startsWith('theme-')));
    await page.locator('#designSaveBtn').click();
    await expect(page.locator('#designPickerPanel')).toBeHidden();
    return themeClass;
}

// Guarda una edición de texto = commit discreto que además CREA el CV propio (el primero
// saca del escaparate y fija la línea base del historial).
async function saveTextEdit(page, text) {
    await page.locator('#textToggle').click();
    await expect(page.locator('body.edit-mode')).toBeVisible();
    await editFirstEditable(page, text);
    await page.locator('#textSaveBtn').click();
    await expect(page.locator('body')).not.toHaveClass(/edit-mode/);
    await expect(page.locator('#cv-es')).toContainText(text);
}

test.describe('CV Editor — Deshacer/Rehacer', () => {
    test('la toolbar incluye Deshacer/Rehacer deshabilitados al arrancar', async ({ page }) => {
        await bootClean(page);
        await expect(page.locator('#undoBtn')).toBeVisible();
        await expect(page.locator('#redoBtn')).toBeVisible();
        await expect(page.locator('#undoBtn')).toBeDisabled();
        await expect(page.locator('#redoBtn')).toBeDisabled();
    });

    test('Ctrl+Z revierte y Ctrl+Y / Ctrl+Shift+Z rehacen un cambio de diseño', async ({ page }) => {
        await bootClean(page);
        await saveTextEdit(page, 'ATAJOS-UNDO-CV'); // línea base (sale del escaparate)
        const themeClass = await saveThemeChange(page);

        await page.keyboard.press('Control+z');
        await expect(page.locator('body')).toHaveClass(/theme-purple/);

        await page.keyboard.press('Control+y');
        await expect(page.locator('body')).toHaveClass(new RegExp(themeClass));

        await page.keyboard.press('Control+z');
        await expect(page.locator('body')).toHaveClass(/theme-purple/);

        // Ctrl+Shift+Z también rehace.
        await page.keyboard.press('Control+Shift+z');
        await expect(page.locator('body')).toHaveClass(new RegExp(themeClass));
    });

    test('varios commits → varios pasos de deshacer (paso a paso)', async ({ page }) => {
        await bootClean(page);
        await saveTextEdit(page, 'PASOS-UNDO-CV');
        const t1 = await saveThemeChange(page);
        const t2 = await saveThemeChange(page);
        expect(t2).not.toBe(t1); // la paleta activa cambió → :not(.active) elige otra
        await expect(page.locator('body')).toHaveClass(new RegExp(t2));

        // Un deshacer vuelve a t1…
        await page.locator('#undoBtn').click();
        await expect(page.locator('body')).toHaveClass(new RegExp(t1));
        // …y otro a la línea base (tema de arranque). Sin más pila → Deshacer deshabilitado.
        await page.locator('#undoBtn').click();
        await expect(page.locator('body')).toHaveClass(/theme-purple/);
        await page.locator('#undoBtn').click();
        await expect(page.locator('#cv-es')).not.toContainText('PASOS-UNDO-CV');
        await expect(page.locator('#undoBtn')).toBeDisabled();
    });

    test('deshacer un texto guardado revierte el contenido y rehacer lo restaura', async ({ page }) => {
        await bootClean(page);
        await saveTextEdit(page, 'NOMBRE-UNO'); // línea base
        await saveTextEdit(page, 'NOMBRE-DOS'); // segunda edición guardada = 1 entrada

        // Deshacer (fuera de edición) → vuelve el primer texto guardado.
        await expect(page.locator('#undoBtn')).toBeEnabled();
        await page.locator('#undoBtn').click();
        await expect(page.locator('#cv-es')).toContainText('NOMBRE-UNO');
        await expect(page.locator('#cv-es')).not.toContainText('NOMBRE-DOS');

        // Rehacer → vuelve el segundo.
        await page.locator('#redoBtn').click();
        await expect(page.locator('#cv-es')).toContainText('NOMBRE-DOS');
    });

    test('Deshacer/Rehacer se deshabilitan durante la edición (manda el undo nativo)', async ({ page }) => {
        await bootClean(page);
        await saveTextEdit(page, 'EDIT-UNDO-CV'); // línea base
        await saveThemeChange(page); // hay historial → Deshacer habilitado
        await expect(page.locator('#undoBtn')).toBeEnabled();

        // Entrar en edición (panel Textos entra en edición): ambos botones se deshabilitan.
        await page.locator('#textToggle').click();
        await expect(page.locator('body.edit-mode')).toBeVisible();
        await expect(page.locator('#undoBtn')).toBeDisabled();
        await expect(page.locator('#redoBtn')).toBeDisabled();

        // Salir sin guardar → Deshacer vuelve a estar disponible (el historial sobrevive).
        await page.locator('#textCancelBtn').click();
        await expect(page.locator('body')).not.toHaveClass(/edit-mode/);
        await expect(page.locator('#undoBtn')).toBeEnabled();
    });
});

test.describe('CV Editor — i18n del chrome', () => {
    test('el toggle de idioma traduce topbar y paneles (ES → EN → DE)', async ({ page }) => {
        await bootClean(page);
        await expect(page.locator('#configToggle .edt-toolbar__label')).toHaveText('Config');
        await expect(page.locator('#undoBtn')).toHaveAttribute('title', 'Deshacer (Ctrl+Z)');

        // ES → EN: topbar completo traducido.
        await page.locator('#langToggle').click();
        await expect(page.locator('#configToggle .edt-toolbar__label')).toHaveText('Settings');
        await expect(page.locator('#textToggle .edt-toolbar__label')).toHaveText('Text');
        await expect(page.locator('#myCvsToggle .edt-toolbar__label')).toHaveText('Saved');
        await expect(page.locator('#designToggle .edt-toolbar__label')).toHaveText('Templates');
        await expect(page.locator('#undoBtn')).toHaveAttribute('title', 'Undo (Ctrl+Z)');

        await page.locator('#configToggle').click();
        await expect(page.locator('#configPanel')).toBeVisible();
        await expect(page.locator('#configPanel .cv-design-picker-header span')).toHaveText('Settings');
        await expect(page.locator('label[for="configPageBgColor"]')).toHaveText('Background');
        await expect(page.locator('#configSaveBtn')).toHaveText('Save');
        await page.locator('#configCancelBtn').click();

        // EN → DE.
        await page.locator('#langToggle').click();
        await expect(page.locator('#configToggle .edt-toolbar__label')).toHaveText('Optionen');
        await expect(page.locator('#undoBtn')).toHaveAttribute('title', 'Rückgängig (Strg+Z)');
    });

    test('las tarjetas de Mis CVs se re-renderizan traducidas y el idioma persiste al recargar', async ({ page }) => {
        await bootClean(page);
        await openMyCvs(page);
        await expect(page.locator('#myCvsPanel')).toBeVisible();
        const addCardLabel = page.locator('#myCvsList [data-action="save-current"] .edt-saved-card__add-box span');
        await expect(addCardLabel).toHaveText('Guardar CV');

        // Cambiar a EN con el panel ABIERTO (Alt+L: un click en el toolbar lo cerraría por
        // click-fuera) → las tarjetas se re-renderizan traducidas al momento.
        await page.keyboard.press('Alt+l');
        await expect(addCardLabel).toHaveText('Save CV');
        await expect(page.locator('#myCvsImportBtn span')).toHaveText('Add by code');

        // La preferencia de idioma persiste: al recargar, el chrome arranca en EN.
        await page.reload();
        await expect(page.locator('body.page-ready')).toBeVisible();
        await expect(page.locator('#configToggle .edt-toolbar__label')).toHaveText('Settings');
    });

    test('Compartir y Añadir código de Mis CVs salen en inglés, también su Cancelar', async ({ page }) => {
        // En el modo completo, Compartir está habilitado desde el arranque: no hace falta importar un CV propio
        await bootClean(page, EDITOR_URL);
        await page.locator('#langToggle').click();
        await expect(page.locator('#configToggle .edt-toolbar__label')).toHaveText('Settings');
        await openMyCvs(page);
        const dlg = page.locator('.edt-dlg-overlay');

        await page.locator('#myCvsImportBtn').click();
        await expect(dlg.locator('.edt-dlg__cancel span')).toHaveText('Cancel');
        await expect(dlg.locator('.edt-dlg__ok span')).toHaveText('Add');
        await dlg.locator('.edt-dlg__cancel').click();
        await expect(dlg).toHaveCount(0);

        await expect(page.locator('#myCvsShareBtn')).toBeEnabled();
        await page.locator('#myCvsShareBtn').click();
        await expect(dlg.locator('.edt-dlg__cancel span')).toHaveText('Cancel');
        await expect(dlg.locator('.edt-dlg__ok span')).toHaveText('Copy');
        await dlg.locator('.edt-dlg__cancel').click();
        await expect(dlg).toHaveCount(0);
    });
});

test.describe('CV Editor — enlaces y colores efectivos', () => {
    test('editar un campo de contacto se copia VERBATIM a EN/DE (popup de enlace)', async ({ page }) => {
        await bootClean(page); // edición solo escritorio: bootClean fuerza escritorio
        await page.locator('#textToggle').click();
        await expect(page.locator('body.edit-mode')).toBeVisible();

        // Editar el email (3er enlace de contacto) vía el popup — es dato real: NUNCA se
        // traduce, se copia tal cual a los gemelos EN/DE (antes quedaban con el ejemplo).
        await page.locator('#cv-es .contact-info a[data-editable-link]').nth(2).click();
        await expect(page.locator('#linkEditorPopup')).toHaveClass(/visible/);
        await page.locator('#linkText').fill('correo-e2e@ejemplo.com');
        await page.locator('#linkEditorPopup .btn-save').click();

        await expect(page.locator('#cv-es .contact-info a[data-editable-link]').nth(2)).toHaveText(
            'correo-e2e@ejemplo.com'
        );
        await expect(page.locator('#cv-en .contact-info a[data-editable-link]').nth(2)).toHaveText(
            'correo-e2e@ejemplo.com'
        );
        await expect(page.locator('#cv-de .contact-info a[data-editable-link]').nth(2)).toHaveText(
            'correo-e2e@ejemplo.com'
        );
    });

    test('el panel Textos muestra el color EFECTIVO del tema cuando no hay override', async ({ page }) => {
        await bootClean(page);
        // Cambiar a otra paleta (el subtítulo pasa al acento del nuevo tema, sin override).
        await saveThemeChange(page);
        const effective = await page.evaluate(() => {
            const h2 = document.querySelector('#cv-es .header h2');
            const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(h2).color);
            const to2 = (n) => parseInt(n, 10).toString(16).padStart(2, '0');
            return `#${to2(m[1])}${to2(m[2])}${to2(m[3])}`;
        });
        expect(effective).not.toBe('#b38f00'); // ya no es el dorado hardcodeado del tema base

        await page.locator('#textToggle').click();
        await expect(page.locator('body.edit-mode')).toBeVisible();
        await expect(page.locator('#textColorSubtitle')).toHaveValue(effective);
        await page.locator('#textCancelBtn').click();
    });

    test('el panel Config muestra el color de panel EFECTIVO del tema', async ({ page }) => {
        await bootClean(page);
        await saveThemeChange(page);
        const effective = await page.evaluate(() =>
            getComputedStyle(document.querySelector('#cv-es')).getPropertyValue('--sidebar-bg').trim().toLowerCase()
        );
        expect(effective).toMatch(/^#[0-9a-f]{6}$/);

        await page.locator('#configToggle').click();
        await expect(page.locator('#configPanel')).toBeVisible();
        await expect(page.locator('#configSidebarColor')).toHaveValue(effective);
        await page.locator('#configCancelBtn').click();
    });

    test('el swatch de un CV guardado refleja el fondo REAL (tema oscuro)', async ({ page }) => {
        test.slow(); // captura de miniatura (html-to-image) con timeout de 15s
        await bootClean(page);
        await saveTextEdit(page, 'FONDO-OSCURO-E2E'); // CV propio (habilita Guardar CV)

        // Pasar a un tema OSCURO: pinta el folio vía body.theme-dark-* (pageBg queda null —
        // el caso que antes producía swatch/miniatura BLANCOS).
        await page.locator('#designToggle').click();
        await expect(page.locator('#designPickerPanel')).toBeVisible();
        await page.locator('#designModeToggle').click();
        await page.locator('#designThemeSwatches .cv-design-theme-swatch:not(.active)').first().click();
        await page.locator('#designSaveBtn').click();
        await expect(page.locator('#designPickerPanel')).toBeHidden();

        const realBg = await page.evaluate(() => {
            const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(
                getComputedStyle(document.getElementById('cv-es')).backgroundColor
            );
            const to2 = (n) => parseInt(n, 10).toString(16).padStart(2, '0');
            return `#${to2(m[1])}${to2(m[2])}${to2(m[3])}`;
        });
        expect(realBg).not.toBe('#ffffff'); // el tema oscuro pinta el folio

        // Guardar a la lista y comprobar el bgSwatch persistido (mismo origen que la captura).
        await openMyCvs(page);
        await expect(page.locator('#myCvsPanel')).toBeVisible();
        await page.locator('#myCvsList [data-action="save-current"]').click();
        await expect
            .poll(
                () =>
                    page.evaluate(async () => {
                        const url =
                            performance
                                .getEntriesByType('resource')
                                .map((r) => r.name)
                                .find((u) => u.includes('/cv/cv-saved.') && !u.includes('cv-saved-ui')) ||
                            '/src/cv/cv-saved.ts';
                        const list = (await import(url)).CVSaved.list();
                        return list.length ? list[list.length - 1].bgSwatch : null;
                    }),
                { timeout: 20000 }
            )
            .toBe(realBg);
    });
});

test.describe('CV Editor — panel móvil arrastrable', () => {
    test('el panel es un bottom-sheet OPACO con asa de arrastre inyectada', async ({ page }) => {
        await bootCleanMobile(page);

        await page.locator('#designToggle').click();
        const panel = page.locator('#designPickerPanel');
        await expect(panel).toBeVisible();

        // Fondo OPACO: gradiente sólido (antes rgba(...,0.75) → semitransparente).
        const bgImage = await panel.evaluate((el) => getComputedStyle(el).backgroundImage);
        expect(bgImage).toContain('linear-gradient');

        // Asa inyectada por el motor compartido (primer hijo).
        await expect(panel.locator('.edt-sheet__handle')).toHaveCount(1);
        const isFirst = await panel.evaluate(
            (p) => p.firstElementChild?.classList.contains('edt-sheet__handle') === true
        );
        expect(isFirst).toBe(true);
    });

    test('arrastrar el asa hacia abajo ENCOGE el panel: el CV asoma y el footer no se mueve', async ({
        page,
    }, testInfo) => {
        test.skip(testInfo.project.name === 'Mobile Safari', 'gesto de ratón (drag)');
        await bootCleanMobile(page);

        await page.locator('#designToggle').click();
        const panel = page.locator('#designPickerPanel');
        await expect(panel).toBeVisible();
        // Esperar a que termine la animación de entrada (@starting-style, 0.2s): medir
        // boundingBox a mitad de la transición desvía el borde inferior unos px.
        await expect
            .poll(() => panel.evaluate((el) => getComputedStyle(el).transform))
            .toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);

        const before = await panel.boundingBox();
        const handleBox = await panel.locator('.edt-sheet__handle').boundingBox();
        if (!before || !handleBox) throw new Error('Sin boundingBox de panel/asa');
        const cx = handleBox.x + handleBox.width / 2;
        const cy = handleBox.y + handleBox.height / 2;
        const footer = panel.locator('.cv-design-footer');

        await page.mouse.move(cx, cy);
        await page.mouse.down();
        await page.mouse.move(cx, cy + 40, { steps: 3 });
        await page.mouse.move(cx, cy + 160, { steps: 8 });

        const footerLive = await footer.boundingBox();
        if (!footerLive) throw new Error('Sin boundingBox del footer durante el gesto');
        expect(footerLive.y + footerLive.height).toBeLessThanOrEqual(845);

        await page.mouse.up();

        const after = await panel.boundingBox();
        if (!after) throw new Error('Sin boundingBox tras el drag');
        expect(after.y).toBeGreaterThan(before.y + 20); // el sheet encogió → el CV asoma
        // Borde inferior clavado (resize real, no desplazamiento — C2)…
        expect(Math.abs(after.y + after.height - (before.y + before.height))).toBeLessThanOrEqual(2);
        await expect(footer).toBeVisible();
        expect(await panel.evaluate((el) => el.style.transform)).toBe('');
    });

    test('T2: con un sheet abierto la bottom bar se oculta y al cerrarlo vuelve', async ({ page }) => {
        await bootCleanMobile(page);

        await expect(page.locator('#langToggle')).toBeVisible();
        await expect(page.locator('body')).not.toHaveClass(/edt-sheet-open/);

        await page.locator('#designToggle').click();
        await expect(page.locator('#designPickerPanel')).toBeVisible();
        await expect(page.locator('body')).toHaveClass(/edt-sheet-open/);
        await expect(page.locator('#langToggle')).toBeHidden();

        const footerBox = await page.locator('#designPickerPanel .cv-design-footer').boundingBox();
        if (!footerBox) throw new Error('Sin boundingBox del footer');
        expect(footerBox.y + footerBox.height).toBeGreaterThan(844 - 40);

        await page.locator('#designCancelBtn').click();
        await expect(page.locator('#designPickerPanel')).toBeHidden();
        await expect(page.locator('body')).not.toHaveClass(/edt-sheet-open/);
        await expect(page.locator('#langToggle')).toBeVisible();
    });

    test('el asa se anuncia en el idioma del CV, también tras cambiarlo', async ({ page }) => {
        await bootCleanMobile(page);
        const panel = page.locator('#designPickerPanel');

        // ES → EN. _boot deniega la traducción: no sale nada a la red.
        await page.locator('#langToggle').click();
        await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('en');
        await page.locator('#designToggle').click();
        await expect(panel).toBeVisible();
        await expect(panel.locator('.edt-sheet__handle')).toHaveAttribute(
            'aria-label',
            'Drag to lower or raise the panel'
        );
    });

    test('el asa sigue al idioma aunque cambie con el sheet abierto (cargar un CV guardado en inglés)', async ({
        page,
    }) => {
        await bootCleanMobile(page);
        await page.evaluate(async () => {
            const surl =
                performance
                    .getEntriesByType('resource')
                    .map((r) => r.name)
                    .find((u) => u.includes('/cv/cv-controller')) || '/src/cv/cv-controller.ts';
            const ctrl = await import(surl);
            const url =
                performance
                    .getEntriesByType('resource')
                    .map((r) => r.name)
                    .find((u) => u.includes('/cv/cv-saved.') && !u.includes('cv-saved-ui')) || '/src/cv/cv-saved.ts';
            const mod = await import(url);
            const snap = ctrl.buildShareSnapshot();
            snap.currentLang = 'EN';
            mod.CVSaved.add({ name: 'Guardado-EN', snapshot: snap, textConfig: null });
        });
        await openMyCvs(page);
        const panel = page.locator('#myCvsPanel');
        const asa = panel.locator('.edt-sheet__handle');
        await expect(asa).toHaveAttribute('aria-label', 'Arrastra para bajar o subir el panel');

        // Cargarlo cambia el idioma con el sheet ABIERTO: el asa ya pintada tiene que seguirle.
        await panel.locator('.edt-saved-card[title="Guardado-EN"] .edt-saved-card__apply').click();
        await expect(page.locator('body')).toHaveClass(/lang-en/);
        await expect(panel).toBeVisible();
        await expect(asa).toHaveAttribute('aria-label', 'Drag to lower or raise the panel');
    });
});

// ─── Barra móvil + menú "Más"
test.describe('CV Editor — barra móvil + menú "Más"', () => {
    test('escritorio: el botón "Más" está oculto (los botones van sueltos)', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 }); // forzar escritorio (el proyecto Mobile Safari es 390px)
        await bootClean(page);
        await expect(page.locator('#cvMasToggle')).toBeHidden();
        await expect(page.locator('#configToggle')).toBeVisible();
        await expect(page.locator('#downloadBtn')).toBeVisible();
    });

    test('móvil: la barra agrupa Config/Guardados/Descargar en "Más" y reordena (Textos en la barra)', async ({
        page,
    }) => {
        await bootCleanMobile(page);

        // "Más" visible; Config/Guardados/Descargar salen de la barra. Textos entró
        // en la barra en el sitio de Guardados.
        await expect(page.locator('#cvMasToggle')).toBeVisible();
        await expect(page.locator('#configToggle')).toBeHidden();
        await expect(page.locator('#myCvsToggle')).toBeHidden();
        await expect(page.locator('#downloadBtn')).toBeHidden();
        await expect(page.locator('#textToggle')).toBeVisible();

        // Reorden: Textos va ANTES que Plantillas (Diseño) en la barra.
        const textos = await page.locator('#textToggle').boundingBox();
        const design = await page.locator('#designToggle').boundingBox();
        if (!textos || !design) throw new Error('Sin boundingBox de los botones de la barra');
        expect(textos.x).toBeLessThan(design.x);

        // Abrir "Más" → panel con las 5 filas (swap 1:1: entra Guardados, sale Textos).
        await page.locator('#cvMasToggle').click();
        await expect(page.locator('#cvMasPanel')).toBeVisible();
        await expect(page.locator('#cvMasPanel .cv-mas__row')).toHaveCount(5);
    });

    test('móvil: la fila Config del "Más" abre el panel Config (y cierra "Más")', async ({ page }) => {
        await bootCleanMobile(page);
        await page.locator('#cvMasToggle').click();
        await expect(page.locator('#cvMasPanel')).toBeVisible();

        await page.locator('#cvMasPanel [data-mas-action="config"]').click();
        await expect(page.locator('#configPanel')).toBeVisible();
        await expect(page.locator('#cvMasPanel')).toBeHidden(); // exclusión mutua
    });

    test('el folio se escala para caber en pantalla y no se recorta (320px → 728px)', async ({ page }) => {
        for (const width of [320, 390, 728]) {
            await page.setViewportSize({ width, height: 844 });
            await _boot(page, EDITOR_URL);

            const box = await page.locator('#cv-es').boundingBox();
            if (!box) throw new Error(`Sin boundingBox del folio a ${width}px`);
            // Cabe entero (el ancho RENDERIZADO ya lleva el scale aplicado)
            expect(box.x, `folio recortado por la izquierda a ${width}px`).toBeGreaterThanOrEqual(-1);
            expect(box.x + box.width, `folio recortado por la derecha a ${width}px`).toBeLessThanOrEqual(width + 1);
            // …y aprovecha el ancho disponible (antes: 357px fijos en los tres tamaños)
            expect(box.width, `folio demasiado pequeño a ${width}px`).toBeGreaterThan(width * 0.7);
            // El folio sigue siendo A4 EXACTO: el scale no toca el layout box
            const clientW = await page.locator('#cv-es').evaluate((el) => el.clientWidth);
            expect(Math.abs(clientW - 794), `el folio dejó de ser A4 a ${width}px`).toBeLessThanOrEqual(2);
        }
    });

    test('móvil: el "Más" se cierra tocando fuera (con T2 la barra está oculta y no hay footer)', async ({ page }) => {
        await bootCleanMobile(page);
        await page.locator('#cvMasToggle').click();
        await expect(page.locator('#cvMasPanel')).toBeVisible();
        // T2: la barra (incluido el propio botón "Más") está oculta → el ÚNICO cierre
        // táctil es tocar fuera del sheet.
        await expect(page.locator('#cvMasToggle')).toBeHidden();
        await page.locator('#cv-container').click({ position: { x: 5, y: 5 } });
        await expect(page.locator('#cvMasPanel')).toBeHidden();
        await expect(page.locator('#cvMasToggle')).toBeVisible();
    });

    test('móvil: la fila Guardados del "Más" abre Mis CVs, y Textos entra en edición SIN texto editable', async ({
        page,
    }) => {
        await bootCleanMobile(page);

        // La fila Guardados del "Más" abre el panel Mis CVs (y la exclusión cierra "Más").
        await page.locator('#cvMasToggle').click();
        await page.locator('#cvMasPanel [data-mas-action="mycvs"]').click();
        await expect(page.locator('#myCvsPanel')).toBeVisible();
        await expect(page.locator('#cvMasPanel')).toBeHidden();
        await page.locator('#myCvsCancelBtn').click();
        await expect(page.locator('#myCvsPanel')).toBeHidden();

        // Textos en móvil entra en edición con la MISMA mecánica que escritorio (edit-mode
        // + swap a datos GENÉRICOS) pero SIN edición de texto inline:
        // nada de contenteditable ni overlays CRUD, y el aviso "función limitada" visible
        // y ANCLADO (fuera del cuerpo scrolleable del sheet).
        await page.locator('#textToggle').click();
        await expect(page.locator('#textPanel')).toBeVisible();
        await expect(page.locator('body')).toHaveClass(/edit-mode/);
        await expect(page.locator('#cv-es')).toContainText(/Lucía Arnedo/i);
        await expect(page.locator('#cv-container [contenteditable="true"]')).toHaveCount(0);
        await expect(page.locator('#cv-container .edt-crud-overlay')).toHaveCount(0);
        const note = page.locator('#textPanel .cv-sheet-note');
        await expect(note).toBeVisible();
        expect(await note.evaluate((el) => Boolean(el.closest('.edt-sheet__body')))).toBe(false); // anclado, no scrollea
        await expect(page.locator('#textSaveBtn')).toBeEnabled();
        await page.locator('#textCancelBtn').click();
        await expect(page.locator('#textPanel')).toBeHidden();
        await expect(page.locator('body')).not.toHaveClass(/edit-mode/);
        await expect(page.locator('#cv-es')).toContainText(/Frontend/i);
    });
});

const MYMEMORY = '**/api.mymemory.translated.net/**';
const GENERAL_EN = { clave: 'lang-preference', valor: 'en' };

// Siembra ANTES de que el CV lea nada: General, el permiso y el idioma recordado. Sin sembrar, permiso denegado
async function bootCon(page, sembrar = {}) {
    test.skip(
        test.info().project.name === 'Mobile Safari',
        'comportamiento de escritorio: cubierto por Desktop Chrome'
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(EDITOR_URL);
    await page.evaluate((s) => {
        localStorage.clear();
        localStorage.setItem('cv-translation-consent', 'denied');
        for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
    }, sembrar);
    await page.reload();
    await expect(page.locator('body.page-ready')).toBeVisible();
}

// Lo que hace el panel de Ajustes al elegir: guardar y avisar a la página
function cambiarGeneral(page, { clave, valor } = GENERAL_EN) {
    return page.evaluate(
        ([k, v]) => {
            localStorage.setItem(k, v);
            window.dispatchEvent(new CustomEvent('ajustes:cambio', { detail: { clave: k, valor: v } }));
        },
        [clave, valor]
    );
}

// Como editFirstEditable, en el árbol del idioma que se diga
async function editarEn(page, arbol, texto) {
    await page
        .locator(`${arbol} [contenteditable="true"]`)
        .first()
        .evaluate((el, t) => {
            el.focus();
            el.textContent = t;
            el.dispatchEvent(new InputEvent('input', { bubbles: true }));
            el.blur();
        }, texto);
}

// Responde «XX: texto» (XX, el idioma de destino) y apunta cada par pedido
async function traductorFalso(page) {
    const pares = [];
    await page.route(MYMEMORY, (route) => {
        const url = new URL(route.request().url());
        const par = url.searchParams.get('langpair') ?? '';
        pares.push(par);
        const destino = par.split('|')[1]?.toUpperCase();
        return route.fulfill({
            json: {
                responseStatus: 200,
                responseData: { translatedText: `${destino}: ${url.searchParams.get('q')}` },
            },
        });
    });
    return pares;
}

test.describe('CV Editor — el idioma de los Ajustes y el permiso de traducción', () => {
    test('tu CV no sigue al idioma de los Ajustes: se queda en el suyo y lo avisa', async ({ page }) => {
        await bootCon(page);
        await saveTextEdit(page, 'CV propio E2E');
        await cambiarGeneral(page);
        await expect(page.locator('.edt-toast').filter({ hasText: 'Tu CV se queda en su idioma' })).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('lang', 'es');
        await page.reload();
        await expect(page.locator('body.page-ready')).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('lang', 'es');
        await expect(page.locator('#cv-es')).toContainText('CV propio E2E');
    });

    test('con la app en inglés traduce lo editado del inglés al español y al alemán', async ({ page }) => {
        await bootCon(page, { 'lang-preference': 'en', 'cv-translation-consent': 'granted' });
        const pares = await traductorFalso(page);
        await page.locator('#textToggle').click();
        await expect(page.locator('body.edit-mode')).toBeVisible();
        await editarEn(page, '#cv-en', 'Name from English');
        await page.locator('#textSaveBtn').click();
        await expect(page.locator('body')).not.toHaveClass(/edit-mode/);
        expect([...pares].sort()).toEqual(['en|de', 'en|es']);
        await expect(page.locator('#cv-es')).toContainText('ES: Name from English');
        await expect(page.locator('#cv-de')).toContainText('DE: Name from English');
    });

    test('si el traductor falla no escribe nada, lo avisa y lo reintenta al guardar otra vez', async ({ page }) => {
        await bootCon(page, { 'cv-translation-consent': 'granted' });
        await page.route(MYMEMORY, (route) => route.abort());
        await saveTextEdit(page, 'Texto que no pasa');
        await expect(page.locator('.edt-toast').filter({ hasText: 'Textos sin traducir: 1' })).toBeVisible();
        // Antes se copiaba el original: el inglés acababa en castellano
        await expect(page.locator('#cv-en')).not.toContainText('Texto que no pasa');
        await page.unroute(MYMEMORY);
        const pares = await traductorFalso(page);
        await page.locator('#textToggle').click();
        await expect(page.locator('body.edit-mode')).toBeVisible();
        await page.locator('#textSaveBtn').click();
        await expect(page.locator('body')).not.toHaveClass(/edit-mode/);
        expect([...pares].sort()).toEqual(['es|de', 'es|en']);
        await expect(page.locator('#cv-en')).toContainText('EN: Texto que no pasa');
    });

    test('el permiso se pide una vez, señala los Ajustes y queda guardado', async ({ page }) => {
        await bootCon(page, { 'cv-translation-consent': 'ask' });
        await traductorFalso(page);
        await page.locator('#textToggle').click();
        await expect(page.locator('body.edit-mode')).toBeVisible();
        await editarEn(page, '#cv-es', 'Con permiso');
        await page.locator('#textSaveBtn').click();
        const dlg = page.locator('.edt-dlg-overlay.active');
        await expect(dlg).toContainText('MyMemory');
        await expect(dlg).toContainText('Ajustes (el engranaje de arriba)');
        await dlg.locator('.edt-dlg__ok').click();
        await expect(page.locator('#cv-en')).toContainText('EN: Con permiso');
        expect(await page.evaluate(() => localStorage.getItem('cv-translation-consent'))).toBe('granted');
    });

    test('lo editado en otro idioma que el de la app no sale del navegador ni pide permiso', async ({ page }) => {
        await bootCon(page, { 'cv-translation-consent': 'ask' });
        const pares = await traductorFalso(page);
        // En escritorio, con el panel Textos abierto la barra (y su botón de idioma) se oculta: se cambia antes
        await page.locator('#langToggle').click();
        await expect(page.locator('#cv-en')).toBeVisible();
        await page.locator('#textToggle').click();
        await expect(page.locator('body.edit-mode')).toBeVisible();
        await editarEn(page, '#cv-en', 'Only in English');
        await page.locator('#textSaveBtn').click();
        await expect(page.locator('body')).not.toHaveClass(/edit-mode/);
        await expect(page.locator('.edt-dlg-overlay.active')).toHaveCount(0);
        expect(pares).toEqual([]);
        await expect(page.locator('#cv-es')).not.toContainText('Only in English');
    });

    test('«Restaurar todo» no revoca el permiso de traducción', async ({ page }) => {
        await bootCon(page, { 'cv-translation-consent': 'granted' });
        await page.locator('#configToggle').click();
        await expect(page.locator('#configPanel')).toBeVisible();
        await page.locator('#configResetAllBtn').click();
        await Promise.all([page.waitForEvent('load'), page.locator('.edt-dlg-overlay.active .edt-dlg__ok').click()]);
        await expect(page.locator('body.page-ready')).toBeVisible();
        expect(await page.evaluate(() => localStorage.getItem('cv-translation-consent'))).toBe('granted');
    });
});
