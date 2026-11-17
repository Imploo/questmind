import type { Translations } from '../core/i18n/translations';
import { ChatAttachment } from '../shared/utils/build-character-context';

export const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export type PdfAttachmentErrorReason = 'not-pdf' | 'too-large' | 'unreadable';

/**
 * Why a picked file cannot be a chat attachment. The `reason` is what the user gets
 * to see, translated by `pdfAttachmentErrorText`; the message is English, for the logs.
 */
export class PdfAttachmentError extends Error {
  constructor(readonly reason: PdfAttachmentErrorReason, message: string) {
    super(message);
    this.name = 'PdfAttachmentError';
  }
}

/**
 * Read a PDF the user picked as a chat attachment. Rejects with a `PdfAttachmentError`
 * when the file is not a PDF, is too large or cannot be read.
 */
export function readPdfAttachment(file: File): Promise<ChatAttachment> {
  if (file.type !== 'application/pdf') {
    return Promise.reject(new PdfAttachmentError('not-pdf', 'Only PDF files are supported.'));
  }
  if (file.size > MAX_PDF_SIZE_BYTES) {
    return Promise.reject(new PdfAttachmentError('too-large', 'PDF file exceeds 10 MB limit.'));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Strip the data URL prefix to get raw base64
      const base64 = (reader.result as string).split(',')[1];
      resolve({ type: 'pdf', fileName: file.name, mimeType: 'application/pdf', data: base64 });
    };
    reader.onerror = () => reject(new PdfAttachmentError('unreadable', 'Failed to read PDF file.'));
    reader.readAsDataURL(file);
  });
}

/** What to tell the user when `readPdfAttachment` rejected; anything unexpected counts as unreadable. */
export function pdfAttachmentErrorText(error: unknown, t: Translations['chat']): string {
  const reason = error instanceof PdfAttachmentError ? error.reason : 'unreadable';
  switch (reason) {
    case 'not-pdf':
      return t.attachment.notPdf;
    case 'too-large':
      return t.attachment.tooLarge;
    case 'unreadable':
      return t.attachment.unreadable;
  }
}
