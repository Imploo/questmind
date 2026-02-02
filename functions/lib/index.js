"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePodcastAudio = void 0;
const v2_1 = require("firebase-functions/v2");
const app_1 = require("firebase-admin/app");
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const ffmpeg_1 = __importDefault(require("@ffmpeg-installer/ffmpeg"));
(0, v2_1.setGlobalOptions)({
    region: 'europe-west4',
    timeoutSeconds: 540,
    memory: '2GiB'
});
(0, app_1.initializeApp)();
fluent_ffmpeg_1.default.setFfmpegPath(ffmpeg_1.default.path);
var generate_podcast_audio_1 = require("./generate-podcast-audio");
Object.defineProperty(exports, "generatePodcastAudio", { enumerable: true, get: function () { return generate_podcast_audio_1.generatePodcastAudio; } });
//# sourceMappingURL=index.js.map