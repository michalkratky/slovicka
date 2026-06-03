const express = require("express");
const path = require("path");
const fs = require("fs");
const router = express.Router();

router.post("/import-words", (req, res) => {
  try {
    // Multi-group format: { groups: [{ category, words }] }
    if (req.body.groups && Array.isArray(req.body.groups)) {
      const results = [];
      for (const group of req.body.groups) {
        if (!group.category || !Array.isArray(group.words)) {
          results.push({ category: group.category || "unknown", imported: 0, errors: 1, errorDetails: ["Invalid group format"] });
          continue;
        }
        const entries = group.words.map((w) => ({ ...w, category: group.category }));
        results.push({ category: group.category, ...req.db.importWords(entries) });
      }
      const totals = results.reduce((acc, r) => ({ imported: acc.imported + r.imported, errors: acc.errors + r.errors }), { imported: 0, errors: 0 });
      return res.json({ message: "Multi-group import completed", ...totals, groups: results });
    }

    // Single-group format: { category, words }
    const { words, category } = req.body;
    if (!category || !Array.isArray(words)) {
      return res.status(400).json({ error: "Expected {words: [], category} or {groups: []}" });
    }

    const entries = words.map((w) => ({ ...w, category }));
    const result = req.db.importWords(entries);
    res.json({ message: "Import completed", ...result });
  } catch (error) {
    console.error("Error during import:", error.message);
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
