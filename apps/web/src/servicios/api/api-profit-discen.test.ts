// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiProfitRegistrationService } from './api-profit-registration-service';

/**
 * FASE 14S (E) — el frontend jamás construye ni envía dis_cen.
 * plan/create/retry salen con cuerpo vacío; solo verify envía coArt.
 */
describe('14S frontend no envía dis_cen', () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: any) => {
      calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
      return { ok: true, status: 200, json: async () => ({}) } as any;
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('plan/create/retry no incluyen dis_cen ni disCen', async () => {
    await apiProfitRegistrationService.plan('r1');
    await apiProfitRegistrationService.create('r1');
    await apiProfitRegistrationService.retry('r1');
    expect(calls.length).toBe(3);
    for (const c of calls) {
      const blob = JSON.stringify(c.body ?? {});
      expect(blob).not.toMatch(/disCen|dis_cen/i);
    }
  });
});
