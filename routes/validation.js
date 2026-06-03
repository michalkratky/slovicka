const express = require("express");
const rateLimit = require("express-rate-limit");
const openai = require("../services/openai-service");
const { requireBody } = require("../middleware/validate");

const router = express.Router();

const validationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Too many validation requests, please try again later" },
});

router.post(
  "/validate-translation",
  validationLimiter,
  requireBody("wordId", "userAnswer", "targetLanguage"),
  async (req, res) => {
    try {
      const { wordId, userAnswer, targetLanguage } = req.body;

      const word = req.db.getWordById(parseInt(wordId));
      if (!word) {
        return res.status(404).json({ error: "Word not found" });
      }

      const sourceLang = targetLanguage === "slovak" ? "english" : "slovak";
      const existingSynonyms = req.db.getSynonyms(parseInt(wordId), targetLanguage);
      const sourceWord = sourceLang === "slovak" ? word.slovak : word.english;
      const correctTranslation = targetLanguage === "slovak" ? word.slovak : word.english;

      const validation = await openai.validateTranslation(
        sourceWord,
        targetLanguage,
        correctTranslation,
        userAnswer,
        existingSynonyms,
        req.selectedDb,
      );

      if (validation.isValid && validation.confidence >= 0.7) {
        req.db.addSynonym(parseInt(wordId), targetLanguage, userAnswer);
        const updatedAnswers = req.db.getCorrectAnswers(parseInt(wordId), targetLanguage);

        res.json({
          valid: true,
          addedAsSynonym: true,
          explanation: validation.explanation,
          correctAnswers: updatedAnswers,
        });
      } else {
        res.json({
          valid: false,
          addedAsSynonym: false,
          explanation: validation.explanation,
        });
      }
    } catch (error) {
      console.error("Error validating translation:", error.message);
      res.status(500).json({ error: "Failed to validate translation" });
    }
  },
);

module.exports = router;
