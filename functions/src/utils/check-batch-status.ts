#!/usr/bin/env node
/**
 * Utility script to check the status of a Gemini batch job
 * Usage: tsx check-batch-status.ts <batchJobName>
 * Example: tsx check-batch-status.ts batches/wgbfhapzfm6mbcel50u2ac2592r3ypv2jlna
 */

import {GoogleGenAI} from '@google/genai';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;

if (!GOOGLE_AI_API_KEY) {
  console.error('Error: GOOGLE_AI_API_KEY environment variable not set');
  console.error('Please set it in your .env file or environment');
  process.exit(1);
}

const batchJobName = process.argv[2];

if (!batchJobName) {
  console.error('Error: Please provide a batch job name as argument');
  console.error(
    'Usage: tsx check-batch-status.ts batches/wgbfhapzfm6mbcel50u2ac2592r3ypv2jlna'
  );
  process.exit(1);
}

async function checkBatchStatus(jobName: string): Promise<void> {
  const ai = new GoogleGenAI({apiKey: GOOGLE_AI_API_KEY});

  try {
    console.log(`\nFetching status for batch job: ${jobName}\n`);

    const batchJob = await ai.batches.get({name: jobName});

    console.log('=== Batch Job Status ===\n');
    console.log(JSON.stringify(batchJob, null, 2));

    // Extract state if available
    if (typeof batchJob === 'object' && batchJob !== null) {
      const state = (batchJob as {state?: unknown}).state;
      console.log(`\n=== Summary ===`);
      console.log(`State: ${state}`);

      // Check for response data
      const job = batchJob as {
        dest?: {inlinedResponses?: unknown[]};
        response?: {inlinedResponses?: unknown[]};
      };

      if (job.dest?.inlinedResponses || job.response?.inlinedResponses) {
        console.log('Response data: Available ✓');
      } else {
        console.log('Response data: Not yet available');
      }
    }
  } catch (error) {
    console.error('Error fetching batch job status:', error);
    if (error instanceof Error) {
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

checkBatchStatus(batchJobName);
