/** Mot-symbole FolioWork : Satoshi Medium, « Folio » et point en Bleu Eloïse. */
export function Wordmark({ muted = false, className = "" }: { muted?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-baseline font-display text-lg font-medium tracking-[-0.02em] ${muted ? "text-ink-3" : "text-ink"} ${className}`}>
      <span className={muted ? undefined : "text-accent"}>Folio</span>
      Work
      <span aria-hidden className={`ml-[3px] inline-block size-[7px] rounded-full ${muted ? "bg-ink-3" : "bg-accent"}`} />
    </span>
  );
}
