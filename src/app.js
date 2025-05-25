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
            translationDirections: {
                slovakToEnglish: true,
                englishToSlovak: false
            },
            wordGroups: {},
            loadingWords: true,
            loadError: null
        }
    },

    mounted() {
        this.loadFromStorage();
        this.loadWordGroups();
    },

    methods: {
        loadFromStorage() {
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
            localStorage.setItem('englishApp_wordStats', JSON.stringify(this.wordStats));
            localStorage.setItem('englishApp_sessionStats', JSON.stringify(this.sessionStats));
            localStorage.setItem('englishApp_directions', JSON.stringify(this.translationDirections));
        },

        async loadWordGroups() {
            this.loadingWords = true;
            this.loadError = null;

            const filesToTry = [
                'advertising.json',
                'alternative_medicine.json',
                'animals.json',
                'art.json',
                'at_a_hotel.json',
                'at_the_station.json',
                'at_work.json',
                'banking_and_insurance.json',
                'basic.json',
                'body.json',
                'computers.json',
                'countries.json',
                'daily_routine.json',
                'describing_people.json',
                'describing_personality.json',
                'diet.json',
                'economy.json',
                'environment.json',
                'equipment_and_decoration.json',
                'examinations.json',
                'family_history.json',
                'feelings_and_emotions.json',
                'food.json',
                'food_and_health.json',
                'going_on_holiday.json',
                'health_problems.json',
                'healthcare.json',
                'healthy_unhealthy_lifestyle.json',
                'in_the_house.json',
                'jobs.json',
                'leaving_and_returning_home.json',
                'leisure_time.json',
                'literature_theatre_film.json',
                'location.json',
                'looking_after_a_house.json',
                'looking_for_a_job.json',
                'marital_status.json',
                'meals.json',
                'means_of_transport.json',
                'music_and_dance.json',
                'not_working.json',
                'people_at_work.json',
                'people_in_a_school.json',
                'people_in_your_life.json',
                'personal_information.json',
                'pets.json',
                'plants.json',
                'politics.json',
                'press_radio_television.json',
                'quantities.json',
                'relationships.json',
                'renting_and_buying_a_home.json',
                'restaurants.json',
                'school_building_and_attendance.json',
                'school_subjects.json',
                'school_year.json',
                'sciences_and_scientists.json',
                'shopping.json',
                'size_and_condition.json',
                'space.json',
                'special_days.json',
                'sport.json',
                'stages_in_life.json',
                'studying_at_school.json',
                'teachers_and_students.json',
                'technology_in_our_lives.json',
                'things_you_wear.json',
                'travelling.json',
                'travelling_abroad.json',
                'treatment.json',
                'types_of_housing.json',
                'types_of_schools.json',
                'types_of_work.json',
                'weather.json'
            ];


            const loadedGroups = {};

            for (const filename of filesToTry) {
                try {
                    const response = await fetch(`/dictionary/${filename}`);
                    if (response.ok) {
                        const words = await response.json();
                        const groupKey = filename.replace('.json', '');
                        const groupName = this.formatGroupName(groupKey);

                        loadedGroups[groupKey] = {
                            name: groupName,
                            enabled: groupKey === 'basic',
                            words: words
                        };

                        console.log(`Loaded ${words.length} words from ${filename}`);
                    }
                } catch (error) {
                    console.log(`Could not load ${filename}:`, error.message);
                }
            }

            if (Object.keys(loadedGroups).length === 0) {
                this.loadError = 'No dictionary files found. Please add JSON files to the dictionary/ folder.';
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
            this.loadingWords = false;

            this.initializeWordStats();
            this.selectNextWord();
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
                                question: word.slovak,
                                answer: word.english,
                                direction: 'sk-en',
                                targetLanguage: 'English',
                                originalWord: word
                            });
                        }
                        if (this.translationDirections.englishToSlovak) {
                            enabledWords.push({
                                question: word.english,
                                answer: word.slovak,
                                direction: 'en-sk',
                                targetLanguage: 'Slovak',
                                originalWord: word
                            });
                        }
                    });
                }
            });
            return enabledWords;
        },

        calculateWordProbability(word) {
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

        selectNextWord() {
            const enabledWords = this.getEnabledWords();

            if (enabledWords.length === 0) {
                this.currentWord = null;
                return;
            }

            const wordProbabilities = enabledWords.map(word => ({
                word: word,
                probability: this.calculateWordProbability(word)
            }));

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
                const key = this.currentWord.originalWord.slovak + '-' + this.currentWord.originalWord.english + '-' + this.currentWord.direction;
                this.wordStats[key] = this.wordStats[key] || {correct: 0, incorrect: 0, lastSeen: 0};
                this.wordStats[key].lastSeen = Date.now();
            }
        },

        checkAnswer() {
            if (!this.userInput.trim()) return;

            const userAnswer = this.userInput.trim().toLowerCase();
            const correctAnswer = this.currentWord.answer.toLowerCase();
            const isCorrect = userAnswer === correctAnswer;

            this.lastResult = {
                correct: isCorrect,
                question: this.currentWord.question,
                answer: this.userInput.trim(),
                correctAnswer: this.currentWord.answer
            };

            const key = this.currentWord.originalWord.slovak + '-' + this.currentWord.originalWord.english + '-' + this.currentWord.direction;
            this.wordStats[key] = this.wordStats[key] || {correct: 0, incorrect: 0, lastSeen: 0};

            if (isCorrect) {
                this.wordStats[key].correct++;
                this.sessionStats.correct++;
            } else {
                this.wordStats[key].incorrect++;
                this.sessionStats.incorrect++;
            }

            this.saveToStorage();
            this.nextWord();
        },

        nextWord() {
            this.userInput = '';
            this.selectNextWord();

            this.$nextTick(() => {
                if (this.$refs.translationInput) {
                    this.$refs.translationInput.focus();
                }
            });
        },

        onDirectionChange() {
            if (!this.translationDirections.slovakToEnglish && !this.translationDirections.englishToSlovak) {
                this.translationDirections.slovakToEnglish = true;
            }

            this.saveToStorage();
            this.selectNextWord();
        },

        onGroupToggle() {
            const enabledWords = this.getEnabledWords();
            const currentWordEnabled = enabledWords.some(word =>
                word.originalWord.slovak === this.currentWord?.originalWord?.slovak &&
                word.originalWord.english === this.currentWord?.originalWord?.english
            );

            if (!currentWordEnabled) {
                this.selectNextWord();
            }
        },

        getSuccessRate(stats) {
            const total = stats.correct + stats.incorrect;
            return total > 0 ? Math.round((stats.correct / total) * 100) : 0;
        }
    }
}).mount('#app');