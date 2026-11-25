export type AppMode = 'full' | 'showcase';

// El <meta name="<app>-mode"> de la página: «showcase» es un escaparate (los CV de muestra alternan al recargar
// y la descarga espera a que guardes uno tuyo); sin él, o con cualquier otro valor, el editor completo.
export function detectAppMode(appName: string): AppMode {
    const meta = document.querySelector<HTMLMetaElement>(`meta[name="${appName}-mode"]`);
    return meta?.content === 'showcase' ? 'showcase' : 'full';
}
