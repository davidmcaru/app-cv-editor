import type { ProfileId } from './cv-types.ts';
import { PROFILE_IDS, PROFILE_SOURCES } from './cv-profiles.ts';

/* Constantes del design picker (cv-design-picker.ts) — extraídas según 5.5/8.1 */

// Índices de temas Light vs Dark dentro del array `themes` (cv-state.js)
export const LIGHT_THEME_INDEXES = [0, 1, 2, 3, 4, 5];
export const DARK_THEME_INDEXES = [6, 7, 9, 8, 10, 11];

export const THEME_TRAVERSAL_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7, 9, 8, 10, 11];

export const THEME_PREVIEWS = {
    0: ['#0d1b2a', '#00a8cc'],
    1: ['#2c3e50', '#3498db'],
    2: ['#1a252f', '#c0392b'],
    3: ['#0f3d3e', '#00b894'],
    4: ['#2e1437', '#9b59b6'],
    5: ['#2d3436', '#b38f00'],
    6: ['#040e12', '#00bcd4'],
    7: ['#080c14', '#4BC0D9'],
    8: ['#050e05', '#2ecc71'],
    9: ['#0e0505', '#e74c3c'],
    10: ['#060510', '#a78bfa'],
    11: ['#0a0804', '#d4a535'],
};

export const FORMAT_ICONS = {
    0: 'fa-file-alt',
    1: 'fa-columns',
    2: 'fa-align-left',
    3: 'fa-list-alt',
};

export const DEFAULT_CV_KEY = 'cv-editor-default-cv';
export const DEFAULT_CV_SEQUENCE: ProfileId[] = PROFILE_IDS;
export const DEFAULT_CV_SOURCES: Record<ProfileId, string> = PROFILE_SOURCES;
