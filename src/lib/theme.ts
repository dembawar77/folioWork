/** Apparence : automatique (suit le téléphone / l'ordinateur), claire ou sombre. Réglage propre à l'appareil. */
export type ThemePref = "system" | "light" | "dark";

const KEY = "fw-theme";
const BARS = { light: "#ffffff", dark: "#0e0e10" };
const media = window.matchMedia("(prefers-color-scheme: dark)");

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/** Pose data-theme (« light » / « dark ») sur <html> et la couleur de la barre du navigateur. */
export function applyTheme(pref: ThemePref = getThemePref()) {
  const theme = pref === "system" ? (media.matches ? "dark" : "light") : pref;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BARS[theme]);
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    /* réglage non mémorisé, appliqué quand même */
  }
  applyTheme(pref);
}

// En mode automatique, suit le changement du système (ex. passage en sombre le soir).
media.addEventListener("change", () => {
  if (getThemePref() === "system") applyTheme("system");
});
