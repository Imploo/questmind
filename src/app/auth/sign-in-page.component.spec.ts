import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { SignInPageComponent } from './sign-in-page.component';
import { AuthService } from './auth.service';
import { EmailAuthFormComponent } from './email-auth-form.component';
import { By } from '@angular/platform-browser';
import { I18nService, LanguagePreferenceService } from '../core/i18n';

describe('SignInPageComponent', () => {
  let fixture: ComponentFixture<SignInPageComponent>;
  let component: SignInPageComponent;
  let element: HTMLElement;

  const isLoading = signal(false);
  const authService = {
    isLoading: isLoading.asReadonly(),
    signInWithGoogle: vi.fn(),
    signInWithEmail: vi.fn(),
    signUpWithEmail: vi.fn(),
    sendPasswordReset: vi.fn(),
  };
  const router = { navigateByUrl: vi.fn() };
  let queryParams: Record<string, string> = {};
  const preference = { choose: vi.fn() };

  const form = () =>
    fixture.debugElement.query(By.directive(EmailAuthFormComponent)).componentInstance as EmailAuthFormComponent;

  const submit = async (email: string, password: string) => {
    form().submitted.emit({ email, password });
    await fixture.whenStable();
    fixture.detectChanges();
  };

  function create(): void {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } } },
        { provide: LanguagePreferenceService, useValue: preference },
      ],
    });
    fixture = TestBed.createComponent(SignInPageComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    queryParams = {};
    isLoading.set(false);
    authService.signInWithGoogle.mockResolvedValue(undefined);
    authService.signInWithEmail.mockResolvedValue({});
    authService.signUpWithEmail.mockResolvedValue({});
    authService.sendPasswordReset.mockResolvedValue(undefined);
    router.navigateByUrl.mockResolvedValue(true);

    create();
  });

  it('shows Google sign in above the email form', () => {
    const text = element.textContent ?? '';
    expect(text).toContain('Sign in with Google');
    expect(text.indexOf('Sign in with Google')).toBeLessThan(text.indexOf('Email'));
    expect(element.querySelector('app-email-auth-form')).not.toBeNull();
  });

  it('signs in with email and navigates home', async () => {
    await submit('hero@example.com', 'secret123');

    expect(authService.signInWithEmail).toHaveBeenCalledWith('hero@example.com', 'secret123');
    expect(authService.signUpWithEmail).not.toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('signs up with email in sign up mode and navigates home', async () => {
    form().modeChange.emit('signup');
    fixture.detectChanges();

    await submit('new@example.com', 'secret123');

    expect(authService.signUpWithEmail).toHaveBeenCalledWith('new@example.com', 'secret123');
    expect(authService.signInWithEmail).not.toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('sends a password reset and shows a success message', async () => {
    form().modeChange.emit('reset');
    fixture.detectChanges();
    expect(element.textContent).not.toContain('Sign in with Google');

    await submit('hero@example.com', '');

    expect(authService.sendPasswordReset).toHaveBeenCalledWith('hero@example.com');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(component.success()).toBe('Password reset email sent! Check your inbox.');
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Password reset email sent!');
  });

  it('shows the error thrown by AuthService', async () => {
    authService.signInWithEmail.mockRejectedValue(new Error('Incorrect password'));

    await submit('hero@example.com', 'wrong-password');

    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Incorrect password');
  });

  it('clears messages when switching mode', async () => {
    authService.signInWithEmail.mockRejectedValue(new Error('Incorrect password'));
    await submit('hero@example.com', 'wrong-password');

    form().modeChange.emit('signup');
    fixture.detectChanges();

    expect(component.error()).toBeNull();
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });

  it('goes back to the page that sent the user to sign in, such as a shared campaign', async () => {
    TestBed.resetTestingModule();
    queryParams = { returnUrl: '/share/campaign/abc/sessions/s1' };
    create();

    await component.signInWithGoogle();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/share/campaign/abc/sessions/s1');

    await submit('a@b.nl', 'secret123');
    expect(router.navigateByUrl).toHaveBeenLastCalledWith('/share/campaign/abc/sessions/s1');
  });

  it('ignores a return address outside the app', async () => {
    TestBed.resetTestingModule();
    queryParams = { returnUrl: 'https://evil.example' };
    create();

    await component.signInWithGoogle();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('signs in with Google and navigates home', async () => {
    await component.signInWithGoogle();

    expect(authService.signInWithGoogle).toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('offers the language choice and passes a pick on', () => {
    const options = Array.from(element.querySelectorAll<HTMLButtonElement>('app-language-switcher button'));
    expect(options.map(option => option.textContent?.trim())).toEqual(['nl', 'en']);
    expect(options[1].getAttribute('aria-pressed')).toBe('true');

    options[0].click();

    expect(preference.choose).toHaveBeenCalledWith('nl');
  });

  it('shows the page in Dutch once the language switches', async () => {
    TestBed.inject(I18nService).use('nl');
    await fixture.whenStable();
    fixture.detectChanges();

    const text = element.textContent ?? '';
    expect(text).toContain('Inloggen met Google');
    expect(text).toContain('Log in om verder te gaan');
    expect(text).not.toContain('Sign in with Google');
  });
});
