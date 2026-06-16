import "@testing-library/jest-dom/vitest";
import { beforeAll } from "vitest";
import { randomFillSync } from "crypto";

beforeAll(() => {
  Object.defineProperty(window, "crypto", {
    value: {
      getRandomValues: (buffer: Uint8Array) => randomFillSync(buffer),
    },
  });

  if (typeof globalThis.ResizeObserver === "undefined") {
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    const value = ResizeObserverStub as unknown as typeof ResizeObserver;
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value,
    });
    Object.defineProperty(window, "ResizeObserver", {
      configurable: true,
      value,
    });
  }

  if (globalThis.AbortController && globalThis.AbortSignal) {
    Object.defineProperty(window, "AbortController", {
      value: globalThis.AbortController,
    });
    Object.defineProperty(window, "AbortSignal", {
      value: globalThis.AbortSignal,
    });
  }

  if (
    globalThis.Headers &&
    globalThis.Request &&
    globalThis.Response &&
    globalThis.fetch
  ) {
    Object.defineProperty(window, "Headers", { value: globalThis.Headers });
    Object.defineProperty(window, "Request", { value: globalThis.Request });
    Object.defineProperty(window, "Response", { value: globalThis.Response });
    Object.defineProperty(window, "fetch", { value: globalThis.fetch });
  }
});
