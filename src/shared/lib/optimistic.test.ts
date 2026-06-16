import { describe, expect, it } from "vitest";

import { applyOptimisticUpdate } from "./optimistic";

describe("applyOptimisticUpdate", () => {
  it("returns next state and rollback", () => {
    const result = applyOptimisticUpdate(1, (value) => value + 1);

    expect(result.next).toBe(2);
    expect(result.rollback()).toBe(1);
  });

  it("handles object updates", () => {
    const current = { count: 1 };
    const result = applyOptimisticUpdate(current, (value) => ({
      ...value,
      count: value.count + 1,
    }));

    expect(result.next.count).toBe(2);
    expect(result.rollback()).toBe(current);
  });
});
