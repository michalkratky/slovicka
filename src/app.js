// src/app.js - Complete frontend with database integration
const {createApp} = Vue;

createApp({
    data() {
        return {
            currentView: 'practice',
            currentWord: null,
            userInput: '',
            lastResult: null,
            sessionStats: {correct: 0, incorrect: 0},
            wordStats: {},
            displayStats: {},
            translationDirections: {
                slovakToEnglish: true,
                englishToSlovak: false
            },
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
            validationExplanation: ''
        }
    },

    async mounted() {
        await this.loadUserPreferences();
        await this.loadWordGroups();
        await this.loadSessionStats();
    },

    methods: {
        async loadUserPreferences() {
            try {
                const response = await fetch('/api/preferences');
                if (response.ok) {
                    const preferences = await response.json();

                    // Load translation directions
                    if (preferences.translationDirections) {
                        this.translationDirections = preferences.translationDirections;
                    }

                    // Load enabled groups
                    if (preferences.enabledGroups) {
                        this.enabledGroups = preferences.enabledGroups;
                    }

                    console.log('Loaded user preferences from database');
                } else {
                    console.warn('Failed to load preferences, using defaults');
                    this.loadFromStorage(); // Fallback to localStorage
                }
            } catch (error) {
                console.warn('Error loading preferences, using localStorage fallback:', error.message);
                this.loadFromStorage();
            }
        },

        async saveUserPreferences() {
            try {
                // Save translation directions
                await fetch('/api/preferences', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        key: 'translationDirections',
                        value: this.translationDirections
                    })
                });

                // Save enabled groups
                const enabledGroups = {};
                Object.keys(this.wordGroups).forEach(groupKey => {
                    enabledGroups[groupKey] = this.wordGroups[groupKey].enabled;
                });

                await fetch('/api/preferences', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        key: 'enabledGroups',
                        value: enabledGroups
                    })
                });

                console.log('Saved user preferences to database');
            } catch (error) {
                console.warn('Failed to save preferences to database, using localStorage fallback:', error.message);
                this.saveToStorage();
            }
        },

        async loadSessionStats() {
            try {
                const response = await fetch('/api/session-stats');
                if (response.ok) {
                    const stats = await response.json();
                    console.log('Raw session stats from database:', stats);

                    // Always use database values as the source of truth
                    this.sessionStats = {
                        correct: stats.today.correct_answers || 0,
                        incorrect: stats.today.incorrect_answers || 0
                    };
                    console.log('Updated session stats:', this.sessionStats);
                } else {
                    console.warn('Failed to load session stats from database, using localStorage');
                    // Fallback to localStorage only if database fails
                    const savedSessionStats = localStorage.getItem('englishApp_sessionStats');
                    if (savedSessionStats) {
                        this.sessionStats = JSON.parse(savedSessionStats);
                    }
                }
            } catch (error) {
                console.warn('Failed to load session stats:', error.message);
                // Fallback to localStorage
                const savedSessionStats = localStorage.getItem('englishApp_sessionStats');
                if (savedSessionStats) {
                    this.sessionStats = JSON.parse(savedSessionStats);
                }
            }
        },

        loadFromStorage() {
            // Fallback method for localStorage compatibility
            const savedWordStats = localStorage.getItem('englishApp_wordStats');
            const savedSessionStats = localStorage.getItem('englishApp_sessionStats');
            const savedDirections = localStorage.getItem('englishApp_directions');

            if (savedWordStats) {
                this.wordStats = JSON.parse(savedWordStats);
            }

            if (savedSessionStats) {
                this.sessionStats = JSON.parse(savedSessionStats);
            }

            if (savedDirections) {
                this.translationDirections = JSON.parse(savedDirections);
            }
        },

        saveToStorage() {
            // Fallback method for localStorage compatibility
            localStorage.setItem('englishApp_wordStats', JSON.stringify(this.wordStats));
            // Only save session stats to localStorage if we're not using database
            if (this.apiError) {
                localStorage.setItem('englishApp_sessionStats', JSON.stringify(this.sessionStats));
            }
            localStorage.setItem('englishApp_directions', JSON.stringify(this.translationDirections));
        },

        async loadWordGroups() {
            this.loadingWords = true;
            this.loadError = null;
            this.apiError = null;

            try {
                // Try to load from database API first
                const response = await fetch('/api/word-groups');

                if (response.ok) {
                    const wordGroups = await response.json();

                    if (Object.keys(wordGroups).length > 0) {
                        this.wordGroups = wordGroups;

                        // Apply saved group preferences if available
                        if (this.enabledGroups) {
                            Object.keys(this.wordGroups).forEach(groupKey => {
                                if (this.enabledGroups.hasOwnProperty(groupKey)) {
                                    this.wordGroups[groupKey].enabled = this.enabledGroups[groupKey];
                                }
                            });
                        }

                        console.log('Loaded word groups from database');
                    } else {
                        // Fallback to JSON files if database is empty
                        await this.loadWordGroupsFromJSON();
                    }
                } else {
                    throw new Error(`API responded with status: ${response.status}`);
                }
            } catch (error) {
                console.warn('Failed to load from database, falling back to JSON files:', error.message);
                this.apiError = error.message;
                await this.loadWordGroupsFromJSON();
            }

            this.loadingWords = false;
            this.initializeWordStats();
            await this.selectNextWord();
        },

        async loadWordGroupsFromJSON() {
            // Fallback to original JSON file loading
            const filesToTry = [
                'advertising.json', 'alternative_medicine.json', 'animals.json', 'art.json',
                'at_a_hotel.json', 'at_the_station.json', 'at_work.json', 'banking_and_insurance.json',
                'basic.json', 'body.json', 'computers.json', 'countries.json', 'daily_routine.json',
                'describing_people.json', 'describing_personality.json', 'diet.json', 'economy.json',
                'environment.json', 'equipment_and_decoration.json', 'examinations.json',
                'family_history.json', 'feelings_and_emotions.json', 'food.json', 'food_and_health.json',
                'going_on_holiday.json', 'health_problems.json', 'healthcare.json',
                'healthy_unhealthy_lifestyle.json', 'in_the_house.json', 'jobs.json',
                'leaving_and_returning_home.json', 'leisure_time.json', 'literature_theatre_film.json',
                'location.json', 'looking_after_a_house.json', 'looking_for_a_job.json',
                'marital_status.json', 'meals.json', 'means_of_transport.json', 'music_and_dance.json',
                'not_working.json', 'people_at_work.json', 'people_in_a_school.json',
                'people_in_your_life.json', 'personal_information.json', 'pets.json', 'plants.json',
                'politics.json', 'press_radio_television.json', 'quantities.json', 'relationships.json',
                'renting_and_buying_a_home.json', 'restaurants.json', 'school_building_and_attendance.json',
                'school_subjects.json', 'school_year.json', 'sciences_and_scientists.json',
                'shopping.json', 'size_and_condition.json', 'space.json', 'special_days.json',
                'sport.json', 'stages_in_life.json', 'studying_at_school.json', 'teachers_and_students.json',
                'technology_in_our_lives.json', 'things_you_wear.json', 'travelling.json',
                'travelling_abroad.json', 'treatment.json', 'types_of_housing.json',
                'types_of_schools.json', 'types_of_work.json', 'weather.json'
            ];

            const loadedGroups = {};

            for (const filename of filesToTry) {
                try {
                    const response = await fetch(`/dictionary/${filename}`);
                    if (response.ok) {
                        const words = await response.json();
                        if (words.length > 0) {
                            const groupKey = filename.replace('.json', '');
                            const groupName = this.formatGroupName(groupKey);

                            loadedGroups[groupKey] = {
                                name: groupName,
                                enabled: groupKey === 'basic',
                                words: words
                            };

                            console.log(`Loaded ${words.length} words from ${filename}`);
                        }
                    }
                } catch (error) {
                    console.log(`Could not load ${filename}:`, error.message);
                }
            }

            if (Object.keys(loadedGroups).length === 0) {
                this.loadError = 'No dictionary files found. Please add JSON files to the dictionary/ folder or set up the database.';
                loadedGroups.default = {
                    name: 'Default Words',
                    enabled: true,
                    words: [
                        {slovak: "dom", english: "house"},
                        {slovak: "auto", english: "car"},
                        {slovak: "voda", english: "water"}
                    ]
                };
            }

            this.wordGroups = loadedGroups;
        },

        formatGroupName(key) {
            return key.charAt(0).toUpperCase() + key.slice(1).replace(/[_-]/g, ' ');
        },

        initializeWordStats() {
            Object.keys(this.wordGroups).forEach(groupKey => {
                this.wordGroups[groupKey].words.forEach(word => {
                    // Initialize stats for both directions
                    const keySK = word.slovak + '-' + word.english + '-sk-en';
                    const keyEN = word.slovak + '-' + word.english + '-en-sk';

                    if (!this.wordStats[keySK]) {
                        this.wordStats[keySK] = {correct: 0, incorrect: 0, lastSeen: 0};
                    }
                    if (!this.wordStats[keyEN]) {
                        this.wordStats[keyEN] = {correct: 0, incorrect: 0, lastSeen: 0};
                    }
                });
            });
        },

        getEnabledWords() {
            const enabledWords = [];
            Object.keys(this.wordGroups).forEach(groupKey => {
                if (this.wordGroups[groupKey].enabled) {
                    this.wordGroups[groupKey].words.forEach(word => {
                        if (this.translationDirections.slovakToEnglish) {
                            enabledWords.push({
                                id: word.id || null, // For database words
                                question: word.slovak,
                                answer: word.english,
                                direction: 'sk-en',
                                targetLanguage: 'english',
                                originalWord: word
                            });
                        }
                        if (this.translationDirections.englishToSlovak) {
                            enabledWords.push({
                                id: word.id || null, // For database words
                                question: word.english,
                                answer: word.slovak,
                                direction: 'en-sk',
                                targetLanguage: 'slovak',
                                originalWord: word
                            });
                        }
                    });
                }
            });
            return enabledWords;
        },

        async calculateWordProbability(word) {
            // Try to get difficulty from database if word has ID
            if (word.id) {
                try {
                    const response = await fetch(`/api/word-difficulty/${word.id}/${word.direction}`);
                    if (response.ok) {
                        const result = await response.json();
                        return result.difficulty;
                    }
                } catch (error) {
                    console.warn('Failed to get word difficulty from database:', error.message);
                }
            }

            // Fallback to original calculation
            const key = word.originalWord.slovak + '-' + word.originalWord.english + '-' + word.direction;
            const stats = this.wordStats[key];

            if (!stats) return 1;

            let probability = 1;

            const correctReduction = Math.min(stats.correct * 0.15, 0.9);
            probability *= (1 - correctReduction);

            probability *= (1 + stats.incorrect * 0.3);

            const timeSinceLastSeen = Date.now() - stats.lastSeen;
            const daysSince = timeSinceLastSeen / (1000 * 60 * 60 * 24);
            probability *= (1 + Math.min(daysSince * 0.1, 2));

            return Math.max(probability, 0.05);
        },

        async selectNextWord() {
            const enabledWords = this.getEnabledWords();

            if (enabledWords.length === 0) {
                this.currentWord = null;
                return;
            }

            // Calculate probabilities for all words
            const wordProbabilities = [];
            for (const word of enabledWords) {
                const probability = await this.calculateWordProbability(word);
                wordProbabilities.push({
                    word: word,
                    probability: probability
                });
            }

            const totalProbability = wordProbabilities.reduce((sum, item) => sum + item.probability, 0);
            let random = Math.random() * totalProbability;

            for (const item of wordProbabilities) {
                random -= item.probability;
                if (random <= 0) {
                    this.currentWord = item.word;
                    break;
                }
            }

            if (this.currentWord) {
                this.lastAnswerTime = Date.now();

                // Update last seen in local stats (fallback)
                const key = this.currentWord.originalWord.slovak + '-' + this.currentWord.originalWord.english + '-' + this.currentWord.direction;
                this.wordStats[key] = this.wordStats[key] || {correct: 0, incorrect: 0, lastSeen: 0};
                this.wordStats[key].lastSeen = Date.now();
            }
        },

        /**
         * Normalizes text by removing diacritics and converting to lowercase
         * @param {string} text - The text to normalize
         * @return {string} - Normalized text
         */
        normalizeText(text) {
            if (!text) return '';
            // Convert to lowercase and trim
            text = text.toLowerCase().trim();
            // Remove diacritics (accent marks)
            return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        },

        async checkAnswer() {
            if (!this.userInput.trim()) return;

            const userAnswer = this.userInput.trim();
            let isCorrect = false;
            let correctAnswers = [this.currentWord.answer];
            const timeTaken = Date.now() - this.lastAnswerTime;
            let recordedInDatabase = false;
            this.showValidationModal = false;

            // If word has an ID (from database), use API to check with synonyms
            if (this.currentWord.id) {
                try {
                    const response = await fetch('/api/check-answer', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            wordId: this.currentWord.id,
                            userAnswer: userAnswer,
                            targetLanguage: this.currentWord.targetLanguage
                        })
                    });

                    if (response.ok) {
                        const result = await response.json();
                        isCorrect = result.correct;
                        correctAnswers = result.correctAnswers;

                        // If the answer is not correct but could be validated
                        if (!isCorrect && result.needsValidation) {
                            // Store this state to show validation option to user
                            this.lastResult = {
                                correct: false,
                                question: this.currentWord.question,
                                answer: userAnswer,
                                correctAnswer: this.getDisplayAnswer(correctAnswers),
                                needsValidation: true,
                                wordId: this.currentWord.id,
                                targetLanguage: this.currentWord.targetLanguage
                            };
                            this.validationInProgress = false;
                            this.validationResult = null;
                            this.showValidationModal = true;
                            return;
                        }

                        // Record the answer in the database (this updates session stats too)
                        recordedInDatabase = await this.recordAnswer(this.currentWord.id, this.currentWord.direction, isCorrect, timeTaken);
                    } else {
                        console.warn('API check failed, falling back to simple comparison');
                        isCorrect = this.normalizeText(userAnswer) === this.normalizeText(this.currentWord.answer);
                    }
                } catch (error) {
                    console.warn('API check error, falling back to simple comparison:', error.message);
                    isCorrect = this.normalizeText(userAnswer) === this.normalizeText(this.currentWord.answer);
                }
            } else {
                // Fallback for JSON-based words - check synonyms if they exist
                const answers = [this.currentWord.answer];

                if (this.currentWord.originalWord.synonyms) {
                    const synonyms = this.currentWord.originalWord.synonyms[this.currentWord.targetLanguage];
                    if (synonyms && Array.isArray(synonyms)) {
                        answers.push(...synonyms);
                    }
                }

                correctAnswers = answers;
                isCorrect = answers.some(answer =>
                    this.normalizeText(answer) === this.normalizeText(userAnswer)
                );
            }

            this.lastResult = {
                correct: isCorrect,
                question: this.currentWord.question,
                answer: userAnswer,
                correctAnswer: this.getDisplayAnswer(correctAnswers),
                needsValidation: false
            };

            // Only update local stats if not recorded in database (to avoid double counting)
            if (!recordedInDatabase) {
                // Update local stats (fallback)
                const key = this.currentWord.originalWord.slovak + '-' + this.currentWord.originalWord.english + '-' + this.currentWord.direction;
                this.wordStats[key] = this.wordStats[key] || {correct: 0, incorrect: 0, lastSeen: 0};

                if (isCorrect) {
                    this.wordStats[key].correct++;
                    this.sessionStats.correct++;
                } else {
                    this.wordStats[key].incorrect++;
                    this.sessionStats.incorrect++;
                }

                this.saveToStorage(); // Fallback save
            }
            // Note: If recorded in database, session stats are already updated by loadSessionStats() call in recordAnswer()

            if (!this.lastResult?.needsValidation) {
                await this.nextWord();
            }
        },

        async recordAnswer(wordId, direction, isCorrect, timeTaken) {
            try {
                const response = await fetch('/api/record-answer', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        wordId: wordId,
                        direction: direction,
                        isCorrect: isCorrect,
                        timeTaken: timeTaken
                    })
                });

                if (response.ok) {
                    const result = await response.json();
                    console.log('Answer recorded successfully in database:', result);

                    // Immediately reload session stats from database to sync
                    await this.loadSessionStats();

                    return true; // Successfully recorded in database
                } else {
                    console.warn('Failed to record answer in database:', response.statusText);
                    return false;
                }
            } catch (error) {
                console.warn('Failed to record answer in database:', error.message);
                return false;
            }
        },

        getDisplayAnswer(correctAnswers) {
            // Display the main answer, and show synonyms if there are multiple
            if (correctAnswers.length === 1) {
                return correctAnswers[0];
            } else {
                return correctAnswers[0] + (correctAnswers.length > 1 ? ` (or: ${correctAnswers.slice(1).join(', ')})` : '');
            }
        },

        async nextWord() {
            this.userInput = '';
            await this.selectNextWord();

            this.$nextTick(() => {
                if (this.$refs.translationInput) {
                    this.$refs.translationInput.focus();
                }
            });
        },

        async onDirectionChange() {
            if (!this.translationDirections.slovakToEnglish && !this.translationDirections.englishToSlovak) {
                this.translationDirections.slovakToEnglish = true;
            }

            await this.saveUserPreferences();
            await this.selectNextWord();
        },

        async onGroupToggle() {
            const enabledWords = this.getEnabledWords();
            const currentWordEnabled = enabledWords.some(word =>
                word.originalWord.slovak === this.currentWord?.originalWord?.slovak &&
                word.originalWord.english === this.currentWord?.originalWord?.english
            );

            if (!currentWordEnabled) {
                await this.selectNextWord();
            }

            // Save the group preferences
            await this.saveUserPreferences();
        },

        async loadUserStats() {
            try {
                const response = await fetch('/api/user-stats');
                if (response.ok) {
                    const stats = await response.json();

                    // Convert database stats to display format
                    this.displayStats = {};
                    stats.forEach(stat => {
                        const key = `${stat.slovak}-${stat.english}`;
                        const direction = stat.direction === 'sk-en' ? 'SK→EN' : 'EN→SK';
                        const displayKey = `${key}-${direction}`;

                        this.displayStats[displayKey] = {
                            correct: stat.correct_count,
                            incorrect: stat.incorrect_count,
                            successRate: stat.success_rate,
                            lastSeen: stat.last_seen,
                            category: stat.category
                        };
                    });
                }
            } catch (error) {
                console.warn('Failed to load user stats:', error.message);
            }
        },

        getSuccessRate(stats) {
            const total = stats.correct + stats.incorrect;
            return total > 0 ? Math.round((stats.correct / total) * 100) : 0;
        },

        // Admin functions for managing words (if needed)
        async addNewWord(slovak, english, category, synonyms = {}) {
            try {
                const response = await fetch('/api/words', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        slovak,
                        english,
                        category,
                        synonyms
                    })
                });

                if (response.ok) {
                    const result = await response.json();
                    console.log('Word added successfully:', result);
                    // Reload word groups to include the new word
                    await this.loadWordGroups();
                    return result;
                } else {
                    const error = await response.json();
                    throw new Error(error.error || 'Failed to add word');
                }
            } catch (error) {
                console.error('Error deleting word:', error.message);
                throw error;
            }
        },

        /**
         * Validate a translation with AI and potentially add it as a synonym
         */
        async validateTranslation() {
            if (!this.lastResult || !this.lastResult.needsValidation) return;
            
            try {
                this.validationInProgress = true;
                
                const response = await fetch('/api/validate-translation', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        wordId: this.lastResult.wordId,
                        userAnswer: this.lastResult.answer,
                        targetLanguage: this.lastResult.targetLanguage
                    })
                });

                if (response.ok) {
                    const result = await response.json();
                    this.validationResult = result;
                    this.validationExplanation = result.explanation || '';
                    
                    if (result.valid) {
                        // If AI considers this a valid answer, update the result
                        this.lastResult.correct = true;
                        this.lastResult.correctAnswer = this.getDisplayAnswer(result.correctAnswers || [this.lastResult.correctAnswer]);
                        this.lastResult.needsValidation = false;
                        
                        // Update stats
                        this.sessionStats.correct++;
                        
                        // Record the answer in the database
                        await this.recordAnswer(
                            this.lastResult.wordId, 
                            this.currentWord.direction, 
                            true, 
                            0  // We don't have accurate time for this one
                        );
                    }
                } else {
                    const error = await response.json();
                    console.error('Error validating translation:', error.error);
                    this.validationResult = {
                        valid: false,
                        explanation: error.error || 'Failed to validate translation'
                    };
                }
            } catch (error) {
                console.error('Error validating translation:', error.message);
                this.validationResult = {
                    valid: false,
                    explanation: error.message
                };
            } finally {
                this.validationInProgress = false;
            }
        },
        
        /**
         * Cancel validation and continue to next word
         */
        async skipValidation() {
            if (this.lastResult) {
                // Update stats for the incorrect answer
                if (!this.lastResult.correct) {
                    await this.recordAnswer(
                        this.lastResult.wordId, 
                        this.currentWord.direction, 
                        false, 
                        0  // We don't have accurate time for this one
                    );
                }
                
                this.lastResult.needsValidation = false;
                this.showValidationModal = false;
            }
            
            await this.nextWord();
        },

        async deleteWord(wordId) {
            try {
                const response = await fetch(`/api/words/${wordId}`, {
                    method: 'DELETE'
                });

                if (response.ok) {
                    console.log('Word deleted successfully');
                    // Reload word groups to reflect the deletion
                    await this.loadWordGroups();
                } else {
                    const error = await response.json();
                    throw new Error(error.error || 'Failed to delete word');
                }
            } catch (error) {
                console.error('Error deleting word:', error.message);
                throw error;
            }
        }
    },

    // Watch for view changes to load appropriate data
    watch: {
        currentView: {
            handler(newView) {
                if (newView === 'stats') {
                    this.loadUserStats();
                }
            }
        }
    }
}).mount('#app');