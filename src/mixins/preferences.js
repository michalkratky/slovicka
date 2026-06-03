// Preference management extracted from the main app
const PreferencesMixin = {
  methods: {
    async loadUserPreferences() {
      try {
        const preferences = await API.getPreferences();

        if (preferences.translationDirections) {
          this.translationDirections = preferences.translationDirections;
        }
        if (preferences.enableAIValidation !== undefined) {
          this.enableAIValidation = preferences.enableAIValidation === true;
        }
        if (preferences.enabledGroups) {
          this.enabledGroups = preferences.enabledGroups;
        }
      } catch (error) {
        console.warn("Error loading preferences, using localStorage fallback:", error.message);
        this.loadFromStorage();
      }
    },

    async saveUserPreferences() {
      try {
        const enabledGroups = {};
        Object.keys(this.wordGroups).forEach((key) => {
          enabledGroups[key] = this.wordGroups[key].enabled;
        });

        await API.saveAllPreferences(this.translationDirections, this.enableAIValidation, enabledGroups);
      } catch (error) {
        console.warn("Failed to save preferences to database:", error.message);
        this.saveToStorage();
      }
    },

    async loadSessionStats() {
      try {
        const stats = await API.getSessionStats();
        this.sessionStats = {
          correct: stats.today.correct_answers || 0,
          incorrect: stats.today.incorrect_answers || 0,
        };
      } catch (error) {
        console.warn("Failed to load session stats:", error.message);
        const saved = localStorage.getItem("englishApp_sessionStats");
        if (saved) this.sessionStats = JSON.parse(saved);
      }
    },

    loadFromStorage() {
      const savedStats = localStorage.getItem("englishApp_sessionStats");
      const savedDirs = localStorage.getItem("englishApp_directions");
      const savedAI = localStorage.getItem("englishApp_enableAIValidation");

      if (savedStats) this.sessionStats = JSON.parse(savedStats);
      if (savedDirs) this.translationDirections = JSON.parse(savedDirs);
      if (savedAI) {
        try { this.enableAIValidation = JSON.parse(savedAI) === true; }
        catch { /* ignore parse error */ }
      }
    },

    saveToStorage() {
      if (this.apiError) {
        localStorage.setItem("englishApp_sessionStats", JSON.stringify(this.sessionStats));
      }
      localStorage.setItem("englishApp_directions", JSON.stringify(this.translationDirections));
      localStorage.setItem("englishApp_enableAIValidation", JSON.stringify(this.enableAIValidation));
    },

    async loadWordGroups() {
      this.loadingWords = true;
      this.loadError = null;
      this.apiError = null;

      try {
        const wordGroups = await API.getWordGroups();

        if (Object.keys(wordGroups).length > 0) {
          this.wordGroups = wordGroups;

          if (this.enabledGroups) {
            Object.keys(this.wordGroups).forEach((key) => {
              if (Object.prototype.hasOwnProperty.call(this.enabledGroups, key)) {
                this.wordGroups[key].enabled = this.enabledGroups[key];
              }
            });
          }
        } else {
          await this.loadWordGroupsFromJSON();
        }
      } catch (error) {
        console.warn("Failed to load from database, falling back to JSON:", error.message);
        this.apiError = error.message;
        await this.loadWordGroupsFromJSON();
      }

      this.loadingWords = false;
      await this.selectNextWord();
    },

    async loadWordGroupsFromJSON() {
      try {
        const files = await API.getDictionaryFiles();
        const loadedGroups = {};

        for (const name of files) {
          try {
            const response = await fetch(`/dictionary/${name}.json`);
            if (response.ok) {
              const words = await response.json();
              if (words.length > 0) {
                loadedGroups[name] = {
                  name: this.formatGroupName(name),
                  enabled: name === "basic",
                  words,
                };
              }
            }
          } catch (error) {
            console.log(`Could not load ${name}:`, error.message);
          }
        }

        if (Object.keys(loadedGroups).length === 0) {
          this.loadError = "No dictionary files found.";
          loadedGroups.default = {
            name: "Default Words",
            enabled: true,
            words: [
              { slovak: "dom", english: "house" },
              { slovak: "auto", english: "car" },
              { slovak: "voda", english: "water" },
            ],
          };
        }

        this.wordGroups = loadedGroups;
      } catch {
        // getDictionaryFiles failed — fall back to hardcoded defaults
        this.wordGroups = {
          default: {
            name: "Default Words",
            enabled: true,
            words: [
              { slovak: "dom", english: "house" },
              { slovak: "auto", english: "car" },
              { slovak: "voda", english: "water" },
            ],
          },
        };
      }
    },

    formatGroupName(key) {
      return key.charAt(0).toUpperCase() + key.slice(1).replace(/[_-]/g, " ");
    },

    async loadUserStats() {
      try {
        const result = await API.getUserStats(0, 50);
        this.displayStats = result.data;
        this.statsHasMore = result.hasMore;
        this.statsOffset = result.data.length;
      } catch (error) {
        console.warn("Failed to load user stats:", error.message);
      }
    },

    async loadMoreStats() {
      try {
        const result = await API.getUserStats(this.statsOffset, 50);
        this.displayStats = [...this.displayStats, ...result.data];
        this.statsHasMore = result.hasMore;
        this.statsOffset += result.data.length;
      } catch (error) {
        console.warn("Failed to load more stats:", error.message);
      }
    },
  },
};
