import type { CampoAjuste } from './ajustes-contrato.ts';

// El valor guardado, si es una de las opciones del campo; si no (nada, uno roto o de otra versión), el de fábrica
export const normalizar = <T extends string>(campo: CampoAjuste<T>, crudo: string | null): T =>
    campo.opciones.find((o) => o.valor === crudo)?.valor ?? campo.defecto;
