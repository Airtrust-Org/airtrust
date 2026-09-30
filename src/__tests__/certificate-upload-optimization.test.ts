import { describe, expect, it } from 'vitest';
import {
  certificatePdfFileName,
  hasPdfDigitalSignature,
} from '@/react-app/utils/certificateUploadOptimization';

describe('certificate upload optimization', () => {
  it('preserva nome de PDF e troca somente a extensão de JPEG', () => {
    expect(certificatePdfFileName('CRM - João da Silva.pdf')).toBe('CRM - João da Silva.pdf');
    expect(certificatePdfFileName('ANDERSON FRANÇA CRM.jpeg')).toBe('ANDERSON FRANÇA CRM.pdf');
    expect(certificatePdfFileName('foto.JPG')).toBe('foto.pdf');
  });

  it('detecta assinatura digital e evita regravação destrutiva', () => {
    const encoder = new TextEncoder();
    expect(hasPdfDigitalSignature(encoder.encode('%PDF-1.7 /ByteRange [0 1 2 3]'))).toBe(true);
    expect(hasPdfDigitalSignature(encoder.encode('%PDF-1.7 /Type /Sig /Filter /Adobe.PPKLite'))).toBe(true);
    expect(hasPdfDigitalSignature(encoder.encode('%PDF-1.7 /Type /Page'))).toBe(false);
  });
});
