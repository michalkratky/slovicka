const express = require("express");
const { normalizeText } = require("../utils");
const { requireBody } = require("../middleware/validate");

const router = express.Router();

router.get("/word-groups", (req, res) => {
  try {
    const wordGroups = req.db.getWordGroups();

    // Merge empty groups stored in preferences
    const prefs = req.db.getUserPreferences("default");
    const emptyGroups = prefs.emptyGroups || [];
    for (const name of emptyGroups) {
      if (!wordGroups[name]) {
        wordGroups[name] = {
          name: req.db.formatGroupName(name),
          enabled: false,
          words: [],
        };
      }
    }

    res.json(wordGroups);
  } catch (error) {
    console.error("Error fetching word groups:", error.message);
    res.status(500).json({ error: "Failed to fetch word groups" });
  }
});

router.get("/categories", (req, res) => {
  try {
    const categories = req.db.getCategories();
    res.json(categories);
  } catch (error) {
    console.error("Error fetching categories:", error.message);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

router.post("/groups", requireBody("name"), (req, res) => {
  try {
    const name = req.body.name.toLowerCase().trim().replace(/\s+/g, "_");
    if (!name) return res.status(400).json({ error: "Group name is required" });

    // Check if group already exists (in DB or in empty groups)
    const wordGroups = req.db.getWordGroups();
    const prefs = req.db.getUserPreferences("default");
    const emptyGroups = prefs.emptyGroups || [];

    if (wordGroups[name] || emptyGroups.includes(name)) {
      return res.status(409).json({ error: "Group already exists" });
    }

    emptyGroups.push(name);
    req.db.setUserPreference("emptyGroups", emptyGroups, "default");
    res.status(201).json({ name, message: "Group created" });
  } catch (error) {
    console.error("Error creating group:", error.message);
    res.status(500).json({ error: "Failed to create group" });
  }
});

router.put("/groups/:name", requireBody("newName"), (req, res) => {
  try {
    const oldName = req.params.name;
    const newName = req.body.newName.toLowerCase().trim().replace(/\s+/g, "_");
    if (!newName) return res.status(400).json({ error: "New name is required" });

    const prefs = req.db.getUserPreferences("default");

    // Rename in DB (updates words with this category)
    req.db.renameGroup(oldName, newName);

    // Migrate emptyGroups preference
    const emptyGroups = prefs.emptyGroups || [];
    const emptyIdx = emptyGroups.indexOf(oldName);
    if (emptyIdx !== -1) {
      emptyGroups[emptyIdx] = newName;
      req.db.setUserPreference("emptyGroups", emptyGroups, "default");
    }

    // Migrate enabledGroups preference
    const enabledGroups = prefs.enabledGroups || {};
    if (oldName in enabledGroups) {
      enabledGroups[newName] = enabledGroups[oldName];
      delete enabledGroups[oldName];
      req.db.setUserPreference("enabledGroups", enabledGroups, "default");
    }

    res.json({ message: "Group renamed", oldName, newName });
  } catch (error) {
    console.error("Error renaming group:", error.message);
    res.status(500).json({ error: "Failed to rename group" });
  }
});

router.delete("/groups/:name", (req, res) => {
  try {
    const name = req.params.name;
    const deletedWords = req.db.deleteGroup(name);

    // Also remove from emptyGroups preference
    const prefs = req.db.getUserPreferences("default");
    const emptyGroups = (prefs.emptyGroups || []).filter((g) => g !== name);
    req.db.setUserPreference("emptyGroups", emptyGroups, "default");

    res.json({ message: "Group deleted", deletedWords });
  } catch (error) {
    console.error("Error deleting group:", error.message);
    res.status(500).json({ error: "Failed to delete group" });
  }
});

router.post("/words/batch-delete", requireBody("wordIds"), (req, res) => {
  try {
    const { wordIds } = req.body;
    if (!Array.isArray(wordIds) || !wordIds.length) {
      return res.status(400).json({ error: "wordIds must be a non-empty array" });
    }
    const deleted = req.db.deleteWords(wordIds.map(Number));
    res.json({ message: "Words deleted", deleted });
  } catch (error) {
    console.error("Error batch deleting:", error.message);
    res.status(500).json({ error: "Failed to delete words" });
  }
});

router.post("/words/batch-move", requireBody("wordIds", "targetCategory"), (req, res) => {
  try {
    const { wordIds, targetCategory } = req.body;
    if (!Array.isArray(wordIds) || !wordIds.length) {
      return res.status(400).json({ error: "wordIds must be a non-empty array" });
    }
    const moved = req.db.moveWords(wordIds.map(Number), targetCategory);
    res.json({ message: "Words moved", moved });
  } catch (error) {
    console.error("Error batch moving:", error.message);
    res.status(500).json({ error: "Failed to move words" });
  }
});

router.post("/check-answer", requireBody("wordId", "userAnswer", "targetLanguage"), (req, res) => {
  try {
    const { wordId, userAnswer, targetLanguage } = req.body;

    const correctAnswers = req.db.getCorrectAnswers(parseInt(wordId), targetLanguage);
    const normalizedUserAnswer = normalizeText(userAnswer);
    const normalizedCorrectAnswers = correctAnswers.map((a) => normalizeText(a));
    const isCorrect = normalizedCorrectAnswers.includes(normalizedUserAnswer);

    res.json({
      correct: isCorrect,
      correctAnswers,
      userAnswer,
      needsValidation: !isCorrect,
    });
  } catch (error) {
    console.error("Error checking answer:", error.message);
    res.status(500).json({ error: "Failed to check answer" });
  }
});

router.post("/words", requireBody("slovak", "english", "category"), (req, res) => {
  try {
    const { slovak, english, category, synonyms } = req.body;

    if (synonyms) {
      if (synonyms.slovak && !Array.isArray(synonyms.slovak)) {
        return res.status(400).json({ error: "Slovak synonyms must be an array" });
      }
      if (synonyms.english && !Array.isArray(synonyms.english)) {
        return res.status(400).json({ error: "English synonyms must be an array" });
      }
    }

    const wordId = req.db.addWord(slovak, english, category, synonyms || {});
    res.status(201).json({
      id: wordId,
      message: "Word added successfully",
      word: { slovak, english, category, synonyms },
    });
  } catch (error) {
    console.error("Error adding word:", error.message);
    if (error.message.includes("UNIQUE constraint failed")) {
      res.status(409).json({ error: "Word already exists" });
    } else {
      res.status(500).json({ error: "Failed to add word" });
    }
  }
});

router.put("/words/:id", (req, res) => {
  try {
    const wordId = parseInt(req.params.id);
    const updates = req.body;

    if (isNaN(wordId)) {
      return res.status(400).json({ error: "Invalid word ID" });
    }

    if (updates.synonyms) {
      if (updates.synonyms.slovak && !Array.isArray(updates.synonyms.slovak)) {
        return res.status(400).json({ error: "Slovak synonyms must be an array" });
      }
      if (updates.synonyms.english && !Array.isArray(updates.synonyms.english)) {
        return res.status(400).json({ error: "English synonyms must be an array" });
      }
    }

    req.db.updateWord(wordId, updates);
    res.json({ message: "Word updated successfully" });
  } catch (error) {
    console.error("Error updating word:", error.message);
    res.status(500).json({ error: "Failed to update word" });
  }
});

router.delete("/words/:id", (req, res) => {
  try {
    const wordId = parseInt(req.params.id);
    if (isNaN(wordId)) {
      return res.status(400).json({ error: "Invalid word ID" });
    }

    const changes = req.db.deleteWord(wordId);
    if (changes === 0) {
      return res.status(404).json({ error: "Word not found" });
    }

    res.json({ message: "Word deleted successfully", deletedCount: changes });
  } catch (error) {
    console.error("Error deleting word:", error.message);
    res.status(500).json({ error: "Failed to delete word" });
  }
});

module.exports = router;
