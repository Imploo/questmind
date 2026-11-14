const HEIGHT_PROPERTY = '--vv-height';
const TOP_PROPERTY = '--vv-top';

/**
 * Keeps two CSS properties on the document in step with the part of the page that is
 * really visible: `--vv-height`, its height, and `--vv-top`, how far it has moved down.
 * An on-screen keyboard shrinks and shifts that part without resizing the page, so a
 * layout that must stay above the keyboard sizes itself with these instead of `100dvh`.
 *
 * Returns a function that stops tracking and removes the properties again.
 */
export function trackVisualViewport(): () => void {
  const viewport = typeof window === 'undefined' ? null : window.visualViewport;
  if (!viewport) {
    return () => undefined;
  }
  const style = document.documentElement.style;
  const clear = () => {
    style.removeProperty(HEIGHT_PROPERTY);
    style.removeProperty(TOP_PROPERTY);
  };
  const update = () => {
    // Pinch-zoomed, the visible part says nothing about the keyboard: fall back to the page.
    if (Math.abs(viewport.scale - 1) > 0.01) {
      clear();
      return;
    }
    style.setProperty(HEIGHT_PROPERTY, `${viewport.height}px`);
    style.setProperty(TOP_PROPERTY, `${viewport.offsetTop}px`);
  };

  update();
  viewport.addEventListener('resize', update);
  viewport.addEventListener('scroll', update);
  return () => {
    viewport.removeEventListener('resize', update);
    viewport.removeEventListener('scroll', update);
    clear();
  };
}
