import type { CVData } from './cv-types.ts';

// `satisfies` (no anotación): valida que la plantilla ES un CVData válido y a la vez
// conserva los tipos literales del objeto. Sin él, `defaultLang: 'ES'` se ensanchaba a
// `string` y no casaba con `Lang` al consumirlo como CVData.
export const cvDataGeneric = {
    meta: {
        version: '1.0',
        lastUpdated: '2026-01-30',
        defaultLang: 'ES',
        defaultTheme: 'theme-navy',
    },
    personal: {
        name: { ES: 'Tu Nombre Completo', EN: 'Your Full Name', DE: 'Ihr vollständiger Name' },
        photo: './cv/foto-generica.webp',
        photoUrl: '',
        qr: './cv/qr-repo.webp',
        qrUrl: 'https://github.com/davidmcaru/app-cv-editor',
        contact: {
            location: {
                ES: 'Tu Ciudad, País',
                EN: 'Your City, Country',
                DE: 'Deine Stadt, Land',
            },
            locationUrl: 'https://www.google.com/maps',
            phone: '+34 000 000 000',
            phoneUrl: 'tel:+34000000000',
            email: { ES: 'tuemail@ejemplo.com', EN: 'youremail@example.com', DE: 'mailadresse@example.com' },
            emailUrl: 'mailto:tuemail@ejemplo.com',
            linkedin: { ES: 'Tu Perfil LinkedIn', EN: 'Your LinkedIn Profile', DE: 'Ihr LinkedIn-Profil' },
            linkedinUrl: 'https://www.linkedin.com/in/tu-perfil/',
            github: { ES: 'tu-usuario', EN: 'your-username', DE: 'ihr-benutzername' },
            githubUrl: 'https://github.com/tu-usuario',
        },
    },
    header: {
        title: {
            ES: 'Tu Título Profesional',
            EN: 'Your Professional Title',
            DE: 'Dein Berufstitel',
        },
        tagline: {
            ES: 'Una breve descripción de tu propuesta de valor profesional.',
            EN: 'A brief description of your professional value proposition.',
            DE: 'Eine kurze Beschreibung deines professionellen Wertangebots.',
        },
    },
    sections: {
        contact: { ES: 'Contacto', EN: 'Contact', DE: 'Kontakt' },
        tools: { ES: 'Herramientas', EN: 'Tools & Technologies', DE: 'IT-Kenntnisse' },
        competencies: { ES: 'Competencias', EN: 'Core Competencies', DE: 'Kernkompetenzen' },
        languages: { ES: 'Idiomas', EN: 'Languages', DE: 'Sprachen' },
        profile: { ES: 'Perfil Profesional', EN: 'Professional Profile', DE: 'Berufsprofil' },
        experience: { ES: 'Experiencia Laboral', EN: 'Work Experience', DE: 'Berufserfahrung' },
        education: { ES: 'Formación', EN: 'Education', DE: 'Ausbildung' },
    },
    profile: {
        ES: 'Escribe aquí tu perfil profesional. Resume tu experiencia, habilidades principales y lo que te hace destacar en tu campo. Este texto debería captar la atención del reclutador en pocos segundos.',
        EN: "Write your professional profile here. Summarize your experience, main skills and what makes you stand out in your field. This text should capture the recruiter's attention in a few seconds.",
        DE: 'Schreibe hier dein berufliches Profil. Fasse deine Erfahrung, Hauptfähigkeiten und das zusammen, was dich in deinem Bereich auszeichnet. Dieser Text sollte die Aufmerksamkeit des Recruiters in wenigen Sekunden fesseln.',
    },
    // 9 skills y 4 competencias (no 10/6): con el folio A4 EXACTO la plantilla
    // genérica debe caber en una cara de serie — con 10/6 el sidebar desbordaba
    // ~44px en Chrome desktop y el aviso de desbordamiento saltaba nada más editar.
    skills: ['Skill 1', 'Skill 2', 'Skill 3', 'Skill 4', 'Skill 5', 'Skill 6', 'Skill 7', 'Skill 8', 'Skill 9'],
    competencies: {
        ES: ['Competencia 1', 'Competencia 2', 'Competencia 3', 'Competencia 4'],
        EN: ['Competency 1', 'Competency 2', 'Competency 3', 'Competency 4'],
        DE: ['Kompetenz 1', 'Kompetenz 2', 'Kompetenz 3', 'Kompetenz 4'],
    },
    languages: [
        {
            name: { ES: 'Español', EN: 'Spanish', DE: 'Spanisch' },
            level: { ES: 'Nativo', EN: 'Native', DE: 'Muttersprache' },
        },
        {
            name: { ES: 'Inglés', EN: 'English', DE: 'Englisch' },
            level: { ES: 'B2', EN: 'B2', DE: 'B2' },
        },
    ],
    experience: [
        {
            title: { ES: 'Tu Puesto de Trabajo', EN: 'Your Job Title', DE: 'Deine Stellenbezeichnung' },
            company: 'Nombre de la Empresa',
            date: { ES: 'Ene 2023 – Actualidad', EN: 'Jan 2023 – Present', DE: 'Jan 2023 – Heute' },
            details: [
                {
                    title: { ES: 'Responsabilidad 1', EN: 'Responsibility 1', DE: 'Verantwortung 1' },
                    content: {
                        ES: 'Descripción de tu primera responsabilidad o logro destacado en este puesto.',
                        EN: 'Description of your first responsibility or notable achievement in this position.',
                        DE: 'Beschreibung deiner ersten Verantwortung oder bemerkenswerten Leistung in dieser Position.',
                    },
                },
                {
                    title: { ES: 'Responsabilidad 2', EN: 'Responsibility 2', DE: 'Verantwortung 2' },
                    content: {
                        ES: 'Descripción de tu segunda responsabilidad o logro destacado en este puesto.',
                        EN: 'Description of your second responsibility or notable achievement in this position.',
                        DE: 'Beschreibung deiner zweiten Verantwortung oder bemerkenswerten Leistung in dieser Position.',
                    },
                },
            ],
        },
        {
            title: { ES: 'Puesto Anterior', EN: 'Previous Position', DE: 'Vorherige Position' },
            company: 'Empresa Anterior',
            date: { ES: 'Jun 2020 – Dic 2022', EN: 'Jun 2020 – Dec 2022', DE: 'Jun 2020 – Dez 2022' },
            details: [
                {
                    title: { ES: 'Logro Principal', EN: 'Main Achievement', DE: 'Haupterfolg' },
                    content: {
                        ES: 'Descripción del logro principal o responsabilidad en tu puesto anterior.',
                        EN: 'Description of the main achievement or responsibility in your previous position.',
                        DE: 'Beschreibung des Haupterfolgs oder der Verantwortung in deiner vorherigen Position.',
                    },
                },
            ],
        },
    ],
    education: [
        {
            title: { ES: 'Tu Título Universitario', EN: 'Your University Degree', DE: 'Dein Universitätsabschluss' },
            institution: 'Universidad, Ciudad',
            date: { ES: '2015 – 2019', EN: '2015 – 2019', DE: '2015 – 2019' },
        },
        {
            title: { ES: 'Formación Adicional', EN: 'Additional Education', DE: 'Zusätzliche Ausbildung' },
            institution: 'Centro de Formación, Ciudad',
            date: { ES: '2014 – 2015', EN: '2014 – 2015', DE: '2014 – 2015' },
        },
    ],
    ui: {
        buttons: {
            addSkill: { ES: '+ Añadir', EN: '+ Add', DE: '+ Hinzufügen' },
            addItem: { ES: '+ Añadir', EN: '+ Add', DE: '+ Hinzufügen' },
            addLanguage: { ES: '+ Añadir idioma', EN: '+ Add language', DE: '+ Sprache hinzufügen' },
            addPoint: { ES: '+ Añadir punto', EN: '+ Add item', DE: '+ Punkt hinzufügen' },
            addExperience: { ES: '+ Añadir experiencia', EN: '+ Add experience', DE: '+ Erfahrung hinzufügen' },
            addEducation: { ES: '+ Añadir formación', EN: '+ Add education', DE: '+ Ausbildung hinzufügen' },
        },
        themes: {
            label: { ES: 'Estilo', EN: 'Theme', DE: 'Stil' },
        },
        edit: {
            label: { ES: 'Editar', EN: 'Edit', DE: 'Bearb.' },
            save: { ES: 'Guardar', EN: 'Save', DE: 'Speichern' },
            cancel: { ES: 'Cancelar', EN: 'Cancel', DE: 'Abbrechen' },
        },
        download: {
            label: { ES: 'Descargar', EN: 'Download', DE: 'Herunterladen' },
        },
        language: {
            label: { ES: 'ESP', EN: 'ENG', DE: 'DEU' },
        },
        format: {
            names: {
                ES: ['Moderno', 'Harvard', 'Minimal', 'ATS'],
                EN: ['Modern', 'Harvard', 'Minimal', 'ATS'],
                DE: ['Modern', 'Harvard', 'Minimal', 'ATS'],
            },
        },
    },
} satisfies CVData;

// Compatibilidad global
// Retirado `window.cvDataGeneric = cvDataGeneric`. Era legacy puro —
// este objeto ya es `export const` (arriba) y su único lector (cv-edit-mode) lo importa.
