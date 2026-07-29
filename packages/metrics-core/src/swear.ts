/**
 * Shared bad-word pattern for the swear-jar counter. Used by both the
 * browser-side usage queries (local history) and the hourly relay exporter
 * so the count is consistent across data sources. Case-insensitive,
 * word-boundary anchored.
 */
export const SWEAR_PATTERN = "\\b(motherfuck[a-z]*|bullshit[a-z]*|asshole[a-z]*|bastard[a-z]*|bitch[a-z]*|goddamn[a-z]*|fuck[a-z]*|shit[a-z]*|crap[a-z]*|damn[a-z]*|dick[a-z]*|piss[a-z]*|wtf|hell)\\b";

/** Count bad-word occurrences in `text` (case-insensitive). */
export function countSwears(text: string): number {
  if (!text) return 0;
  const matches = text.toLowerCase().match(new RegExp(SWEAR_PATTERN, "g"));
  return matches ? matches.length : 0;
}
