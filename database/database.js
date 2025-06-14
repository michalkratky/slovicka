// database/database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { normalizeText } = require('../utils');

class DatabaseService {
    constructor(dbPath = './database.db') {
        this.dbPath = dbPath;
        this.db = null;
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log('Connected to SQLite database');
                    resolve();
                }
            });
        });
    }

    // Get all word groups with their words and synonyms
    async getWordGroups() {
        const query = `
            SELECT
                w.id,
                w.slovak,
                w.english,
                w.category,
                GROUP_CONCAT(
                        CASE WHEN s.language = 'slovak'
                                 THEN s.synonym
                            END
                ) as slovak_synonyms,
                GROUP_CONCAT(
                        CASE WHEN s.language = 'english'
                                 THEN s.synonym
                            END
                ) as english_synonyms
            FROM words w
                     LEFT JOIN synonyms s ON w.id = s.word_id
            GROUP BY w.id, w.slovak, w.english, w.category
            ORDER BY w.category, w.slovak
        `;

        return new Promise((resolve, reject) => {
            this.db.all(query, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    const groups = {};

                    rows.forEach(row => {
                        if (!groups[row.category]) {
                            groups[row.category] = {
                                name: this.formatGroupName(row.category),
                                enabled: row.category === 'basic',
                                words: []
                            };
                        }

                        const word = {
                            id: row.id,
                            slovak: row.slovak,
                            english: row.english,
                            synonyms: {
                                slovak: row.slovak_synonyms ? row.slovak_synonyms.split(',') : [],
                                english: row.english_synonyms ? row.english_synonyms.split(',') : []
                            }
                        };

                        groups[row.category].words.push(word);
                    });

                    resolve(groups);
                }
            });
        });
    }

    // Get all possible correct answers for a word (including synonyms)
    async getCorrectAnswers(wordId, targetLanguage) {
        const query = `
            SELECT
                CASE
                    WHEN ? = 'english' THEN w.english
                    ELSE w.slovak
                    END as main_answer,
                s.synonym
            FROM words w
                     LEFT JOIN synonyms s ON w.id = s.word_id
                AND s.language = ?
            WHERE w.id = ?
        `;

        return new Promise((resolve, reject) => {
            this.db.all(query, [targetLanguage, targetLanguage, wordId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    const answers = new Set();

                    rows.forEach(row => {
                        if (row.main_answer) {
                            answers.add(row.main_answer.toLowerCase().trim());
                            // Also add normalized version (without diacritics)
                            answers.add(normalizeText(row.main_answer));
                        }
                        if (row.synonym) {
                            answers.add(row.synonym.toLowerCase().trim());
                            // Also add normalized version (without diacritics)
                            answers.add(normalizeText(row.synonym));
                        }
                    });

                    resolve(Array.from(answers));
                }
            });
        });
    }

    /**
     * Get all synonyms for a word in a specific language
     * @param {number} wordId - The ID of the word
     * @param {string} language - The language of the synonyms ('slovak' or 'english')
     * @returns {Promise<Array<string>>} List of synonyms
     */
    async getSynonyms(wordId, language) {
        const query = `
            SELECT synonym
            FROM synonyms
            WHERE word_id = ? AND language = ?
        `;

        return new Promise((resolve, reject) => {
            this.db.all(query, [wordId, language], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    const synonyms = rows.map(row => row.synonym);
                    resolve(synonyms);
                }
            });
        });
    }

    /**
     * Add a new synonym for a word
     * @param {number} wordId - The ID of the word
     * @param {string} language - The language of the synonym ('slovak' or 'english')
     * @param {string} synonym - The synonym to add
     * @returns {Promise<boolean>} Success status
     */
    async addSynonym(wordId, language, synonym) {
        // First check if this synonym already exists
        const checkQuery = `
            SELECT COUNT(*) as count
            FROM synonyms
            WHERE word_id = ? AND language = ? AND LOWER(synonym) = LOWER(?)
        `;

        return new Promise((resolve, reject) => {
            this.db.get(checkQuery, [wordId, language, synonym], (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }

                // If synonym already exists, return success
                if (row.count > 0) {
                    console.log(`Synonym "${synonym}" already exists for word ${wordId}`);
                    resolve(true);
                    return;
                }

                // Add the new synonym
                const insertQuery = `
                    INSERT INTO synonyms (word_id, language, synonym)
                    VALUES (?, ?, ?)
                `;

                this.db.run(insertQuery, [wordId, language, synonym.trim()], function(err) {
                    if (err) {
                        console.error('Error adding synonym:', err.message);
                        reject(err);
                    } else {
                        console.log(`Added new synonym "${synonym}" for word ${wordId} in ${language}`);
                        resolve(true);
                    }
                });
            });
        });
    }

    // Add a new word with synonyms
    async addWord(slovak, english, category, synonyms = {}) {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run('BEGIN TRANSACTION');

                // Insert main word
                const insertWord = `
                    INSERT INTO words (slovak, english, category)
                    VALUES (?, ?, ?)
                `;

                this.db.run(insertWord, [slovak, english, category], function(err) {
                    if (err) {
                        this.db.run('ROLLBACK');
                        reject(err);
                        return;
                    }

                    const wordId = this.lastID;

                    // Insert synonyms
                    const insertSynonym = `
                        INSERT INTO synonyms (word_id, synonym, language)
                        VALUES (?, ?, ?)
                    `;

                    let pendingInserts = 0;
                    let completed = 0;
                    let hasError = false;

                    // Count total synonyms to insert
                    if (synonyms.slovak) pendingInserts += synonyms.slovak.length;
                    if (synonyms.english) pendingInserts += synonyms.english.length;

                    const checkComplete = () => {
                        completed++;
                        if (completed === pendingInserts) {
                            if (hasError) {
                                this.db.run('ROLLBACK');
                            } else {
                                this.db.run('COMMIT');
                                resolve(wordId);
                            }
                        }
                    };

                    if (pendingInserts === 0) {
                        this.db.run('COMMIT');
                        resolve(wordId);
                        return;
                    }

                    // Insert Slovak synonyms
                    if (synonyms.slovak) {
                        synonyms.slovak.forEach(synonym => {
                            this.db.run(insertSynonym, [wordId, synonym, 'slovak'], (err) => {
                                if (err && !hasError) {
                                    hasError = true;
                                    reject(err);
                                } else {
                                    checkComplete();
                                }
                            });
                        });
                    }

                    // Insert English synonyms
                    if (synonyms.english) {
                        synonyms.english.forEach(synonym => {
                            this.db.run(insertSynonym, [wordId, synonym, 'english'], (err) => {
                                if (err && !hasError) {
                                    hasError = true;
                                    reject(err);
                                } else {
                                    checkComplete();
                                }
                            });
                        });
                    }
                });
            });
        });
    }

    // Update a word and its synonyms
    async updateWord(wordId, updates) {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run('BEGIN TRANSACTION');

                let query = 'UPDATE words SET ';
                const params = [];
                const updateFields = [];

                if (updates.slovak) {
                    updateFields.push('slovak = ?');
                    params.push(updates.slovak);
                }
                if (updates.english) {
                    updateFields.push('english = ?');
                    params.push(updates.english);
                }
                if (updates.category) {
                    updateFields.push('category = ?');
                    params.push(updates.category);
                }

                updateFields.push('updated_at = CURRENT_TIMESTAMP');
                query += updateFields.join(', ') + ' WHERE id = ?';
                params.push(wordId);

                this.db.run(query, params, (err) => {
                    if (err) {
                        this.db.run('ROLLBACK');
                        reject(err);
                        return;
                    }

                    // Update synonyms if provided
                    if (updates.synonyms) {
                        // Delete existing synonyms
                        this.db.run('DELETE FROM synonyms WHERE word_id = ?', [wordId], (err) => {
                            if (err) {
                                this.db.run('ROLLBACK');
                                reject(err);
                                return;
                            }

                            // Insert new synonyms (similar logic as in addWord)
                            // ... (synonym insertion logic here)

                            this.db.run('COMMIT');
                            resolve();
                        });
                    } else {
                        this.db.run('COMMIT');
                        resolve();
                    }
                });
            });
        });
    }

    // Delete a word and its synonyms
    async deleteWord(wordId) {
        return new Promise((resolve, reject) => {
            // Due to CASCADE DELETE, synonyms will be automatically deleted
            const query = 'DELETE FROM words WHERE id = ?';

            this.db.run(query, [wordId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    // Get word statistics
    async getWordStats() {
        const query = `
            SELECT
                category,
                COUNT(*) as word_count,
                COUNT(DISTINCT s.word_id) as words_with_synonyms
            FROM words w
                     LEFT JOIN synonyms s ON w.id = s.word_id
            GROUP BY category
            ORDER BY category
        `;

        return new Promise((resolve, reject) => {
            this.db.all(query, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Get user preferences
    async getUserPreferences(userId = 'default') {
        const query = `
            SELECT preference_key, preference_value
            FROM user_preferences
            WHERE user_id = ?
        `;

        return new Promise((resolve, reject) => {
            this.db.all(query, [userId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    const preferences = {};
                    rows.forEach(row => {
                        try {
                            preferences[row.preference_key] = JSON.parse(row.preference_value);
                        } catch {
                            preferences[row.preference_key] = row.preference_value;
                        }
                    });
                    resolve(preferences);
                }
            });
        });
    }

    // Set user preference
    async setUserPreference(key, value, userId = 'default') {
        const query = `
            INSERT OR REPLACE INTO user_preferences (user_id, preference_key, preference_value, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        `;

        const jsonValue = typeof value === 'object' ? JSON.stringify(value) : value;

        return new Promise((resolve, reject) => {
            this.db.run(query, [userId, key, jsonValue], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    // Get user statistics for specific word and direction
    async getUserWordStats(wordId, direction) {
        const query = `
            SELECT correct_count, incorrect_count, last_seen
            FROM user_statistics
            WHERE word_id = ? AND direction = ?
        `;

        return new Promise((resolve, reject) => {
            this.db.get(query, [wordId, direction], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row || {correct_count: 0, incorrect_count: 0, last_seen: 0});
                }
            });
        });
    }

    // Update user statistics for a word
    async updateUserWordStats(wordId, direction, isCorrect) {
        const query = `
            INSERT OR REPLACE INTO user_statistics 
            (word_id, direction, correct_count, incorrect_count, last_seen, updated_at)
            VALUES (
                ?, ?, 
                COALESCE((SELECT correct_count FROM user_statistics WHERE word_id = ? AND direction = ?), 0) + ?,
                COALESCE((SELECT incorrect_count FROM user_statistics WHERE word_id = ? AND direction = ?), 0) + ?,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            )
        `;

        const correctIncrement = isCorrect ? 1 : 0;
        const incorrectIncrement = isCorrect ? 0 : 1;

        return new Promise((resolve, reject) => {
            this.db.run(query, [
                wordId, direction,
                wordId, direction, correctIncrement,
                wordId, direction, incorrectIncrement
            ], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    // Get all user statistics for display
    async getAllUserStats() {
        const query = `
            SELECT
                w.slovak,
                w.english,
                w.category,
                us.direction,
                us.correct_count,
                us.incorrect_count,
                us.last_seen,
                ROUND(
                        CASE
                            WHEN (us.correct_count + us.incorrect_count) = 0 THEN 0
                            ELSE (us.correct_count * 100.0) / (us.correct_count + us.incorrect_count)
                            END, 1
                ) as success_rate
            FROM user_statistics us
                     JOIN words w ON us.word_id = w.id
            WHERE us.correct_count > 0 OR us.incorrect_count > 0
            ORDER BY us.incorrect_count - us.correct_count DESC
        `;

        return new Promise((resolve, reject) => {
            this.db.all(query, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Get session statistics for today
    async getTodaySessionStats() {
        const today = new Date().toISOString().split('T')[0]; // Get YYYY-MM-DD format
        const query = `
            SELECT 
                correct_answers,
                incorrect_answers,
                total_time_minutes,
                words_practiced
            FROM session_statistics
            WHERE session_date = ?
        `;

        return new Promise((resolve, reject) => {
            this.db.get(query, [today], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    const result = row || {
                        correct_answers: 0,
                        incorrect_answers: 0,
                        total_time_minutes: 0,
                        words_practiced: 0
                    };
                    console.log(`Today's session stats (${today}):`, result);
                    resolve(result);
                }
            });
        });
    }

    // Update session statistics
    async updateSessionStats(isCorrect, timeDelta = 0) {
        const today = new Date().toISOString().split('T')[0]; // Get YYYY-MM-DD format

        // First, check if today's record exists
        const checkQuery = `
            SELECT id, correct_answers, incorrect_answers, total_time_minutes, words_practiced
            FROM session_statistics
            WHERE session_date = ?
        `;

        return new Promise((resolve, reject) => {
            this.db.get(checkQuery, [today], (err, existingRow) => {
                if (err) {
                    reject(err);
                    return;
                }

                const correctIncrement = isCorrect ? 1 : 0;
                const incorrectIncrement = isCorrect ? 0 : 1;
                const timeIncrement = Math.max(0, Math.round(timeDelta / 60000)); // Convert ms to minutes

                if (existingRow) {
                    // Update existing record
                    const updateQuery = `
                        UPDATE session_statistics 
                        SET 
                            correct_answers = correct_answers + ?,
                            incorrect_answers = incorrect_answers + ?,
                            total_time_minutes = total_time_minutes + ?,
                            words_practiced = words_practiced + 1,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE session_date = ?
                    `;

                    this.db.run(updateQuery, [correctIncrement, incorrectIncrement, timeIncrement, today], function(err) {
                        if (err) {
                            reject(err);
                        } else {
                            console.log(`Updated session stats for ${today}: +${correctIncrement} correct, +${incorrectIncrement} incorrect`);
                            resolve(this.changes);
                        }
                    });
                } else {
                    // Insert new record for today
                    const insertQuery = `
                        INSERT INTO session_statistics 
                        (session_date, correct_answers, incorrect_answers, total_time_minutes, words_practiced)
                        VALUES (?, ?, ?, ?, 1)
                    `;

                    this.db.run(insertQuery, [today, correctIncrement, incorrectIncrement, timeIncrement], function(err) {
                        if (err) {
                            reject(err);
                        } else {
                            console.log(`Created new session stats for ${today}: ${correctIncrement} correct, ${incorrectIncrement} incorrect`);
                            resolve(this.lastID);
                        }
                    });
                }
            });
        });
    }

    // Get historical session statistics
    async getSessionHistory(days = 30) {
        const query = `
            SELECT
                session_date,
                correct_answers,
                incorrect_answers,
                total_time_minutes,
                words_practiced,
                ROUND(
                        CASE
                            WHEN (correct_answers + incorrect_answers) = 0 THEN 0
                            ELSE (correct_answers * 100.0) / (correct_answers + incorrect_answers)
                            END, 1
                ) as success_rate
            FROM session_statistics
            WHERE session_date >= date('now', '-' || ? || ' days')
            ORDER BY session_date DESC
        `;

        return new Promise((resolve, reject) => {
            this.db.all(query, [days], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Get word learning difficulty (for probability calculation)
    async getWordDifficulty(wordId, direction) {
        try {
            const stats = await this.getUserWordStats(wordId, direction);

            if (stats.correct_count + stats.incorrect_count === 0) {
                return 1.0; // New word, high probability
            }

            let difficulty = 1.0;

            // Reduce probability based on correct answers
            const correctReduction = Math.min(stats.correct_count * 0.15, 0.9);
            difficulty *= (1 - correctReduction);

            // Increase probability based on incorrect answers
            difficulty *= (1 + stats.incorrect_count * 0.3);

            // Increase probability based on time since last seen
            const timeSinceLastSeen = Date.now() - new Date(stats.last_seen).getTime();
            const daysSince = timeSinceLastSeen / (1000 * 60 * 60 * 24);
            difficulty *= (1 + Math.min(daysSince * 0.1, 2));

            return Math.max(difficulty, 0.05);
        } catch (error) {
            console.error('Error calculating word difficulty:', error.message);
            return 1.0; // Default to high probability if error
        }
    }
    
    /**
     * Get next word to practice based on difficulty (probability)
     * @param {Array<string>} enabledGroupKeys - Array of enabled group keys
     * @param {Array<string>} enabledDirections - Array of enabled directions ('sk-en', 'en-sk')
     * @returns {Promise<Object|null>} The next word to practice, or null if none available
     */
    async getNextWordByDifficulty(enabledGroupKeys, enabledDirections) {
        try {
            // 1. Get all words from enabled categories
            const placeholders = enabledGroupKeys.map(() => '?').join(',');
            const directionPlaceholders = enabledDirections.map(() => '?').join(',');
            
            const query = `
                SELECT 
                    w.id, 
                    w.slovak, 
                    w.english, 
                    w.category,
                    ? as direction
                FROM words w
                WHERE w.category IN (${placeholders})
                
                UNION
                
                SELECT 
                    w.id, 
                    w.slovak, 
                    w.english, 
                    w.category,
                    ? as direction
                FROM words w
                WHERE w.category IN (${placeholders})
                
                ORDER BY id
            `;
            
            // Create params array by concatenating directions and categories for each direction
            let params = [];
            if (enabledDirections.includes('sk-en')) {
                params.push('sk-en', ...enabledGroupKeys);
            }
            if (enabledDirections.includes('en-sk')) {
                params.push('en-sk', ...enabledGroupKeys);
            }
            
            // If no directions or groups enabled, return null
            if (params.length === 0) return null;
            
            // Get all potential words
            const words = await new Promise((resolve, reject) => {
                this.db.all(query, params, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
            
            if (!words || words.length === 0) return null;
            
            // 2. Calculate difficulty for each word
            const wordProbabilities = [];
            for (const word of words) {
                const difficulty = await this.getWordDifficulty(word.id, word.direction);
                wordProbabilities.push({
                    word,
                    probability: difficulty
                });
            }
            
            // 3. Select a word based on weighted probability
            const totalProbability = wordProbabilities.reduce((sum, item) => sum + item.probability, 0);
            let random = Math.random() * totalProbability;
            
            for (const item of wordProbabilities) {
                random -= item.probability;
                if (random <= 0) {
                    // 4. Format word for client
                    const nextWord = {
                        id: item.word.id,
                        question: item.word.direction === 'sk-en' ? item.word.slovak : item.word.english,
                        answer: item.word.direction === 'sk-en' ? item.word.english : item.word.slovak,
                        direction: item.word.direction,
                        category: item.word.category,
                        targetLanguage: item.word.direction === 'sk-en' ? 'english' : 'slovak',
                        originalWord: {
                            slovak: item.word.slovak,
                            english: item.word.english
                        }
                    };
                    
                    return nextWord;
                }
            }
            
            // If we reach here for some reason, return the first word
            if (wordProbabilities.length > 0) {
                const fallbackWord = wordProbabilities[0].word;
                return {
                    id: fallbackWord.id,
                    question: fallbackWord.direction === 'sk-en' ? fallbackWord.slovak : fallbackWord.english,
                    answer: fallbackWord.direction === 'sk-en' ? fallbackWord.english : fallbackWord.slovak,
                    direction: fallbackWord.direction,
                    category: fallbackWord.category,
                    targetLanguage: fallbackWord.direction === 'sk-en' ? 'english' : 'slovak',
                    originalWord: {
                        slovak: fallbackWord.slovak,
                        english: fallbackWord.english
                    }
                };
            }
            
            return null;
        } catch (error) {
            console.error('Error getting next word by difficulty:', error);
            return null;
        }
    }

    formatGroupName(key) {
        return key.charAt(0).toUpperCase() + key.slice(1).replace(/[_-]/g, ' ');
    }

    close() {
        return new Promise((resolve) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        console.error('Error closing database:', err.message);
                    } else {
                        console.log('Database connection closed');
                    }
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = DatabaseService;