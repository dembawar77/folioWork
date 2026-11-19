/**
 * Adresses de notification acceptées : uniquement les services push des navigateurs.
 * Empêche d'utiliser le serveur pour envoyer des requêtes vers une destination quelconque.
 */
const EXACT = new Set(["fcm.googleapis.com", "android.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"]);
const SUFFIXES = [".notify.windows.com", ".push.apple.com", ".push.services.mozilla.com"];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  if (endpoint.length > 1024) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return EXACT.has(host) || SUFFIXES.some((s) => host.endsWith(s) && host.length > s.length);
}

/** Clés d'abonnement : base64url de taille plausible (p256dh : 65 octets, auth : 16 octets). */
export function isValidKeys(p256dh: string, auth: string): boolean {
  const b64 = /^[A-Za-z0-9_-]+=*$/;
  return b64.test(p256dh) && b64.test(auth) && p256dh.length >= 80 && p256dh.length <= 100 && auth.length >= 16 && auth.length <= 30;
}
