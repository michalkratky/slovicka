/**
 * Utility functions for the Slovicka app
 */

/**
 * Normalizes text by:
 * 1. Converting to lowercase
 * 2. Removing diacritics (accent marks)
 * 3. Trimming whitespace
 * 
 * @param {string} text - The text to normalize
 * @return {string} The normalized text
 */
function normalizeText(text) {
  if (!text) return '';
  
  // Convert to lowercase and trim
  text = text.toLowerCase().trim();
  
  // Remove diacritics (accent marks)
  // This uses Unicode normalization to decompose characters with diacritics
  // and then removes the diacritic marks (category "Mark, Nonspacing")
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

module.exports = {
  normalizeText
};