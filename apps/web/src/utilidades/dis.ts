// Espejo frontend de apps/api/src/modulos/contabilidad/dis.utils.ts
// (misma regla; no importar del backend: web no depende de apps/api).
// Fase 8E — serialización <DIS>{c1:...}{c7:...}</DIS>, posiciones c1..c10.

export type ContabilidadPosition = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface DisEntry {
  position: ContabilidadPosition;
  code: string;
}

const POS_RE = /^c([1-9]|10)$/;

export function positionKey(position: ContabilidadPosition): string {
  return `c${position}`;
}

export function serializarDis(entries: DisEntry[] | Record<string, string | undefined | null>): string {
  const list: DisEntry[] = Array.isArray(entries)
    ? entries
    : Object.entries(entries).map(([k, v]) => {
        const m = POS_RE.exec(k.trim());
        if (!m) throw new Error(`Posición inválida: "${k}". Use c1..c10.`);
        return { position: parseInt(m[1]!, 10) as ContabilidadPosition, code: (v ?? '').trim() };
      });

  if (list.length > 10) throw new Error('Máximo 10 posiciones contables (c1..c10).');

  const seen = new Set<number>();
  const cleaned: DisEntry[] = [];
  for (const e of list) {
    if (!Number.isInteger(e.position) || e.position < 1 || e.position > 10) {
      throw new Error(`Posición inválida: "${(e as { position: unknown }).position}". Use 1..10.`);
    }
    if (seen.has(e.position)) throw new Error(`Posición duplicada: c${e.position}. Una sola cuenta por posición.`);
    seen.add(e.position);
    const code = (e.code ?? '').trim();
    if (!code) continue;
    cleaned.push({ position: e.position, code });
  }

  cleaned.sort((a, b) => a.position - b.position);
  return `<DIS>${cleaned.map((e) => `{c${e.position}:${e.code}}`).join('')}</DIS>`;
}

export function deserializarDis(dis: string): Record<string, string> {
  const out: Record<string, string> = {};
  const m = /^<DIS>(.*)<\/DIS>$/s.exec((dis ?? '').trim());
  if (!m) throw new Error('Formato DIS inválido. Esperado <DIS>{c1:...}...</DIS>.');
  const body = m[1]!.trim();
  if (!body) return out;
  const re = /\{(c\d{1,2}):([^}]*)\}/g;
  let match: RegExpExecArray | null;
  let found = false;
  while ((match = re.exec(body)) !== null) {
    found = true;
    const key = match[1]!;
    if (!POS_RE.test(key)) throw new Error(`Posición inválida en DIS: ${key}.`);
    if (out[key] !== undefined) throw new Error(`Posición duplicada en DIS: ${key}.`);
    const code = (match[2] ?? '').trim();
    if (!code) continue;
    out[key] = code;
  }
  if (!found) throw new Error('DIS sin posiciones válidas {cN:código}.');
  return out;
}
