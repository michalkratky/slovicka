const { OpenAI } = require('openai');
require('dotenv').config();

/**
 * Service for interacting with the OpenAI API
 */
class OpenAIService {
  constructor() {
    // Get API key from environment variables
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      console.warn('OpenAI API key not found. Translation validation will not work.');
      this.isEnabled = false;
      return;
    }
    
    this.isEnabled = true;
    this.model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
    
    // Initialize OpenAI client
    this.openai = new OpenAI({
      apiKey: apiKey
    });
    
    console.log(`OpenAI service initialized with model: ${this.model}`);
  }

  /**
   * Validate if a user's translation is correct for a given word
   * 
   * @param {string} sourceWord - The word in the source language
   * @param {string} targetLanguage - The language of the expected translation ('slovak' or 'english')
   * @param {string} correctTranslation - The known correct translation
   * @param {string} userTranslation - The user's translation to validate
   * @param {Array<string>} existingSynonyms - List of existing synonyms for the word
   * @returns {Promise<Object>} - Object with isValid and explanation properties
   */
  async validateTranslation(sourceWord, targetLanguage, correctTranslation, userTranslation, existingSynonyms = []) {
    if (!this.isEnabled) {
      return { 
        isValid: false, 
        explanation: 'OpenAI service is not enabled. Please set OPENAI_API_KEY in your .env file.' 
      };
    }
    
    try {
      // Determine source and target language names
      const sourceLang = targetLanguage === 'slovak' ? 'English' : 'Slovak';
      const targetLang = targetLanguage === 'slovak' ? 'Slovak' : 'English';
      
      // Format the list of existing synonyms for the prompt
      const synonymsText = existingSynonyms.length > 0 
        ? `Known synonyms for this word: ${existingSynonyms.join(', ')}.` 
        : '';
      
      // Create prompt for ChatGPT
      const messages = [
        { role: 'system', content: `You are a bilingual ${sourceLang}-${targetLang} language expert. Your task is to determine if a translation is valid.` },
        { role: 'user', content: `
I'm translating from ${sourceLang} to ${targetLang}.

The ${sourceLang} word is: "${sourceWord}"
The known correct ${targetLang} translation is: "${correctTranslation}"
${synonymsText}

The user provided this translation: "${userTranslation}"

Is the user's translation a valid alternative translation or synonym for "${sourceWord}" in ${targetLang}?
Please consider:
1. Meaning - does it convey the same meaning?
2. Usage - would it be used in the same context?
3. Formality - is it appropriate for the same situations?

Respond with a JSON object with these fields:
- isValid (boolean): true if it's a valid translation, false otherwise
- explanation (string): brief explanation of your reasoning
- confidence (number): your confidence in this assessment from 0 to 1

Only provide the JSON response with no other text.
`}
      ];

      // Call the OpenAI API
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: messages,
        temperature: 0.3, // Lower temperature for more consistent results
        max_tokens: 500,
        response_format: { type: 'json_object' }
      });

      // Parse the JSON response
      const content = response.choices[0].message.content;
      const result = JSON.parse(content);
      
      // Log the result for debugging
      console.log(`Translation validation for "${userTranslation}": ${result.isValid ? 'Valid' : 'Invalid'}`);

      return {
        isValid: result.isValid,
        explanation: result.explanation,
        confidence: result.confidence || 0.8 // Default confidence if not provided
      };
    } catch (error) {
      console.error('Error validating translation with OpenAI:', error);
      return { 
        isValid: false, 
        explanation: `Error validating translation: ${error.message}`,
        confidence: 0
      };
    }
  }
}

module.exports = new OpenAIService();