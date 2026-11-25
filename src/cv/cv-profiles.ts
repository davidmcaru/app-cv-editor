// Los CV de muestra del editor, cada uno con su JSON en public/cv/. Para usarlo con los tuyos, cambia esta
// lista y sus JSON: el primero es el que abre la primera vez, y las tarjetas de «Mis CVs» salen en este orden.
export const PROFILES = [
    { id: 'lucia', label: 'Lucía', icon: 'fa-code', source: 'cv/cv-lucia.json' },
    { id: 'jonas', label: 'Jonas', icon: 'fa-database', source: 'cv/cv-jonas.json' },
] as const;

export type ProfileId = (typeof PROFILES)[number]['id'];
export const PROFILE_IDS: ProfileId[] = PROFILES.map((p) => p.id);
export const DEFAULT_PROFILE: ProfileId = PROFILES[0].id;
export const PROFILE_SOURCES = Object.fromEntries(PROFILES.map((p) => [p.id, p.source])) as Record<ProfileId, string>;

export function isProfileId(value: unknown): value is ProfileId {
    return PROFILE_IDS.includes(value as ProfileId);
}
