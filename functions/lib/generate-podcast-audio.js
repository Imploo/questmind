"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePodcastAudio = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const genai_1 = require("@google/genai");
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const GEMINI_TTS_MODEL = process.env.PODCAST_TTS_MODEL || 'gemini-2.5-flash-tts';
const HOST_VOICES = {
    host1: 'Puck',
    host2: 'Aoede'
};
exports.generatePodcastAudio = (0, https_1.onCall)({ cors: true }, async (request) => {
    const { auth, data } = request;
    if (!auth?.uid) {
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const { sessionId, version, script } = data;
    if (!sessionId || typeof sessionId !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'Missing sessionId.');
    }
    if (!version || typeof version !== 'number') {
        throw new https_1.HttpsError('invalid-argument', 'Missing version.');
    }
    if (!script || !Array.isArray(script.segments) || script.segments.length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'Script segments are required.');
    }
    const apiKey = process.env.GOOGLE_AI_API_KEY ||
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        throw new https_1.HttpsError('failed-precondition', 'Google AI API key is not configured.');
    }
    const ai = new genai_1.GoogleGenAI({ apiKey });
    const db = (0, firestore_1.getFirestore)();
    const storage = (0, storage_1.getStorage)().bucket();
    const sessionRef = db.doc(`users/${auth.uid}/audioSessions/${sessionId}`);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) {
        throw new https_1.HttpsError('not-found', 'Session not found.');
    }
    const sessionData = sessionSnap.data() || {};
    const existingPodcasts = Array.isArray(sessionData.podcasts) ? sessionData.podcasts : [];
    const existingEntry = existingPodcasts.find((podcast) => podcast?.version === version);
    const basePodcastEntry = {
        version,
        createdAt: existingEntry?.createdAt ?? firestore_1.FieldValue.serverTimestamp(),
        scriptGeneratedAt: existingEntry?.scriptGeneratedAt ?? firestore_1.FieldValue.serverTimestamp(),
        duration: script.estimatedDuration,
        storyVersion: sessionData.storyRegenerationCount ?? existingEntry?.storyVersion,
        script,
        status: 'generating_audio'
    };
    await sessionRef.update({
        podcasts: upsertPodcast(existingPodcasts, basePodcastEntry),
        latestPodcastVersion: version,
        updatedAt: firestore_1.FieldValue.serverTimestamp()
    });
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'podcast-'));
    const segmentFiles = [];
    const outputPath = path.join(tempDir, `podcast-${sessionId}-v${version}.mp3`);
    try {
        for (let i = 0; i < script.segments.length; i++) {
            const segment = script.segments[i];
            const voiceName = HOST_VOICES[segment.speaker] ?? HOST_VOICES.host1;
            const ttsConfig = {
                responseModalities: ['AUDIO'],
                audioConfig: {
                    audioEncoding: 'MP3',
                    voiceConfig: {
                        prebuiltVoiceConfig: {
                            voiceName
                        }
                    }
                }
            };
            const response = await ai.models.generateContent({
                model: GEMINI_TTS_MODEL,
                contents: [
                    {
                        role: 'user',
                        parts: [
                            {
                                text: segment.text
                            }
                        ]
                    }
                ],
                config: ttsConfig
            });
            const audioData = extractAudioData(response);
            if (!audioData) {
                throw new Error(`No audio data returned for segment ${i + 1}.`);
            }
            const segmentPath = path.join(tempDir, `segment-${i}.mp3`);
            fs.writeFileSync(segmentPath, Buffer.from(audioData, 'base64'));
            segmentFiles.push(segmentPath);
        }
        await combineAudioSegments(segmentFiles, outputPath);
        const storagePath = `podcasts/${auth.uid}/${sessionId}/v${version}.mp3`;
        await storage.upload(outputPath, {
            destination: storagePath,
            metadata: {
                contentType: 'audio/mpeg',
                metadata: {
                    sessionId,
                    version: version.toString(),
                    userId: auth.uid
                }
            }
        });
        const [fileUrl] = await storage.file(storagePath).getSignedUrl({
            action: 'read',
            expires: '03-01-2030'
        });
        const fileSize = fs.statSync(outputPath).size;
        const completedEntry = {
            ...basePodcastEntry,
            audioUrl: fileUrl,
            fileSize,
            audioGeneratedAt: firestore_1.FieldValue.serverTimestamp(),
            status: 'completed',
            error: null
        };
        await sessionRef.update({
            podcasts: upsertPodcast(existingPodcasts, completedEntry),
            latestPodcastVersion: version,
            updatedAt: firestore_1.FieldValue.serverTimestamp()
        });
        return {
            success: true,
            audioUrl: fileUrl,
            fileSize,
            duration: script.estimatedDuration
        };
    }
    catch (error) {
        console.error('Error generating podcast audio:', error);
        const failedEntry = {
            ...basePodcastEntry,
            status: 'failed',
            error: error?.message || 'Audio generation failed.'
        };
        await sessionRef.update({
            podcasts: upsertPodcast(existingPodcasts, failedEntry),
            updatedAt: firestore_1.FieldValue.serverTimestamp()
        });
        throw new https_1.HttpsError('internal', 'Failed to generate podcast audio.');
    }
    finally {
        for (const file of segmentFiles) {
            safeUnlink(file);
        }
        safeUnlink(outputPath);
        safeRemoveDir(tempDir);
    }
});
function extractAudioData(response) {
    const parts = response?.candidates?.[0]?.content?.parts;
    if (!parts || !Array.isArray(parts)) {
        return null;
    }
    const audioPart = parts.find((part) => part?.inlineData?.data);
    return audioPart?.inlineData?.data ?? null;
}
function upsertPodcast(existing, nextEntry) {
    const index = existing.findIndex(podcast => podcast?.version === nextEntry.version);
    if (index === -1) {
        return [...existing, nextEntry];
    }
    const updated = [...existing];
    updated[index] = { ...existing[index], ...nextEntry };
    return updated;
}
function combineAudioSegments(segmentFiles, outputPath) {
    return new Promise((resolve, reject) => {
        if (segmentFiles.length === 1) {
            fs.copyFileSync(segmentFiles[0], outputPath);
            resolve();
            return;
        }
        const command = (0, fluent_ffmpeg_1.default)();
        segmentFiles.forEach(file => command.input(file));
        const filter = segmentFiles.map((_, index) => `[${index}:a]`).join('') +
            `concat=n=${segmentFiles.length}:v=0:a=1[out]`;
        command
            .complexFilter(filter)
            .outputOptions(['-map [out]', '-ac 1', '-b:a 128k'])
            .output(outputPath)
            .on('end', () => resolve())
            .on('error', (err) => reject(err))
            .run();
    });
}
function safeUnlink(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
    catch (error) {
        console.warn('Failed to delete temp file:', filePath, error);
    }
}
function safeRemoveDir(dirPath) {
    try {
        if (fs.existsSync(dirPath)) {
            fs.rmSync(dirPath, { recursive: true, force: true });
        }
    }
    catch (error) {
        console.warn('Failed to delete temp dir:', dirPath, error);
    }
}
//# sourceMappingURL=generate-podcast-audio.js.map