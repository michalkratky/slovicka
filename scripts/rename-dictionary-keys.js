#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const DICTIONARY_DIR = path.join(__dirname, "..", "dictionary");

const files = fs.readdirSync(DICTIONARY_DIR).filter((f) => f.endsWith(".json"));
let transformed = 0;

for (const file of files) {
  const filePath = path.join(DICTIONARY_DIR, file);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error(`Skipping ${file}: ${err.message}`);
    continue;
  }

  if (data[0] && data[0].word) {
    console.log(`Already transformed: ${file}`);
    continue;
  }

  const words = data.map((entry) => {
    const out = { word: entry.slovak, translation: entry.english };
    if (entry.synonyms) {
      out.synonyms = {};
      if (entry.synonyms.slovak) out.synonyms.word = entry.synonyms.slovak;
      if (entry.synonyms.english) out.synonyms.translation = entry.synonyms.english;
    }
    return out;
  });

  fs.writeFileSync(filePath, JSON.stringify(words, null, 2) + "\n", "utf8");
  transformed++;
  console.log(`Transformed ${file} (${words.length} words)`);
}

console.log(`\nDone: ${transformed} files transformed.`);
