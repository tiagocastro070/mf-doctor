import { afterEach, describe, expect, it } from "vitest";
import { shouldRunInteractive } from "./interactiveFix.js";

const originalIsTTY = process.stdout.isTTY;

function setTTY(value: boolean | undefined): void {
  Object.defineProperty(process.stdout, "isTTY", {
    value,
    configurable: true,
  });
}

afterEach(() => {
  Object.defineProperty(process.stdout, "isTTY", {
    value: originalIsTTY,
    configurable: true,
  });
});

describe("shouldRunInteractive", () => {
  it("runs in a TTY with pretty output", () => {
    setTTY(true);
    expect(shouldRunInteractive("pretty")).toBe(true);
  });

  it("never runs for json output", () => {
    setTTY(true);
    expect(shouldRunInteractive("json")).toBe(false);
  });

  it("never runs without a TTY", () => {
    setTTY(false);
    expect(shouldRunInteractive("pretty")).toBe(false);
  });
});
