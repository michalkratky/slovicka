const express = require("express");
const { normalizeText } = require("../utils");
const { requireBody } = require("../middleware/validate");

const router = express.Router();

router.get("/word-groups", (req, res) => {
  try {
    const wordGroups = req.db.getWordGroups();
    res.json(wordGroups);
  } catch (error) {
    console.error("Error fetching word groups:", error.message);
    res.status(500).json({ error: "Failed to fetch word groups" });
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
