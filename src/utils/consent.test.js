import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./api.js', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from './api.js';
import { CONSENT_DOCS, isConsentComplete, recordConsents, resetConsentCache } from './consent.js';

const response = (body, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  json: async () => body,
});

beforeEach(() => {
  apiFetch.mockReset();
  resetConsentCache();
});

describe('isConsentComplete', () => {
  it('fails closed: rejects when the status endpoint is not ok', async () => {
    apiFetch.mockResolvedValue(response({}, { ok: false, status: 503 }));
    await expect(isConsentComplete()).rejects.toThrow(/503/);
  });

  it('fails closed: rejects when the request itself throws', async () => {
    apiFetch.mockRejectedValue(new Error('Not authenticated.'));
    await expect(isConsentComplete()).rejects.toThrow('Not authenticated.');
  });

  it('does not cache a failure, so a retry hits the server again', async () => {
    apiFetch.mockRejectedValueOnce(new Error('offline'));
    await expect(isConsentComplete()).rejects.toThrow('offline');
    apiFetch.mockResolvedValue(response({ complete: true }));
    await expect(isConsentComplete()).resolves.toBe(true);
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it('returns true when the server reports complete, and caches it', async () => {
    apiFetch.mockResolvedValue(response({ complete: true }));
    await expect(isConsentComplete()).resolves.toBe(true);
    await expect(isConsentComplete()).resolves.toBe(true);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith('/api/consents/status');
  });

  it('does not cache an incomplete result', async () => {
    apiFetch.mockResolvedValue(response({ complete: false }));
    await expect(isConsentComplete()).resolves.toBe(false);
    await expect(isConsentComplete()).resolves.toBe(false);
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it('resetConsentCache forces a fresh check (used on sign-out)', async () => {
    apiFetch.mockResolvedValue(response({ complete: true }));
    await isConsentComplete();
    resetConsentCache();
    await isConsentComplete();
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });
});

describe('recordConsents', () => {
  it('posts every required document at its current version', async () => {
    apiFetch.mockResolvedValue(response({}));
    await recordConsents();

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [path, opts] = apiFetch.mock.calls[0];
    expect(path).toBe('/api/consents');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({
      documents: CONSENT_DOCS.map((d) => ({ document: d.key, version: d.version })),
    });
  });

  it('marks consent complete locally after a successful record', async () => {
    apiFetch.mockResolvedValue(response({}));
    await recordConsents();
    await expect(isConsentComplete()).resolves.toBe(true);
    expect(apiFetch).toHaveBeenCalledTimes(1); // no extra status round-trip
  });

  it('throws and leaves the cache untouched when the server rejects', async () => {
    apiFetch.mockResolvedValueOnce(response({}, { ok: false, status: 500 }));
    await expect(recordConsents()).rejects.toThrow(/Could not record consent/);
    apiFetch.mockResolvedValue(response({ complete: false }));
    await expect(isConsentComplete()).resolves.toBe(false);
  });
});

describe('CONSENT_DOCS', () => {
  it('lists the three documents the server requires with dated versions', () => {
    expect(CONSENT_DOCS.map((d) => d.key)).toEqual([
      'terms_of_service',
      'privacy_policy',
      'health_data_processing',
    ]);
    for (const d of CONSENT_DOCS) expect(d.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
