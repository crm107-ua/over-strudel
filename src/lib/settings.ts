/** User settings, kept in the browser (localStorage): no account, no server. */
export interface Settings {
  /**
   * Keep the user's own code when the score changes in ways that do not need rewriting it (key signature, number of
   * measures, transposition): only the directives / a trailing `.transpose()` are touched. Edits to individual notes
   * still regenerate the code (undo restores it).
   */
  preserveCode: boolean;
}

export const DEFAULT_SETTINGS: Settings = { preserveCode: true };
const KEY = "os-settings";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const j = JSON.parse(raw) as Partial<Settings>;
    return { preserveCode: typeof j.preserveCode === "boolean" ? j.preserveCode : DEFAULT_SETTINGS.preserveCode };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: the setting just lasts for this session */
  }
}
