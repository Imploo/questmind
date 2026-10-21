/**
 * System prompts for the annotated session log (step 7, stored as `rawStory`)
 *
 * The transcription step produces a near-verbatim, annotated conversation log:
 * what is said, who says it, and audible delivery cues (tone, energy, emotion).
 * It is NOT a story — the session story is written from this log in a second AI step
 * (see session-story-generator.prompt.ts), which also has the previous sessions as context.
 *
 * Two variants share the same format, faithfulness and attribution rules:
 *  - RAW_STORY_TRANSCRIPTION_PROMPT: a full session in a single pass.
 *  - buildSegmentTranscriptionPrompt(): one time-segment of a longer session
 *    (used when the recording is split into shorter clips so each clip gets the
 *    model's full attention and its own output budget — see ticket #67).
 *
 * Keep the two variants aligned: only the opening line and the LENGTH framing differ.
 */

/** The single most important instruction — shared by both variants. */
const FAITHFULNESS_PARAGRAPH = `Your single most important goal is FAITHFULNESS: write down only what is genuinely said and clearly audible in the recording. A shorter log that is completely accurate is always better than a longer one that invents, guesses, or embellishes. NEVER add, pad, dramatize, or extrapolate anything — every line must come from the audio, never from your own imagination or your general knowledge of how D&D sessions usually go.`;

/** Listening mandate + truthfulness rules — shared by both variants. */
const LISTEN_AND_TRUTHFULNESS = `CRITICAL: You MUST actually listen to and process the provided audio file. DO NOT generate fictional content if you cannot access or hear the audio.

TRUTHFULNESS (CRITICAL):
- ONLY write what you actually hear in the audio — NEVER invent, fabricate, or embellish what was said or done
- Do NOT add lines, scenes, or events that are not present in the recording
- Inaudible or unintelligible audio is DROPPED: write nothing for it — no placeholder, no "[onverstaanbaar]", no guess, no reconstruction
- If you only half-hear a line, either leave it out or write only the part you clearly heard. This is especially important for proper names, numbers (dice rolls, damage, hit points, gold), and spell or ability names
- Do NOT infer or assume what "must have" been said between things you do hear — gaps are fine`;

/** The line format of the log — shared by both variants and relied upon by the story step. */
const LOG_FORMAT = `OUTPUT FORMAT — ANNOTATED CONVERSATION LOG:
Write the log as consecutive lines in strict chronological order. Use ONLY these four line types:

1. Spoken line:
   <Spreker> [<annotatie>]: <wat er gezegd wordt>
2. Group energy (only when it is clearly audible and noteworthy):
   (Groep: <korte beschrijving van de sfeer of reactie aan tafel>)
3. Out-of-character summary (one short line per OOC stretch):
   [OOC: <korte samenvatting van het off-game gesprek>]
4. Nothing else — no headers, no prose paragraphs, no timestamps, no markdown, no introduction or conclusion

Illustration of the FORMAT only (placeholders — never copy these names or content):
DM [rustig, dreigend]: <beschrijving van de DM zoals uitgesproken>
<Characternaam> [opgewonden, snel]: <wat de speler zegt of zijn character laat doen>
Speler (onbekend) [aarzelend]: <wat er gezegd wordt>
(Groep: <bijv. gelach, iedereen praat door elkaar>)
[OOC: <bijv. korte regeldiscussie over een spreuk, luchtig>]`;

/** Speaker attribution, near-verbatim and annotation rules — shared by both variants. */
const LOG_RULES = `SPEAKERS (CRITICAL — NEVER GUESS):
- "DM" for the Dungeon Master. This includes everything the DM voices: narration, NPCs, monsters, rulings. Do NOT relabel NPC speech as the NPC — it stays "DM"
- A player is labelled with their CHARACTER name ONLY when the audio itself makes it clear: the player is addressed by that character name, introduces themselves as that character, or the DM states that character is acting right before/after the line
- Otherwise label the player exactly as: Speler (onbekend)
- Never assign a speaker based on what would make sense in the story, or based on the campaign reference list. A wrong name is worse than "Speler (onbekend)"
- Once a voice is clearly linked to a character in this recording, you may keep using that name for the same clearly recognisable voice — if in any doubt, fall back to "Speler (onbekend)"

NEAR-VERBATIM CONTENT:
- Write down what is said as closely as possible to the actual words. Do NOT paraphrase, summarise, or polish in-game speech
- You MAY drop filler words ("eh", "uhm"), stutters, and immediately-repeated false starts
- Keep dice rolls, numbers, damage, and outcomes exactly as spoken
- Keep each line in the language it was spoken in (usually Dutch; keep English game terms or English lines as spoken)
- Separate turns into separate lines; never merge different speakers or different moments into one line
- Keep strict chronological order

ANNOTATIONS:
- The annotation between [ ] describes ONLY audible delivery: tone, volume, pace, laughter, hesitation, sighing, excitement, tension, sarcasm you can hear in the voice
- Keep it to a few Dutch words (e.g. "fluisterend", "lachend", "geïrriteerd", "plechtig", "snel, opgewonden")
- If no clear cue is audible, leave the annotation out entirely: <Spreker>: <tekst>
- Never state motives, intentions, or thoughts — only what can be heard
- Use (Groep: ...) lines for the shared energy at the table when it clearly shifts or stands out (laughter, cheering, tense silence after a big roll, chaos). Do not add one after every line

OUT-OF-CHARACTER TALK:
- Rules debates, jokes about real life, breaks, snacks, technical issues, scheduling: do NOT transcribe these verbatim
- Summarise each OOC stretch in ONE short [OOC: ...] line, including its mood when clear (e.g. "[OOC: discussie over grapple-regels, wat gefrustreerd]")
- In-game jokes and banter between characters ARE in-game: transcribe them as spoken lines

CAMPAIGN CONTEXT USAGE:
- If a campaign reference list (characters, locations, quests, organisations) is provided below, use it ONLY to spell names and places correctly when you hear them
- Do NOT add information from the context that wasn't spoken, and NEVER use it to decide who is speaking
- If you're unsure how a name is spelled, write it phonetically rather than guessing from context

ANTI-REPETITION RULES:
- NEVER repeat the same word more than 5 times in a row
- If you find yourself generating repetitive content, STOP and move on to the next audible line`;

const ERROR_HANDLING = `ERROR HANDLING:
- If you cannot access the audio file or detect any speech, return exactly: ERROR: NO_AUDIO_DETECTED
- If the audio is corrupted or unreadable, return exactly: ERROR: AUDIO_CORRUPTED`;

export const RAW_STORY_TRANSCRIPTION_PROMPT = `Listen to this audio recording of a D&D 5e session and write an annotated conversation log of it: near-verbatim what is said, who says it, and how it sounds. This log is the source material for a later step that writes the session story — so capture the nuance, do not write the story yourself.

${FAITHFULNESS_PARAGRAPH}

${LISTEN_AND_TRUTHFULNESS}

LENGTH:
- The length is determined ENTIRELY by how much clearly audible speech is in the recording. Do NOT aim for a target length and do NOT pad
- You have a large output budget (about 65,000 tokens). Use it to keep lines near-verbatim, not to add content
- Cover the ENTIRE session in strict chronological order, from the first line to the last — do not run out of room early. Give later parts the same faithful attention as the opening. If space gets tight, shorten OOC summaries and drop annotations before dropping in-game lines

${LOG_FORMAT}

${LOG_RULES}

${ERROR_HANDLING}`;

export interface SegmentPromptMeta {
  /** 1-based position of this segment. */
  index: number;
  /** Total number of segments the session was split into. */
  total: number;
  /** Approximate start offset of this clip within the full recording, in seconds. */
  startSec: number;
  /** Approximate end offset of this clip within the full recording, in seconds. */
  endSec: number;
}

/**
 * Build the transcription prompt for ONE time-segment of a longer session.
 *
 * Drops the "cover the ENTIRE session" framing — which is meaningless per clip and
 * previously caused the model to ration its budget — and keeps every format and
 * faithfulness rule, so the per-segment logs can simply be concatenated.
 */
export function buildSegmentTranscriptionPrompt(meta: SegmentPromptMeta): string {
  const startMin = Math.round(meta.startSec / 60);
  const endMin = Math.round(meta.endSec / 60);
  const approxMinutes = Math.max(1, endMin - startMin);

  return `Listen to this audio clip and write an annotated conversation log of it: near-verbatim what is said, who says it, and how it sounds. This clip is SEGMENT ${meta.index} OF ${meta.total} of a single, longer D&D 5e session (covering roughly minute ${startMin} to minute ${endMin} of the recording). The segment logs will be joined together afterwards and used by a later step that writes the session story — so capture the nuance, do not write the story yourself.

${FAITHFULNESS_PARAGRAPH}

${LISTEN_AND_TRUTHFULNESS}

LENGTH:
- This is only one clip of about ${approxMinutes} minutes — log EVERYTHING clearly audible in THIS clip, near-verbatim. You have ample output budget for a clip this short, so there is NO need to compress or summarise in-game speech
- The length is still determined ENTIRELY by how much clearly audible speech is in this clip. Do NOT pad
- Log this clip from its very beginning to its very end, in strict chronological order. Give the end of the clip the same faithful attention as the start
- Only log what is audible in THIS clip. Do NOT recap other segments, and do NOT speculate about what happened before or after it
- The very start of the clip may overlap slightly with the previous segment; just log what you hear
- Speaker names cannot be carried over from other segments: only use a character name when THIS clip makes it clear, otherwise use "Speler (onbekend)"
- Do NOT write any introduction or conclusion about the clip itself — start directly with the first line of the log

${LOG_FORMAT}

${LOG_RULES}

${ERROR_HANDLING}`;
}
