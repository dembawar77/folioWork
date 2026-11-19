/** Relances WhatsApp : numéros, liens wa.me et message pré-rédigé. Aucune API payante. */
import { formatDue } from "./format";

/**
 * Normalise un numéro pour wa.me (chiffres, indicatif inclus, sans « + »).
 * Un numéro sénégalais à 9 chiffres (77…, 78…, 76…, 70…, 75…, 33…) reçoit l'indicatif 221.
 */
export function normalizePhone(input: string | undefined | null): string | undefined {
  if (!input) return undefined;
  let digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  digits = digits.replace(/\D/g, "");
  if (/^(7[05678]|3[03])\d{7}$/.test(digits)) digits = `221${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? digits : undefined;
}

export function formatPhone(digits: string): string {
  if (digits.startsWith("221") && digits.length === 12) {
    const n = digits.slice(3);
    return `+221 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5, 7)} ${n.slice(7)}`;
  }
  return `+${digits}`;
}

export function followUpMessage(name: string, title: string, dueAt: number | undefined, timeZone: string): string {
  const first = name.trim().split(/\s+/)[0];
  const due = dueAt !== undefined ? ` (prévu ${formatDue(dueAt, timeZone)})` : "";
  return `Bonjour ${first}, je reviens vers vous au sujet de « ${title} »${due}. Où en sommes-nous ? Merci.`;
}

/** Lien qui ouvre WhatsApp avec le message ; sans numéro, WhatsApp demande le destinataire. */
export function whatsappLink(phone: string | undefined, text: string): string {
  return `https://wa.me/${phone ?? ""}?text=${encodeURIComponent(text)}`;
}
