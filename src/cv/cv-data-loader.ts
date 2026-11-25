import { state } from './cv-state.ts';
import { updateDesignPickerLabels } from './cv-design-picker.ts';
import { cvData } from './cv-data-default.ts';
import { safeUrl, escapeHtml, escapeAttr } from './cv-utils.ts';
import type { CVData, CVEducationItem, CVExperienceItem, I18nString, Lang, MaybeI18nString } from './cv-types.ts';

export { cvData };

// Inicializar datos activos + base en el state (antes la base vivía en window.cvData)
state.activeData = cvData;
state.baseData = cvData;

export function setActiveData(data: CVData): void {
    state.activeData = data;
}

/**
 * Carga una BASE nueva: pasa a ser el CV activo Y la base a la que se vuelve.
 *
 * Los 4 sitios que cargan una base (3 en cv-controller + applyProfile) hacían a
 * mano `setActiveData(data); window.cvData = data;`. Escribir los dos slots por separado es
 * justo donde acaban divergiendo — y divergir aquí significa que "salir de edición" te
 * devuelve a un CV que no es el que cargaste. Un solo punto de entrada lo impide.
 *
 * Ojo: `setActiveData` SIGUE existiendo aparte a propósito, para los cambios de dato activo
 * que NO son una base nueva (p. ej. entrar en edición conmuta a la plantilla genérica).
 */
export function loadBaseData(data: CVData): void {
    setActiveData(data);
    state.baseData = data;
}

// Resuelve un campo que puede ser string (dato real: email/nombre reales, iguales en todos los
// idiomas) o un objeto por idioma {ES,EN,DE} (plantilla genérica con ejemplos localizados).
function pickLang(value: MaybeI18nString | undefined | null, lang: Lang): string {
    if (value && typeof value === 'object') return value[lang] ?? value.ES ?? '';
    return value ?? '';
}

// Título de una sección del CV en el idioma pedido. `sections` es un diccionario abierto
// (Record<string, I18nString>): si un dato no trae la clave, antes se imprimía "undefined"
// o petaba; aquí queda en blanco.
function sectionTitle(sections: Record<string, I18nString>, key: string, lang: Lang): string {
    return sections[key]?.[lang] ?? '';
}

// Compatibilidad global

export function initializeCV() {
    const container = document.getElementById('cv-container');
    if (!container) return;
    const activeLang = (state.currentLang || 'ES').toUpperCase() as Lang;

    // Render lazy de idiomas. Solo el idioma activo se renderiza completo;
    // los otros se generan al cambiar de idioma (renderLanguageIfNeeded).
    const buildShell = (lang: Lang) => {
        if (lang === activeLang) return generateCVHTML(lang, true);
        return `<div class="cv-container cv-lang-pending" id="cv-${lang.toLowerCase()}" hidden data-lang-pending="${lang}"></div>`;
    };

    container.innerHTML = `
        ${buildShell('ES')}
        ${buildShell('EN')}
        ${buildShell('DE')}
    `;

    // Actualizar botones con textos del idioma por defecto
    updateButtonLabelsForCV(activeLang);
}

/**
 * Renderiza el HTML de un idioma si todavía está pendiente.
 * Devuelve true si generó contenido nuevo.
 */
export function renderLanguageIfNeeded(lang: string): boolean {
    const upper = lang.toUpperCase() as Lang;
    const el = document.getElementById(`cv-${upper.toLowerCase()}`);
    if (!el || !el.hasAttribute('data-lang-pending')) return false;
    el.outerHTML = generateCVHTML(upper, false);
    return true;
}

function updateButtonLabelsForCV(lang: Lang): void {
    const ui = state.activeData?.ui;
    if (!ui) return;

    // Toolbar Textos/Config/Descargar tienen label estático; solo Idioma
    // (badge) y el badge de descarga se actualizan por idioma.
    const downloadBtn = document.querySelector('#downloadBtn span');
    if (downloadBtn) downloadBtn.textContent = ui.download.label[lang];

    const langToggle = document.querySelector('#langToggle span');
    if (langToggle) {
        langToggle.textContent = ui.language.label[lang];
        langToggle.classList.remove('lang-badge--es', 'lang-badge--en', 'lang-badge--de');
        langToggle.classList.add(`lang-badge--${lang.toLowerCase()}`);
    }

    updateDesignPickerLabels(lang);
}

function generateCVHTML(lang: Lang, visible = false): string {
    const displayStyle = visible ? 'flex' : 'none';
    const hiddenAttr = visible ? '' : 'hidden';
    // Marca para que las imágenes internas usen loading=lazy cuando no son visibles.
    const lazyAttr = visible ? '' : 'data-lazy-imgs';

    return `
        <div class="cv-container" id="cv-${lang.toLowerCase()}" style="display: ${displayStyle};" ${hiddenAttr} ${lazyAttr}>
            ${generateSidebar(lang, visible)}
            ${generateMainContent(lang)}
        </div>
    `;
}

// Helper: genera imagen con o sin enlace según tenga URL
function generateImageWithOptionalLink(imgHtml: string, url: string | undefined, linkClass: string): string {
    if (url && url.trim() !== '') {
        return `<a href="${escapeAttr(safeUrl(url))}" target="_blank" rel="noopener noreferrer" class="${escapeAttr(linkClass)}" data-image-link>${imgHtml}</a>`;
    }
    return imgHtml;
}

function generateSidebar(lang: Lang, visible = true): string {
    const data = state.activeData;
    if (!data) return '';
    const sections = data.sections;
    const loadingAttr = visible ? '' : 'loading="lazy"';

    // Foto de perfil (con o sin enlace). URLs por safeUrl + escape de atributos.
    // OJO: `src` puede ser un data: URI (imagen subida en base64) → NO pasa por safeUrl
    // (lo bloquearía); solo se escapa el atributo.
    const profilePhotoHtml = `<div class="profile-photo-placeholder editable-image" data-image-type="profile" data-image-url="${escapeAttr(safeUrl(data.personal.photoUrl || ''))}">
                <img src="${escapeAttr(data.personal.photo)}" alt="${escapeAttr(pickLang(data.personal.name, lang))}" ${loadingAttr}>
            </div>`;
    const profileWithLink = generateImageWithOptionalLink(
        profilePhotoHtml,
        data.personal.photoUrl,
        'profile-photo-link'
    );

    const qrHtml = `<img class="qr-image editable-image" data-image-type="qr" data-image-url="${escapeAttr(safeUrl(data.personal.qrUrl || ''))}" src="${escapeAttr(data.personal.qr)}" alt="QR Web" style="width: 140px; opacity: 0.9;" ${loadingAttr}>`;
    const qrWithLink = generateImageWithOptionalLink(qrHtml, data.personal.qrUrl, 'qr-image-link');

    return `
        <div class="sidebar">
            ${profileWithLink}

            <div class="sidebar-section">
                <h3 data-editable>${sectionTitle(sections, 'contact', lang)}</h3>
                <div class="contact-info">
                    <div><i class="fas fa-map-marker-alt"></i> <a data-editable-link href="${escapeAttr(safeUrl(data.personal.contact.locationUrl))}" target="_blank" rel="noopener noreferrer" style="color: white; text-decoration: none;">${escapeHtml(data.personal.contact.location[lang])}</a></div>
                    <div><i class="fas fa-phone"></i> <a data-editable-link href="${escapeAttr(safeUrl(data.personal.contact.phoneUrl))}" style="color: white; text-decoration: none;">${escapeHtml(data.personal.contact.phone)}</a></div>
                    <div><i class="fas fa-envelope"></i> <a data-editable-link href="${escapeAttr(safeUrl(data.personal.contact.emailUrl))}" style="color: white; text-decoration: none;">${escapeHtml(pickLang(data.personal.contact.email, lang))}</a></div>
                    <div><i class="fab fa-linkedin"></i> <a data-editable-link href="${escapeAttr(safeUrl(data.personal.contact.linkedinUrl))}" target="_blank" rel="noopener noreferrer" style="color: white; text-decoration: none;">${escapeHtml(pickLang(data.personal.contact.linkedin, lang))}</a></div>
                    <div><i class="fab fa-github"></i> <a data-editable-link href="${escapeAttr(safeUrl(data.personal.contact.githubUrl))}" target="_blank" rel="noopener noreferrer" style="color: white; text-decoration: none;">${escapeHtml(pickLang(data.personal.contact.github, lang))}</a></div>
                </div>
            </div>

            <div class="sidebar-section">
                <h3 data-editable>${sectionTitle(sections, 'tools', lang)}</h3>
                <div class="skills-container" data-editable-skills>
                    ${data.skills.map((skill) => `<span class="skill-tag"><span class="tag-text">${skill}</span></span>`).join('')}
                </div>
            </div>

            <div class="sidebar-section">
                <h3 data-editable>${sectionTitle(sections, 'competencies', lang)}</h3>
                <ul class="list-clean" data-editable-list>
                    ${data.competencies[lang].map((comp) => `<li><span class="list-text">\u2022 ${comp}</span></li>`).join('')}
                </ul>
            </div>

            <div class="sidebar-section">
                <h3 data-editable>${sectionTitle(sections, 'languages', lang)}</h3>
                <ul class="list-clean" data-editable-list>
                    ${data.languages.map((language) => `<li><strong data-editable>${language.name[lang]}:</strong> <span data-editable>${language.level[lang]}</span></li>`).join('')}
                </ul>
            </div>

            <div style="text-align: center; margin-top: -25px;">
                ${qrWithLink}
            </div>
        </div>
    `;
}

function generateMainContent(lang: Lang): string {
    const data = state.activeData;
    if (!data) return '';
    const sections = data.sections;

    return `
        <div class="main-content">
            <div class="header">
                <h1 data-editable>${pickLang(data.personal.name, lang)}</h1>
                <h2 data-editable>${data.header.title[lang]}</h2>
                <p data-editable>${data.header.tagline[lang]}</p>
            </div>

            <div class="main-section">
                <h3 data-editable>${sectionTitle(sections, 'profile', lang)}</h3>
                <p class="profile-text" data-editable>${data.profile[lang]}</p>
            </div>

            <div class="main-section" data-cv-section="experience">
                <h3 data-editable>${sectionTitle(sections, 'experience', lang)}</h3>
                ${data.experience.map((job) => generateJobItem(job, lang)).join('')}
            </div>

            <div class="main-section" data-cv-section="education">
                <h3 data-editable>${sectionTitle(sections, 'education', lang)}</h3>
                ${data.education.map((edu) => generateEducationItem(edu, lang)).join('')}
            </div>
        </div>
    `;
}

function generateJobItem(job: CVExperienceItem, lang: Lang): string {
    // `company` es opcional en el schema: una entrada sin empresa (los viajes de 2012-2016) no lleva « | undefined»
    const company = job.company ? ` | <span class="job-company" data-editable>${job.company}</span>` : '';
    return `
        <div class="job-item">
            <div class="job-header">
                <div>
                    <span class="job-title" data-editable>${job.title[lang]}</span>${company}
                </div>
                <span class="job-date" data-editable>${job.date[lang]}</span>
            </div>
            <ul class="job-details" data-editable-job-list>
                ${job.details
                    .map(
                        (detail) => `
                    <li>
                        <span class="item-title" data-editable>${detail.title[lang]}:</span>
                        <span class="item-content" data-editable>${detail.content[lang]}</span>
                    </li>
                `
                    )
                    .join('')}
            </ul>
        </div>
    `;
}

function generateEducationItem(edu: CVEducationItem, lang: Lang): string {
    return `
        <div class="job-item">
            <div class="job-header">
                <span class="job-title" data-editable>${edu.title[lang]}</span>
                <span class="job-date" data-editable>${edu.date[lang]}</span>
            </div>
            <div class="job-details" style="margin-left: 0;" data-editable>${edu.institution}</div>
        </div>
    `;
}

export function updateButtonLabels(lang: Lang): void {
    const ui = state.activeData?.ui;
    if (!ui) return;

    // Botones flotantes (Textos/Config estáticos)
    const downloadBtn = document.querySelector('#downloadBtn span');
    if (downloadBtn) downloadBtn.textContent = ui.download.label[lang];

    const langToggle = document.querySelector('#langToggle span');
    if (langToggle) {
        langToggle.textContent = ui.language.label[lang];
        langToggle.classList.remove('lang-badge--es', 'lang-badge--en', 'lang-badge--de');
        langToggle.classList.add(`lang-badge--${lang.toLowerCase()}`);
    }

    updateDesignPickerLabels(lang);
}
