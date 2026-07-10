const { serialize } = require("../../src/utils/serialize");

describe("serialize", () => {
  test("converts BigInt to string", () => {
    const out = serialize({ id: 1n, name: "Dev" });
    expect(out).toEqual({ id: "1", name: "Dev" });
  });

  test("handles nested arrays", () => {
    const out = serialize([{ id: 5n }, { id: 6n }]);
    expect(out).toEqual([{ id: "5" }, { id: "6" }]);
  });
});
