/** Words and short phrases used all over the app. */
export interface CommonTranslations {
  save: string;
  cancel: string;
  confirm: string;
  delete: string;
  remove: string;
  close: string;
  edit: string;
  add: string;
  create: string;
  rename: string;
  back: string;
  retry: string;
  undo: string;
  copy: string;
  share: string;
  download: string;
  upload: string;
  search: string;
  settings: string;
  yes: string;
  no: string;
  loading: string;
  busy: string;
  done: string;
  failed: string;
  unknown: string;
  none: string;
  optional: string;
  notAvailable: string;
  name: string;
  description: string;
  email: string;
  language: string;
  signIn: string;
  version: (version: number | string) => string;
}

export const commonNl: CommonTranslations = {
  save: 'Opslaan',
  cancel: 'Annuleren',
  confirm: 'Bevestigen',
  delete: 'Verwijderen',
  remove: 'Verwijderen',
  close: 'Sluiten',
  edit: 'Bewerken',
  add: 'Toevoegen',
  create: 'Aanmaken',
  rename: 'Hernoemen',
  back: 'Terug',
  retry: 'Opnieuw proberen',
  undo: 'Ongedaan maken',
  copy: 'Kopiëren',
  share: 'Delen',
  download: 'Downloaden',
  upload: 'Uploaden',
  search: 'Zoeken',
  settings: 'Instellingen',
  yes: 'Ja',
  no: 'Nee',
  loading: 'Laden...',
  busy: 'Bezig...',
  done: 'Klaar',
  failed: 'Mislukt',
  unknown: 'Onbekend',
  none: 'Geen',
  optional: 'optioneel',
  notAvailable: 'n.v.t.',
  name: 'Naam',
  description: 'Beschrijving',
  email: 'E-mailadres',
  language: 'Taal',
  signIn: 'Inloggen',
  version: (version) => `Versie ${version}`,
};

export const commonEn: CommonTranslations = {
  save: 'Save',
  cancel: 'Cancel',
  confirm: 'Confirm',
  delete: 'Delete',
  remove: 'Remove',
  close: 'Close',
  edit: 'Edit',
  add: 'Add',
  create: 'Create',
  rename: 'Rename',
  back: 'Back',
  retry: 'Try again',
  undo: 'Undo',
  copy: 'Copy',
  share: 'Share',
  download: 'Download',
  upload: 'Upload',
  search: 'Search',
  settings: 'Settings',
  yes: 'Yes',
  no: 'No',
  loading: 'Loading...',
  busy: 'Working...',
  done: 'Done',
  failed: 'Failed',
  unknown: 'Unknown',
  none: 'None',
  optional: 'optional',
  notAvailable: 'N/A',
  name: 'Name',
  description: 'Description',
  email: 'Email',
  language: 'Language',
  signIn: 'Sign in',
  version: (version) => `Version ${version}`,
};
