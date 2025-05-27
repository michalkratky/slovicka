-- database/schema.sql
-- Complete database schema for the Slovak-English learning app

-- Create words table
CREATE TABLE IF NOT EXISTS words (
                                     id INTEGER PRIMARY KEY AUTOINCREMENT,
                                     slovak TEXT NOT NULL,
                                     english TEXT NOT NULL,
                                     category TEXT NOT NULL,
                                     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create synonyms table
CREATE TABLE IF NOT EXISTS synonyms (
                                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                                        word_id INTEGER NOT NULL,
                                        synonym TEXT NOT NULL,
                                        language TEXT NOT NULL CHECK (language IN ('slovak', 'english')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
    );

-- Create user_statistics table for tracking individual word performance
CREATE TABLE IF NOT EXISTS user_statistics (
                                               id INTEGER PRIMARY KEY AUTOINCREMENT,
                                               word_id INTEGER NOT NULL,
                                               direction TEXT NOT NULL CHECK (direction IN ('sk-en', 'en-sk')),
    correct_count INTEGER DEFAULT 0,
    incorrect_count INTEGER DEFAULT 0,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE,
    UNIQUE(word_id, direction)
    );

-- Create user_preferences table for storing user settings
CREATE TABLE IF NOT EXISTS user_preferences (
                                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                user_id TEXT DEFAULT 'default',
                                                preference_key TEXT NOT NULL,
                                                preference_value TEXT NOT NULL,
                                                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                                UNIQUE(user_id, preference_key)
    );

-- Create session_statistics table for tracking learning sessions
CREATE TABLE IF NOT EXISTS session_statistics (
                                                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                  session_date DATE DEFAULT (date('now')),
    correct_answers INTEGER DEFAULT 0,
    incorrect_answers INTEGER DEFAULT 0,
    total_time_minutes INTEGER DEFAULT 0,
    words_practiced INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_date)
    );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_words_category ON words(category);
CREATE INDEX IF NOT EXISTS idx_words_slovak ON words(slovak);
CREATE INDEX IF NOT EXISTS idx_words_english ON words(english);
CREATE INDEX IF NOT EXISTS idx_synonyms_word_id ON synonyms(word_id);
CREATE INDEX IF NOT EXISTS idx_synonyms_language ON synonyms(language);
CREATE INDEX IF NOT EXISTS idx_user_statistics_word_direction ON user_statistics(word_id, direction);
CREATE INDEX IF NOT EXISTS idx_user_statistics_last_seen ON user_statistics(last_seen);
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_key ON user_preferences(user_id, preference_key);
CREATE INDEX IF NOT EXISTS idx_session_statistics_date ON session_statistics(session_date);