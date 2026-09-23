import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIdleTimeout } from "../src/hooks/useIdleTimeout";

describe("useIdleTimeout", () => {
  it("locks after specified timeout and unlocks on demand", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useIdleTimeout({ timeoutMs: 1000, enabled: true }));

    expect(result.current.isLocked).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1100);
    });

    expect(result.current.isLocked).toBe(true);

    act(() => {
      result.current.unlock();
    });

    expect(result.current.isLocked).toBe(false);
    vi.useRealTimers();
  });
});
