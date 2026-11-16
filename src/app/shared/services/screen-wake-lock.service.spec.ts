import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScreenWakeLockService } from './screen-wake-lock.service';

/** A wake lock the browser, or the service, can take back. */
class FakeSentinel extends EventTarget {
  released = false;

  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    this.dispatchEvent(new Event('release'));
  }
}

const originalWakeLock = Object.getOwnPropertyDescriptor(navigator, 'wakeLock');
const originalVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');

/** Lets the promises of a request or a release run to their end. */
const settle = () => new Promise(resolve => setTimeout(resolve));

describe('ScreenWakeLockService', () => {
  let sentinels: FakeSentinel[];
  let request: ReturnType<typeof vi.fn>;

  const active = () => sentinels.filter(sentinel => !sentinel.released).length;

  function setVisibility(state: 'visible' | 'hidden'): void {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
    if (state === 'hidden') {
      // The browser takes every lock back as soon as the page is out of sight.
      sentinels.forEach(sentinel => void sentinel.release());
    }
    document.dispatchEvent(new Event('visibilitychange'));
  }

  beforeEach(() => {
    sentinels = [];
    request = vi.fn(async () => {
      const sentinel = new FakeSentinel();
      sentinels.push(sentinel);
      return sentinel;
    });
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  afterEach(() => {
    if (originalWakeLock) {
      Object.defineProperty(navigator, 'wakeLock', originalWakeLock);
    } else {
      Reflect.deleteProperty(navigator, 'wakeLock');
    }
    if (originalVisibility) {
      Object.defineProperty(document, 'visibilityState', originalVisibility);
    } else {
      Reflect.deleteProperty(document, 'visibilityState');
    }
  });

  it('keeps the screen awake while held and lets it go afterwards', async () => {
    const service = new ScreenWakeLockService();

    const release = service.hold();
    await settle();
    expect(request).toHaveBeenCalledWith('screen');
    expect(active()).toBe(1);

    release();
    await settle();
    expect(active()).toBe(0);
  });

  it('shares one lock between holders and keeps it until the last one lets go', async () => {
    const service = new ScreenWakeLockService();

    const releaseFirst = service.hold();
    const releaseSecond = service.hold();
    await settle();
    expect(request).toHaveBeenCalledTimes(1);

    releaseFirst();
    releaseFirst();
    await settle();
    expect(active()).toBe(1);

    releaseSecond();
    await settle();
    expect(active()).toBe(0);
  });

  it('asks again when the page comes back into view', async () => {
    const service = new ScreenWakeLockService();
    const release = service.hold();
    await settle();

    setVisibility('hidden');
    await settle();
    expect(active()).toBe(0);

    setVisibility('visible');
    await settle();
    expect(request).toHaveBeenCalledTimes(2);
    expect(active()).toBe(1);
    release();
  });

  it('does not ask again once nobody holds it', async () => {
    const service = new ScreenWakeLockService();
    service.hold()();
    await settle();

    setVisibility('hidden');
    setVisibility('visible');
    await settle();

    expect(active()).toBe(0);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('lets go of a lock that arrives after the hold was given back', async () => {
    const service = new ScreenWakeLockService();

    service.hold()();
    await settle();

    expect(active()).toBe(0);
  });

  it('survives a refusal and tries again on the next return to the page', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    request.mockRejectedValueOnce(new Error('battery saver'));
    const service = new ScreenWakeLockService();

    const release = service.hold();
    await settle();
    expect(active()).toBe(0);

    setVisibility('visible');
    await settle();
    expect(active()).toBe(1);
    release();
  });

  it('does nothing on a browser without wake locks', () => {
    Reflect.deleteProperty(navigator, 'wakeLock');
    const service = new ScreenWakeLockService();

    expect(service.supported).toBe(false);
    expect(() => service.hold()()).not.toThrow();
  });
});
