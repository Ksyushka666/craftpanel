export type AppTheme = "light" | "dark";

export function getStoredTheme(
  defaultTheme: AppTheme,
  storedTheme: string | null
): AppTheme {
  return storedTheme === "dark" || storedTheme === "light"
    ? storedTheme
    : defaultTheme;
}

export function getNextTheme(theme: AppTheme): AppTheme {
  return theme === "light" ? "dark" : "light";
}

export function getThemeToggleLabel(theme: AppTheme): string {
  return theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему";
}
