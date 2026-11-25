import type { ThemePreference } from '../types.ts';
import type { CampoAjuste } from './ajustes-contrato.ts';

export const IDIOMAS = ['es', 'en'] as const;
export type Lang = (typeof IDIOMAS)[number];

export const AJUSTE_TEMA: CampoAjuste<ThemePreference> = {
    id: 'tema',
    clave: 'theme-preference',
    texto: 'ajustes.general.tema',
    ayuda: 'ajustes.general.temaAyuda',
    defecto: 'auto',
    opciones: [
        { valor: 'light', texto: 'ajustes.general.claro', icono: 'fa-regular fa-lightbulb' },
        { valor: 'dark', texto: 'ajustes.general.oscuro', icono: 'fa-regular fa-moon' },
        { valor: 'auto', texto: 'ajustes.general.sistema', icono: 'fa-solid fa-desktop' },
    ],
};

export const AJUSTE_IDIOMA: CampoAjuste<Lang> = {
    id: 'idioma',
    clave: 'lang-preference',
    texto: 'ajustes.general.idioma',
    ayuda: 'ajustes.general.idiomaNota',
    defecto: 'es',
    opciones: [
        { valor: 'es', texto: 'ajustes.general.espanol', glifo: 'ES' },
        { valor: 'en', texto: 'ajustes.general.ingles', glifo: 'EN' },
    ],
};
