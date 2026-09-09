import { describe, expect, it } from "vitest";
import type { PrintDocument } from "./index";

describe("printing contracts", () => {
  it("supports a transport-neutral test document", () => {
    const document: PrintDocument = {
      id: "test",
      kind: "test",
      content: "Test print",
    };
    expect(document.kind).toBe("test");
  });
});
