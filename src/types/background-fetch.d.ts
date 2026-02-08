/**
 * TypeScript type declarations for the experimental Background Fetch API.
 * https://wicg.github.io/background-fetch/
 */

interface BackgroundFetchManager {
  fetch(
    id: string,
    requests: RequestInfo | RequestInfo[],
    options?: BackgroundFetchOptions
  ): Promise<BackgroundFetchRegistration>;
  get(id: string): Promise<BackgroundFetchRegistration | undefined>;
  getIds(): Promise<string[]>;
}

interface BackgroundFetchOptions {
  title?: string;
  icons?: BackgroundFetchIcon[];
  downloadTotal?: number;
}

interface BackgroundFetchIcon {
  src: string;
  sizes?: string;
  type?: string;
}

interface BackgroundFetchRegistration extends EventTarget {
  readonly id: string;
  readonly uploadTotal: number;
  readonly uploaded: number;
  readonly downloadTotal: number;
  readonly downloaded: number;
  readonly result: '' | 'success' | 'failure';
  readonly failureReason:
    | ''
    | 'aborted'
    | 'bad-status'
    | 'fetch-error'
    | 'quota-exceeded'
    | 'download-total-exceeded';
  readonly recordsAvailable: boolean;
  onprogress: ((this: BackgroundFetchRegistration, ev: Event) => void) | null;
  abort(): Promise<boolean>;
  match(
    request: RequestInfo,
    options?: CacheQueryOptions
  ): Promise<BackgroundFetchRecord | undefined>;
  matchAll(
    request?: RequestInfo,
    options?: CacheQueryOptions
  ): Promise<BackgroundFetchRecord[]>;
}

interface BackgroundFetchRecord {
  readonly request: Request;
  readonly responseReady: Promise<Response>;
}

interface BackgroundFetchEvent extends ExtendableEvent {
  readonly registration: BackgroundFetchRegistration;
}

interface BackgroundFetchUpdateUIEvent extends BackgroundFetchEvent {
  updateUI(options?: { title?: string }): Promise<void>;
}

interface ServiceWorkerRegistration {
  readonly backgroundFetch: BackgroundFetchManager;
}

interface ServiceWorkerGlobalScopeEventMap {
  backgroundfetchsuccess: BackgroundFetchUpdateUIEvent;
  backgroundfetchfail: BackgroundFetchUpdateUIEvent;
  backgroundfetchabort: BackgroundFetchEvent;
  backgroundfetchclick: BackgroundFetchEvent;
}
