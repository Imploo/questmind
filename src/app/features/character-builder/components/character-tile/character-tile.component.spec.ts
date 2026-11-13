import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { CharacterTileComponent } from './character-tile.component';

describe('CharacterTileComponent', () => {
  let fixture: ComponentFixture<CharacterTileComponent>;
  const opened = vi.fn();
  const restored = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    fixture = TestBed.createComponent(CharacterTileComponent);
    fixture.componentRef.setInput('name', 'Old Bram');
    fixture.componentRef.setInput('subtitle', 'Human Wizard');
    fixture.componentInstance.opened.subscribe(opened);
    fixture.componentInstance.restored.subscribe(restored);
    fixture.detectChanges();
  });

  function tile(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the character and opens it on a click', () => {
    expect(tile().textContent).toContain('Old Bram');
    expect(tile().textContent).toContain('Human Wizard');
    expect(tile().querySelector('button')).toBeNull();

    tile().click();

    expect(opened).toHaveBeenCalledTimes(1);
  });

  it('offers to bring an archived character back, without opening it', () => {
    fixture.componentRef.setInput('archived', true);
    fixture.detectChanges();
    const unarchive = tile().querySelector('button')!;

    expect(unarchive.textContent).toContain('Unarchive');
    expect(unarchive.getAttribute('aria-label')).toBe('Unarchive Old Bram');

    unarchive.click();

    expect(restored).toHaveBeenCalledTimes(1);
    expect(opened).not.toHaveBeenCalled();
  });
});
