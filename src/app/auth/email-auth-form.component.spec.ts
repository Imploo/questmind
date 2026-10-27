import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  EmailAuthFormComponent,
  type EmailAuthCredentials,
  type EmailAuthMode,
} from './email-auth-form.component';

describe('EmailAuthFormComponent', () => {
  let fixture: ComponentFixture<EmailAuthFormComponent>;
  let component: EmailAuthFormComponent;
  let element: HTMLElement;
  let submitted: EmailAuthCredentials[];
  let modeChanges: EmailAuthMode[];

  const setMode = (mode: EmailAuthMode) => {
    fixture.componentRef.setInput('mode', mode);
    fixture.detectChanges();
  };

  const typeInto = (selector: string, value: string) => {
    const input = element.querySelector<HTMLInputElement>(selector);
    if (!input) throw new Error(`Missing input ${selector}`);
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  const submitForm = () => {
    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };

  const clickButton = (label: string) => {
    const button = Array.from(element.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === label,
    );
    if (!button) throw new Error(`Missing button ${label}`);
    button.click();
    fixture.detectChanges();
  };

  beforeEach(() => {
    fixture = TestBed.createComponent(EmailAuthFormComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    submitted = [];
    modeChanges = [];
    component.submitted.subscribe((value) => submitted.push(value));
    component.modeChange.subscribe((value) => modeChanges.push(value));
    fixture.detectChanges();
  });

  describe('validation', () => {
    it('does not submit and shows errors when the form is empty', () => {
      submitForm();

      expect(submitted).toEqual([]);
      expect(element.querySelector('[data-testid="email-error"]')?.textContent).toContain('Email is required');
      expect(element.querySelector('[data-testid="password-error"]')?.textContent).toContain('Password is required');
    });

    it('rejects an invalid email address', () => {
      typeInto('#email', 'not-an-email');
      typeInto('#password', 'secret123');
      submitForm();

      expect(submitted).toEqual([]);
      expect(element.querySelector('[data-testid="email-error"]')?.textContent).toContain('Enter a valid email address');
    });

    it('rejects a password shorter than 6 characters', () => {
      typeInto('#email', 'hero@example.com');
      typeInto('#password', '12345');
      submitForm();

      expect(submitted).toEqual([]);
      expect(element.querySelector('[data-testid="password-error"]')?.textContent).toContain('at least 6 characters');
    });

    it('does not require a password in reset mode', () => {
      setMode('reset');
      expect(element.querySelector('#password')).toBeNull();

      typeInto('#email', 'hero@example.com');
      submitForm();

      expect(submitted).toEqual([{ email: 'hero@example.com', password: '' }]);
    });
  });

  describe('submit', () => {
    it('emits trimmed credentials when valid', () => {
      typeInto('#email', '  hero@example.com ');
      typeInto('#password', 'secret123');
      submitForm();

      expect(submitted).toEqual([{ email: 'hero@example.com', password: 'secret123' }]);
    });

    it('does not emit while loading and disables the inputs', () => {
      typeInto('#email', 'hero@example.com');
      typeInto('#password', 'secret123');
      fixture.componentRef.setInput('loading', true);
      fixture.detectChanges();

      submitForm();

      expect(submitted).toEqual([]);
      expect(element.querySelector<HTMLInputElement>('#email')?.disabled).toBe(true);
      expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
      expect(element.textContent).toContain('Processing...');
    });
  });

  describe('mode switching', () => {
    it('shows the sign in labels by default and switches to sign up', () => {
      expect(element.querySelector('button[type="submit"]')?.textContent).toContain('Sign In');

      clickButton('Sign up');

      expect(modeChanges).toEqual(['signup']);
    });

    it('switches to reset via "Forgot password?"', () => {
      clickButton('Forgot password?');

      expect(modeChanges).toEqual(['reset']);
    });

    it('renders sign up and reset modes with a way back', () => {
      setMode('signup');
      expect(element.querySelector('button[type="submit"]')?.textContent).toContain('Create Account');
      clickButton('Sign in');

      setMode('reset');
      expect(element.querySelector('button[type="submit"]')?.textContent).toContain('Send Reset Link');
      clickButton('Back to sign in');

      expect(modeChanges).toEqual(['signin', 'signin']);
    });
  });

  describe('messages', () => {
    it('shows the error message', () => {
      fixture.componentRef.setInput('error', 'Incorrect password');
      fixture.detectChanges();

      expect(element.querySelector('[role="alert"]')?.textContent).toContain('Incorrect password');
    });

    it('shows the success message', () => {
      fixture.componentRef.setInput('success', 'Password reset email sent! Check your inbox.');
      fixture.detectChanges();

      expect(element.querySelector('[role="status"]')?.textContent).toContain('Password reset email sent!');
    });
  });
});
