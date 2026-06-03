const DATABASE_CONFIG = {
  databases: {
    "sk-en": {
      name: "Slovenčina - Angličtina",
      file: "database.db",
      flag: "🇸🇰",
      labels: { word: "Slovensky", translation: "English" },
      directions: {
        "word-translation": { from: "Slovenčina", to: "Angličtina" },
        "translation-word": { from: "Angličtina", to: "Slovenčina" },
      },
    },
    "de-en": {
      name: "Deutsch - English",
      file: "database.de.db",
      flag: "🇩🇪",
      labels: { word: "Deutsch", translation: "English" },
      directions: {
        "word-translation": { from: "Deutsch", to: "English" },
        "translation-word": { from: "English", to: "Deutsch" },
      },
    },
  },
  default: "sk-en",
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = DATABASE_CONFIG;
} else {
  window.DATABASE_CONFIG = DATABASE_CONFIG;
}
