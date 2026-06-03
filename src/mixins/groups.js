const GroupsMixin = {
  data() {
    return {
      selectedGroup: null,
      selectedWordIds: [],
      isSelectMode: false,
      isDragging: false,
      dragStartIndex: null,
      showGroupModal: false,
      showCreateGroupModal: false,
      showRenameGroupModal: false,
      showDeleteGroupConfirm: false,
      showImportModal: false,
      showAddWordForm: false,
      editingWordId: null,
      deleteGroupTarget: null,
      renameGroupKey: "",
      renameGroupName: "",
      newGroupName: "",
      newWord: { slovak: "", english: "", synonymsSlovak: "", synonymsEnglish: "" },
      editWord: { slovak: "", english: "", synonymsSlovak: "", synonymsEnglish: "" },
      importPreview: null,
      importResult: null,
      importErrors: [],
      importDragOver: false,
      importLegacyCategory: "",
      allCategories: [],
      moveTargetCategory: "",
      hasFinePointer: window.matchMedia("(pointer: fine)").matches,
    };
  },

  computed: {
    selectedGroupData() {
      if (!this.selectedGroup || !this.wordGroups[this.selectedGroup]) return null;
      return this.wordGroups[this.selectedGroup];
    },
    selectedGroupWords() {
      return this.selectedGroupData ? this.selectedGroupData.words : [];
    },
  },

  methods: {
    // --- Group CRUD ---
    openGroupModal(key) {
      this.selectedGroup = key;
      this.selectedWordIds = [];
      this.isSelectMode = false;
      this.showAddWordForm = false;
      this.editingWordId = null;
      this.showGroupModal = true;
    },

    closeGroupModal() {
      this.showGroupModal = false;
      this.selectedGroup = null;
      this.selectedWordIds = [];
    },

    openCreateGroup() {
      this.newGroupName = "";
      this.showCreateGroupModal = true;
    },

    async createGroup() {
      if (!this.newGroupName.trim()) return;
      try {
        await API.createGroup(this.newGroupName.trim());
        this.showCreateGroupModal = false;
        await this.loadWordGroups();
      } catch (error) {
        alert(error.message);
      }
    },

    openRenameGroup(key) {
      this.renameGroupKey = key;
      this.renameGroupName = this.wordGroups[key]?.name || key;
      this.showRenameGroupModal = true;
    },

    async renameGroup() {
      if (!this.renameGroupName.trim()) return;
      try {
        await API.renameGroup(this.renameGroupKey, this.renameGroupName.trim());
        this.showRenameGroupModal = false;
        await this.loadWordGroups();
      } catch (error) {
        alert(error.message);
      }
    },

    confirmDeleteGroup(key) {
      this.deleteGroupTarget = key;
      this.showDeleteGroupConfirm = true;
    },

    async deleteGroup() {
      try {
        await API.deleteGroup(this.deleteGroupTarget);
        this.showDeleteGroupConfirm = false;
        this.deleteGroupTarget = null;
        await this.loadWordGroups();
      } catch (error) {
        alert(error.message);
      }
    },

    // --- Word CRUD ---
    openAddWordForm() {
      this.newWord = { slovak: "", english: "", synonymsSlovak: "", synonymsEnglish: "" };
      this.showAddWordForm = true;
      this.editingWordId = null;
    },

    async saveNewWord() {
      if (!this.newWord.slovak.trim() || !this.newWord.english.trim()) return;
      const synonyms = {};
      if (this.newWord.synonymsSlovak.trim()) {
        synonyms.slovak = this.newWord.synonymsSlovak.split(",").map((s) => s.trim()).filter(Boolean);
      }
      if (this.newWord.synonymsEnglish.trim()) {
        synonyms.english = this.newWord.synonymsEnglish.split(",").map((s) => s.trim()).filter(Boolean);
      }
      try {
        await API.addWord(this.newWord.slovak.trim(), this.newWord.english.trim(), this.selectedGroup, synonyms);
        this.showAddWordForm = false;
        await this.loadWordGroups();
      } catch (error) {
        alert(error.message);
      }
    },

    startEditWord(word) {
      this.editingWordId = word.id;
      this.editWord = {
        slovak: word.slovak,
        english: word.english,
        synonymsSlovak: (word.synonyms?.slovak || []).join(", "),
        synonymsEnglish: (word.synonyms?.english || []).join(", "),
      };
    },

    cancelEditWord() {
      this.editingWordId = null;
    },

    async saveEditWord() {
      const synonyms = {};
      if (this.editWord.synonymsSlovak.trim()) {
        synonyms.slovak = this.editWord.synonymsSlovak.split(",").map((s) => s.trim()).filter(Boolean);
      }
      if (this.editWord.synonymsEnglish.trim()) {
        synonyms.english = this.editWord.synonymsEnglish.split(",").map((s) => s.trim()).filter(Boolean);
      }
      try {
        await API.updateWord(this.editingWordId, {
          slovak: this.editWord.slovak.trim(),
          english: this.editWord.english.trim(),
          synonyms,
        });
        this.editingWordId = null;
        await this.loadWordGroups();
      } catch (error) {
        alert(error.message);
      }
    },

    async deleteSingleWord(wordId) {
      if (!confirm("Naozaj odstrániť toto slovo?")) return;
      try {
        await API.deleteWord(wordId);
        await this.loadWordGroups();
      } catch (error) {
        alert(error.message);
      }
    },

    // --- Selection ---
    toggleWordSelection(wordId) {
      const idx = this.selectedWordIds.indexOf(wordId);
      if (idx === -1) {
        this.selectedWordIds.push(wordId);
      } else {
        this.selectedWordIds.splice(idx, 1);
      }
    },

    selectAll() {
      this.selectedWordIds = this.selectedGroupWords.map((w) => w.id);
    },

    deselectAll() {
      this.selectedWordIds = [];
    },

    isWordSelected(wordId) {
      return this.selectedWordIds.includes(wordId);
    },

    // --- Drag selection (desktop only) ---
    onWordMouseDown(index, event) {
      if (!this.hasFinePointer || this.editingWordId) return;
      if (event.target.closest("button, input, a, .word-actions")) return;
      event.preventDefault();
      this.isDragging = true;
      this.dragStartIndex = index;
      this.selectedWordIds = [this.selectedGroupWords[index].id];
    },

    onWordMouseOver(index) {
      if (!this.isDragging) return;
      const start = Math.min(this.dragStartIndex, index);
      const end = Math.max(this.dragStartIndex, index);
      this.selectedWordIds = this.selectedGroupWords
        .slice(start, end + 1)
        .map((w) => w.id);
    },

    onWordMouseUp() {
      this.isDragging = false;
    },

    // --- Batch operations ---
    async batchDelete() {
      if (!this.selectedWordIds.length) return;
      if (!confirm(`Naozaj odstrániť ${this.selectedWordIds.length} slov?`)) return;
      try {
        await API.batchDeleteWords(this.selectedWordIds);
        this.selectedWordIds = [];
        await this.loadWordGroups();
      } catch (error) {
        alert(error.message);
      }
    },

    async openBatchMove() {
      try {
        this.allCategories = await API.getCategories();
        this.moveTargetCategory = "";
      } catch (error) {
        alert(error.message);
      }
    },

    async batchMove() {
      if (!this.moveTargetCategory || !this.selectedWordIds.length) return;
      try {
        await API.batchMoveWords(this.selectedWordIds, this.moveTargetCategory);
        this.selectedWordIds = [];
        this.moveTargetCategory = "";
        await this.loadWordGroups();
      } catch (error) {
        alert(error.message);
      }
    },

    // --- Import ---
    openImportModal() {
      this.importPreview = null;
      this.importResult = null;
      this.importErrors = [];
      this.importDragOver = false;
      this.importLegacyCategory = "";
      this.showImportModal = true;
    },

    onImportDragOver(event) {
      event.preventDefault();
      this.importDragOver = true;
    },

    onImportDragLeave() {
      this.importDragOver = false;
    },

    onImportDrop(event) {
      event.preventDefault();
      this.importDragOver = false;
      const file = event.dataTransfer?.files[0];
      if (file) this._readImportFile(file);
    },

    onImportFileSelect(event) {
      const file = event.target.files[0];
      if (file) this._readImportFile(file);
    },

    _readImportFile(file) {
      if (!file.name.endsWith(".json")) {
        this.importErrors = ["Podporovaný je iba formát JSON."];
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          this._parseImportData(data);
        } catch {
          this.importErrors = ["Neplatný JSON súbor."];
          this.importPreview = null;
        }
      };
      reader.readAsText(file);
    },

    _parseImportData(data) {
      this.importErrors = [];
      this.importResult = null;

      // Multi-group format
      if (data.groups && Array.isArray(data.groups)) {
        const groups = data.groups
          .filter((g) => g.category && Array.isArray(g.words))
          .map((g) => ({ category: g.category, words: g.words, count: g.words.length }));
        if (!groups.length) {
          this.importErrors = ["Žiadne platné skupiny v súbore."];
          return;
        }
        this.importPreview = { format: "multi", groups, totalWords: groups.reduce((s, g) => s + g.count, 0) };
        return;
      }

      // Single-group format
      if (data.category && Array.isArray(data.words)) {
        this.importPreview = {
          format: "single",
          groups: [{ category: data.category, words: data.words, count: data.words.length }],
          totalWords: data.words.length,
        };
        return;
      }

      // Legacy array format
      if (Array.isArray(data)) {
        this.importPreview = {
          format: "legacy",
          groups: [{ category: null, words: data, count: data.length }],
          totalWords: data.length,
        };
        return;
      }

      this.importErrors = ["Neznámy formát súboru."];
    },

    async confirmImport() {
      if (!this.importPreview) return;

      // For legacy format, require a category name
      if (this.importPreview.format === "legacy") {
        if (!this.importLegacyCategory.trim()) {
          this.importErrors = ["Zadaj názov skupiny pre import."];
          return;
        }
        this.importPreview.groups[0].category = this.importLegacyCategory.trim().toLowerCase().replace(/\s+/g, "_");
      }

      try {
        let body;
        if (this.importPreview.groups.length === 1) {
          body = { category: this.importPreview.groups[0].category, words: this.importPreview.groups[0].words };
        } else {
          body = { groups: this.importPreview.groups.map((g) => ({ category: g.category, words: g.words })) };
        }
        this.importResult = await API.importWords(body);
        await this.loadWordGroups();
      } catch (error) {
        this.importErrors = [error.message];
      }
    },

    cancelImport() {
      this.showImportModal = false;
      this.importPreview = null;
      this.importResult = null;
      this.importErrors = [];
    },
  },
};
