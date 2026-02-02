/**
 * System prompt for Audio Transcription
 * 
 * This prompt configures the AI to transcribe D&D session audio recordings
 * with specific formatting and validation requirements.
 */
export const AUDIO_TRANSCRIPTION_PROMPT = `Transcribe this audio recording of a D&D 5e session.

CRITICAL: You MUST actually listen to and process the provided audio file. DO NOT generate fictional content if you cannot access or hear the audio.

REQUIREMENTS:
- If you cannot access the audio file or detect any speech, return: { "error": "NO_AUDIO_DETECTED", "message": "No speech detected in audio file" }
- If the audio is corrupted or unreadable, return: { "error": "AUDIO_CORRUPTED", "message": "Audio file is corrupted or unreadable" }
- If you successfully hear audio, transcribe ONLY what you actually hear - DO NOT make up or invent content
- Focus on in-game content only (combat, character actions, plot, NPC dialogue)
- Remove meta-game talk, rules debates, breaks, background noise, and repeated corrections
- Use clear, complete sentences
- Provide timestamps in seconds from the start of the audio for each segment
- Keep speaker labels short if you can infer them, otherwise omit

OUTPUT:
- If successful, return JSON with:
  - segments: array of { timeSeconds: number, text: string, speaker?: string }
- If error, return JSON with:
  - error: error code string
  - message: error message string`;
