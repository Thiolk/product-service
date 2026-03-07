const request = require("supertest");

jest.mock("pg", () => {
  const queryMock = jest.fn();

  return {
    Pool: jest.fn(() => ({
      query: queryMock,
    })),
    __queryMock: queryMock,
  };
});

const { __queryMock } = require("pg");
const { index } = require("../../src/index");

describe("product-service service-local integration tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __queryMock.mockReset();
  });

  describe("GET /health", () => {
    test("returns 200 with OK body", async () => {
      const res = await request(index).get("/health");

      expect(res.status).toBe(200);
      expect(res.text).toBe("OK");
    });
  });

  describe("POST /products", () => {
    test("creates a product successfully", async () => {
      __queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: 11,
            name: "Keyboard",
            price: 49.99,
            description: "Mechanical keyboard",
          },
        ],
      });

      const payload = {
        name: "Keyboard",
        price: 49.99,
        description: "Mechanical keyboard",
      };

      const res = await request(index).post("/products").send(payload);

      expect(res.status).toBe(201);

      expect(__queryMock).toHaveBeenCalledWith(
        "INSERT INTO products (name, price, description) VALUES ($1, $2, $3) RETURNING *",
        ["Keyboard", 49.99, "Mechanical keyboard"],
      );

      expect(res.body).toEqual({
        id: 11,
        name: "Keyboard",
        price: 49.99,
        description: "Mechanical keyboard",
      });
    });

    test("returns 500 when database insert fails", async () => {
      __queryMock.mockRejectedValueOnce(new Error("database failure"));

      const res = await request(index).post("/products").send({
        name: "Mouse",
        price: 29.99,
        description: "Wireless mouse",
      });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "Database error" });
    });
  });
});
