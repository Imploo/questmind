/**
 * System prompts for Raw Story Transcription
 *
 * Two variants share the same faithfulness/accuracy rules:
 *  - RAW_STORY_TRANSCRIPTION_PROMPT: a full session in a single pass.
 *  - buildSegmentTranscriptionPrompt(): one time-segment of a longer session
 *    (used when the recording is split into shorter clips so each clip gets the
 *    model's full attention and its own output budget — see ticket #67).
 *
 * The output is later polished into the final session story by a second AI step.
 * Keep the two variants aligned: only the opening line and the LENGTH/OUTPUT
 * framing differ; the faithfulness, processing and accuracy rules are shared.
 */

/** The single most important instruction — shared by both variants. */
const FAITHFULNESS_PARAGRAPH = `Your single most important goal is FAITHFULNESS: write down only what is genuinely said and clearly audible in the recording. A shorter account that is completely accurate is always better than a longer one that invents, guesses, or embellishes. NEVER add, pad, dramatize, or extrapolate anything to make the story longer or more exciting — every detail must come from the audio, never from your own imagination or your general knowledge of how D&D sessions usually go.`;

/** Listening mandate + truthfulness rules — shared by both variants. */
const LISTEN_AND_TRUTHFULNESS = `CRITICAL: You MUST actually listen to and process the provided audio file. DO NOT generate fictional content if you cannot access or hear the audio.

TRUTHFULNESS (CRITICAL):
- ONLY write what you actually hear in the audio — NEVER invent, fabricate, or embellish events that did not happen
- If you are unsure about something, either skip it or clearly describe only what you can confirm
- Detail and length must come from faithfully capturing what IS in the audio, not from making things up
- Do NOT add scenes, dialogue, or events that are not present in the recording
- If a section of audio is unclear, move on — do not fill in gaps with imagined content
- The goal is a DETAILED and FAITHFUL account, not a creative writing exercise
- When you cannot make out what was said, do NOT guess — either leave it out, or briefly note that a passage was unclear. This is especially important for proper names, numbers (dice rolls, damage, hit points, gold), and specific spell or ability names
- Do NOT turn a vague impression into a concrete event: if you only half-hear something, omit the specifics rather than inventing plausible-sounding dialogue, outcomes, or actions
- Do NOT infer or assume what "must have" happened between things you do hear — only report what is actually in the audio, even if that leaves gaps`;

/** Detail sub-bullets shared by both LENGTH sections. */
const DETAIL_SUBBULLETS = `  - Do NOT summarize — instead, expand and elaborate on every scene, conversation, and encounter you HEAR in the audio
  - Include full dialogue exchanges as spoken, not just summaries of what was discussed
  - Describe combat round by round as narrated: who attacks whom, what abilities are used, what the results are, how characters react
  - Capture the emotional tone as expressed in the audio: how characters sound, their hesitations, their excitement, their fear
  - Describe environments and atmospheres as the DM describes them in the audio
  - Include NPC personalities and mannerisms as they come through in the audio
  - When characters deliberate about decisions, capture that discussion — what options were considered, what arguments were made
  - Include transitions between scenes: travel, rest, preparation moments as they occur`;

/** Processing, accuracy, campaign-context, anti-repetition and quality rules — shared. */
const PROCESSING_TO_QUALITY = `PROCESSING APPROACH:
- Process the audio chronologically in strict order
- For each event: First identify WHO is involved, THEN describe WHAT happens in detail, THEN note WHEN/WHERE it occurs
- Keep events separate and sequential - NEVER merge or conflate different moments into one
- If unsure about timing or who performed an action, describe events separately rather than combining them
- Maintain clear boundaries between different actions, conversations, and scenes
- Give each significant scene or encounter multiple paragraphs of description

ACCURACY REQUIREMENTS:
- NEVER combine separate events into a single merged event
- NEVER assume who performed an action if unclear - state uncertainty or describe the event generically instead
- Keep strict chronological order: if event A happens before event B, always write them in that exact order
- If you're unsure about the sequence of events, write each event separately with its own context
- When multiple characters are involved, clearly attribute each action to the correct person
- If a name-to-action connection is unclear, prefer writing "someone" or "a character" over guessing wrongly

CAMPAIGN CONTEXT USAGE:
- If campaign context (characters, locations, quests, organisations) is provided below, use it ONLY to improve accuracy when hearing names and places
- The context helps you recognize proper nouns correctly (e.g., "Khuri-Khan" instead of "corikan", "Waterdeep" instead of "water deep")
- DO NOT add information from the context that wasn't spoken in the audio
- ONLY use the context to spell names and places correctly when you hear them
- If you're unsure what was said, write what you hear phonetically rather than guessing from context
- NEVER use context to infer who did what - only use audio evidence for action attribution

ANTI-REPETITION RULES:
- NEVER repeat the same word more than 5 times in a row
- If you find yourself generating repetitive content, STOP and move to the next part
- Each paragraph should contain unique, meaningful content
- If audio is genuinely unclear or contains static/noise, briefly note it and move on

QUALITY GUIDELINES:
- Write exactly what you hear — faithfully and in detail
- Focus on meaningful in-game content, skip filler words and repeated false starts
- If a speaker repeats themselves naturally (e.g., "No, no, I mean..."), write it once concisely
- If there is silence, background music, or unintelligible audio, skip it and move on — do not hallucinate content
- When audio IS clear, be as detailed and thorough as possible — capture every conversation, every action, every decision`;

const ERROR_HANDLING = `ERROR HANDLING:
- If you cannot access the audio file or detect any speech, return exactly: ERROR: NO_AUDIO_DETECTED
- If the audio is corrupted or unreadable, return exactly: ERROR: AUDIO_CORRUPTED`;

export const RAW_STORY_TRANSCRIPTION_PROMPT = `Listen to this audio recording of a D&D 5e session and write a detailed, faithful account of everything that actually happens in it. This raw story is the source material for a later refining step.

${FAITHFULNESS_PARAGRAPH}

${LISTEN_AND_TRUTHFULNESS}

LENGTH AND DETAIL (CRITICAL):
- The length of the narrative is determined ENTIRELY by how much real content is actually in the audio. Capture everything you genuinely hear, and let the length be whatever that honestly requires. Do NOT aim for a target length and do NOT pad to reach one
- When the audio is clear and full of events, be thorough: write down the actual dialogue, actions, rolls, and outcomes you hear, scene by scene. When a stretch of audio is quiet, unclear, or off-topic, it is CORRECT for the narrative to be brief there — say less rather than inventing more
- You have a large output budget (about 65,000 tokens / roughly 200,000 characters). This is room you MAY use when there is real content to capture, not a quota you must fill
- Cover the ENTIRE session in strict chronological order, from the first scene to the last — do not run out of room early. Give later parts the same faithful attention as the opening
- Be as detailed as the audio genuinely supports, on every front:
${DETAIL_SUBBULLETS}

${PROCESSING_TO_QUALITY}

OUTPUT REQUIREMENTS:
- Write in Dutch
- Output plain text only - NO JSON, NO timestamps, NO speaker labels, NO markdown formatting
- Write a flowing, richly detailed narrative in chronological order
- Include ALL details: full dialogue exchanges, combat actions blow-by-blow, NPC interactions with personality, plot developments, character decisions and reasoning
- Name characters explicitly when you can identify them
- Focus on in-game content only (combat, character actions, plot, NPC dialogue)
- Remove meta-game talk, rules debates, breaks, background noise, and repeated corrections
- Use clear, complete sentences grouped into well-developed paragraphs
- Be thorough where the audio is rich and brief where it is sparse — capture the real content faithfully and keep the whole session covered from start to finish, never padding with invented material to reach a length
- When in doubt about whether to include something from the audio, prefer meaningful in-game content; if space is getting tight, economize on verbosity rather than skipping later events

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
 * Drops the "cover the ENTIRE session / pace yourself over 3 hours" framing —
 * which is meaningless per clip and previously caused the model to ration its
 * budget — and keeps every faithfulness rule. Each clip is short enough that
 * the full output budget is ample, so the model can transcribe it completely.
 */
export function buildSegmentTranscriptionPrompt(meta: SegmentPromptMeta): string {
  const startMin = Math.round(meta.startSec / 60);
  const endMin = Math.round(meta.endSec / 60);
  const approxMinutes = Math.max(1, endMin - startMin);

  return `Listen to this audio clip and write a detailed, faithful account of everything that actually happens in it. This clip is SEGMENT ${meta.index} OF ${meta.total} of a single, longer D&D 5e session (covering roughly minute ${startMin} to minute ${endMin} of the recording). It is the source material for a later refining step; the segments will be joined together afterwards.

${FAITHFULNESS_PARAGRAPH}

${LISTEN_AND_TRUTHFULNESS}

LENGTH AND DETAIL (CRITICAL):
- This is only one clip of about ${approxMinutes} minutes — transcribe EVERYTHING you hear in THIS clip, faithfully and in full. You have ample output budget for a clip this short, so there is NO need to compress or summarise: capture the actual dialogue, actions, rolls, and outcomes scene by scene
- The length is still determined ENTIRELY by how much real content is in this clip. When a stretch is quiet, unclear, or off-topic, it is CORRECT to be brief there — say less rather than inventing more. Do NOT pad to reach a length
- Transcribe this clip from its very beginning to its very end, in strict chronological order. Do NOT skip the later part of the clip — give the end of the clip the same faithful attention as the start
- Only report what is audible in THIS clip. Do NOT summarise or recap other segments, and do NOT speculate about what happened before or after it
- The very start of the clip may overlap slightly with the previous segment; just transcribe what you hear naturally
- Be as detailed as the audio genuinely supports, on every front:
${DETAIL_SUBBULLETS}

${PROCESSING_TO_QUALITY}

OUTPUT REQUIREMENTS:
- Write in Dutch
- Output plain text only - NO JSON, NO timestamps, NO speaker labels, NO markdown formatting
- Write a flowing, richly detailed narrative in chronological order
- Include ALL details: full dialogue exchanges, combat actions blow-by-blow, NPC interactions with personality, plot developments, character decisions and reasoning
- Name characters explicitly when you can identify them
- Focus on in-game content only (combat, character actions, plot, NPC dialogue)
- Remove meta-game talk, rules debates, breaks, background noise, and repeated corrections
- Use clear, complete sentences grouped into well-developed paragraphs
- Do NOT write any introduction or conclusion ABOUT the clip itself (no "in this part...", no "the clip ends...") — just narrate the in-game events, so the segments read as one continuous story when joined
- When in doubt about whether to include something from the audio, prefer meaningful in-game content

${ERROR_HANDLING}`;
}
