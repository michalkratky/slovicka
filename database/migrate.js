// database/migrate.js - Updated with user preferences migration
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

class DatabaseMigrator {
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.db = null;
    }

    async connect() {
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

    async createTables() {
        const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
        const statements = schema.split(';').filter(stmt => stmt.trim());

        for (const statement of statements) {
            if (statement.trim()) {
                await this.runQuery(statement);
            }
        }
        console.log('Database tables created successfully');
    }

    async migrateFromJSON() {
        const dictionaryPath = path.join(__dirname, '..', 'dictionary');

        if (!fs.existsSync(dictionaryPath)) {
            console.log('Dictionary folder not found, skipping migration');
            return;
        }

        const files = fs.readdirSync(dictionaryPath).filter(file => file.endsWith('.json'));

        for (const file of files) {
            const category = file.replace('.json', '');
            const filePath = path.join(dictionaryPath, file);

            try {
                const words = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                await this.importWordsFromCategory(words, category);
                console.log(`Migrated ${words.length} words from ${file}`);
            } catch (error) {
                console.error(`Error migrating ${file}:`, error.message);
            }
        }
    }

    async importWordsFromCategory(words, category) {
        for (const word of words) {
            try {
                // Insert the main word pair
                const wordId = await this.insertWord(word.slovak, word.english, category);

                // Add synonyms if they exist
                if (word.synonyms) {
                    if (word.synonyms.slovak) {
                        for (const synonym of word.synonyms.slovak) {
                            await this.insertSynonym(wordId, synonym, 'slovak');
                        }
                    }
                    if (word.synonyms.english) {
                        for (const synonym of word.synonyms.english) {
                            await this.insertSynonym(wordId, synonym, 'english');
                        }
                    }
                }
            } catch (error) {
                console.error(`Error importing word ${word.slovak}/${word.english}:`, error.message);
            }
        }
    }

    async migrateLocalStorageData() {
        console.log('Note: To migrate your existing localStorage data, you can:');
        console.log('1. Open the app in your browser');
        console.log('2. Open browser developer tools (F12)');
        console.log('3. Go to Console tab');
        console.log('4. Run the following commands:');
        console.log('');
        console.log('// Export your current localStorage data');
        console.log('const data = {');
        console.log('  directions: localStorage.getItem("englishApp_directions"),');
        console.log('  wordStats: localStorage.getItem("englishApp_wordStats"),');
        console.log('  sessionStats: localStorage.getItem("englishApp_sessionStats")');
        console.log('};');
        console.log('console.log(JSON.stringify(data, null, 2));');
        console.log('');
        console.log('Then use the exported data to populate the database through the app.');
    }

    async setDefaultPreferences() {
        try {
            // Set default translation directions
            await this.insertPreference('default', 'translationDirections', JSON.stringify({
                slovakToEnglish: true,
                englishToSlovak: false
            }));

            // Set default enabled groups (enable 'basic' by default)
            await this.insertPreference('default', 'enabledGroups', JSON.stringify({
                basic: true
            }));

            console.log('Default preferences set');
        } catch (error) {
            console.error('Error setting default preferences:', error.message);
        }
    }

    async insertWord(slovak, english, category) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO words (slovak, english, category)
                VALUES (?, ?, ?)
            `;

            this.db.run(query, [slovak, english, category], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    async insertSynonym(wordId, synonym, language) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO synonyms (word_id, synonym, language)
                VALUES (?, ?, ?)
            `;

            this.db.run(query, [wordId, synonym, language], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    async insertPreference(userId, key, value) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT OR REPLACE INTO user_preferences (user_id, preference_key, preference_value)
                VALUES (?, ?, ?)
            `;

            this.db.run(query, [userId, key, value], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    async runQuery(query, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(query, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this);
                }
            });
        });
    }

    async getDatabaseStats() {
        return new Promise((resolve, reject) => {
            const queries = [
                'SELECT COUNT(*) as word_count FROM words',
                'SELECT COUNT(*) as synonym_count FROM synonyms',
                'SELECT COUNT(DISTINCT category) as category_count FROM words'
            ];

            Promise.all(queries.map(query =>
                new Promise((res, rej) => {
                    this.db.get(query, [], (err, row) => {
                        if (err) rej(err);
                        else res(row);
                    });
                })
            )).then(results => {
                resolve({
                    words: results[0].word_count,
                    synonyms: results[1].synonym_count,
                    categories: results[2].category_count
                });
            }).catch(reject);
        });
    }

    async close() {
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

// Run migration if this file is executed directly
if (require.main === module) {
    async function runMigration() {
        const migrator = new DatabaseMigrator('./database.db');

        try {
            await migrator.connect();
            console.log('Creating database schema...');
            await migrator.createTables();

            console.log('Migrating words from JSON files...');
            await migrator.migrateFromJSON();

            console.log('Setting default preferences...');
            await migrator.setDefaultPreferences();

            const stats = await migrator.getDatabaseStats();
            console.log('\n=== Migration Summary ===');
            console.log(`Words imported: ${stats.words}`);
            console.log(`Synonyms imported: ${stats.synonyms}`);
            console.log(`Categories: ${stats.categories}`);
            console.log('=========================\n');

            console.log('Migration completed successfully!');
            console.log('\nDatabase is ready. You can now start the application with: npm start');

            await migrator.migrateLocalStorageData();

        } catch (error) {
            console.error('Migration failed:', error.message);
            process.exit(1);
        } finally {
            await migrator.close();
        }
    }

    runMigration();
}

module.exports = DatabaseMigrator;