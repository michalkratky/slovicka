const { createApp } = Vue;

createApp({
  mixins: [PreferencesMixin, PracticeMixin, GroupsMixin],

  data() {
    return {
      currentView: "practice",
      currentWord: null,
      userInput: "",
      lastResult: null,
      sessionStats: { correct: 0, incorrect: 0 },
      displayStats: {},
      translationDirections: {
        slovakToEnglish: true,
        englishToSlovak: false,
      },
      enableAIValidation: true,
      wordGroups: {},
      enabledGroups: {},
      loadingWords: true,
      loadError: null,
      apiError: null,
      sessionStartTime: Date.now(),
      lastAnswerTime: Date.now(),
      validationInProgress: false,
      validationResult: null,
      showValidationModal: false,
      validationExplanation: "",
      validationInput: "",
      validationHasResult: false,
      statsHasMore: false,
      statsOffset: 0,
      availableDatabases: window.DATABASE_CONFIG?.databases || {},
      currentDatabase: API.currentDatabase,
    };
  },

  async mounted() {
    await this.loadUserPreferences();
    await this.loadWordGroups();
    await this.loadSessionStats();
    this.saveUserPreferences();
  },

  methods: {
    async onDirectionChange() {
      if (!this.translationDirections.slovakToEnglish && !this.translationDirections.englishToSlovak) {
        this.translationDirections.slovakToEnglish = true;
      }
      await this.saveUserPreferences();
      this.currentWord = null;
      await this.selectNextWord();
    },

    async onAIValidationChange() {
      this.enableAIValidation = this.enableAIValidation === true;
      await this.saveUserPreferences();
    },

    async onGroupToggle() {
      await this.saveUserPreferences();
      this.currentWord = null;
      await this.selectNextWord();
    },

    async switchDatabase(event) {
      const newDatabase = event.target.value;
      if (newDatabase === this.currentDatabase) return;

      localStorage.setItem("selectedDatabase", newDatabase);
      this.currentDatabase = newDatabase;
      API.currentDatabase = newDatabase;

      this.currentWord = null;
      this.userInput = "";
      this.lastResult = null;
      this.loadingWords = true;
      this.loadError = null;
      this.wordGroups = {};
      this.sessionStats = { correct: 0, incorrect: 0 };
      this.displayStats = {};

      try {
        await this.loadUserPreferences();
        await this.loadWordGroups();
        await this.loadSessionStats();
        this.saveUserPreferences();
      } catch (error) {
        console.error("Error switching database:", error);
        this.loadError = `Failed to switch to database: ${error.message}`;
      }

      this.loadingWords = false;
    },
  },

  watch: {
    currentView: {
      handler(newView) {
        if (newView === "stats") {
          this.loadUserStats();
        }
      },
    },
  },
}).mount("#app");
