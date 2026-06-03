// Database configuration for language switching
const DATABASE_CONFIG = {
    databases: {
        'sk-en': {
            name: 'Slovenčina - Angličtina',
            file: 'database.db',
            flag: '🇸🇰'
        },
        'de-en': {
            name: 'Deutsch - English',
            file: 'database.de.db',
            flag: '🇩🇪'
        }
    },
    default: 'sk-en'
};

// Export for both Node.js and browser environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DATABASE_CONFIG;
} else {
    window.DATABASE_CONFIG = DATABASE_CONFIG;
}
