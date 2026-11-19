/** Durée minimale du lancement : laisse l'animation du logo se terminer au lieu de clignoter. */
const MIN_MS = 750;
let done = false;

/** Retire l'écran de lancement (index.html) en fondu, une seule fois. */
export function hideSplash() {
  if (done) return;
  done = true;
  const el = document.getElementById("splash");
  if (!el) return;
  const wait = Math.max(0, MIN_MS - performance.now());
  window.setTimeout(() => {
    el.classList.add("out");
    window.setTimeout(() => el.remove(), 300);
  }, wait);
}
