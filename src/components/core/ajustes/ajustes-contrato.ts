// Claves del i18n del header: texto, ayuda, etiqueta y el corto del campo; el glifo y el icono de una opción, literales
export interface OpcionAjuste<T extends string = string> {
    readonly valor: T;
    readonly texto: string;
    readonly icono?: string;
    readonly glifo?: string;
    readonly ayuda?: string;
}

export interface CampoAjuste<T extends string = string> {
    readonly id: string;
    readonly clave: string;
    readonly claveVieja?: string;
    readonly texto: string;
    readonly corto?: string;
    readonly icono?: string;
    readonly ayuda?: string;
    // La ayuda corta de la baldosa del modal; con ella, la larga (`ayuda`) va en su ⓘ
    readonly resumen?: string;
    readonly etiqueta?: string;
    readonly opciones: readonly OpcionAjuste<T>[];
    readonly defecto: T;
    readonly rejilla?: boolean;
}
