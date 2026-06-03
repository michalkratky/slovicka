require("dotenv").config();

const express = require("express");
const path = require("path");
const { initializeDatabase, attachDb, closeAll } = require("./middleware/db");

const wordsRouter = require("./routes/words");
const practiceRouter = require("./routes/practice");
const preferencesRouter = require("./routes/preferences");
const statsRouter = require("./routes/stats");
const validationRouter = require("./routes/validation");
const adminRouter = require("./routes/admin");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.static("."));
app.use("/src", express.static(path.join(__dirname, "src")));

// Attach database to every API request
app.use("/api", attachDb);

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    database: req.db.db ? "connected" : "disconnected",
    selectedDatabase: req.selectedDb,
  });
});

// Routes
app.use("/api", wordsRouter);
app.use("/api", practiceRouter);
app.use("/api", preferencesRouter);
app.use("/api", statsRouter);
app.use("/api", validationRouter);
app.use("/api", adminRouter);

// Legacy dictionary route (outside /api prefix)
app.get("/dictionary/:filename", (req, res, next) => {
  req.db = null;
  next();
}, adminRouter);

// Main application route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Global error handling
app.use((err, req, res, _next) => {
  console.error("Unhandled error:", err.message);

  const statusCode = err.statusCode || 500;
  const isDevelopment = process.env.NODE_ENV !== "production";

  res.status(statusCode).json({
    error: statusCode === 500 ? "Internal server error" : err.message,
    ...(isDevelopment && statusCode === 500 && { details: err.message }),
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  try {
    closeAll();
    console.log("✅ Database connections closed");
  } catch (error) {
    console.error("❌ Error closing databases:", error.message);
  }
  process.exit(0);
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error.message);
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  gracefulShutdown("UNHANDLED_REJECTION");
});

// Server startup
function startServer() {
  console.log("\n🚀 Starting Slovak-English Learning App...\n");

  try {
    initializeDatabase();
  } catch (error) {
    console.error("❌ Failed to connect to databases:", error.message);
    console.log("⚠️  App will continue with JSON file fallback");
  }

  const server = app.listen(PORT, () => {
    console.log(`\n✅ Server running at http://localhost:${PORT}\n`);
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`❌ Port ${PORT} is already in use.`);
    } else {
      console.error("❌ Server error:", error.message);
    }
    process.exit(1);
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { app, initializeDatabase };
