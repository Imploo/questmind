# Gemini API Standard Usage Guide

## Overview

The Gemini API provides powerful generative AI capabilities through standard REST endpoints. This document covers the interactive/standard usage of the Gemini API (non-batch mode), including best practices, rate limits, and advanced features.

## Table of Contents

1. [API Modes](#api-modes)
2. [Getting Started](#getting-started)
3. [Content Generation](#content-generation)
4. [Multimodal Capabilities](#multimodal-capabilities)
5. [Advanced Features](#advanced-features)
6. [Rate Limits & Quotas](#rate-limits--quotas)
7. [Best Practices](#best-practices)
8. [Error Handling](#error-handling)

## API Modes

The Gemini API offers three main interaction modes:

### 1. Standard Mode (`generateContent`)
- **Use Case**: Non-interactive tasks where you can wait for the entire result
- **Response**: Returns the model's full response in a single package
- **Best For**: Batch processing, background jobs, single-shot completions

### 2. Streaming Mode (`streamGenerateContent`)
- **Use Case**: Interactive applications requiring real-time feedback
- **Response**: Uses Server-Sent Events (SSE) to push chunks as they're generated
- **Best For**: Chatbots, UI applications, progressive displays

### 3. Live API (`BidiGenerateContent`)
- **Use Case**: Real-time conversational experiences
- **Response**: WebSocket-based bi-directional streaming
- **Best For**: Voice assistants, video calls, interactive sessions

## Getting Started

### Installation

```typescript
import { GoogleGenAI } from '@google/genai';

const googleAi = new GoogleGenAI({
  apiKey: process.env.GOOGLE_AI_API_KEY
});
```

### Basic Request Structure

```typescript
const request = {
  model: 'gemini-2.5-flash',
  contents: [
    {
      role: 'user',
      parts: [
        { text: 'Your prompt here' }
      ]
    }
  ],
  generationConfig: {
    temperature: 0.7,
    topK: 40,
    topP: 0.95,
    maxOutputTokens: 8192,
  }
};
```

## Content Generation

### Standard Generation

```typescript
const model = googleAi.models.get('gemini-2.5-flash');
const response = await model.generateContent({
  contents: [
    {
      role: 'user',
      parts: [{ text: 'Explain quantum computing' }]
    }
  ]
});

const text = response.candidates[0].content.parts[0].text;
```

### Streaming Generation

```typescript
const stream = await model.streamGenerateContent({
  contents: [
    {
      role: 'user',
      parts: [{ text: 'Write a story about AI' }]
    }
  ]
});

for await (const chunk of stream) {
  const text = chunk.candidates[0].content.parts[0].text;
  process.stdout.write(text); // Display progressively
}
```

### Multi-turn Conversations

```typescript
const chat = model.startChat({
  history: [
    {
      role: 'user',
      parts: [{ text: 'Hello! I need help with coding.' }]
    },
    {
      role: 'model',
      parts: [{ text: 'Hi! I\'d be happy to help. What language?' }]
    }
  ]
});

const result = await chat.sendMessage('I want to learn Python');
```

## Multimodal Capabilities

### File Upload Methods

The Gemini API supports multiple ways to include media:

1. **Inline Data** (< 20MB, simple requests)
2. **File API** (> 20MB, reusable files)
3. **Cloud Storage URLs** (gs:// URLs)

### Audio Files

```typescript
// Upload audio file
const audioFile = await googleAi.files.upload({
  file: audioBuffer,
  mimeType: 'audio/wav',
  displayName: 'session-recording.wav'
});

// Wait for processing
let file = await googleAi.files.get({ name: audioFile.name });
while (file.state === 'PROCESSING') {
  await new Promise(resolve => setTimeout(resolve, 5000));
  file = await googleAi.files.get({ name: audioFile.name });
}

// Generate content with audio
const response = await model.generateContent({
  contents: [
    {
      parts: [
        { text: 'Transcribe this audio file' },
        {
          fileData: {
            mimeType: audioFile.mimeType,
            fileUri: audioFile.uri
          }
        }
      ]
    }
  ],
  generationConfig: {
    responseModalities: ['text'],
    audioTimestamp: true // For accurate timestamps
  }
});
```

### Video Files

```typescript
// Upload video
const videoFile = await googleAi.files.upload({
  file: videoBuffer,
  mimeType: 'video/mp4',
  displayName: 'presentation.mp4'
});

// Use in prompt
const response = await model.generateContent({
  contents: [
    {
      parts: [
        {
          fileData: {
            mimeType: videoFile.mimeType,
            fileUri: videoFile.uri
          }
        },
        { text: 'Summarize this video at timestamp 01:45' }
      ]
    }
  ]
});
```

### File Upload Best Practices

| Scenario | Method | Max Size | Notes |
|----------|--------|----------|-------|
| Small files (< 20MB) | Inline data | 20MB | Simple, no upload needed |
| Large files (> 20MB) | File API | 2GB | Requires upload + processing |
| Long videos | File API | 2GB | Split into 5-15 min chunks |
| Reusable files | File API | 2GB | Files expire after 48 hours |
| Cloud files | gs:// URLs | N/A | Must be accessible by Google AI |

**Important Notes:**
- Only one video per prompt for optimal results
- Place video before text prompt
- Use MM:SS format for timestamps (e.g., 01:15)
- Split long files: ≤5 min (Free tier), ≤15 min (Pro tier)
- File API uploads expire after 48 hours

### Supported File Types

**Audio**: WAV, MP3, AIFF, AAC, OGG, FLAC
**Video**: MP4, MPEG, MOV, AVI, FLV, MPG, WEBM, WMV, 3GPP
**Images**: PNG, JPEG, WEBP, HEIC, HEIF
**Documents**: PDF, TXT, HTML, CSS, JavaScript, TypeScript, Python, etc.

## Advanced Features

### System Instructions

System instructions steer the model's behavior across all interactions:

```typescript
const model = googleAi.models.get('gemini-2.5-flash', {
  systemInstruction: {
    role: 'system',
    parts: [
      {
        text: 'You are a helpful assistant that always responds in JSON format. ' +
              'Be concise and accurate.'
      }
    ]
  }
});
```

**Best Practices:**
- Define the model's role clearly
- Specify response format requirements
- Set boundaries and limitations
- Use for consistent behavior across conversations

### Function Calling

Enable the model to use external tools and APIs:

```typescript
const tools = [
  {
    functionDeclarations: [
      {
        name: 'get_weather',
        description: 'Get the current weather for a location',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'City and state, e.g. San Francisco, CA'
            },
            unit: {
              type: 'string',
              enum: ['celsius', 'fahrenheit']
            }
          },
          required: ['location']
        }
      }
    ]
  }
];

const response = await model.generateContent({
  contents: [
    {
      role: 'user',
      parts: [{ text: 'What\'s the weather in Paris?' }]
    }
  ],
  tools: tools
});

// Check if function call was requested
const functionCall = response.candidates[0].content.parts[0].functionCall;
if (functionCall) {
  // Execute the function
  const weatherData = await getWeather(functionCall.args);

  // Send result back to model
  const finalResponse = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [{ text: 'What\'s the weather in Paris?' }]
      },
      {
        role: 'model',
        parts: [{ functionCall: functionCall }]
      },
      {
        role: 'function',
        parts: [
          {
            functionResponse: {
              name: 'get_weather',
              response: weatherData
            }
          }
        ]
      }
    ],
    tools: tools
  });
}
```

**Function Calling Tips:**
- Keep active tools to 10-20 maximum
- Use low temperature (0) for deterministic calls
- Provide clear function descriptions
- Include when/how to use functions in system instructions
- Validate function arguments before execution

### Safety Settings

Control content filtering for harmful content:

```typescript
const safetySettings = [
  {
    category: 'HARM_CATEGORY_HATE_SPEECH',
    threshold: 'BLOCK_MEDIUM_AND_ABOVE'
  },
  {
    category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    threshold: 'BLOCK_MEDIUM_AND_ABOVE'
  },
  {
    category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
    threshold: 'BLOCK_ONLY_HIGH'
  },
  {
    category: 'HARM_CATEGORY_HARASSMENT',
    threshold: 'BLOCK_MEDIUM_AND_ABOVE'
  },
  {
    category: 'HARM_CATEGORY_CIVIC_INTEGRITY',
    threshold: 'BLOCK_MEDIUM_AND_ABOVE'
  }
];

const response = await model.generateContent({
  contents: [...],
  safetySettings: safetySettings
});
```

**Safety Thresholds:**
- `BLOCK_NONE`: No blocking
- `BLOCK_ONLY_HIGH`: Block only high probability
- `BLOCK_MEDIUM_AND_ABOVE`: Block medium and high (default)
- `BLOCK_LOW_AND_ABOVE`: Block low, medium, and high

### Generation Configuration

Fine-tune response generation:

```typescript
const generationConfig = {
  temperature: 0.7,        // Creativity (0.0 - 2.0)
  topK: 40,                // Top K tokens to consider
  topP: 0.95,              // Nucleus sampling threshold
  maxOutputTokens: 8192,   // Max response length
  stopSequences: ['END'],  // Stop generation at these strings
  candidateCount: 1,       // Number of responses
  responseMimeType: 'application/json', // Response format
  responseSchema: {        // JSON schema for structured output
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'number' }
    }
  }
};
```

**Parameter Guidelines:**
- **Temperature**: 0 for deterministic, 1+ for creative
- **TopK/TopP**: Balance diversity vs coherence
- **MaxOutputTokens**: Account for input + output in context window
- **ResponseSchema**: Use for structured outputs (JSON mode)

## Rate Limits & Quotas

### Current Limits (2026)

| Tier | RPM | TPM | RPD | Cost |
|------|-----|-----|-----|------|
| Free | 5-15 | 250K | Varies | Free |
| Tier 1 | 150-300 | 2M | Varies | Pay-as-you-go |
| Tier 2 | 1,000+ | 4M+ | Varies | $250+ cumulative |
| Tier 3 | 4,000+ | Custom | Custom | Enterprise |

**Legend:**
- RPM: Requests per minute
- TPM: Tokens per minute
- RPD: Requests per day (resets at midnight PT)
- IPM: Images per minute (for vision models)

### Rate Limit Dimensions

Rate limits are enforced across four dimensions:
1. **RPM**: Total requests per minute
2. **TPM**: Total tokens (input + output) per minute
3. **RPD**: Total requests per day
4. **IPM**: Images processed per minute (vision models)

### Important Notes

- Rate limits are per **project**, not per API key
- RPD resets at midnight Pacific time
- Limits vary by model (check documentation for specific model limits)
- Recent changes (Dec 2025) reduced free tier limits significantly
- Upgrade tier automatically as usage increases

### Handling Rate Limits

```typescript
async function generateWithRetry(request, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await model.generateContent(request);
    } catch (error) {
      if (error.status === 429) { // Rate limit exceeded
        const waitTime = Math.pow(2, i) * 1000; // Exponential backoff
        console.log(`Rate limited. Retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        throw error;
      }
    }
  }
  throw new Error('Max retries exceeded');
}
```

## Best Practices

### Performance Optimization

1. **Choose the Right Model:**
   - `gemini-2.5-flash`: Fast, cost-effective, general purpose
   - `gemini-2.5-pro`: Complex reasoning, longer context
   - `gemini-3-pro-preview`: Latest features, state-of-the-art

2. **Optimize Token Usage:**
   - Use concise prompts
   - Set appropriate `maxOutputTokens`
   - Consider context window limits
   - Monitor `usageMetadata` in responses

3. **Use Streaming for UX:**
   - Display results progressively
   - Reduce perceived latency
   - Better user experience for long responses

4. **Cache System Instructions:**
   - Reuse model instances with system instructions
   - Reduces redundant token usage
   - Improves consistency

### Error Handling

```typescript
try {
  const response = await model.generateContent(request);

  // Check for safety blocks
  if (response.candidates[0].finishReason === 'SAFETY') {
    const safetyRatings = response.candidates[0].safetyRatings;
    console.error('Content blocked due to safety:', safetyRatings);
  }

  // Check for other finish reasons
  if (response.candidates[0].finishReason !== 'STOP') {
    console.warn('Unexpected finish reason:',
                 response.candidates[0].finishReason);
  }

} catch (error) {
  if (error.status === 429) {
    // Rate limit - implement backoff
  } else if (error.status === 400) {
    // Invalid request - check parameters
  } else if (error.status === 401) {
    // Authentication error - check API key
  } else if (error.status === 500) {
    // Server error - retry with backoff
  }
  console.error('Generation failed:', error.message);
}
```

### Common Finish Reasons

- `STOP`: Natural completion (normal)
- `MAX_TOKENS`: Hit token limit
- `SAFETY`: Blocked by safety filters
- `RECITATION`: Blocked due to potential copyright
- `OTHER`: Unknown reason

### Content Safety

1. **Configure Appropriate Thresholds:**
   - Start with default (BLOCK_MEDIUM_AND_ABOVE)
   - Adjust based on use case
   - Monitor blocked content

2. **Handle Safety Blocks Gracefully:**
   - Show user-friendly messages
   - Don't expose raw safety ratings
   - Offer alternative phrasing suggestions

3. **Review Safety Ratings:**
   - Check `safetyRatings` in responses
   - Log blocked content for analysis
   - Adjust thresholds if needed

### Prompt Engineering

1. **Be Specific and Clear:**
   - Define expected output format
   - Provide examples when possible
   - Set clear constraints

2. **Use System Instructions:**
   - Define consistent behavior
   - Set tone and style
   - Specify format requirements

3. **Multi-turn Context:**
   - Include relevant history
   - Summarize when context grows large
   - Use condensed representations

4. **Structured Outputs:**
   - Use `responseSchema` for JSON
   - Validate outputs programmatically
   - Handle parsing errors

## Error Handling

### Common Errors

| Error Code | Meaning | Solution |
|------------|---------|----------|
| 400 | Bad Request | Validate request parameters |
| 401 | Unauthorized | Check API key |
| 403 | Forbidden | Verify project permissions |
| 404 | Not Found | Check model name |
| 429 | Rate Limit | Implement exponential backoff |
| 500 | Server Error | Retry with backoff |
| 503 | Service Unavailable | Retry later |

### Retry Strategy

```typescript
const retryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 32000,
  retryableStatuses: [429, 500, 503]
};

async function retryWithBackoff(fn, config = retryConfig) {
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!config.retryableStatuses.includes(error.status) ||
          attempt === config.maxRetries) {
        throw error;
      }

      const delay = Math.min(
        config.baseDelay * Math.pow(2, attempt),
        config.maxDelay
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

## Model Selection Guide

| Model | Use Case | Speed | Cost | Context |
|-------|----------|-------|------|---------|
| gemini-2.5-flash | General purpose, chatbots | Fast | Low | 1M tokens |
| gemini-2.5-pro | Complex reasoning, analysis | Medium | Medium | 2M tokens |
| gemini-3-pro-preview | Latest features, best quality | Slower | High | 2M tokens |
| gemini-1.5-flash | Legacy, basic tasks | Fast | Low | 1M tokens |

**Note:** Context windows may vary. Check current documentation for exact limits.

## References

### Official Documentation
- [Gemini API Documentation](https://ai.google.dev/gemini-api/docs)
- [Content Generation Guide](https://ai.google.dev/api/generate-content)
- [Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Function Calling](https://ai.google.dev/gemini-api/docs/function-calling)
- [Safety Settings](https://ai.google.dev/gemini-api/docs/safety-settings)

### File APIs
- [Files API](https://ai.google.dev/gemini-api/docs/files)
- [File Input Methods](https://ai.google.dev/gemini-api/docs/file-input-methods)
- [Audio Understanding](https://ai.google.dev/gemini-api/docs/audio)
- [Video Understanding](https://ai.google.dev/gemini-api/docs/video-understanding)

### Advanced Features
- [Live API Overview](https://ai.google.dev/gemini-api/docs/live)
- [System Instructions](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/prompts/system-instructions)
- [Streaming Guide](https://github.com/google-gemini/cookbook/blob/main/quickstarts/rest/Streaming_REST.ipynb)

### Community Resources
- [Rate Limits Complete Guide](https://www.aifreeapi.com/en/posts/gemini-api-rate-limit-explained)
- [Multimodal Capabilities](https://patloeber.com/gemini-multimodal/)
- [Google Gen AI SDK](https://googleapis.github.io/python-genai/)

---

**Last Updated**: 2026-02-06
