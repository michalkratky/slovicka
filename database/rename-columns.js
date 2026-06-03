#!/usr/bin/env node
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const DATABASE_CONFIG = require("../config");

const DATA_DIR = process.env.DATA_DIR || ".";

for (const [key, config] of Object.entries(DATABASE_CONFIG.databases)) {
  const dbPath = path.join(DATA_DIR, config.file);
  if (!fs.existsSync(dbPath)) {
    console.log(`Skipping ${key}: ${dbPath} does not exist`);
    continue;
  }

  const backupPath = dbPath + ".backup-rename";
  fs.copyFileSync(dbPath, backupPath);
  console.log(`Backed up ${dbPath} -> ${backupPath}`);

  const db = new Database(dbPath);
  db.pragma("foreign_keys = OFF");

  const tx = db.transaction(() => {
    // Rename words columns
    db.exec("ALTER TABLE words RENAME COLUMN slovak TO word");
    db.exec("ALTER TABLE words RENAME COLUMN english TO translation");

    // Recreate synonyms with updated CHECK constraint
    db.exec(`
      CREATE TABLE synonyms_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word_id INTEGER NOT NULL,
        synonym TEXT NOT NULL,
        language TEXT NOT NULL CHECK (language IN ('word', 'translation')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
      )
    `);
    db.exec(`
      INSERT INTO synonyms_new (id, word_id, synonym, language, created_at)
      SELECT id, word_id, synonym,
        CASE language WHEN 'slovak' THEN 'word' WHEN 'english' THEN 'translation' ELSE language END,
        created_at
      FROM synonyms
    `);
    db.exec("DROP TABLE synonyms");
    db.exec("ALTER TABLE synonyms_new RENAME TO synonyms");

    // Recreate user_statistics with updated CHECK constraint
    db.exec(`
      CREATE TABLE user_statistics_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word_id INTEGER NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('word-translation', 'translation-word')),
        correct_count INTEGER DEFAULT 0,
        incorrect_count INTEGER DEFAULT 0,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE,
        UNIQUE(word_id, direction)
      )
    `);
    db.exec(`
      INSERT INTO user_statistics_new (id, word_id, direction, correct_count, incorrect_count, last_seen, created_at, updated_at)
      SELECT id, word_id,
        CASE direction WHEN 'sk-en' THEN 'word-translation' WHEN 'en-sk' THEN 'translation-word' ELSE direction END,
        correct_count, incorrect_count, last_seen, created_at, updated_at
      FROM user_statistics
    `);
    db.exec("DROP TABLE user_statistics");
    db.exec("ALTER TABLE user_statistics_new RENAME TO user_statistics");

    // Recreate indexes
    db.exec("DROP INDEX IF EXISTS idx_words_slovak");
    db.exec("DROP INDEX IF EXISTS idx_words_english");
    db.exec("CREATE INDEX IF NOT EXISTS idx_words_word ON words(word)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_words_translation ON words(translation)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_synonyms_word_id ON synonyms(word_id)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_synonyms_language ON synonyms(language)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_user_statistics_word_direction ON user_statistics(word_id, direction)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_user_statistics_last_seen ON user_statistics(last_seen)");

    // Migrate stored preferences
    db.exec(`
      UPDATE user_preferences
      SET preference_value = REPLACE(REPLACE(preference_value, 'slovakToEnglish', 'wordToTranslation'), 'englishToSlovak', 'translationToWord'),
          updated_at = CURRENT_TIMESTAMP
      WHERE preference_key = 'translationDirections'
    `);
  });

  tx();
  db.pragma("foreign_keys = ON");
  db.close();
  console.log(`Migrated ${key} (${dbPath}) successfully`);
}

console.log("All databases migrated.");
