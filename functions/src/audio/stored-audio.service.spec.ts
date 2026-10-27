import { describe, it, expect } from 'vitest';
import { computeSegmentRanges, sessionAudioPrefix } from './stored-audio.service';

const cfg = { enabled: true, segmentMinutes: 30, overlapSeconds: 15, minSplitMinutes: 35 };

describe('computeSegmentRanges', () => {
  it('keeps recordings at or below the split threshold as one segment', () => {
    expect(computeSegmentRanges(35 * 60, cfg)).toEqual([{ startSec: 0, endSec: 2100 }]);
  });

  it('splits long recordings into overlapping segments', () => {
    expect(computeSegmentRanges(70 * 60, cfg)).toEqual([
      { startSec: 0, endSec: 1800 },
      { startSec: 1785, endSec: 3600 },
      { startSec: 3585, endSec: 4200 },
    ]);
  });

  it('never splits when segmentation is disabled', () => {
    expect(computeSegmentRanges(3 * 3600, { ...cfg, enabled: false })).toEqual([
      { startSec: 0, endSec: 10800 },
    ]);
  });
});

describe('sessionAudioPrefix', () => {
  it('scopes the path to one campaign session', () => {
    expect(sessionAudioPrefix('c1', 's1')).toBe('campaigns/c1/audio/s1/');
  });
});
