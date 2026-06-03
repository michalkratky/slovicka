const express = require("express");

const router = express.Router();

router.get("/preferences", (req, res) => {
  try {
    const userId = req.query.userId || "default";
    const preferences = req.db.getUserPreferences(userId);
    res.json(preferences);
  } catch (error) {
    console.error("Error fetching preferences:", error.message);
    res.status(500).json({ error: "Failed to fetch preferences" });
  }
});

router.post("/preferences", (req, res) => {
  try {
    const { key, value, userId } = req.body;
    if (!key) {
      return res.status(400).json({ error: "Missing preference key" });
    }

    req.db.setUserPreference(key, value, userId || "default");
    res.json({ message: "Preference saved successfully" });
  } catch (error) {
    console.error("Error saving preference:", error.message);
    res.status(500).json({ error: "Failed to save preference" });
  }
});

module.exports = router;
