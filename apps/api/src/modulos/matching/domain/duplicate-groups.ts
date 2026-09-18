import { createHash } from 'node:crypto';

/**
 * FASE 23 — Agrupación conservadora por cliques maximales.
 * Un grupo solo une artículos conectados TODOS con TODOS por aristas
 * sin conflictos (HIGH/MEDIUM). Así A↔B y B↔C con A↔C en conflicto
 * producen {A,B} y {B,C}, jamás {A,B,C}. Sin transitividad ciega.
 */

export function maximalCliques(nodes: string[], adjacency: Map<string, Set<string>>): string[][] {
  const cliques: string[][] = [];
  const sorted = [...nodes].sort();
  const neighbors = (n: string): string[] =>
    [...(adjacency.get(n) ?? new Set<string>())].filter((m) => sorted.includes(m)).sort();

  const expand = (current: string[], candidates: string[], excluded: string[]): void => {
    if (candidates.length === 0 && excluded.length === 0) {
      if (current.length >= 2) cliques.push([...current].sort());
      return;
    }
    const union = [...candidates, ...excluded];
    let pivot = union[0]!;
    let maxCover = -1;
    for (const u of union) {
      const cover = candidates.filter((v) => neighbors(u).includes(v)).length;
      if (cover > maxCover) {
        maxCover = cover;
        pivot = u;
      }
    }
    const pivotNeighbors = new Set(neighbors(pivot));
    for (const v of candidates.filter((c) => !pivotNeighbors.has(c))) {
      const vNeighbors = new Set(neighbors(v));
      expand(
        [...current, v],
        candidates.filter((c) => vNeighbors.has(c)),
        excluded.filter((c) => vNeighbors.has(c)),
      );
      candidates = candidates.filter((c) => c !== v);
      excluded = [...excluded, v];
    }
  };

  expand([], sorted, []);
  cliques.sort((a, b) => (a.join('|') < b.join('|') ? -1 : 1));
  return cliques;
}

/** Id determinístico de grupo a partir de sus miembros ordenados. */
export function groupIdFor(members: Array<{ companyCode: string; profitArticleCode: string }>): string {
  const keys = members
    .map((m) => `${m.companyCode}:${m.profitArticleCode}`)
    .sort()
    .join('::');
  return `grp:${createHash('sha256').update(keys).digest('hex').slice(0, 32)}`;
}
