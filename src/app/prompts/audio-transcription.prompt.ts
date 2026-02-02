/**
 * System prompt for Audio Transcription
 * 
 * This prompt configures the AI to transcribe D&D session audio recordings
 * with specific formatting and validation requirements.
 */
export const AUDIO_TRANSCRIPTION_PROMPT = `Transcribe this audio recording of a D&D 5e session.

CRITICAL: You MUST actually listen to and process the provided audio file. DO NOT generate fictional content if you cannot access or hear the audio.

ANTI-REPETITION RULES (IMPORTANT):
- NEVER repeat the same word more than 3 times in a row
- If you find yourself generating repetitive content, STOP immediately and move to the next segment
- Each segment should contain unique, meaningful dialogue or narration
- If audio is unclear or contains static/noise, use [inaudible] or [unclear] rather than guessing or repeating
- When uncertain about what was said, it's better to skip that segment than to hallucinate or repeat
- Silence and brevity are better than invention

QUALITY GUIDELINES:
- Transcribe exactly what you hear - no more, no less
- If you don't hear clear speech, return fewer segments rather than inventing content
- Focus on meaningful content, skip filler words and repeated false starts
- If a speaker repeats themselves naturally (e.g., "No, no, I mean..."), transcribe it once concisely
- If there is no speech, silence, background music or you can't understand, ignore it and move on. Don't hallucinate or repeat.

REQUIREMENTS:
- If you cannot access the audio file or detect any speech, return: { "error": "NO_AUDIO_DETECTED", "message": "No speech detected in audio file" }
- If the audio is corrupted or unreadable, return: { "error": "AUDIO_CORRUPTED", "message": "Audio file is corrupted or unreadable" }
- If you successfully hear audio, transcribe ONLY what you actually hear - DO NOT make up or invent content
- Focus on in-game content only (combat, character actions, plot, NPC dialogue)
- Remove meta-game talk, rules debates, breaks, background noise, and repeated corrections
- Use clear, complete sentences
- Provide timestamps in seconds from the start of the audio for each segment
- Keep speaker labels short if you can infer them, otherwise omit

OUTPUT FORMAT EXAMPLE:
{
  "segments": [
    { "timeSeconds": 0, "text": "The party enters the ancient dungeon cautiously, torches in hand.", "speaker": "DM" },
    { "timeSeconds": 15.5, "text": "I want to check the door for traps before we proceed.", "speaker": "Rogue" },
    { "timeSeconds": 18, "text": "Good idea. Roll investigation.", "speaker": "DM" },
    { "timeSeconds": 22, "text": "[dice rolling]" },
    { "timeSeconds": 24, "text": "That's a natural 20!", "speaker": "Rogue" },
    { "timeSeconds": 26, "text": "You spot a pressure plate just inside the doorway.", "speaker": "DM" }
  ]
}

OUTPUT:
- If successful, return JSON with:
  - segments: array of { timeSeconds: number, text: string, speaker?: string }
- If error, return JSON with:
  - error: error code string
  - message: error message string`;
