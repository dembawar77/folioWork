/** Mot-symbole FolioWork : Satoshi Medium, « Folio » et point en Bleu Eloïse. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline font-display text-lg font-medium tracking-[-0.02em] text-ink ${className}`}>
      <span className="text-accent">Folio</span>
      Work
      <span aria-hidden className="ml-[3px] inline-block size-[7px] rounded-full bg-accent" />
    </span>
  );
}
