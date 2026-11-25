import type { CVData } from './cv-types.ts';

// El CV de reserva: el que enseña el editor si el JSON del perfil activo no se puede cargar. Es el de
// «Lucía» (cv-profiles.ts); para hacerlo tuyo, pon aquí también el tuyo.
export const cvData = {
    meta: {
        version: '1.0',
        lastUpdated: '2026-11-25',
        defaultTheme: 'theme-purple',
    },
    personal: {
        name: 'Lucía Arnedo',
        photo: './cv/foto-generica.webp',
        photoUrl: '',
        qr: './cv/qr-repo.webp',
        qrUrl: 'https://github.com/davidmcaru/app-cv-editor',
        contact: {
            location: {
                ES: 'Londres, Reino Unido',
                EN: 'London, United Kingdom',
                DE: 'London, Vereinigtes Königreich',
            },
            locationUrl: 'https://www.google.com/maps/place/London',
            phone: '+44 7700 900412',
            phoneUrl: 'tel:+447700900412',
            email: 'lucia.arnedo@example.com',
            emailUrl: 'mailto:lucia.arnedo@example.com',
            linkedin: 'linkedin.com/in/larnedo',
            linkedinUrl: 'https://www.linkedin.com/',
            github: 'github.com/larnedo',
            githubUrl: 'https://github.com/',
        },
    },
    header: {
        title: {
            ES: 'Ingeniera Frontend',
            EN: 'Frontend Engineer',
            DE: 'Frontend-Entwicklerin',
        },
        tagline: {
            ES: 'Interfaces rápidas y accesibles, del prototipo a producción',
            EN: 'Fast, accessible interfaces, from prototype to production',
            DE: 'Schnelle, barrierefreie Oberflächen vom Prototyp bis zur Produktion',
        },
    },
    sections: {
        contact: {
            ES: 'Contacto',
            EN: 'Contact',
            DE: 'Kontakt',
        },
        tools: {
            ES: 'Herramientas',
            EN: 'Tools & Technologies',
            DE: 'IT-Kenntnisse',
        },
        competencies: {
            ES: 'Competencias',
            EN: 'Core Competencies',
            DE: 'Kernkompetenzen',
        },
        languages: {
            ES: 'Idiomas',
            EN: 'Languages',
            DE: 'Sprachen',
        },
        profile: {
            ES: 'Perfil Profesional',
            EN: 'Professional Profile',
            DE: 'Berufsprofil',
        },
        experience: {
            ES: 'Experiencia Laboral',
            EN: 'Work Experience',
            DE: 'Berufserfahrung',
        },
        education: {
            ES: 'Formación',
            EN: 'Education',
            DE: 'Ausbildung',
        },
    },
    profile: {
        ES: 'Ingeniera frontend con ocho años construyendo productos web en equipos pequeños. Me muevo entre el diseño y el código: llevo prototipos de Figma a componentes accesibles, mido el rendimiento en dispositivos reales y cuido los detalles que hacen que una interfaz se sienta rápida. He liderado la migración a TypeScript de una plataforma con 400.000 usuarios y un design system que usan cinco equipos.',
        EN: 'Frontend engineer with eight years building web products in small teams. I move between design and code: I turn Figma prototypes into accessible components, measure performance on real devices and care about the details that make an interface feel fast. I led the TypeScript migration of a platform with 400,000 users and a design system used by five teams.',
        DE: 'Frontend-Entwicklerin mit acht Jahren Erfahrung in kleinen Produktteams. Aus Figma-Prototypen mache ich barrierefreie Komponenten, ich messe die Performance auf echten Geräten und achte auf die Details, durch die sich eine Oberfläche schnell anfühlt. Ich habe die TypeScript-Migration einer Plattform mit 400.000 Nutzern und ein Designsystem für fünf Teams geleitet.',
    },
    skills: [
        'TypeScript',
        'React',
        'Vue',
        'CSS',
        'Vite',
        'Node.js',
        'Figma',
        'Storybook',
        'Playwright',
        'Vitest',
        'GraphQL',
        'Git',
    ],
    competencies: {
        ES: [
            'Arquitectura frontend',
            'Accesibilidad (WCAG 2.2)',
            'Rendimiento web',
            'Design systems',
            'Testing E2E',
            'Mentoría técnica',
        ],
        EN: [
            'Frontend architecture',
            'Accessibility (WCAG 2.2)',
            'Web performance',
            'Design systems',
            'End-to-end testing',
            'Technical mentoring',
        ],
        DE: [
            'Frontend-Architektur',
            'Barrierefreiheit (WCAG 2.2)',
            'Web-Performance',
            'Designsysteme',
            'End-to-End-Tests',
            'Technisches Mentoring',
        ],
    },
    languages: [
        {
            name: {
                ES: 'Español',
                EN: 'Spanish',
                DE: 'Spanisch',
            },
            level: {
                ES: 'Nativo',
                EN: 'Native',
                DE: 'Muttersprache',
            },
        },
        {
            name: {
                ES: 'Inglés',
                EN: 'English',
                DE: 'Englisch',
            },
            level: {
                ES: 'C2',
                EN: 'C2',
                DE: 'C2',
            },
        },
        {
            name: {
                ES: 'Francés',
                EN: 'French',
                DE: 'Französisch',
            },
            level: {
                ES: 'B1',
                EN: 'B1',
                DE: 'B1',
            },
        },
    ],
    experience: [
        {
            title: {
                ES: 'Senior Frontend Engineer',
                EN: 'Senior Frontend Engineer',
                DE: 'Senior Frontend Engineer',
            },
            company: 'Lumenta',
            date: {
                ES: 'Mar 2022 – Actualidad',
                EN: 'Mar 2022 – Present',
                DE: 'Seit Mär 2022',
            },
            details: [
                {
                    title: {
                        ES: 'Plataforma',
                        EN: 'Platform',
                        DE: 'Plattform',
                    },
                    content: {
                        ES: 'Migré a TypeScript y Vite la app principal (400.000 usuarios): builds seis veces más rápidos y un 40 % menos de errores en producción.',
                        EN: 'Migrated the main app (400,000 users) to TypeScript and Vite: builds six times faster and 40% fewer errors in production.',
                        DE: 'Migration der Haupt-App (400.000 Nutzer) auf TypeScript und Vite: sechsmal schnellere Builds und 40 % weniger Fehler in Produktion.',
                    },
                },
                {
                    title: {
                        ES: 'Design system',
                        EN: 'Design system',
                        DE: 'Design system',
                    },
                    content: {
                        ES: 'Creé y mantengo la librería de componentes de cinco equipos, con Storybook, tokens de diseño y pruebas visuales.',
                        EN: 'Built and maintain the component library used by five teams, with Storybook, design tokens and visual tests.',
                        DE: 'Aufbau und Pflege der Komponentenbibliothek für fünf Teams, mit Storybook, Design-Tokens und visuellen Tests.',
                    },
                },
                {
                    title: {
                        ES: 'Accesibilidad',
                        EN: 'Accessibility',
                        DE: 'Barrierefreiheit',
                    },
                    content: {
                        ES: 'Llevé el producto a WCAG 2.2 AA y enseñé al equipo a probarlo con lector de pantalla.',
                        EN: 'Brought the product to WCAG 2.2 AA and taught the team to test it with a screen reader.',
                        DE: 'Das Produkt auf WCAG 2.2 AA gebracht und dem Team das Testen mit Screenreader beigebracht.',
                    },
                },
            ],
        },
        {
            title: {
                ES: 'Frontend Developer',
                EN: 'Frontend Developer',
                DE: 'Frontend Developer',
            },
            company: 'Paperkite Studio',
            date: {
                ES: 'Jun 2019 – Feb 2022',
                EN: 'Jun 2019 – Feb 2022',
                DE: 'Jun 2019 – Feb 2022',
            },
            details: [
                {
                    title: {
                        ES: 'Clientes',
                        EN: 'Clients',
                        DE: 'Kunden',
                    },
                    content: {
                        ES: 'Webs y apps para 20 clientes de comercio y cultura, del prototipo a producción.',
                        EN: 'Websites and apps for 20 retail and culture clients, from prototype to production.',
                        DE: 'Websites und Apps für 20 Kunden aus Handel und Kultur, vom Prototyp bis zum Livegang.',
                    },
                },
                {
                    title: {
                        ES: 'Rendimiento',
                        EN: 'Performance',
                        DE: 'Performance',
                    },
                    content: {
                        ES: 'Bajé el tiempo de carga de la tienda principal de 4,1 a 1,6 segundos.',
                        EN: 'Cut the load time of the main online store from 4.1 to 1.6 seconds.',
                        DE: 'Ladezeit des wichtigsten Onlineshops von 4,1 auf 1,6 Sekunden gesenkt.',
                    },
                },
            ],
        },
        {
            title: {
                ES: 'Desarrolladora web',
                EN: 'Web Developer',
                DE: 'Webentwicklerin',
            },
            company: 'Brisa Digital',
            date: {
                ES: 'Sep 2017 – May 2019',
                EN: 'Sep 2017 – May 2019',
                DE: 'Sep 2017 – Mai 2019',
            },
            details: [],
        },
    ],
    education: [
        {
            title: {
                ES: 'Grado en Ingeniería Informática',
                EN: 'BSc in Computer Engineering',
                DE: 'B.Sc. Technische Informatik',
            },
            institution: 'Escuela Superior de Ingeniería del Turia',
            date: {
                ES: '2013 – 2017',
                EN: '2013 – 2017',
                DE: '2013 – 2017',
            },
        },
    ],
    ui: {
        buttons: {
            addSkill: {
                ES: '+ Añadir',
                EN: '+ Add',
                DE: '+ Hinzufügen',
            },
            addItem: {
                ES: '+ Añadir',
                EN: '+ Add',
                DE: '+ Hinzufügen',
            },
            addLanguage: {
                ES: '+ Añadir idioma',
                EN: '+ Add language',
                DE: '+ Sprache hinzufügen',
            },
            addPoint: {
                ES: '+ Añadir punto',
                EN: '+ Add item',
                DE: '+ Punkt hinzufügen',
            },
            addExperience: {
                ES: '+ Añadir experiencia',
                EN: '+ Add experience',
                DE: '+ Erfahrung hinzufügen',
            },
            addEducation: {
                ES: '+ Añadir formación',
                EN: '+ Add education',
                DE: '+ Ausbildung hinzufügen',
            },
        },
        themes: {
            label: {
                ES: 'Estilo',
                EN: 'Theme',
                DE: 'Stil',
            },
        },
        edit: {
            label: {
                ES: 'Editar',
                EN: 'Edit',
                DE: 'Bearb.',
            },
            save: {
                ES: 'Guardar',
                EN: 'Save',
                DE: 'Speichern',
            },
            cancel: {
                ES: 'Cancelar',
                EN: 'Cancel',
                DE: 'Abbrechen',
            },
        },
        download: {
            label: {
                ES: 'Descargar',
                EN: 'Download',
                DE: 'Herunterladen',
            },
        },
        language: {
            label: {
                ES: 'ESP',
                EN: 'ENG',
                DE: 'DEU',
            },
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

export default cvData;
