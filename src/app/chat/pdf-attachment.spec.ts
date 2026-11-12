import { describe, expect, it } from 'vitest';
import { MAX_PDF_SIZE_BYTES, readPdfAttachment } from './pdf-attachment';

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
  });

  it('rejects a PDF over the size limit', async () => {
    const file = new File(['x'], 'big.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: MAX_PDF_SIZE_BYTES + 1 });
    await expect(readPdfAttachment(file)).rejects.toThrow('10 MB');
  });
});
