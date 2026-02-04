import { Injectable, signal, computed, effect } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SidebarService {
  private readonly STORAGE_KEY = 'questmind_sidebar_collapsed';

  private readonly _isCollapsed = signal<boolean>(this.loadFromStorage());

  readonly isCollapsed = this._isCollapsed.asReadonly();

  readonly width = computed(() => this._isCollapsed() ? 'w-20' : 'w-64');

  constructor() {
    effect(() => {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this._isCollapsed()));
    });
  }

  toggle(): void {
    this._isCollapsed.update(collapsed => !collapsed);
  }

  expand(): void {
    this._isCollapsed.set(false);
  }

  collapse(): void {
    this._isCollapsed.set(true);
  }

  isExpanded(): boolean {
    return !this._isCollapsed();
  }

  private loadFromStorage(): boolean {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    return stored ? JSON.parse(stored) : false;
  }
}
