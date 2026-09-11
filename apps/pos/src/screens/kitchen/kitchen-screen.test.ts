import { describe, expect, it } from "vitest";
import { ageMinutes, urgencyForAge } from "./kitchen-screen";

describe("kitchen ticket timing", () => {
  const now = Date.parse("2026-09-11T12:00:00.000Z");

  it("derives age from the persisted ticket timestamp", () => {
    expect(ageMinutes("2026-09-11T11:42:00.000Z", now)).toBe(18);
    expect(ageMinutes("not-a-date", now)).toBe(0);
  });

  it("uses stable urgency thresholds", () => {
    expect(urgencyForAge(9)).toBe("normal");
    expect(urgencyForAge(10)).toBe("approaching");
    expect(urgencyForAge(20)).toBe("late");
    expect(urgencyForAge(30)).toBe("critical");
  });
});
