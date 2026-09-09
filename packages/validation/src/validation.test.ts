import { describe, expect, it } from "vitest";
import { locationIdSchema } from "./index";

describe("locationIdSchema", () => {
  it("accepts UUID strings", () => {
    expect(locationIdSchema.safeParse(crypto.randomUUID()).success).toBe(true);
  });
});
