/** Enregistrement du service worker et abonnement aux notifications web. */

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const url = import.meta.env.DEV ? "/dev-sw.js?dev-sw" : "/sw.js";
  navigator.serviceWorker.register(url, { type: import.meta.env.DEV ? "module" : "classic" }).catch((err) => {
    console.warn("Service worker non enregistré", err);
  });
}

export type PushSupport =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "ios-not-installed" | "denied" };

export function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
}

export function pushSupport(): PushSupport {
  if (isIos() && !isStandalone()) return { ok: false, reason: "ios-not-installed" };
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return { ok: false, reason: "unsupported" };
  }
  if (Notification.permission === "denied") return { ok: false, reason: "denied" };
  return { ok: true };
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function subscribePush(vapidPublicKey: string) {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications refusées par le navigateur");
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) }));
  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
    deviceLabel: deviceLabel(),
  };
}

export function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua)
    ? "Android"
    : isIos()
      ? "iPhone/iPad"
      : /Mac/.test(ua)
        ? "Mac"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "Appareil";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navigateur";
  return `${os} · ${browser}${isStandalone() ? " · app installée" : ""}`;
}
