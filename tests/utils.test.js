const { normalizeText } = require("../utils");

describe("normalizeText", () => {
  it("converts to lowercase", () => {
    expect(normalizeText("HELLO")).toBe("hello");
  });

  it("trims whitespace", () => {
    expect(normalizeText("  hello  ")).toBe("hello");
  });

  it("removes Slovak diacritics", () => {
    expect(normalizeText("čšžťďňľĺŕáéíóúý")).toBe("csztdnllraeiouy");
  });

  it("removes German umlauts", () => {
    expect(normalizeText("über")).toBe("uber");
  });

  it("handles combined transformations", () => {
    expect(normalizeText("  Škola  ")).toBe("skola");
  });

  it("returns empty string for null/undefined", () => {
    expect(normalizeText(null)).toBe("");
    expect(normalizeText(undefined)).toBe("");
    expect(normalizeText("")).toBe("");
  });
});
