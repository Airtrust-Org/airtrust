import { describe, expect, it } from 'vitest';
import {
  createEdbSignatureCeremony,
  finalizeEdbSignatureCeremony,
  isEdbSignatureCeremonyFresh,
} from '../../services/edb/signature-ceremony';

const signer = {
  employeeId: 10,
  fullName: 'Piloto em Comando',
  anacCode: '123456',
};

function ceremony() {
  return createEdbSignatureCeremony({
    ceremonyId: 'ceremony-1',
    targetType: 'FINAL_RECORD_REVISION',
    targetId: 'edb-1-r1',
    signatureType: 'PIC_FLIGHT_RECORD',
    signer,
    payloadHashSha256: 'a'.repeat(64),
    intentStatement: 'Declaro que revisei e assino este registro de voo.',
    contentReviewedAt: '2026-08-28T12:00:00.000Z',
    authentication: {
      subjectId: 'user-10',
      method: 'UNIQUE_CREDENTIALS_PLUS_MFA',
      authenticatedAt: '2026-08-28T12:00:30.000Z',
      evidenceReference: 'auth-event-123',
    },
    createdAt: '2026-08-28T12:01:00.000Z',
    expiresAt: '2026-08-28T12:06:00.000Z',
  });
}

const duringCeremony = new Date('2026-08-28T12:03:00.000Z');

describe('eDB signature ceremony', () => {
  it('records review, authentication and explicit signing intent before external signing', () => {
    const value = ceremony();
    expect(value.targetType).toBe('FINAL_RECORD_REVISION');
    expect(value.intentStatement).toContain('assino');
    expect(value.authentication.method).toBe('UNIQUE_CREDENTIALS_PLUS_MFA');
    expect(isEdbSignatureCeremonyFresh(value, duringCeremony)).toBe(true);
  });

  it('supports a preflight technical-situation target without inventing a final record id', () => {
    const value = createEdbSignatureCeremony({
      ceremonyId: 'ceremony-tech-1',
      targetType: 'TECHNICAL_SITUATION',
      targetId: 'tech-snapshot-1',
      signatureType: 'PIC_TECHNICAL_ACK',
      signer,
      payloadHashSha256: 'b'.repeat(64),
      intentStatement: 'Declaro ciencia da situacao tecnica apresentada antes do voo.',
      contentReviewedAt: '2026-08-28T09:00:00.000Z',
      authentication: {
        subjectId: 'user-10',
        method: 'UNIQUE_CREDENTIALS_PLUS_MFA',
        authenticatedAt: '2026-08-28T09:00:30.000Z',
        evidenceReference: 'auth-event-tech-1',
      },
      createdAt: '2026-08-28T09:01:00.000Z',
      expiresAt: '2026-08-28T09:06:00.000Z',
    });

    expect(value.targetId).toBe('tech-snapshot-1');
    expect(value.signatureType).toBe('PIC_TECHNICAL_ACK');
  });

  it('rejects a signature intent bound to the wrong kind of target', () => {
    expect(() =>
      createEdbSignatureCeremony({
        ceremonyId: 'bad-target',
        targetType: 'FINAL_RECORD_REVISION',
        targetId: 'edb-not-yet-created',
        signatureType: 'PIC_TECHNICAL_ACK',
        signer,
        payloadHashSha256: 'c'.repeat(64),
        intentStatement: 'Ciencia tecnica.',
        contentReviewedAt: '2026-08-28T09:00:00.000Z',
        authentication: {
          subjectId: 'user-10',
          method: 'UNIQUE_CREDENTIALS_PLUS_MFA',
          authenticatedAt: '2026-08-28T09:00:30.000Z',
          evidenceReference: 'auth-event-bad',
        },
        createdAt: '2026-08-28T09:01:00.000Z',
        expiresAt: '2026-08-28T09:06:00.000Z',
      }),
    ).toThrow('must target a technical situation');
  });

  it('accepts an external signature result only when bound to the same signer, payload and immutable target', () => {
    const value = ceremony();
    const proof = finalizeEdbSignatureCeremony(
      value,
      {
        ceremonyId: 'ceremony-1',
        signerSubjectId: 'user-10',
        payloadHashSha256: 'a'.repeat(64),
        signedAt: '2026-08-28T12:02:00.000Z',
        method: 'ASYMMETRIC_DIGITAL_SIGNATURE',
        proofReference: 'signature-provider/proof/123',
      },
      new Date('2026-08-28T12:02:01.000Z'),
    );

    expect(proof.type).toBe('PIC_FLIGHT_RECORD');
    expect(proof.targetType).toBe('FINAL_RECORD_REVISION');
    expect(proof.targetId).toBe('edb-1-r1');
    expect(proof.signer.fullName).toBe('Piloto em Comando');
    expect(proof.canonicalPayloadHashSha256).toBe('a'.repeat(64));
    expect(proof.proofReference).toBe('signature-provider/proof/123');
  });

  it('rejects signer substitution and payload substitution', () => {
    const value = ceremony();
    expect(() =>
      finalizeEdbSignatureCeremony(
        value,
        {
          ceremonyId: 'ceremony-1',
          signerSubjectId: 'another-user',
          payloadHashSha256: 'a'.repeat(64),
          signedAt: '2026-08-28T12:02:00.000Z',
          method: 'ASYMMETRIC_DIGITAL_SIGNATURE',
          proofReference: 'proof-1',
        },
        duringCeremony,
      ),
    ).toThrow('signer mismatch');

    expect(() =>
      finalizeEdbSignatureCeremony(
        value,
        {
          ceremonyId: 'ceremony-1',
          signerSubjectId: 'user-10',
          payloadHashSha256: 'b'.repeat(64),
          signedAt: '2026-08-28T12:02:00.000Z',
          method: 'ASYMMETRIC_DIGITAL_SIGNATURE',
          proofReference: 'proof-2',
        },
        duringCeremony,
      ),
    ).toThrow('payload hash mismatch');
  });

  it('rejects completion after the ceremony expiration', () => {
    const value = ceremony();
    expect(() =>
      finalizeEdbSignatureCeremony(
        value,
        {
          ceremonyId: 'ceremony-1',
          signerSubjectId: 'user-10',
          payloadHashSha256: 'a'.repeat(64),
          signedAt: '2026-08-28T12:07:00.000Z',
          method: 'ASYMMETRIC_DIGITAL_SIGNATURE',
          proofReference: 'proof-expired',
        },
        new Date('2026-08-28T12:07:00.000Z'),
      ),
    ).toThrow('expired');
  });
});
