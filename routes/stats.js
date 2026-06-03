const express = require("express");

const router = express.Router();

router.get("/stats", (req, res) => {
  try {
    const stats = req.db.getWordStats();
    res.json(stats);
  } catch (error) {
    console.error("Error fetching database stats:", error.message);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

router.get("/user-stats", (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const stats = req.db.getAllUserStats(limit, offset);
    const total = req.db.getUserStatsCount();

    res.json({ data: stats, total, limit, offset, hasMore: offset + limit < total });
  } catch (error) {
    console.error("Error fetching user stats:", error.message);
    res.status(500).json({ error: "Failed to fetch user statistics" });
  }
});

router.get("/session-stats", (req, res) => {
  try {
    const todayStats = req.db.getTodaySessionStats();
    const historyDays = parseInt(req.query.days) || 7;
    const history = req.db.getSessionHistory(historyDays);

    res.json({
      today: todayStats,
      history,
      summary: {
        totalDays: history.length,
        averageCorrect:
          history.length > 0
            ? Math.round(history.reduce((sum, day) => sum + day.correct_answers, 0) / history.length)
            : 0,
        averageIncorrect:
          history.length > 0
            ? Math.round(
                history.reduce((sum, day) => sum + day.incorrect_answers, 0) / history.length,
              )
            : 0,
        totalTimeMinutes: history.reduce((sum, day) => sum + day.total_time_minutes, 0),
      },
    });
  } catch (error) {
    console.error("Error fetching session stats:", error.message);
    res.status(500).json({ error: "Failed to fetch session statistics" });
  }
});

router.post("/cleanup-session-stats", (req, res) => {
  try {
    const duplicates = req.db.cleanupDuplicateSessionStats();
    res.json({
      message: "Session statistics cleanup completed",
      consolidatedDates: duplicates.length,
      details: duplicates,
    });
  } catch (error) {
    console.error("Error during cleanup:", error.message);
    res.status(500).json({ error: "Failed to cleanup session statistics" });
  }
});

module.exports = router;
