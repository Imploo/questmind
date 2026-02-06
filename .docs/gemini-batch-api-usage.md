# Gemini Batch API Usage Guide

## Overview

The Gemini Batch API allows you to process large volumes of requests asynchronously at 50% of the standard interactive API cost. This document outlines the correct usage patterns, best practices, and common issues.

## Creating a Batch Job

### Basic Approach

You can create a batch job by directly embedding `GenerateContentRequest` objects within your `BatchGenerateContentRequest` using the `batches.create` method.

```typescript
const batchJob = await googleAi.batches.create({
  model: 'gemini-2.5-flash',
  src: [inlineRequest],  // Array of GenerateContentRequest objects
  config: {
    displayName: 'transcription-session-123',
  },
});
```

### Request Format

Each request should include:
- `contents`: Array of content parts (text, file data, etc.)
- `generationConfig`: Temperature, topK, topP, maxOutputTokens

## Job States

A batch job progresses through the following states:

| State | Description |
|-------|-------------|
| `JOB_STATE_PENDING` | Job has been created and is waiting to be processed |
| `JOB_STATE_RUNNING` | Job is currently in progress |
| `JOB_STATE_SUCCEEDED` | Job completed successfully |
| `JOB_STATE_FAILED` | Job failed to complete |
| `JOB_STATE_CANCELLED` | Job was cancelled by the user |
| `JOB_STATE_EXPIRED` | Job expired after running or pending for more than 48 hours |

## Polling for Status

### Best Practices

1. **Polling Interval**: Poll conservatively (e.g., **30-60 second intervals**) to avoid rate limits
2. **Expected Timeline**: Target turnaround time is 24 hours, but most jobs complete much faster
3. **Error Handling**: Always check `batch_job.state.name` and `batch_job.error`

### Polling Implementation

```typescript
const batchJob = await ai.batches.get({ name: batchJobName });
const state = batchJob.state; // e.g., 'JOB_STATE_PENDING', 'JOB_STATE_RUNNING', etc.
```

### Recommended Polling Strategy

- **Initial checks**: Every 30 seconds for the first 5 minutes
- **After 5 minutes**: Every 1-2 minutes
- **After 30 minutes**: Every 5 minutes
- **Stop polling**: After 48 hours (job will be expired)

## Known Issues

### Jobs Stuck in PENDING State

**Issue**: Batch jobs can sometimes get stuck in `JOB_STATE_PENDING` for extended periods (>24 hours).

**Reported Cases**:
- [GitHub Issue #1482](https://github.com/googleapis/python-genai/issues/1482): Gemini Batch API stuck all jobs on BATCH_STATE_PENDING for more than 24 hours
- [Gemini Community Thread](https://support.google.com/gemini/thread/378405055/gemini-flash-2-5-latest-stuck-in-batch-state-running-with-batch-requests): Jobs stuck in BATCH_STATE_RUNNING

**Possible Causes**:
1. High system load on Google's infrastructure
2. Invalid request format (especially with video/audio inputs)
3. Model-specific issues (e.g., gemini-3-flash-preview vs gemini-2.5-flash)
4. Large file sizes or complex requests

**Troubleshooting Steps**:
1. Check if the job eventually processes (can take >24 hours during high load)
2. Verify request format is valid JSONL
3. Try with a different model (e.g., switch from preview to stable)
4. Check file accessibility (gs:// URLs must be accessible by Google AI)
5. Monitor for expiration after 48 hours

## Best Practices

### Request Optimization

1. **Batch Size**: Combine smaller jobs into one large job
   - ✅ One batch job with 200,000 requests
   - ❌ 1,000 jobs with 200 requests each
   - Better throughput with larger batches

2. **File Management**:
   - Storage limit: 20GB total
   - File TTL: 48 hours
   - Clean up files after processing

3. **Format Validation**:
   - Validate JSONL format before upload
   - Ensure all required fields are present
   - Test with a small batch first

### Monitoring and Costs

1. **Token Usage**: Monitor via `usageMetadata` to track costs
2. **Pricing**: Batch API is 50% of standard interactive API cost
3. **Rate Limits**: Respect polling intervals to avoid hitting rate limits

## Response Handling

### Inline Responses

When using inline requests (recommended), responses are returned directly in the batch job object:

```typescript
if (state === 'JOB_STATE_SUCCEEDED') {
  const responseText = extractInlineResponseText(batchJob);
  // Process the response
}
```

### File-based Responses

Avoid file-based output when possible due to access issues. If using files:
- Ensure proper permissions for output GCS bucket
- Handle file access errors gracefully
- Clean up files after processing

## Error Handling

### Common Errors

1. **Access Denied**: File URLs not accessible by Google AI
2. **Format Error**: Invalid JSONL or request format
3. **Timeout**: Job expired after 48 hours
4. **Model Error**: Model-specific limitations or bugs

### Retry Strategy

- Don't retry immediately if job is stuck in PENDING
- Wait for state change or expiration
- Consider using a different model if persistent failures

## Implementation Checklist

- [ ] Use inline requests instead of file-based requests
- [ ] Set up conservative polling (30-60 second intervals)
- [ ] Handle all job states (PENDING, RUNNING, SUCCEEDED, FAILED, CANCELLED, EXPIRED)
- [ ] Implement timeout after 48 hours
- [ ] Validate request format before submission
- [ ] Monitor token usage and costs
- [ ] Clean up files after processing
- [ ] Log batch job names for debugging
- [ ] Implement fallback for stuck jobs

## References

- [Batch API Official Documentation](https://ai.google.dev/gemini-api/docs/batch-api)
- [Batch Prediction API Reference](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/batch-prediction-api)
- [Batch Mode Announcement](https://developers.googleblog.com/scale-your-ai-workloads-batch-mode-gemini-api/)
- [Batch Processing Cookbook](https://deepwiki.com/google-gemini/cookbook/2.6-batch-processing)
- [Batch API Tutorial (Colab)](https://colab.research.google.com/github/google-gemini/cookbook/blob/main/quickstarts/Batch_mode.ipynb)

## Related Issues

- [GitHub: Jobs stuck in PENDING](https://github.com/googleapis/python-genai/issues/1482)
- [GitHub: Batch API error with video input](https://github.com/googleapis/python-genai/issues/1890)
- [Community: Jobs stuck in RUNNING](https://support.google.com/gemini/thread/378405055)

---

**Last Updated**: 2026-02-06
