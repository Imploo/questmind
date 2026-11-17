import { describe, expect, it } from 'vitest';
import { en } from '../core/i18n/en';
import { nl } from '../core/i18n/nl';
import { MAX_PDF_SIZE_BYTES, PdfAttachmentError, pdfAttachmentErrorText, readPdfAttachment } from './pdf-attachment';

describe('readPdfAttachment', () => {
  it('reads a PDF as a base64 chat attachment', async () => {
    const file = new File(['%PDF-1.7'], 'sheet.pdf', { type: 'application/pdf' });

    expect(await readPdfAttachment(file)).toEqual({
      type: 'pdf',
      fileName: 'sheet.pdf',
      mimeType: 'application/pdf',
      data: btoa('%PDF-1.7'),
    });
  });

  it('rejects a file that is not a PDF', async () => {
    const file = new File(['x'], 'sheet.png', { type: 'image/png' });
    await expect(readPdfAttachment(file)).rejects.toThrow('Only PDF files are supported.');
    await expect(readPdfAttachment(file)).rejects.toMatchObject({ reason: 'not-pdf' });
  });

  it('rejects a PDF over the size limit', async () => {
    const file = new File(['x'], 'big.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: MAX_PDF_SIZE_BYTES + 1 });
    await expect(readPdfAttachment(file)).rejects.toThrow('10 MB');
    await expect(readPdfAttachment(file)).rejects.toMatchObject({ reason: 'too-large' });
  });
});

describe('pdfAttachmentErrorText', () => {
  it('tells in the given language why the file was refused', () => {
    const notPdf = new PdfAttachmentError('not-pdf', 'Only PDF files are supported.');
    const tooLarge = new PdfAttachmentError('too-large', 'PDF file exceeds 10 MB limit.');

    expect(pdfAttachmentErrorText(notPdf, en.chat)).toBe(en.chat.attachment.notPdf);
    expect(pdfAttachmentErrorText(notPdf, nl.chat)).toBe(nl.chat.attachment.notPdf);
    expect(pdfAttachmentErrorText(tooLarge, en.chat)).toBe(en.chat.attachment.tooLarge);
    expect(pdfAttachmentErrorText(tooLarge, nl.chat)).toBe(nl.chat.attachment.tooLarge);
  });

  it('calls a file it could not read, or any other failure, unreadable', () => {
    const unreadable = new PdfAttachmentError('unreadable', 'Failed to read PDF file.');

    expect(pdfAttachmentErrorText(unreadable, en.chat)).toBe(en.chat.attachment.unreadable);
    expect(pdfAttachmentErrorText(new Error('boom'), nl.chat)).toBe(nl.chat.attachment.unreadable);
    expect(pdfAttachmentErrorText(undefined, en.chat)).toBe(en.chat.attachment.unreadable);
  });
});
