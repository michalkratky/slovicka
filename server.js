// server.js - Complete Express server with enhanced database integration
// Load environment variables first
require('dotenv').config();

const express = require('express');
const path = require('path');
const DatabaseService = require('./database/database');
const { normalizeText } = require('./utils');
const openai = require('./services/openai-service');

const app = express();
const PORT = process.env.PORT || 3000;
const db = new DatabaseService();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static('.'));
app.use('/src', express.static(path.join(__dirname, 'src')));

// Initialize database connection
async function initializeDatabase() {
    try {
        await db.connect();
        console.log('✅ Database connected successfully');
        return true;
    } catch (error) {
        console.error('❌ Failed to connect to database:', error.message);
        console.log('⚠️  App will continue with JSON file fallback');
        return false;
    }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: db.db ? 'connected' : 'disconnected'
    });
});

// ===================
// WORD GROUPS & WORDS
// ===================

// Get all word groups with synonyms
app.get('/api/word-groups', async (req, res) => {
    try {
        const wordGroups = await db.getWordGroups();
        res.json(wordGroups);
    } catch (error) {
        console.error('Error fetching word groups:', error.message);
        res.status(500).json({ error: 'Failed to fetch word groups' });
    }
});

// Check if an answer is correct (handles synonyms)
app.post('/api/check-answer', async (req, res) => {
    try {
        const { wordId, userAnswer, targetLanguage } = req.body;

        if (!wordId || !userAnswer || !targetLanguage) {
            return res.status(400).json({ error: 'Missing required fields: wordId, userAnswer, targetLanguage' });
        }

        const correctAnswers = await db.getCorrectAnswers(parseInt(wordId), targetLanguage);
        const normalizedUserAnswer = normalizeText(userAnswer);
        const normalizedCorrectAnswers = correctAnswers.map(answer => normalizeText(answer));
        const isCorrect = normalizedCorrectAnswers.includes(normalizedUserAnswer);

        // If answer is not correct based on exact match, we'll send back a flag
        // indicating client should ask the user if they want to validate with AI
        const needsValidation = !isCorrect;

        res.json({
            correct: isCorrect,
            correctAnswers: correctAnswers,
            userAnswer: userAnswer,
            needsValidation: needsValidation
        });
    } catch (error) {
        console.error('Error checking answer:', error.message);
        res.status(500).json({ error: 'Failed to check answer' });
    }
});

// Get next word for practice based on difficulty
app.post('/api/next-word', async (req, res) => {
    try {
        const { enabledGroups, translationDirections } = req.body;
        
        if (!enabledGroups || !translationDirections) {
            return res.status(400).json({ error: 'Missing required fields: enabledGroups, translationDirections' });
        }
        
        // Get enabled group keys (those with value = true)
        const enabledGroupKeys = Object.keys(enabledGroups).filter(key => enabledGroups[key]);
        
        if (enabledGroupKeys.length === 0) {
            return res.json({ noWordsAvailable: true });
        }
        
        // Get enabled directions
        const directions = [];
        if (translationDirections.slovakToEnglish) directions.push('sk-en');
        if (translationDirections.englishToSlovak) directions.push('en-sk');
        
        if (directions.length === 0) {
            return res.json({ noWordsAvailable: true });
        }
        
        // Get next word
        const nextWord = await db.getNextWordByDifficulty(enabledGroupKeys, directions);
        
        if (!nextWord) {
            return res.json({ noWordsAvailable: true });
        }
        
        res.json({ nextWord });
    } catch (error) {
        console.error('Error getting next word:', error.message);
        res.status(500).json({ error: 'Failed to get next word' });
    }
});

// Endpoint to validate translation with AI and optionally add as synonym
app.post('/api/validate-translation', async (req, res) => {
    try {
        const { wordId, userAnswer, targetLanguage } = req.body;

        if (!wordId || !userAnswer || !targetLanguage) {
            return res.status(400).json({ error: 'Missing required fields: wordId, userAnswer, targetLanguage' });
        }

        // Get word details for context
        const sourceLang = targetLanguage === 'slovak' ? 'english' : 'slovak';
        
        // Query to get the word in both languages
        const query = `
            SELECT slovak, english
            FROM words
            WHERE id = ?
        `;
        
        const word = await new Promise((resolve, reject) => {
            db.db.get(query, [wordId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!word) {
            return res.status(404).json({ error: 'Word not found' });
        }

        // Get existing synonyms for context
        const existingSynonyms = await db.getSynonyms(parseInt(wordId), targetLanguage);
        
        // Get the source word and correct translation
        const sourceWord = sourceLang === 'slovak' ? word.slovak : word.english;
        const correctTranslation = targetLanguage === 'slovak' ? word.slovak : word.english;

        // Validate translation with OpenAI
        const validation = await openai.validateTranslation(
            sourceWord,
            targetLanguage,
            correctTranslation, 
            userAnswer,
            existingSynonyms
        );

        // If OpenAI confirms this is a valid translation, add it as a synonym
        if (validation.isValid && validation.confidence >= 0.7) {
            await db.addSynonym(parseInt(wordId), targetLanguage, userAnswer);
            
            // Return updated list of correct answers
            const updatedAnswers = await db.getCorrectAnswers(parseInt(wordId), targetLanguage);
            
            res.json({
                valid: true,
                addedAsSynonym: true,
                explanation: validation.explanation,
                correctAnswers: updatedAnswers
            });
        } else {
            res.json({
                valid: false,
                addedAsSynonym: false,
                explanation: validation.explanation
            });
        }
    } catch (error) {
        console.error('Error validating translation:', error.message);
        res.status(500).json({ error: 'Failed to validate translation' });
    }
});

// Add a new word with synonyms
app.post('/api/words', async (req, res) => {
    try {
        const { slovak, english, category, synonyms } = req.body;

        if (!slovak || !english || !category) {
            return res.status(400).json({ error: 'Missing required fields: slovak, english, category' });
        }

        // Validate synonyms structure if provided
        if (synonyms) {
            if (synonyms.slovak && !Array.isArray(synonyms.slovak)) {
                return res.status(400).json({ error: 'Slovak synonyms must be an array' });
            }
            if (synonyms.english && !Array.isArray(synonyms.english)) {
                return res.status(400).json({ error: 'English synonyms must be an array' });
            }
        }

        const wordId = await db.addWord(slovak, english, category, synonyms || {});
        res.status(201).json({
            id: wordId,
            message: 'Word added successfully',
            word: { slovak, english, category, synonyms }
        });
    } catch (error) {
        console.error('Error adding word:', error.message);
        if (error.message.includes('UNIQUE constraint failed')) {
            res.status(409).json({ error: 'Word already exists' });
        } else {
            res.status(500).json({ error: 'Failed to add word' });
        }
    }
});

// Update a word and its synonyms
app.put('/api/words/:id', async (req, res) => {
    try {
        const wordId = parseInt(req.params.id);
        const updates = req.body;

        if (isNaN(wordId)) {
            return res.status(400).json({ error: 'Invalid word ID' });
        }

        // Validate synonyms structure if provided
        if (updates.synonyms) {
            if (updates.synonyms.slovak && !Array.isArray(updates.synonyms.slovak)) {
                return res.status(400).json({ error: 'Slovak synonyms must be an array' });
            }
            if (updates.synonyms.english && !Array.isArray(updates.synonyms.english)) {
                return res.status(400).json({ error: 'English synonyms must be an array' });
            }
        }

        await db.updateWord(wordId, updates);
        res.json({ message: 'Word updated successfully' });
    } catch (error) {
        console.error('Error updating word:', error.message);
        res.status(500).json({ error: 'Failed to update word' });
    }
});

// Delete a word and its synonyms
app.delete('/api/words/:id', async (req, res) => {
    try {
        const wordId = parseInt(req.params.id);

        if (isNaN(wordId)) {
            return res.status(400).json({ error: 'Invalid word ID' });
        }

        const changes = await db.deleteWord(wordId);

        if (changes === 0) {
            return res.status(404).json({ error: 'Word not found' });
        }

        res.json({ message: 'Word deleted successfully', deletedCount: changes });
    } catch (error) {
        console.error('Error deleting word:', error.message);
        res.status(500).json({ error: 'Failed to delete word' });
    }
});

// Get database statistics
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await db.getWordStats();
        res.json(stats);
    } catch (error) {
        console.error('Error fetching database stats:', error.message);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// ===================
// USER PREFERENCES
// ===================

// Get user preferences
app.get('/api/preferences', async (req, res) => {
    try {
        const userId = req.query.userId || 'default';
        const preferences = await db.getUserPreferences(userId);
        res.json(preferences);
    } catch (error) {
        console.error('Error fetching preferences:', error.message);
        res.status(500).json({ error: 'Failed to fetch preferences' });
    }
});

// Set user preference
app.post('/api/preferences', async (req, res) => {
    try {
        const { key, value, userId } = req.body;

        if (!key) {
            return res.status(400).json({ error: 'Missing preference key' });
        }

        await db.setUserPreference(key, value, userId || 'default');
        res.json({ message: 'Preference saved successfully' });
    } catch (error) {
        console.error('Error saving preference:', error.message);
        res.status(500).json({ error: 'Failed to save preference' });
    }
});

// ===================
// USER STATISTICS
// ===================

// Get comprehensive user statistics
app.get('/api/user-stats', async (req, res) => {
    try {
        const stats = await db.getAllUserStats();
        res.json(stats);
    } catch (error) {
        console.error('Error fetching user stats:', error.message);
        res.status(500).json({ error: 'Failed to fetch user statistics' });
    }
});

// Get session statistics (today + history)
app.get('/api/session-stats', async (req, res) => {
    try {
        const todayStats = await db.getTodaySessionStats();
        const historyDays = parseInt(req.query.days) || 7;
        const history = await db.getSessionHistory(historyDays);

        res.json({
            today: todayStats,
            history: history,
            summary: {
                totalDays: history.length,
                averageCorrect: history.length > 0 ? Math.round(history.reduce((sum, day) => sum + day.correct_answers, 0) / history.length) : 0,
                averageIncorrect: history.length > 0 ? Math.round(history.reduce((sum, day) => sum + day.incorrect_answers, 0) / history.length) : 0,
                totalTimeMinutes: history.reduce((sum, day) => sum + day.total_time_minutes, 0)
            }
        });
    } catch (error) {
        console.error('Error fetching session stats:', error.message);
        res.status(500).json({ error: 'Failed to fetch session statistics' });
    }
});

// Record answer and update all statistics
app.post('/api/record-answer', async (req, res) => {
    try {
        const { wordId, direction, isCorrect, timeTaken } = req.body;

        if (!wordId || !direction || typeof isCorrect !== 'boolean') {
            return res.status(400).json({ error: 'Missing required fields: wordId, direction, isCorrect' });
        }

        if (!['sk-en', 'en-sk'].includes(direction)) {
            return res.status(400).json({ error: 'Invalid direction. Must be sk-en or en-sk' });
        }

        console.log(`Recording answer: wordId=${wordId}, direction=${direction}, correct=${isCorrect}`);

        // Update word-specific statistics
        await db.updateUserWordStats(parseInt(wordId), direction, isCorrect);

        // Update session statistics
        await db.updateSessionStats(isCorrect, timeTaken || 0);

        // Get updated session stats to verify
        const updatedStats = await db.getTodaySessionStats();
        console.log('Updated session stats:', updatedStats);

        res.json({
            message: 'Answer recorded successfully',
            wordId: parseInt(wordId),
            direction: direction,
            correct: isCorrect,
            sessionStats: updatedStats
        });
    } catch (error) {
        console.error('Error recording answer:', error.message);
        res.status(500).json({ error: 'Failed to record answer' });
    }
});

// Get word difficulty for probability calculation
app.get('/api/word-difficulty/:wordId/:direction', async (req, res) => {
    try {
        const { wordId, direction } = req.params;

        if (!['sk-en', 'en-sk'].includes(direction)) {
            return res.status(400).json({ error: 'Invalid direction. Must be sk-en or en-sk' });
        }

        const difficulty = await db.getWordDifficulty(parseInt(wordId), direction);
        res.json({
            difficulty: difficulty,
            wordId: parseInt(wordId),
            direction: direction
        });
    } catch (error) {
        console.error('Error fetching word difficulty:', error.message);
        res.status(500).json({ error: 'Failed to fetch word difficulty' });
    }
});

// ===================
// DATABASE MAINTENANCE
// ===================

// Clean up duplicate session statistics
app.post('/api/cleanup-session-stats', async (req, res) => {
    try {
        console.log('Starting session statistics cleanup...');

        // Get all session statistics grouped by date with totals
        const consolidateQuery = `
            SELECT 
                session_date,
                SUM(correct_answers) as total_correct,
                SUM(incorrect_answers) as total_incorrect,
                SUM(total_time_minutes) as total_time,
                SUM(words_practiced) as total_words,
                COUNT(*) as duplicate_count
            FROM session_statistics
            GROUP BY session_date
            HAVING COUNT(*) > 1
        `;

        // First, get the duplicates
        const duplicates = await new Promise((resolve, reject) => {
            db.db.all(consolidateQuery, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        console.log(`Found ${duplicates.length} dates with duplicate entries`);

        for (const duplicate of duplicates) {
            // Delete all entries for this date
            await new Promise((resolve, reject) => {
                db.db.run('DELETE FROM session_statistics WHERE session_date = ?', [duplicate.session_date], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Insert consolidated entry
            await new Promise((resolve, reject) => {
                db.db.run(`
                    INSERT INTO session_statistics 
                    (session_date, correct_answers, incorrect_answers, total_time_minutes, words_practiced)
                    VALUES (?, ?, ?, ?, ?)
                `, [
                    duplicate.session_date,
                    duplicate.total_correct,
                    duplicate.total_incorrect,
                    duplicate.total_time,
                    duplicate.total_words
                ], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            console.log(`Consolidated ${duplicate.duplicate_count} entries for ${duplicate.session_date}`);
        }

        res.json({
            message: 'Session statistics cleanup completed',
            consolidatedDates: duplicates.length,
            details: duplicates
        });

    } catch (error) {
        console.error('Error during cleanup:', error.message);
        res.status(500).json({ error: 'Failed to cleanup session statistics' });
    }
});

// ===================
// BULK OPERATIONS
// ===================

// Bulk import words from JSON
app.post('/api/import-words', async (req, res) => {
    try {
        const { words, category } = req.body;

        if (!Array.isArray(words) || !category) {
            return res.status(400).json({ error: 'Invalid request. Expected array of words and category' });
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

                await db.addWord(word.slovak, word.english, category, word.synonyms || {});
                imported++;
            } catch (error) {
                errors++;
                errorDetails.push(`Failed to import ${word.slovak}/${word.english}: ${error.message}`);
            }
        }

        res.json({
            message: 'Bulk import completed',
            imported: imported,
            errors: errors,
            errorDetails: errorDetails.slice(0, 10) // Limit error details
        });
    } catch (error) {
        console.error('Error during bulk import:', error.message);
        res.status(500).json({ error: 'Failed to import words' });
    }
});

// ===================
// LEGACY COMPATIBILITY
// ===================

// Legacy route for backward compatibility (fallback to old JSON files)
app.get('/dictionary/:filename', (req, res) => {
    const filename = req.params.filename;

    // Validate filename to prevent directory traversal
    if (!/^[a-zA-Z0-9_-]+\.json$/.test(filename)) {
        return res.status(400).json({ error: 'Invalid filename' });
    }

    const filepath = path.join(__dirname, 'dictionary', filename);

    // Check if file exists
    const fs = require('fs');
    if (fs.existsSync(filepath)) {
        try {
            const content = fs.readFileSync(filepath, 'utf8');
            const words = JSON.parse(content);
            res.json(words);
        } catch (error) {
            console.error(`Error reading ${filename}:`, error.message);
            res.status(500).json({ error: 'Failed to read dictionary file' });
        }
    } else {
        // Return empty array for non-existent files (graceful degradation)
        res.json([]);
    }
});

// ===================
// ERROR HANDLING
// ===================

// Global error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.message);
    console.error('Stack:', err.stack);

    // Don't leak error details in production
    const isDevelopment = process.env.NODE_ENV !== 'production';

    res.status(500).json({
        error: 'Internal server error',
        ...(isDevelopment && { details: err.message, stack: err.stack })
    });
});

// Handle 404s
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// ===================
// MAIN ROUTES
// ===================

// Main application route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ===================
// GRACEFUL SHUTDOWN
// ===================

// Graceful shutdown handlers
const gracefulShutdown = async (signal) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);

    try {
        await db.close();
        console.log('✅ Database connection closed');
    } catch (error) {
        console.error('❌ Error closing database:', error.message);
    }

    process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error.message);
    console.error('Stack:', error.stack);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('UNHANDLED_REJECTION');
});

// ===================
// SERVER STARTUP
// ===================

async function startServer() {
    console.log('\n🚀 Starting Slovak-English Learning App...\n');

    // Initialize database (non-blocking)
    const dbConnected = await initializeDatabase();

    // Start server regardless of database status
    const server = app.listen(PORT, () => {
        console.log('\n=================================');
        console.log(`✅ Server running at http://localhost:${PORT}`);
        console.log(`📚 Database: ${dbConnected ? 'Connected' : 'Fallback mode'}`);
        console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log('=================================\n');

        if (dbConnected) {
            console.log('🎯 Features available:');
            console.log('   • Database-driven word management');
            console.log('   • Persistent user preferences');
            console.log('   • Advanced statistics tracking');
            console.log('   • Synonym support');
            console.log('   • Smart word selection algorithm');
        } else {
            console.log('⚠️  Running in fallback mode:');
            console.log('   • JSON file dictionary support');
            console.log('   • Basic localStorage functionality');
            console.log('   • Limited statistics');
        }
        console.log('\n📖 Ready for learning! Open your browser and start practicing.\n');
    });

    // Handle server errors
    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            console.error(`❌ Port ${PORT} is already in use. Please try a different port.`);
            console.error('   You can set a different port: PORT=3001 npm start');
        } else {
            console.error('❌ Server error:', error.message);
        }
        process.exit(1);
    });

    return server;
}

// Start the server
startServer().catch(error => {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
});

module.exports = app;