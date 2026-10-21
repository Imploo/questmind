/**
 * Keeps only lines that follow the annotated session-log format
 * (see prompts/raw-story-transcription.prompt.ts) and drops anything else —
 * in practice the model occasionally leaks its own reasoning or a preamble
 * ("Faithful conversation log of the audio clip:") into the output.
 */

/** Words allowed in lowercase inside a multi-word character name (e.g. "Bart de Bonker"). */
const NAME_PARTICLE = "(?:de|van|der|den|het|von|of|the|du|la|le)";
const NAME_WORD = "\\p{Lu}[\\p{L}'’.-]*";
const CHARACTER_NAME = `${NAME_WORD}(?: (?:${NAME_PARTICLE}|${NAME_WORD})){0,3}`;
const SPEAKER = `(?:DM|Speler \\(onbekend\\)|${CHARACTER_NAME})`;
const ANNOTATION = "(?:\\s*\\[[^\\]\\n]+\\])?";

/** "<Spreker> [annotatie]: tekst" */
const SPOKEN_LINE = new RegExp(`^${SPEAKER}${ANNOTATION}\\s*:\\s*\\S`, 'u');
/** "(Groep: ...)" */
const GROUP_LINE = /^\(Groep:.*\)$/u;
/** "[OOC: ...]" */
const OOC_LINE = /^\[OOC:.*\]$/u;
/**
 * A fixed speaker label glued to the end of leaked text, e.g.
 * "…game mechanics.Speler (onbekend): De deur blijft dicht." — only the fixed
 * labels are recovered, so ordinary prose containing a colon is never split.
 */
const EMBEDDED_FIXED_SPEAKER = new RegExp(`(?:DM|Speler \\(onbekend\\))${ANNOTATION}\\s*:\\s*\\S`, 'u');

export interface SanitizedLog {
  text: string;
  /** Lines (or leaked prefixes) that were removed. */
  dropped: string[];
}

export function isSessionLogLine(line: string): boolean {
  return SPOKEN_LINE.test(line) || GROUP_LINE.test(line) || OOC_LINE.test(line);
}

export function sanitizeSessionLog(raw: string): SanitizedLog {
  const kept: string[] = [];
  const dropped: string[] = [];

  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    if (isSessionLogLine(line)) {
      kept.push(line);
      continue;
    }

    const embedded = EMBEDDED_FIXED_SPEAKER.exec(line);
    if (embedded && embedded.index > 0) {
      dropped.push(line.slice(0, embedded.index));
      kept.push(line.slice(embedded.index));
      continue;
    }

    dropped.push(line);
  }

  return { text: kept.join('\n'), dropped };
}
