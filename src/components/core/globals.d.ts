interface ThemeToggleAPI {
    toggle: () => void;
    getTheme: () => 'light' | 'dark';
    setTheme: (theme: string) => void;
    reset: () => void;
    reinit: () => void;
}

interface ThemeChangeDetail {
    theme: 'light' | 'dark';
}

// El único global de la app: el cambio de tema, que lo publica theme-toggle.ts
interface Window {
    ThemeToggle?: ThemeToggleAPI;
}

interface WindowEventMap {
    themechange: CustomEvent<ThemeChangeDetail>;
    'ajustes:cambio': CustomEvent<{ clave: string; valor: string }>;
}
