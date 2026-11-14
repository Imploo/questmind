import { afterEach, describe, expect, it } from 'vitest';
import { trackVisualViewport } from './visual-viewport';

/** A visual viewport that can be resized and scrolled by hand. */
class FakeViewport extends EventTarget {
  height = 800;
  offsetTop = 0;
  scale = 1;
}

const original = Object.getOwnPropertyDescriptor(window, 'visualViewport');
const property = (name: string) => document.documentElement.style.getPropertyValue(name);

function useViewport(viewport: FakeViewport | null): void {
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
}

describe('trackVisualViewport', () => {
  afterEach(() => {
    if (original) {
      Object.defineProperty(window, 'visualViewport', original);
    } else {
      Reflect.deleteProperty(window, 'visualViewport');
    }
  });

  it('publishes the visible height and offset right away', () => {
    useViewport(new FakeViewport());

    const stop = trackVisualViewport();

    expect(property('--vv-height')).toBe('800px');
    expect(property('--vv-top')).toBe('0px');
    stop();
  });

  it('follows a keyboard that shrinks and shifts the visible part', () => {
    const viewport = new FakeViewport();
    useViewport(viewport);
    const stop = trackVisualViewport();

    viewport.height = 460;
    viewport.dispatchEvent(new Event('resize'));
    expect(property('--vv-height')).toBe('460px');

    viewport.offsetTop = 120;
    viewport.dispatchEvent(new Event('scroll'));
    expect(property('--vv-top')).toBe('120px');
    stop();
  });

  it('falls back to the page while pinch-zoomed', () => {
    const viewport = new FakeViewport();
    useViewport(viewport);
    const stop = trackVisualViewport();

    viewport.scale = 2;
    viewport.height = 400;
    viewport.dispatchEvent(new Event('resize'));

    expect(property('--vv-height')).toBe('');
    expect(property('--vv-top')).toBe('');
    stop();
  });

  it('removes the properties and stops listening when stopped', () => {
    const viewport = new FakeViewport();
    useViewport(viewport);
    const stop = trackVisualViewport();

    stop();
    viewport.height = 300;
    viewport.dispatchEvent(new Event('resize'));

    expect(property('--vv-height')).toBe('');
    expect(property('--vv-top')).toBe('');
  });

  it('does nothing in a browser without a visual viewport', () => {
    useViewport(null);

    const stop = trackVisualViewport();

    expect(property('--vv-height')).toBe('');
    stop();
  });
});
