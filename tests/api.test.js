const request = require("supertest");
const { app, initializeDatabase } = require("../server");

// These tests run against the real database (read-only operations and input
// validation only). Tests that mutate data should use a separate test DB.
beforeAll(async () => {
  await initializeDatabase();
});

describe("GET /api/health", () => {
  it("returns health status with expected fields", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status", "ok");
    expect(res.body).toHaveProperty("database", "connected");
    expect(res.body).toHaveProperty("selectedDatabase", "sk-en");
  });
});

describe("GET /api/word-groups", () => {
  it("returns word groups as a non-empty object", async () => {
    const res = await request(app).get("/api/word-groups");
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe("object");
    expect(Object.keys(res.body).length).toBeGreaterThan(0);
  });
});

describe("POST /api/check-answer", () => {
  it("rejects missing fields with 400", async () => {
    const res = await request(app).post("/api/check-answer").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Missing required fields");
  });

  it("rejects partial fields with 400", async () => {
    const res = await request(app)
      .post("/api/check-answer")
      .send({ wordId: 1, userAnswer: "test" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/next-word", () => {
  it("rejects missing fields with 400", async () => {
    const res = await request(app).post("/api/next-word").send({});
    expect(res.status).toBe(400);
  });
});

describe("POST /api/validate-translation", () => {
  it("rejects missing fields with 400", async () => {
    const res = await request(app).post("/api/validate-translation").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Missing required fields");
  });
});
