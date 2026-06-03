const express = require("express");
const path = require("path");
const fs = require("fs");
const { requireBody } = require("../middleware/validate");

const router = express.Router();

router.post("/import-words", requireBody("words", "category"), (req, res) => {
  try {
    const { words, category } = req.body;

    if (!Array.isArray(words)) {
      return res.status(400).json({ error: "words must be an array" });
    }

    let imported = 0;
    let errors = 0;
    const errorDetails = [];

    for (const word of words) {
      try {
        if (!word.slovak || !word.english) {
          errors++;
          errorDetails.push(`Invalid word: ${JSON.stringify(word)}`);
          continue;
        }
        req.db.addWord(word.slovak, word.english, category, word.synonyms || {});
        imported++;
      } catch (error) {
        errors++;
        errorDetails.push(`Failed to import ${word.slovak}/${word.english}: ${error.message}`);
      }
    }

    res.json({
      message: "Bulk import completed",
      imported,
      errors,
      errorDetails: errorDetails.slice(0, 10),
    });
  } catch (error) {
    console.error("Error during bulk import:", error.message);
    res.status(500).json({ error: "Failed to import words" });
  }
});

router.get("/dictionary-files", (_req, res) => {
  try {
    const dictionaryPath = path.join(__dirname, "..", "dictionary");
    const files = fs
      .readdirSync(dictionaryPath)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(".json", ""));
    res.json(files);
  } catch (error) {
    console.error("Error listing dictionary files:", error.message);
    res.status(500).json({ error: "Failed to list dictionary files" });
  }
});

// Legacy route for serving dictionary JSON files
router.get("/dictionary/:filename", (req, res) => {
  const filename = req.params.filename;
  if (!/^[a-zA-Z0-9_-]+\.json$/.test(filename)) {
    return res.status(400).json({ error: "Invalid filename" });
  }

  const filepath = path.join(__dirname, "..", "dictionary", filename);
  if (fs.existsSync(filepath)) {
    try {
      const content = fs.readFileSync(filepath, "utf8");
      res.json(JSON.parse(content));
    } catch (error) {
      console.error(`Error reading ${filename}:`, error.message);
      res.status(500).json({ error: "Failed to read dictionary file" });
    }
  } else {
    res.json([]);
  }
});

module.exports = router;
