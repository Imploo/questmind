import { environment } from '../../environments/environment';

const isProduction = environment.production;

export function warn(message: string, context?: any): void {
  if (context !== undefined) {
    console.warn(`[WARN] ${message}`, context);
  } else {
    console.warn(`[WARN] ${message}`);
  }
}

export function info(message: string, context?: any): void {
  if (isProduction) return;

  if (context !== undefined) {
    console.info(`[INFO] ${message}`, context);
  } else {
    console.info(`[INFO] ${message}`);
  }
}

export function debug(message: string, context?: any): void {
  if (isProduction) return;

  if (context !== undefined) {
    console.log(`[DEBUG] ${message}`, context);
  } else {
    console.log(`[DEBUG] ${message}`);
  }
}
