// Practice-related methods extracted from the main app
const PracticeMixin = {
  methods: {
    async selectNextWord() {
      try {
        const enabledGroups = {};
        Object.keys(this.wordGroups).forEach((key) => {
          enabledGroups[key] = this.wordGroups[key].enabled;
        });

        const data = await API.getNextWord(enabledGroups, this.translationDirections);

        if (data.noWordsAvailable) {
          this.currentWord = null;
          return;
        }

        this.currentWord = data.nextWord;
        this.lastAnswerTime = Date.now();
      } catch (error) {
        console.error("Error fetching next word:", error);
        this.currentWord = null;
      }
    },

    async checkAnswer() {
      if (!this.userInput.trim()) return;
      if (this.showValidationModal) return;

      const userAnswer = this.userInput.trim();
      let isCorrect = false;
      let correctAnswers = [this.currentWord.answer];
      const timeTaken = Date.now() - this.lastAnswerTime;
      let recordedInDatabase = false;
      this._resetValidationState();

      if (this.currentWord.id) {
        try {
          const result = await API.checkAnswer(
            this.currentWord.id,
            userAnswer,
            this.currentWord.targetLanguage,
          );
          isCorrect = result.correct;
          correctAnswers = result.correctAnswers;

          if (!isCorrect && result.needsValidation && this.enableAIValidation) {
            this.lastResult = {
              correct: false,
              question: this.currentWord.question,
              answer: userAnswer,
              correctAnswer: this.getDisplayAnswer(correctAnswers),
              needsValidation: true,
              wordId: this.currentWord.id,
              targetLanguage: this.currentWord.targetLanguage,
            };
            this.showValidationModal = true;
            this.$nextTick(() => {
              if (this.$refs.validationInput) this.$refs.validationInput.focus();
            });
            return;
          }

          recordedInDatabase = await this.recordAnswer(
            this.currentWord.id,
            this.currentWord.direction,
            isCorrect,
            timeTaken,
          );
        } catch (error) {
          console.warn("API check error, falling back to simple comparison:", error.message);
          isCorrect = this.normalizeText(userAnswer) === this.normalizeText(this.currentWord.answer);
        }
      } else {
        const answers = [this.currentWord.answer];
        const synonyms = this.currentWord.originalWord?.synonyms?.[this.currentWord.targetLanguage];
        if (Array.isArray(synonyms)) answers.push(...synonyms);

        correctAnswers = answers;
        isCorrect = answers.some((a) => this.normalizeText(a) === this.normalizeText(userAnswer));
      }

      this.lastResult = {
        correct: isCorrect,
        question: this.currentWord.question,
        answer: userAnswer,
        correctAnswer: this.getDisplayAnswer(correctAnswers),
        needsValidation: false,
      };

      if (!recordedInDatabase) {
        if (isCorrect) this.sessionStats.correct++;
        else this.sessionStats.incorrect++;
        localStorage.setItem("englishApp_sessionStats", JSON.stringify(this.sessionStats));
      }

      if (!this.lastResult?.needsValidation) {
        await this.nextWord();
      }
    },

    async recordAnswer(wordId, direction, isCorrect, timeTaken) {
      try {
        await API.recordAnswer(wordId, direction, isCorrect, timeTaken);
        await this.loadSessionStats();
        return true;
      } catch (error) {
        console.warn("Failed to record answer in database:", error.message);
        return false;
      }
    },

    handleEnterKey(event) {
      event.preventDefault();
      if (this.validationResult || this.validationHasResult) {
        this.skipValidation();
      } else {
        this.validateTranslation();
      }
    },

    async validateTranslation() {
      if (!this.lastResult?.needsValidation || this.validationInProgress) return;

      try {
        this.validationInProgress = true;
        const result = await API.validateTranslation(
          this.lastResult.wordId,
          this.lastResult.answer,
          this.lastResult.targetLanguage,
        );

        this.validationResult = result;
        this.validationExplanation = result.explanation || "";
        this.validationHasResult = true;

        if (result.valid) {
          this.lastResult.correct = true;
          this.lastResult.correctAnswer = this.getDisplayAnswer(result.correctAnswers || [this.lastResult.correctAnswer]);
          this.lastResult.needsValidation = false;
          this.sessionStats.correct++;

          await this.recordAnswer(this.lastResult.wordId, this.currentWord.direction, true, 0);
          this.showValidationModal = false;
          await this.nextWord();
        }

        this.$nextTick(() => {
          if (this.$refs.validationInput) this.$refs.validationInput.focus();
        });
      } catch (error) {
        console.error("Error validating translation:", error.message);
        this.validationResult = { valid: false, explanation: error.message };
      } finally {
        this.validationInProgress = false;
      }
    },

    async skipValidation() {
      if (this.validationInProgress) return;

      if (this.lastResult) {
        if (!this.lastResult.correct && !this.validationResult?.valid) {
          await this.recordAnswer(this.lastResult.wordId, this.currentWord.direction, false, 0);
        }
        this.lastResult.needsValidation = false;
        this._resetValidationState();
      }

      await this.nextWord();
    },

    _resetValidationState() {
      this.showValidationModal = false;
      this.validationInput = "";
      this.validationResult = null;
      this.validationExplanation = "";
      this.validationHasResult = false;
    },

    async nextWord() {
      this.userInput = "";
      await this.selectNextWord();
      this.$nextTick(() => {
        if (this.$refs.translationInput) this.$refs.translationInput.focus();
      });
    },

    getDisplayAnswer(correctAnswers) {
      if (correctAnswers.length <= 1) return correctAnswers[0];
      return correctAnswers[0] + ` (or: ${correctAnswers.slice(1).join(", ")})`;
    },

    normalizeText(text) {
      if (!text) return "";
      return text.toLowerCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "");
    },

    getSuccessRate(stats) {
      const total = stats.correct + stats.incorrect;
      return total > 0 ? Math.round((stats.correct / total) * 100) : 0;
    },
  },
};
