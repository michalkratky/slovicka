const path = require("path");
const DatabaseService = require("../database/database");
const DATABASE_CONFIG = require("../config");

const DATA_DIR = process.env.DATA_DIR || ".";
const dbInstances = {};

function getDatabase(selectedDb = "sk-en") {
  if (!DATABASE_CONFIG.databases[selectedDb]) {
    selectedDb = DATABASE_CONFIG.default;
  }

  if (!dbInstances[selectedDb]) {
    const dbFile = DATABASE_CONFIG.databases[selectedDb].file;
    dbInstances[selectedDb] = new DatabaseService(path.join(DATA_DIR, dbFile));
  }

  return dbInstances[selectedDb];
}

function initializeDatabase() {
  for (const [key, config] of Object.entries(DATABASE_CONFIG.databases)) {
    const db = getDatabase(key);
    db.connect();
    console.log(`✅ Database ${config.name} (${config.file}) connected successfully`);
  }
}

function attachDb(req, _res, next) {
  const selectedDb = req.headers["x-database"] || DATABASE_CONFIG.default;
  req.db = getDatabase(selectedDb);
  req.selectedDb = selectedDb;
  next();
}

function closeAll() {
  for (const db of Object.values(dbInstances)) {
    db.close();
  }
}

module.exports = { getDatabase, initializeDatabase, attachDb, closeAll };
