const express = require("express");
const { requireBody } = require("../middleware/validate");

const router = express.Router();

router.post("/next-word", requireBody("enabledGroups", "translationDirections"), (req, res) => {
  try {
    const { enabledGroups, translationDirections } = req.body;

    const enabledGroupKeys = Object.keys(enabledGroups).filter((key) => enabledGroups[key]);
    if (enabledGroupKeys.length === 0) {
      return res.json({ noWordsAvailable: true });
    }

    const directions = [];
    if (translationDirections.wordToTranslation) directions.push("word-translation");
    if (translationDirections.translationToWord) directions.push("translation-word");
    if (directions.length === 0) {
      return res.json({ noWordsAvailable: true });
    }

    const nextWord = req.db.getNextWordByDifficulty(enabledGroupKeys, directions);
    if (!nextWord) {
      return res.json({ noWordsAvailable: true });
    }

    res.json({ nextWord });
  } catch (error) {
    console.error("Error getting next word:", error.message);
    res.status(500).json({ error: "Failed to get next word" });
  }
});

router.post("/record-answer", requireBody("wordId", "direction", "isCorrect"), (req, res) => {
  try {
    const { wordId, direction, isCorrect, timeTaken } = req.body;

    if (typeof isCorrect !== "boolean") {
      return res.status(400).json({ error: "isCorrect must be a boolean" });
    }
    if (!["word-translation", "translation-word"].includes(direction)) {
      return res.status(400).json({ error: "Invalid direction. Must be word-translation or translation-word" });
    }

    req.db.updateUserWordStats(parseInt(wordId), direction, isCorrect);
    req.db.updateSessionStats(isCorrect, timeTaken || 0);

    const updatedStats = req.db.getTodaySessionStats();

    res.json({
      message: "Answer recorded successfully",
      wordId: parseInt(wordId),
      direction,
      correct: isCorrect,
      sessionStats: updatedStats,
    });
  } catch (error) {
    console.error("Error recording answer:", error.message);
    res.status(500).json({ error: "Failed to record answer" });
  }
});

router.get("/word-difficulty/:wordId/:direction", (req, res) => {
  try {
    const { wordId, direction } = req.params;
    if (!["word-translation", "translation-word"].includes(direction)) {
      return res.status(400).json({ error: "Invalid direction. Must be word-translation or translation-word" });
    }

    const difficulty = req.db.getWordDifficulty(parseInt(wordId), direction);
    res.json({ difficulty, wordId: parseInt(wordId), direction });
  } catch (error) {
    console.error("Error fetching word difficulty:", error.message);
    res.status(500).json({ error: "Failed to fetch word difficulty" });
  }
});

module.exports = router;
