import { BadRequestException } from '@nestjs/common';

/** Posición contable interna 1..10. Se serializa como c1..c10. */
export type ContabilidadPosition = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/** Entrada conceptual: posición interna + código Profit exacto. */
export interface DisEntry {
  position: ContabilidadPosition;
  code: string;
}

const POS_RE = /^c([1-9]|10)$/;

function toKey(position: ContabilidadPosition): string {
  return `c${position}`;
}

function parseKey(key: string): ContabilidadPosition {
  const m = POS_RE.exec(key.trim());
  if (!m) {
    throw new BadRequestException(`Posición inválida: "${key}". Use c1..c10.`);
  }
  return parseInt(m[1]!, 10) as ContabilidadPosition;
}

/**
 * Serializa posiciones contables al formato exacto de Profit:
 * `<DIS>{c1:COD}{c7:COD}</DIS>`
 * - Solo posiciones con cuenta (vacías se omiten).
 * - Orden siempre c1 → c10.
 * - Sin espacios. Conserva puntos/ceros del código.
 */
export function serializarDis(entries: DisEntry[] | Record<string, string | undefined | null>): string {
  const list: DisEntry[] = Array.isArray(entries)
    ? entries
    : Object.entries(entries).map(([k, v]) => ({ position: parseKey(k), code: (v ?? '').trim() }));

  if (list.length > 10) {
    throw new BadRequestException('Máximo 10 posiciones contables (c1..c10).');
  }

  const seen = new Set<number>();
  const cleaned: DisEntry[] = [];
  for (const e of list) {
    if (!Number.isInteger(e.position) || e.position < 1 || e.position > 10) {
      throw new BadRequestException(`Posición inválida: "${(e as any).position}". Use 1..10.`);
    }
    if (seen.has(e.position)) {
      throw new BadRequestException(`Posición duplicada: c${e.position}. Una sola cuenta por posición.`);
    }
    seen.add(e.position);
    const code = (e.code ?? '').trim();
    if (!code) continue; // posición vacía: se omite
    cleaned.push({ position: e.position, code });
  }

  cleaned.sort((a, b) => a.position - b.position);
  return `<DIS>${cleaned.map((e) => `{${toKey(e.position)}:${e.code}}`).join('')}</DIS>`;
}

/**
 * Deserializa `<DIS>{c1:COD}{c7:COD}</DIS>` a mapa posición → código.
 * Acepta 0..10 posiciones, no consecutivas, c9/c10 y `<DIS></DIS>`.
 * Rechaza posiciones fuera de c1-c10 (no las acepta silenciosamente).
 */
export function deserializarDis(dis: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (dis == null) {
    throw new BadRequestException('DIS requerido.');
  }
  const t = dis.trim();
  const m = /^<DIS>(.*)<\/DIS>$/s.exec(t);
  if (!m) {
    throw new BadRequestException('Formato DIS inválido. Esperado <DIS>{c1:...}...</DIS>.');
  }
  const body = m[1]!.trim();
  if (!body) return out;

  const re = /\{(c\d{1,2}):([^}]*)\}/g;
  let match: RegExpExecArray | null;
  let found = false;
  while ((match = re.exec(body)) !== null) {
    found = true;
    const key = match[1]!;
    const code = (match[2] ?? '').trim();
    const pos = parseKey(key); // lanza si c0/c11/c99
    const k = toKey(pos);
    if (out[k] !== undefined) {
      throw new BadRequestException(`Posición duplicada en DIS: ${k}.`);
    }
    if (!code) continue;
    out[k] = code;
  }
  if (!found) {
    throw new BadRequestException('DIS sin posiciones válidas {cN:código}.');
  }
  return out;
}
