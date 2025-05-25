const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

// Serve static files from current directory
app.use(express.static('.'));

// Serve static files from /src under the /src path
app.use('/src', express.static(path.join(__dirname, 'src')));

// Serve dictionary files under the /dictionary path
app.use('/dictionary', express.static(path.join(__dirname, 'dictionary')));

// Main route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('Static files served from /src/ and /dictionary/');
});
