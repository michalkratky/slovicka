const Database = require("better-sqlite3");
const { normalizeText } = require("../utils");

class DatabaseService {
  constructor(dbPath = "./database.db") {
    this.dbPath = dbPath;
    this.db = null;
    this._wordGroupsCache = null;
    this._wordGroupsCacheTime = 0;
  }

  connect() {
    this.db = new Database(this.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    console.log("Connected to SQLite database");
  }

  getWordGroups() {
    const now = Date.now();
    if (this._wordGroupsCache && now - this._wordGroupsCacheTime < 5 * 60 * 1000) {
      return this._wordGroupsCache;
    }

    const rows = this.db
      .prepare(
        `SELECT w.id, w.slovak, w.english, w.category,
            GROUP_CONCAT(CASE WHEN s.language = 'slovak' THEN s.synonym END) as slovak_synonyms,
            GROUP_CONCAT(CASE WHEN s.language = 'english' THEN s.synonym END) as english_synonyms
         FROM words w
         LEFT JOIN synonyms s ON w.id = s.word_id
         GROUP BY w.id, w.slovak, w.english, w.category
         ORDER BY w.category, w.slovak`,
      )
      .all();

    const groups = {};
    for (const row of rows) {
      if (!groups[row.category]) {
        groups[row.category] = {
          name: this.formatGroupName(row.category),
          enabled: row.category === "basic",
          words: [],
        };
      }
      groups[row.category].words.push({
        id: row.id,
        slovak: row.slovak,
        english: row.english,
        synonyms: {
          slovak: row.slovak_synonyms ? row.slovak_synonyms.split(",") : [],
          english: row.english_synonyms ? row.english_synonyms.split(",") : [],
        },
      });
    }

    this._wordGroupsCache = groups;
    this._wordGroupsCacheTime = now;
    return groups;
  }

  _invalidateWordGroupsCache() {
    this._wordGroupsCache = null;
    this._wordGroupsCacheTime = 0;
  }

  getCorrectAnswers(wordId, targetLanguage) {
    const rows = this.db
      .prepare(
        `SELECT
            CASE WHEN ? = 'english' THEN w.english ELSE w.slovak END as main_answer,
            s.synonym
         FROM words w
         LEFT JOIN synonyms s ON w.id = s.word_id AND s.language = ?
         WHERE w.id = ?`,
      )
      .all(targetLanguage, targetLanguage, wordId);

    const answers = new Set();
    for (const row of rows) {
      if (row.main_answer) {
        answers.add(row.main_answer.toLowerCase().trim());
        answers.add(normalizeText(row.main_answer));
      }
      if (row.synonym) {
        answers.add(row.synonym.toLowerCase().trim());
        answers.add(normalizeText(row.synonym));
      }
    }
    return Array.from(answers);
  }

  getSynonyms(wordId, language) {
    const rows = this.db
      .prepare("SELECT synonym FROM synonyms WHERE word_id = ? AND language = ?")
      .all(wordId, language);
    return rows.map((row) => row.synonym);
  }

  addSynonym(wordId, language, synonym) {
    const existing = this.db
      .prepare(
        "SELECT COUNT(*) as count FROM synonyms WHERE word_id = ? AND language = ? AND LOWER(synonym) = LOWER(?)",
      )
      .get(wordId, language, synonym);

    if (existing.count > 0) return true;

    this.db
      .prepare("INSERT INTO synonyms (word_id, language, synonym) VALUES (?, ?, ?)")
      .run(wordId, language, synonym.trim());

    this._invalidateWordGroupsCache();
    return true;
  }

  addWord(slovak, english, category, synonyms = {}) {
    const insertWord = this.db.prepare(
      "INSERT INTO words (slovak, english, category) VALUES (?, ?, ?)",
    );
    const insertSynonym = this.db.prepare(
      "INSERT INTO synonyms (word_id, synonym, language) VALUES (?, ?, ?)",
    );

    const tx = this.db.transaction(() => {
      const { lastInsertRowid } = insertWord.run(slovak, english, category);
      const wordId = Number(lastInsertRowid);

      for (const lang of ["slovak", "english"]) {
        if (synonyms[lang]) {
          for (const syn of synonyms[lang]) {
            insertSynonym.run(wordId, syn, lang);
          }
        }
      }
      return wordId;
    });

    const wordId = tx();
    this._invalidateWordGroupsCache();
    return wordId;
  }

  updateWord(wordId, updates) {
    const tx = this.db.transaction(() => {
      const updateFields = [];
      const params = [];

      if (updates.slovak) {
        updateFields.push("slovak = ?");
        params.push(updates.slovak);
      }
      if (updates.english) {
        updateFields.push("english = ?");
        params.push(updates.english);
      }
      if (updates.category) {
        updateFields.push("category = ?");
        params.push(updates.category);
      }

      updateFields.push("updated_at = CURRENT_TIMESTAMP");
      params.push(wordId);

      this.db
        .prepare(`UPDATE words SET ${updateFields.join(", ")} WHERE id = ?`)
        .run(...params);

      if (updates.synonyms) {
        this.db.prepare("DELETE FROM synonyms WHERE word_id = ?").run(wordId);

        const insertSynonym = this.db.prepare(
          "INSERT INTO synonyms (word_id, synonym, language) VALUES (?, ?, ?)",
        );
        for (const lang of ["slovak", "english"]) {
          if (updates.synonyms[lang]) {
            for (const syn of updates.synonyms[lang]) {
              insertSynonym.run(wordId, syn, lang);
            }
          }
        }
      }
    });

    tx();
    this._invalidateWordGroupsCache();
  }

  deleteWord(wordId) {
    const result = this.db.prepare("DELETE FROM words WHERE id = ?").run(wordId);
    this._invalidateWordGroupsCache();
    return result.changes;
  }

  getWordStats() {
    return this.db
      .prepare(
        `SELECT category, COUNT(*) as word_count,
            COUNT(DISTINCT s.word_id) as words_with_synonyms
         FROM words w
         LEFT JOIN synonyms s ON w.id = s.word_id
         GROUP BY category ORDER BY category`,
      )
      .all();
  }

  getUserPreferences(userId = "default") {
    const rows = this.db
      .prepare("SELECT preference_key, preference_value FROM user_preferences WHERE user_id = ?")
      .all(userId);

    const preferences = {};
    for (const row of rows) {
      try {
        preferences[row.preference_key] = JSON.parse(row.preference_value);
      } catch {
        preferences[row.preference_key] = row.preference_value;
      }
    }
    return preferences;
  }

  setUserPreference(key, value, userId = "default") {
    const jsonValue = typeof value === "object" ? JSON.stringify(value) : value;
    this.db
      .prepare(
        `INSERT OR REPLACE INTO user_preferences (user_id, preference_key, preference_value, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
      )
      .run(userId, key, jsonValue);
  }

  getUserWordStats(wordId, direction) {
    const row = this.db
      .prepare("SELECT correct_count, incorrect_count, last_seen FROM user_statistics WHERE word_id = ? AND direction = ?")
      .get(wordId, direction);
    return row || { correct_count: 0, incorrect_count: 0, last_seen: 0 };
  }

  updateUserWordStats(wordId, direction, isCorrect) {
    const correctIncrement = isCorrect ? 1 : 0;
    const incorrectIncrement = isCorrect ? 0 : 1;

    this.db
      .prepare(
        `INSERT OR REPLACE INTO user_statistics
         (word_id, direction, correct_count, incorrect_count, last_seen, updated_at)
         VALUES (?, ?,
            COALESCE((SELECT correct_count FROM user_statistics WHERE word_id = ? AND direction = ?), 0) + ?,
            COALESCE((SELECT incorrect_count FROM user_statistics WHERE word_id = ? AND direction = ?), 0) + ?,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      )
      .run(wordId, direction, wordId, direction, correctIncrement, wordId, direction, incorrectIncrement);
  }

  getAllUserStats(limit = 50, offset = 0) {
    return this.db
      .prepare(
        `SELECT w.slovak, w.english, w.category, us.direction,
            us.correct_count, us.incorrect_count, us.last_seen,
            ROUND(CASE WHEN (us.correct_count + us.incorrect_count) = 0 THEN 0
                  ELSE (us.correct_count * 100.0) / (us.correct_count + us.incorrect_count) END, 1) as success_rate
         FROM user_statistics us
         JOIN words w ON us.word_id = w.id
         WHERE us.correct_count > 0 OR us.incorrect_count > 0
         ORDER BY us.incorrect_count - us.correct_count DESC
         LIMIT ? OFFSET ?`,
      )
      .all(limit, offset);
  }

  getUserStatsCount() {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM user_statistics
         WHERE correct_count > 0 OR incorrect_count > 0`,
      )
      .get();
    return row.count;
  }

  getTodaySessionStats() {
    const today = new Date().toISOString().split("T")[0];
    const row = this.db
      .prepare(
        "SELECT correct_answers, incorrect_answers, total_time_minutes, words_practiced FROM session_statistics WHERE session_date = ?",
      )
      .get(today);

    return (
      row || {
        correct_answers: 0,
        incorrect_answers: 0,
        total_time_minutes: 0,
        words_practiced: 0,
      }
    );
  }

  updateSessionStats(isCorrect, timeDelta = 0) {
    const today = new Date().toISOString().split("T")[0];
    const correctIncrement = isCorrect ? 1 : 0;
    const incorrectIncrement = isCorrect ? 0 : 1;
    const timeIncrement = Math.max(0, Math.round(timeDelta / 60000));

    this.db
      .prepare(
        `INSERT INTO session_statistics
            (session_date, correct_answers, incorrect_answers, total_time_minutes, words_practiced)
         VALUES (?, ?, ?, ?, 1)
         ON CONFLICT(session_date) DO UPDATE SET
            correct_answers = correct_answers + excluded.correct_answers,
            incorrect_answers = incorrect_answers + excluded.incorrect_answers,
            total_time_minutes = total_time_minutes + excluded.total_time_minutes,
            words_practiced = words_practiced + 1,
            updated_at = CURRENT_TIMESTAMP`,
      )
      .run(today, correctIncrement, incorrectIncrement, timeIncrement);
  }

  getSessionHistory(days = 30) {
    return this.db
      .prepare(
        `SELECT session_date, correct_answers, incorrect_answers,
            total_time_minutes, words_practiced,
            ROUND(CASE WHEN (correct_answers + incorrect_answers) = 0 THEN 0
                  ELSE (correct_answers * 100.0) / (correct_answers + incorrect_answers) END, 1) as success_rate
         FROM session_statistics
         WHERE session_date >= date('now', '-' || ? || ' days')
         ORDER BY session_date DESC`,
      )
      .all(days);
  }

  _calculateDifficulty(stats) {
    if (stats.correct_count + stats.incorrect_count === 0) return 1.0;

    let difficulty = 1.0;
    const correctReduction = Math.min(stats.correct_count * 0.15, 0.9);
    difficulty *= 1 - correctReduction;
    difficulty *= 1 + stats.incorrect_count * 0.3;

    if (stats.last_seen) {
      const daysSince = (Date.now() - new Date(stats.last_seen).getTime()) / (1000 * 60 * 60 * 24);
      difficulty *= 1 + Math.min(daysSince * 0.1, 2);
    }

    return Math.max(difficulty, 0.05);
  }

  getWordDifficulty(wordId, direction) {
    const stats = this.getUserWordStats(wordId, direction);
    return this._calculateDifficulty(stats);
  }

  getNextWordByDifficulty(enabledGroupKeys, enabledDirections) {
    if (!enabledGroupKeys.length || !enabledDirections.length) return null;

    const placeholders = enabledGroupKeys.map(() => "?").join(",");
    const wordRows = [];

    // Fetch words with stats in a single query per direction (fixes N+1)
    for (const direction of enabledDirections) {
      const rows = this.db
        .prepare(
          `SELECT w.id, w.slovak, w.english, w.category,
              ? as direction,
              COALESCE(us.correct_count, 0) as correct_count,
              COALESCE(us.incorrect_count, 0) as incorrect_count,
              us.last_seen
           FROM words w
           LEFT JOIN user_statistics us ON w.id = us.word_id AND us.direction = ?
           WHERE w.category IN (${placeholders})`,
        )
        .all(direction, direction, ...enabledGroupKeys);
      wordRows.push(...rows);
    }

    if (wordRows.length === 0) return null;

    // Calculate difficulty weights in JS from the joined data
    const wordProbabilities = wordRows.map((word) => ({
      word,
      probability: this._calculateDifficulty(word),
    }));

    // Weighted random selection
    const totalProbability = wordProbabilities.reduce((sum, item) => sum + item.probability, 0);
    let random = Math.random() * totalProbability;

    for (const item of wordProbabilities) {
      random -= item.probability;
      if (random <= 0) {
        return this._formatWordForClient(item.word);
      }
    }

    return this._formatWordForClient(wordProbabilities[0].word);
  }

  _formatWordForClient(word) {
    const isSlovakToEnglish = word.direction === "sk-en";
    return {
      id: word.id,
      question: isSlovakToEnglish ? word.slovak : word.english,
      answer: isSlovakToEnglish ? word.english : word.slovak,
      direction: word.direction,
      category: word.category,
      targetLanguage: isSlovakToEnglish ? "english" : "slovak",
      originalWord: { slovak: word.slovak, english: word.english },
    };
  }

  getWordById(wordId) {
    return this.db.prepare("SELECT slovak, english FROM words WHERE id = ?").get(wordId);
  }

  cleanupDuplicateSessionStats() {
    const duplicates = this.db
      .prepare(
        `SELECT session_date,
            SUM(correct_answers) as total_correct,
            SUM(incorrect_answers) as total_incorrect,
            SUM(total_time_minutes) as total_time,
            SUM(words_practiced) as total_words,
            COUNT(*) as duplicate_count
         FROM session_statistics
         GROUP BY session_date HAVING COUNT(*) > 1`,
      )
      .all();

    const tx = this.db.transaction(() => {
      for (const dup of duplicates) {
        this.db.prepare("DELETE FROM session_statistics WHERE session_date = ?").run(dup.session_date);
        this.db
          .prepare(
            `INSERT INTO session_statistics
                (session_date, correct_answers, incorrect_answers, total_time_minutes, words_practiced)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(dup.session_date, dup.total_correct, dup.total_incorrect, dup.total_time, dup.total_words);
      }
    });

    tx();
    return duplicates;
  }

  formatGroupName(key) {
    return key.charAt(0).toUpperCase() + key.slice(1).replace(/[_-]/g, " ");
  }

  close() {
    if (this.db) {
      this.db.close();
      console.log("Database connection closed");
    }
  }
}

module.exports = DatabaseService;
