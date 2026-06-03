// Centralized API service — eliminates repeated fetch boilerplate
const API = {
  currentDatabase: localStorage.getItem("selectedDatabase") || window.DATABASE_CONFIG?.default || "sk-en",

  _headers(withContentType = false) {
    const headers = { "x-database": this.currentDatabase };
    if (withContentType) headers["Content-Type"] = "application/json";
    return headers;
  },

  async _get(endpoint) {
    const res = await fetch(`/api/${endpoint}`, { headers: this._headers() });
    if (!res.ok) throw new Error(`API ${endpoint}: ${res.status}`);
    return res.json();
  },

  async _post(endpoint, body) {
    const res = await fetch(`/api/${endpoint}`, {
      method: "POST",
      headers: this._headers(true),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `API ${endpoint}: ${res.status}`);
    }
    return res.json();
  },

  // Preferences
  getPreferences() { return this._get("preferences"); },
  savePreference(key, value) { return this._post("preferences", { key, value }); },
  async saveAllPreferences(translationDirections, enableAIValidation, enabledGroups) {
    await Promise.all([
      this.savePreference("translationDirections", translationDirections),
      this.savePreference("enableAIValidation", enableAIValidation),
      this.savePreference("enabledGroups", enabledGroups),
    ]);
  },

  // Word groups & words
  getWordGroups() { return this._get("word-groups"); },
  getDictionaryFiles() { return this._get("dictionary-files"); },
  addWord(word, translation, category, synonyms) {
    return this._post("words", { word, translation, category, synonyms });
  },
  async deleteWord(wordId) {
    const res = await fetch(`/api/words/${wordId}`, {
      method: "DELETE",
      headers: this._headers(),
    });
    if (!res.ok) throw new Error("Failed to delete word");
    return res.json();
  },

  // Group management
  getCategories() { return this._get("categories"); },
  createGroup(name) { return this._post("groups", { name }); },
  async renameGroup(oldName, newName) {
    const res = await fetch(`/api/groups/${encodeURIComponent(oldName)}`, {
      method: "PUT",
      headers: this._headers(true),
      body: JSON.stringify({ newName }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to rename group");
    }
    return res.json();
  },
  async deleteGroup(name) {
    const res = await fetch(`/api/groups/${encodeURIComponent(name)}`, {
      method: "DELETE",
      headers: this._headers(),
    });
    if (!res.ok) throw new Error("Failed to delete group");
    return res.json();
  },

  // Word management
  async updateWord(wordId, updates) {
    const res = await fetch(`/api/words/${wordId}`, {
      method: "PUT",
      headers: this._headers(true),
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error("Failed to update word");
    return res.json();
  },
  batchDeleteWords(wordIds) { return this._post("words/batch-delete", { wordIds }); },
  batchMoveWords(wordIds, targetCategory) { return this._post("words/batch-move", { wordIds, targetCategory }); },
  importWords(body) { return this._post("import-words", body); },

  // Practice
  getNextWord(enabledGroups, translationDirections) {
    return this._post("next-word", { enabledGroups, translationDirections });
  },
  checkAnswer(wordId, userAnswer, targetLanguage) {
    return this._post("check-answer", { wordId, userAnswer, targetLanguage });
  },
  recordAnswer(wordId, direction, isCorrect, timeTaken) {
    return this._post("record-answer", { wordId, direction, isCorrect, timeTaken });
  },
  validateTranslation(wordId, userAnswer, targetLanguage) {
    return this._post("validate-translation", { wordId, userAnswer, targetLanguage });
  },

  // Stats
  getSessionStats() { return this._get("session-stats"); },
  getUserStats(offset = 0, limit = 50) { return this._get(`user-stats?limit=${limit}&offset=${offset}`); },
};
