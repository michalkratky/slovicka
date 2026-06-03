const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

class DatabaseMigrator {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
  }

  connect() {
    this.db = new Database(this.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    console.log("Connected to SQLite database");
  }

  createTables() {
    const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
    this.db.exec(schema);
    console.log("Database tables created successfully");
  }

  migrateFromJSON() {
    const dictionaryPath = path.join(__dirname, "..", "dictionary");

    if (!fs.existsSync(dictionaryPath)) {
      console.log("Dictionary folder not found, skipping migration");
      return;
    }

    const files = fs.readdirSync(dictionaryPath).filter((file) => file.endsWith(".json"));
    const insertWord = this.db.prepare(
      "INSERT INTO words (word, translation, category) VALUES (?, ?, ?)",
    );
    const insertSynonym = this.db.prepare(
      "INSERT INTO synonyms (word_id, synonym, language) VALUES (?, ?, ?)",
    );

    for (const file of files) {
      const category = file.replace(".json", "");
      const filePath = path.join(dictionaryPath, file);

      try {
        const words = JSON.parse(fs.readFileSync(filePath, "utf8"));

        const tx = this.db.transaction(() => {
          for (const word of words) {
            const { lastInsertRowid } = insertWord.run(word.word, word.translation, category);
            const wordId = Number(lastInsertRowid);

            if (word.synonyms) {
              for (const lang of ["word", "translation"]) {
                if (word.synonyms[lang]) {
                  for (const syn of word.synonyms[lang]) {
                    insertSynonym.run(wordId, syn, lang);
                  }
                }
              }
            }
          }
        });

        tx();
        console.log(`Migrated ${words.length} words from ${file}`);
      } catch (error) {
        console.error(`Error migrating ${file}:`, error.message);
      }
    }
  }

  setDefaultPreferences() {
    const insert = this.db.prepare(
      "INSERT OR REPLACE INTO user_preferences (user_id, preference_key, preference_value) VALUES (?, ?, ?)",
    );

    insert.run(
      "default",
      "translationDirections",
      JSON.stringify({ wordToTranslation: true, translationToWord: false }),
    );
    insert.run("default", "enabledGroups", JSON.stringify({ basic: true }));
    console.log("Default preferences set");
  }

  getDatabaseStats() {
    const words = this.db.prepare("SELECT COUNT(*) as count FROM words").get();
    const synonyms = this.db.prepare("SELECT COUNT(*) as count FROM synonyms").get();
    const categories = this.db.prepare("SELECT COUNT(DISTINCT category) as count FROM words").get();

    return {
      words: words.count,
      synonyms: synonyms.count,
      categories: categories.count,
    };
  }

  close() {
    if (this.db) {
      this.db.close();
      console.log("Database connection closed");
    }
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const skipWords = args.includes("--skip-words");

  const dataDir = process.env.DATA_DIR || ".";
  const migrator = new DatabaseMigrator(path.join(dataDir, "database.db"));

  try {
    migrator.connect();
    console.log("Creating database schema...");
    migrator.createTables();

    if (!skipWords) {
      console.log("Migrating words from JSON files...");
      migrator.migrateFromJSON();
    } else {
      console.log("Skipping word import from JSON files...");
    }

    console.log("Setting default preferences...");
    migrator.setDefaultPreferences();

    const stats = migrator.getDatabaseStats();
    console.log("\n=== Migration Summary ===");
    console.log(`Words imported: ${stats.words}`);
    console.log(`Synonyms imported: ${stats.synonyms}`);
    console.log(`Categories: ${stats.categories}`);
    console.log("=========================\n");
    console.log("Migration completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error.message);
    process.exit(1);
  } finally {
    migrator.close();
  }
}

module.exports = DatabaseMigrator;
