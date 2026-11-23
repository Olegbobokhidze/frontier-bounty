/**
 * Reference adapter for a real game server. Expected endpoints:
 *   POST {base}/rounds              OpenRoundRequest   → RoundOpened
 *   POST {base}/rounds/:id/reveal   RevealRequest      → RevealResult
 *   POST {base}/rounds/:id/cashout  CashOutRequest     → CashOutResult
 *   GET  {base}/balance                                 → { balance }
 * Every call sends `Idempotency-Key: <requestId>` and never throws.
 */
import { ProviderErrorCode, type ProviderResult } from '../core/result';
import type { CashOutResult, OpenRoundRequest, RevealResult, RoundOpened, RoundProvider } from '../engine/bounty/ports';

export type HttpProviderOptions = {
  readonly baseUrl: string;
  readonly sessionToken: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export class HttpProvider implements RoundProvider {
  readonly id = 'http';
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly o: HttpProviderOptions) {
    this.base = o.baseUrl.replace(/\/$/, '');
    this.fetchImpl = o.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = o.timeoutMs ?? 6000;
  }

  openRound(req: OpenRoundRequest): Promise<ProviderResult<RoundOpened>> {
    return this.post(`/rounds`, req.requestId, req, (j) => typeof j.roundId === 'string' && typeof j.serverSeedHash === 'string' && Number.isInteger(j.balanceAfter));
  }
  reveal(req: { requestId: number; roundId: string; cell: number }): Promise<ProviderResult<RevealResult>> {
    return this.post(`/rounds/${encodeURIComponent(req.roundId)}/reveal`, req.requestId, req, (j) => (j.outcome === 'safe' || j.outcome === 'hazard') && j.cell === req.cell);
  }
  cashOut(req: { requestId: number; roundId: string }): Promise<ProviderResult<CashOutResult>> {
    return this.post(`/rounds/${encodeURIComponent(req.roundId)}/cashout`, req.requestId, req, (j) => Number.isInteger(j.payout) && Array.isArray(j.hazards));
  }

  async getBalance(): Promise<number> {
    const res = await this.fetchImpl(`${this.base}/balance`, { headers: { authorization: `Bearer ${this.o.sessionToken}` } });
    const j: unknown = await res.json();
    if (isObj(j) && typeof j.balance === 'number') return j.balance;
    throw new Error('Malformed balance response');
  }

  private async post<T>(path: string, requestId: number, body: unknown, valid: (j: Record<string, unknown>) => boolean): Promise<ProviderResult<T>> {
    const ctrl = new AbortController();
    const timer = globalThis.setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.o.sessionToken}`, 'idempotency-key': String(requestId) },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const code = res.status === 402 ? ProviderErrorCode.INSUFFICIENT_FUNDS : res.status === 404 ? ProviderErrorCode.ROUND_NOT_FOUND : ProviderErrorCode.SERVER;
        return { ok: false, requestId, error: { code, message: `HTTP ${res.status}`, recoverable: res.status < 500 || res.status === 503 } };
      }
      const j: unknown = await res.json();
      if (!isObj(j) || !valid(j)) return { ok: false, requestId, error: { code: ProviderErrorCode.VALIDATION, message: 'Malformed server response.', recoverable: true } };
      return { ok: true, requestId, value: j as T };
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      return { ok: false, requestId, error: { code: aborted ? ProviderErrorCode.TIMEOUT : ProviderErrorCode.NETWORK, message: String(err), recoverable: true } };
    } finally {
      globalThis.clearTimeout(timer);
    }
  }
}
