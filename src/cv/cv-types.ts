export type Lang = 'ES' | 'EN' | 'DE';

/** Perfil profesional del CV. Vive aquí (y no en cv-profile-panel) para que cv-constants
 *  pueda tiparse sin crear un ciclo constants → profile-panel → controller → constants. */
export type { ProfileId } from './cv-profiles.ts';

export type I18nString = Record<Lang, string>;
export type I18nArray = Record<Lang, string[]>;

/** Campo de texto que admite las DOS formas que el render acepta a propósito (`pickLang`
 *  en cv-data-loader devuelve `value[lang]` si es objeto y `value` si es plano): los datos
 *  reales traen un `string` único —un nombre o un email no se traducen—
 *  y la plantilla genérica de edición trae `{ES,EN,DE}` con el placeholder por idioma.
 *  Declarar solo `string` describía media realidad; lo destapó `satisfies CVData` al quitar
 *  el `@ts-nocheck` de cv-data-generic. */
export type MaybeI18nString = string | I18nString;

export interface CVContact {
    location: I18nString;
    locationUrl?: string;
    phone?: MaybeI18nString;
    phoneUrl?: string;
    email?: MaybeI18nString;
    emailUrl?: string;
    linkedin?: MaybeI18nString;
    linkedinUrl?: string;
    github?: MaybeI18nString;
    githubUrl?: string;
}

export interface CVPersonal {
    name: MaybeI18nString;
    photo: string;
    photoUrl?: string;
    qr?: string;
    qrUrl?: string;
    contact: CVContact;
}

export interface CVHeader {
    title: I18nString;
    tagline: I18nString;
}

export interface CVExperienceDetail {
    title: I18nString;
    content: I18nString;
}

export interface CVExperienceItem {
    title: I18nString;
    company?: string;
    date: I18nString;
    details: CVExperienceDetail[];
}

export interface CVEducationItem {
    title: I18nString;
    institution?: string;
    /** Obligatorio: el render la usa sin guard y está presente en las 4 fuentes de datos
     * . Estaba declarada opcional. */
    date: I18nString;
}

export interface CVLanguageItem {
    name: I18nString;
    level: I18nString;
}

export interface CVMeta {
    version: string;
    lastUpdated?: string;
    defaultLang?: Lang;
    defaultTheme?: string;
}

export interface CVUiButtons {
    addSkill: I18nString;
    addItem: I18nString;
    addLanguage: I18nString;
    addPoint: I18nString;
    addExperience: I18nString;
    addEducation: I18nString;
}

export interface CVUi {
    buttons: CVUiButtons;
    themes: { label: I18nString };
    edit: { label: I18nString; save: I18nString; cancel: I18nString };
    download: { label: I18nString };
    language: { label: I18nString };
    format: { names: Record<Lang, string[]> };
}

export interface CVData {
    meta: CVMeta;
    personal: CVPersonal;
    header: CVHeader;
    sections: Record<string, I18nString>;
    profile: I18nString;
    skills: string[];
    competencies: I18nArray;
    languages: CVLanguageItem[];
    experience: CVExperienceItem[];
    education: CVEducationItem[];
    ui: CVUi;
}

export interface CVManualSnapshot {
    version: number;
    timestamp: number;
    currentLang: Lang;
    currentThemeIndex: number;
    currentFormat: number;
    downloadEnabled?: boolean;
    isOwnerView?: boolean;
    cvs: { ES: string; EN: string; DE: string };
}
