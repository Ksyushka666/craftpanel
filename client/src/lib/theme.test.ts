import { describe, expect, it } from "vitest";
import { getNextTheme, getStoredTheme, getThemeToggleLabel } from "./theme";

describe("theme helpers", () => {
  it("toggles between light and dark themes", () => {
    expect(getNextTheme("light")).toBe("dark");
    expect(getNextTheme("dark")).toBe("light");
  });

  it("accepts only valid stored themes and falls back safely", () => {
    expect(getStoredTheme("light", "dark")).toBe("dark");
    expect(getStoredTheme("dark", "light")).toBe("light");
    expect(getStoredTheme("light", "system")).toBe("light");
    expect(getStoredTheme("dark", null)).toBe("dark");
  });

  it("exposes an accessible action label for the current theme", () => {
    expect(getThemeToggleLabel("light")).toBe("Включить тёмную тему");
    expect(getThemeToggleLabel("dark")).toBe("Включить светлую тему");
  });
});
