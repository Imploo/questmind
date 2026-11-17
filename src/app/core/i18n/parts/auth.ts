/** Signing in, signing up and resetting a password. */
export interface AuthTranslations {
  subtitleSignIn: string;
  subtitleSignUp: string;
  subtitleReset: string;
  signingIn: string;
  signInWithGoogle: string;
  or: string;
  terms: string;
  resetSent: string;
  signInFailed: string;
  passwordLabel: string;
  emailPlaceholder: string;
  emailRequired: string;
  emailInvalid: string;
  passwordRequired: string;
  passwordTooShort: (minLength: number) => string;
  passwordHint: (minLength: number) => string;
  sending: string;
  processing: string;
  createAccount: string;
  sendResetLink: string;
  signIn: string;
  haveAccount: string;
  signInLink: string;
  backToSignIn: string;
  forgotPassword: string;
  noAccount: string;
  signUpLink: string;
  errors: {
    generic: string;
    failed: string;
    invalidEmail: string;
    userDisabled: string;
    userNotFound: string;
    wrongPassword: string;
    emailInUse: string;
    weakPassword: string;
    notAllowed: string;
    popupBlocked: string;
    cancelled: string;
    network: string;
    tooManyRequests: string;
    invalidCredential: string;
  };
}

export const authNl: AuthTranslations = {
  subtitleSignIn: 'Log in om verder te gaan',
  subtitleSignUp: 'Maak je account aan',
  subtitleReset: 'Stel je wachtwoord opnieuw in',
  signingIn: 'Bezig met inloggen...',
  signInWithGoogle: 'Inloggen met Google',
  or: 'of',
  terms: 'Door in te loggen ga je akkoord met onze gebruiksvoorwaarden en ons privacybeleid',
  resetSent: 'De e-mail om je wachtwoord opnieuw in te stellen is verstuurd. Kijk in je inbox.',
  signInFailed: 'Inloggen is niet gelukt. Probeer het opnieuw.',
  passwordLabel: 'Wachtwoord',
  emailPlaceholder: 'jij@voorbeeld.nl',
  emailRequired: 'Vul je e-mailadres in',
  emailInvalid: 'Vul een geldig e-mailadres in',
  passwordRequired: 'Vul je wachtwoord in',
  passwordTooShort: (minLength) => `Het wachtwoord moet minstens ${minLength} tekens hebben`,
  passwordHint: (minLength) => `Minstens ${minLength} tekens`,
  sending: 'Versturen...',
  processing: 'Bezig...',
  createAccount: 'Account aanmaken',
  sendResetLink: 'Stuur de link',
  signIn: 'Inloggen',
  haveAccount: 'Heb je al een account?',
  signInLink: 'Inloggen',
  backToSignIn: 'Terug naar inloggen',
  forgotPassword: 'Wachtwoord vergeten?',
  noAccount: 'Nog geen account?',
  signUpLink: 'Registreren',
  errors: {
    generic: 'Er ging iets mis',
    failed: 'Inloggen is mislukt',
    invalidEmail: 'Ongeldig e-mailadres',
    userDisabled: 'Dit account is uitgeschakeld',
    userNotFound: 'Er is geen account met dit e-mailadres',
    wrongPassword: 'Onjuist wachtwoord',
    emailInUse: 'Er bestaat al een account met dit e-mailadres',
    weakPassword: 'Het wachtwoord moet minstens 6 tekens hebben',
    notAllowed: 'Deze manier van inloggen staat niet aan',
    popupBlocked: 'Het inlogvenster is geblokkeerd. Sta pop-ups toe voor deze site.',
    cancelled: 'Het inloggen is afgebroken',
    network: 'Netwerkfout. Controleer je verbinding.',
    tooManyRequests: 'Te veel pogingen. Probeer het later opnieuw.',
    invalidCredential: 'De inloggegevens kloppen niet',
  },
};

export const authEn: AuthTranslations = {
  subtitleSignIn: 'Sign in to continue',
  subtitleSignUp: 'Create your account',
  subtitleReset: 'Reset your password',
  signingIn: 'Signing in...',
  signInWithGoogle: 'Sign in with Google',
  or: 'or',
  terms: 'By signing in, you agree to our Terms of Service and Privacy Policy',
  resetSent: 'Password reset email sent! Check your inbox.',
  signInFailed: 'Failed to sign in. Please try again.',
  passwordLabel: 'Password',
  emailPlaceholder: 'you@example.com',
  emailRequired: 'Email is required',
  emailInvalid: 'Enter a valid email address',
  passwordRequired: 'Password is required',
  passwordTooShort: (minLength) => `Password must be at least ${minLength} characters`,
  passwordHint: (minLength) => `Must be at least ${minLength} characters`,
  sending: 'Sending...',
  processing: 'Processing...',
  createAccount: 'Create Account',
  sendResetLink: 'Send Reset Link',
  signIn: 'Sign In',
  haveAccount: 'Already have an account?',
  signInLink: 'Sign in',
  backToSignIn: 'Back to sign in',
  forgotPassword: 'Forgot password?',
  noAccount: "Don't have an account?",
  signUpLink: 'Sign up',
  errors: {
    generic: 'An error occurred',
    failed: 'Authentication failed',
    invalidEmail: 'Invalid email address',
    userDisabled: 'This account has been disabled',
    userNotFound: 'No account found with this email',
    wrongPassword: 'Incorrect password',
    emailInUse: 'An account with this email already exists',
    weakPassword: 'Password should be at least 6 characters',
    notAllowed: 'This sign-in method is not enabled',
    popupBlocked: 'Sign-in popup was blocked. Please allow popups for this site.',
    cancelled: 'Sign-in was cancelled',
    network: 'Network error. Please check your connection.',
    tooManyRequests: 'Too many attempts. Please try again later.',
    invalidCredential: 'Invalid credentials provided',
  },
};
