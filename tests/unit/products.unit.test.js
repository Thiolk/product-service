const request = require("supertest");

// Mock pg BEFORE requiring the app
const mockQuery = jest.fn();
jest.mock("pg", () => ({
  Pool: jest.fn(() => ({
    query: mockQuery,
  })),
}));

const { index } = require("../../src/index.js");

describe("Product Service - Unit Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("GET /health returns 200 OK", async () => {
    const res = await request(index).get("/health");
    expect(res.status).toBe(200);
    expect(res.text).toBe("OK");
  });

  test("GET /products returns rows from DB", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, name: "Apple", price: 1.5, description: "fruit" },
        { id: 2, name: "Bread", price: 3.0, description: "carbs" },
      ],
    });

    const res = await request(index).get("/products");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 1, name: "Apple", price: 1.5, description: "fruit" },
      { id: 2, name: "Bread", price: 3.0, description: "carbs" },
    ]);

    expect(mockQuery).toHaveBeenCalledWith("SELECT * FROM products");
  });

  test("GET /products/:id returns 200 when found", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 10, name: "Milk", price: 2.2, description: "dairy" }],
    });

    const res = await request(index).get("/products/10");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 10,
      name: "Milk",
      price: 2.2,
      description: "dairy",
    });

    expect(mockQuery).toHaveBeenCalledWith(
      "SELECT * FROM products WHERE id = $1",
      ["10"]
    );
  });

  test("GET /products/:id returns 404 when not found", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(index).get("/products/999");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Product not found" });

    expect(mockQuery).toHaveBeenCalledWith(
      "SELECT * FROM products WHERE id = $1",
      ["999"]
    );
  });

  test("POST /products creates a product", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 5, name: "Chips", price: 4.5, description: "snack" }],
    });

    const res = await request(index)
      .post("/products")
      .send({ name: "Chips", price: 4.5, description: "snack" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: 5,
      name: "Chips",
      price: 4.5,
      description: "snack",
    });

    expect(mockQuery).toHaveBeenCalledWith(
      "INSERT INTO products (name, price, description) VALUES ($1, $2, $3) RETURNING *",
      ["Chips", 4.5, "snack"]
    );
  });
});