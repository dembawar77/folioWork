import { useRef, useState } from "react";
import { Check, CalendarClock } from "lucide-react";

/**
 * Glisser une ligne au doigt : vers la droite = terminer, vers la gauche = reporter à demain.
 * Le défilement vertical reste libre : le geste ne démarre que sur un mouvement nettement horizontal.
 * Souris ignorée (le clic et les boutons restent la voie sur ordinateur).
 */
export function SwipeRow({
  disabled,
  onRight,
  onLeft,
  children,
  surface,
}: {
  disabled?: boolean;
  onRight: () => void;
  onLeft: () => void;
  children: React.ReactNode;
  surface: string;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; axis: "x" | "y" | null; width: number; armed: boolean } | null>(null);
  const swallowClick = useRef(false);

  const threshold = (w: number) => Math.min(110, w * 0.3);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (disabled || e.pointerType === "mouse") return;
    start.current = { x: e.clientX, y: e.clientY, axis: null, width: e.currentTarget.offsetWidth, armed: false };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const s = start.current;
    if (!s) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (s.axis === null) {
      if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.5) {
        s.axis = "x";
        setDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      } else if (Math.abs(my) > 10) {
        s.axis = "y";
        start.current = null;
        return;
      } else return;
    }
    const armed = Math.abs(mx) > threshold(s.width);
    if (armed !== s.armed) {
      s.armed = armed;
      if (armed) navigator.vibrate?.(8);
    }
    setDx(mx);
  }

  function finish() {
    const s = start.current;
    start.current = null;
    if (!s || s.axis !== "x") return;
    setDragging(false);
    swallowClick.current = true;
    setTimeout(() => (swallowClick.current = false), 50);
    const t = threshold(s.width);
    if (dx > t) {
      setDx(s.width);
      setTimeout(() => {
        onRight();
        setDx(0);
      }, 180);
    } else if (dx < -t) {
      setDx(-s.width);
      setTimeout(() => {
        onLeft();
        setDx(0);
      }, 180);
    } else setDx(0);
  }

  const armedRight = dx > 0 && start.current !== null && dx > threshold(start.current.width);
  const armedLeft = dx < 0 && start.current !== null && -dx > threshold(start.current.width);

  return (
    <div className="relative overflow-hidden">
      {dx !== 0 && (
        <div aria-hidden className={`absolute inset-0 flex items-center px-5 text-sm font-medium text-white ${dx > 0 ? "justify-start bg-accent" : "justify-end bg-soon"}`}>
          {dx > 0 ? (
            <span className={`inline-flex items-center gap-2 transition-transform duration-150 ${armedRight ? "scale-110" : ""}`}>
              <Check className="size-5" /> Terminer
            </span>
          ) : (
            <span className={`inline-flex items-center gap-2 transition-transform duration-150 ${armedLeft ? "scale-110" : ""}`}>
              Demain <CalendarClock className="size-5" />
            </span>
          )}
        </div>
      )}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onClickCapture={(e) => {
          if (swallowClick.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, touchAction: "pan-y" }}
        className={`relative ${surface} ${dragging ? "" : "transition-transform duration-200 ease-brand"}`}
      >
        {children}
      </div>
    </div>
  );
}
