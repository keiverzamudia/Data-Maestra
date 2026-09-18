import * as React from 'react';
import { apiDuplicatesService, type DuplicateRelation, type DuplicatesResumen } from '../../servicios/api/api-duplicates-service';
import {
  Page, Button, SearchInput, EmptyState, Alert,
  Skeleton, ErrorState, DataTable, Pagination, Select, Modal, Badge, type DataColumn,
} from '../../componentes/ui';
import { HelpButton } from '../../componentes/ayuda';
import {
  getMatchClassificationLabel,
  getMatchEvidenceLabel,
  getMatchConflictLabel,
} from '../../utilidades/presentacion';

const PAGE_SIZE = 25;

function parseList(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function toneFor(c: string): 'green' | 'yellow' | 'gray' | 'blue' {
  if (c === 'HIGH') return 'green';
  if (c === 'MEDIUM') return 'blue';
  if (c === 'LOW') return 'gray';
  return 'yellow';
}

/**
 * FASE 23 — Auditoría histórica de posibles duplicados (solo lectura).
 * DETECCIÓN ≠ DECISIÓN: no hay botones SAME/DIFFERENT, solo ver detalle.
 */
export const AuditoriaHistorica: React.FC = () => {
  const [resumen, setResumen] = React.useState<DuplicatesResumen | null>(null);
  const [resumenError, setResumenError] = React.useState<string | null>(null);
  const [companyCode, setCompanyCode] = React.useState('');
  const [classification, setClassification] = React.useState('');
  const [conConflictos, setConConflictos] = React.useState('');
  const [coverage, setCoverage] = React.useState('');
  const [code, setCode] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [orderBy, setOrderBy] = React.useState<'score' | 'classification' | 'detectedAt' | 'evidenceCount' | 'conflictCount'>('score');
  const [page, setPage] = React.useState(1);
  const [view, setView] = React.useState<{ items: DuplicateRelation[]; total: number } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [listError, setListError] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<DuplicateRelation | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  React.useEffect(() => {
    apiDuplicatesService.resumen().then(setResumen, (err: any) => {
      setResumenError(err?.message || 'No pudimos cargar el resumen.');
    });
  }, []);

  const load = React.useCallback(() => {
    setLoading(true);
    setListError(null);
    apiDuplicatesService.relaciones({
      companyCode: companyCode || undefined,
      classification: classification || undefined,
      conConflictos: conConflictos === '' ? undefined : conConflictos === 'true',
      coverage: coverage || undefined,
      code: code || undefined,
      text: debounced || undefined,
      orderBy,
      orderDir: 'desc',
      page,
      limit: PAGE_SIZE,
    }).then(
      (v) => {
        setView({ items: v.items, total: v.total });
        setLoading(false);
      },
      (err: any) => {
        setListError(err?.message || 'No pudimos cargar las relaciones.');
        setLoading(false);
      },
    );
  }, [companyCode, classification, conConflictos, coverage, code, debounced, orderBy, page]);

  React.useEffect(() => { load(); }, [load]);

  const columns: DataColumn<DuplicateRelation>[] = [
    { key: 'a', header: 'Artículo A', label: 'Artículo A', render: (r) => <strong className="mono">{r.companyACode}:{r.profitACode}</strong> },
    { key: 'b', header: 'Artículo B', label: 'Artículo B', render: (r) => <strong className="mono">{r.companyBCode}:{r.profitBCode}</strong> },
    {
      key: 'cls', header: 'Clasificación', label: 'Clasificación',
      render: (r) => <Badge tone={toneFor(r.classification)}>{getMatchClassificationLabel(r.classification)}</Badge>,
    },
    { key: 'score', header: 'Score de coincidencia', label: 'Score', render: (r) => <span className="mono">{r.score}</span> },
    {
      key: 'conf', header: 'Conflictos', label: 'Conflictos',
      render: (r) => {
        const list = parseList(r.conflictsJson);
        return list.length === 0
          ? <span className="muted small">Sin conflictos</span>
          : <span>{list.map(getMatchConflictLabel).join(', ')}</span>;
      },
    },
    { key: 'cov', header: 'Cobertura', label: 'Cobertura', render: (r) => <span className="muted small">{r.coverageA ?? '—'} / {r.coverageB ?? '—'}</span> },
    { key: 'est', header: 'Estado', label: 'Estado', render: (r) => <span className="muted small">{r.status === 'PENDIENTE_REVISION' ? 'Pendiente de revisión' : r.status}</span> },
  ];

  const totalPages = view ? Math.max(1, Math.ceil(view.total / PAGE_SIZE)) : 1;

  return (
    <Page
      title="Auditoría histórica"
      desc="Posibles duplicados detectados entre artículos Profit. La detección no decide: la revisión humana corresponde a una fase posterior."
      actions={<HelpButton helpKey="auditoria" />}
    >
      {resumenError && <Alert tone="danger">{resumenError}</Alert>}
      {!resumen && !resumenError && (
        <div className="card p16 stack-sm" aria-label="Cargando resumen">
          <Skeleton height={16} width="30%" /><Skeleton height={40} />
        </div>
      )}
      {resumen && (
        <div className="card p16 stack-sm" aria-label="Resumen del universo">
          <div className="stat-grid">
            <div><div className="muted small">Artículos históricos</div><strong>{resumen.historicalArticles}</strong></div>
            <div><div className="muted small">Analizados</div><strong>{resumen.analyzed}</strong></div>
            <div><div className="muted small">Posibles relaciones</div><strong>{resumen.relations}</strong></div>
            <div><div className="muted small">Grupos potenciales</div><strong>{resumen.groups}</strong></div>
            <div><div className="muted small">Con conflictos</div><strong>{resumen.withConflicts}</strong></div>
            <div><div className="muted small">Sin conflictos</div><strong>{resumen.withoutConflicts}</strong></div>
          </div>
        </div>
      )}

      <div className="card p16 stack-sm">
        <div className="toolbar" role="search">
          <span className="grow">
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar por código o descripción..." />
          </span>
          <input
            className="input" style={{ maxWidth: 140 }} placeholder="Código" aria-label="Filtrar por código"
            value={code} onChange={(e) => { setCode(e.target.value); setPage(1); }}
          />
          <Select value={classification} onChange={(e) => { setClassification(e.target.value); setPage(1); }} aria-label="Filtrar por clasificación">
            <option value="">Toda clasificación</option>
            <option value="HIGH">Coincidencia alta</option>
            <option value="MEDIUM">Coincidencia media</option>
            <option value="LOW">Coincidencia baja</option>
            <option value="REVIEW">Requiere revisión</option>
          </Select>
          <Select value={conConflictos} onChange={(e) => { setConConflictos(e.target.value); setPage(1); }} aria-label="Filtrar por conflictos">
            <option value="">Con/sin conflictos</option>
            <option value="true">Con conflictos</option>
            <option value="false">Sin conflictos</option>
          </Select>
          <Select value={coverage} onChange={(e) => { setCoverage(e.target.value); setPage(1); }} aria-label="Filtrar por cobertura">
            <option value="">Toda cobertura</option>
            <option value="RICA">Rica</option>
            <option value="COMPARABLE">Comparable</option>
            <option value="BASICA">Básica</option>
            <option value="INSUFICIENTE">Insuficiente</option>
          </Select>
          <Select value={orderBy} onChange={(e) => { setOrderBy(e.target.value as typeof orderBy); setPage(1); }} aria-label="Ordenar por prioridad de revisión">
            <option value="score">Prioridad: score</option>
            <option value="evidenceCount">Prioridad: evidencias</option>
            <option value="conflictCount">Prioridad: conflictos</option>
            <option value="classification">Prioridad: clasificación</option>
            <option value="detectedAt">Prioridad: detección</option>
          </Select>
        </div>
        <div className="toolbar">
          <span className="muted small">Compañía</span>
          <input
            className="input" style={{ maxWidth: 160 }} placeholder="AD_TRANS" aria-label="Filtrar por compañía"
            value={companyCode} onChange={(e) => { setCompanyCode(e.target.value); setPage(1); }}
          />
          <Button variant="secondary" size="sm" onClick={load}>Actualizar</Button>
        </div>
      </div>

      {loading && (
        <div className="card p16 stack-sm" aria-label="Cargando relaciones">
          <Skeleton height={16} width="30%" /><Skeleton height={40} /><Skeleton height={40} />
        </div>
      )}
      {!loading && listError && <ErrorState title="No pudimos cargar las relaciones." onRetry={load} />}
      {!loading && !listError && view && view.items.length === 0 && (
        <EmptyState title="Sin relaciones" desc="Aún no hay posibles duplicados para estos filtros." />
      )}
      {!loading && !listError && view && view.items.length > 0 && (
        <>
          <DataTable
            columns={columns}
            rows={view.items}
            rowKey={(r) => r.pairKey}
            caption={`${view.total} relaciones.`}
            onRowClick={(r) => setDetail(r)}
          />
          {totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} total={view.total} pageSize={PAGE_SIZE} onPage={setPage} />
          )}
        </>
      )}

      <Modal open={detail !== null} onClose={() => setDetail(null)} title="Detalle de posible duplicado">
        {detail && <RelationDetail relation={detail} />}
      </Modal>
    </Page>
  );
};

const RelationDetail: React.FC<{ relation: DuplicateRelation }> = ({ relation: r }) => {
  const evidences = parseList(r.evidencesJson);
  const conflicts = parseList(r.conflictsJson);
  return (
    <div className="stack-sm">
      <div className="grid2">
        <div>
          <p className="muted small">Artículo A</p>
          <p><strong className="mono">{r.companyACode}:{r.profitACode}</strong></p>
          <p className="muted small">Cobertura: {r.coverageA ?? '—'}</p>
        </div>
        <div>
          <p className="muted small">Artículo B</p>
          <p><strong className="mono">{r.companyBCode}:{r.profitBCode}</strong></p>
          <p className="muted small">Cobertura: {r.coverageB ?? '—'}</p>
        </div>
      </div>
      <p>
        <Badge tone={toneFor(r.classification)}>{getMatchClassificationLabel(r.classification)}</Badge>
        {' '}<span className="muted small">Score de coincidencia: {r.score} (referencial, no es una decisión).</span>
      </p>
      {evidences.length > 0 && (
        <div>
          <p className="muted small">Evidencias</p>
          <ul>{evidences.map((e) => <li key={e}>✓ {getMatchEvidenceLabel(e)}</li>)}</ul>
        </div>
      )}
      {conflicts.length > 0 && (
        <div>
          <p className="muted small">Conflictos</p>
          <ul>{conflicts.map((c) => <li key={c}>⚠ {getMatchConflictLabel(c)}</li>)}</ul>
        </div>
      )}
      <div>
        <p className="muted small">Explicación</p>
        <p>{r.explanation}</p>
      </div>
      <p className="muted small">Versión del motor: {r.engineVersion}. Estado: {r.status === 'PENDIENTE_REVISION' ? 'Pendiente de revisión' : r.status}.</p>
    </div>
  );
};
