import { describe, expect, it } from "vitest";
import { createDatabase, initializeDatabase } from "./index";

describe("database", () => {
  it("initializes a local SQLite database", () => {
    const { sqlite } = createDatabase();
    initializeDatabase(sqlite);
    sqlite
      .prepare("INSERT INTO app_metadata (key, value) VALUES ('version', '1')")
      .run();
    expect(
      sqlite
        .prepare("SELECT value FROM app_metadata WHERE key = 'version'")
        .get(),
    ).toEqual({
      value: "1",
    });
    sqlite.close();
  });
});
