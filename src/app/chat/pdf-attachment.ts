import { ChatAttachment } from '../shared/utils/build-character-context';

export const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Read a PDF the user picked as a chat attachment. Rejects with a message for the
 * user when the file is not a PDF, is too large or cannot be read.
 */
export function readPdfAttachment(file: File): Promise<ChatAttachment> {
  if (file.type !== 'application/pdf') {
    return Promise.reject(new Error('Only PDF files are supported.'));
  }
  if (file.size > MAX_PDF_SIZE_BYTES) {
    return Promise.reject(new Error('PDF file exceeds 10 MB limit.'));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Strip the data URL prefix to get raw base64
      const base64 = (reader.result as string).split(',')[1];
      resolve({ type: 'pdf', fileName: file.name, mimeType: 'application/pdf', data: base64 });
    };
    reader.onerror = () => reject(new Error('Failed to read PDF file.'));
    reader.readAsDataURL(file);
  });
}
