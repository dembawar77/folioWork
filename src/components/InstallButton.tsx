import { useEffect, useState } from "react";
import { Check, Download } from "lucide-react";
import { isIos, isStandalone } from "../lib/push";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

export function InstallButton({ variant = "compact" }: { variant?: "compact" | "full" }) {
  const [, force] = useState(0);
  const [showIosHelp, setShowIosHelp] = useState(false);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);

  if (isStandalone()) return variant === "full" ? <p className="inline-flex items-center gap-2 text-sm font-medium text-ink"><Check className="size-4" aria-hidden /> App installée</p> : null;

  if (isIos()) {
    return (
      <div>
        <button onClick={() => setShowIosHelp((s) => !s)} className="inline-flex h-10 items-center gap-2 border border-line px-3 text-sm font-medium hover:bg-hover">
          <Download className="size-4" aria-hidden /> Installer
        </button>
        {showIosHelp && (
          <p className="mt-2 max-w-xs text-xs text-ink-2">
            Dans Safari : touchez <b>Partager</b> puis <b>Sur l'écran d'accueil</b>.
          </p>
        )}
      </div>
    );
  }

  if (!deferred) return variant === "full" ? <p className="text-sm text-ink-2">Utilisez le menu du navigateur → « Installer l'application ».</p> : null;

  return (
    <button
      onClick={async () => {
        await deferred?.prompt();
        deferred = null;
        force((n) => n + 1);
      }}
      className="inline-flex h-10 items-center gap-2 border border-line px-3 text-sm font-medium hover:bg-hover"
    >
      <Download className="size-4" aria-hidden /> Installer l'app
    </button>
  );
}
