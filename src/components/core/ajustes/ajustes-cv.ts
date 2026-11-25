import type { CampoAjuste } from './ajustes-contrato.ts';

// ⚠️ La clave y 'granted'/'denied' son los que el CV ya guardaba: con otros, todos volverían a «Preguntar»
const PERMISOS = ['ask', 'granted', 'denied'] as const;
type Permiso = (typeof PERMISOS)[number];

const GLIFO_PERMISO: Record<Permiso, string> = {
    ask: 'fa-solid fa-circle-question',
    granted: 'fa-solid fa-check',
    denied: 'fa-solid fa-ban',
};

export const AJUSTE_TRADUCCION_CV: CampoAjuste<Permiso> = {
    id: 'traduccion',
    clave: 'cv-translation-consent',
    texto: 'ajustes.cv.traduccion',
    corto: 'ajustes.cv.traduccionCorto',
    icono: 'fa-solid fa-language',
    ayuda: 'ajustes.cv.traduccionAyuda',
    resumen: 'ajustes.cv.traduccionResumen',
    defecto: 'ask',
    opciones: PERMISOS.map((valor) => ({
        valor,
        texto: `ajustes.cv.traduccion.${valor}`,
        glifo: GLIFO_PERMISO[valor],
        ayuda: `ajustes.cv.traduccion.${valor}Ayuda`,
    })),
};
