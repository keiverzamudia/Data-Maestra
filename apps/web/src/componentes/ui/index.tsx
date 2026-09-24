import * as React from 'react';
export const Button:React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'primary'|'secondary'|'ghost'|'danger'|'accent';size?:'sm'|'md';loading?:boolean}> = ({variant='primary',size='md',loading=false,className='',disabled,...p})=>{
  const v={primary:'btn-primary',secondary:'btn-secondary',ghost:'btn-ghost',danger:'btn-danger',accent:'btn-accent'}[variant];
  const s=size==='sm'?'btn-sm':'';
  return <button className={`btn ${v} ${s} ${loading?'btn-loading':''} ${className}`} disabled={disabled||loading} aria-busy={loading||undefined} {...p}>{loading && <span className="spinner" aria-hidden="true" />} {p.children}</button>;
};
export const Input:React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (p)=><input className="input" {...p}/>;
export const Select:React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (p)=><select className="input" {...p}/>;

/** Normaliza para búsqueda: minúsculas + sin tildes. */
export function normalizeSearchText(v: string): string {
  return (v ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export interface ComboboxOption { value: string; label: string; }
/**
 * Combobox: se ve como un select pero permite escribir para filtrar por
 * coincidencia de código o descripción. Selección estricta: solo valores de
 * la lista; si el texto no coincide, al salir se revierte al seleccionado.
 */
export const Combobox:React.FC<{
  options: ComboboxOption[]; value: string; onChange:(value:string)=>void;
  placeholder?: string; disabled?: boolean; ariaLabel?: string; id?: string;
  noResultsText?: string;
}> = ({options,value,onChange,placeholder,disabled,ariaLabel,id,noResultsText='Sin coincidencias'})=>{
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState('');
  const [highlight, setHighlight] = React.useState(0);
  const selected = options.find(o => o.value === value) ?? null;
  const shown = selected ? selected.label : '';
  // Sincroniza el texto visible con el valor externo (prefill, reseteo).
  React.useEffect(() => { setText(shown); }, [shown]);
  const query = normalizeSearchText(text);
  const filtered = query
    ? options.filter(o => normalizeSearchText(o.label).includes(query) || normalizeSearchText(o.value).includes(query))
    : options;
  React.useEffect(() => { setHighlight(0); }, [text]);

  const commit = (v: string) => {
    const opt = options.find(o => o.value === v) ?? null;
    setText(opt ? opt.label : '');
    setOpen(false);
    if (v !== value) onChange(v);
  };
  const revert = () => { setText(shown); setOpen(false); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      const n = filtered.length;
      if (n === 0) return;
      setHighlight(h => (h + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
    } else if (e.key === 'Enter') {
      if (open && filtered[highlight]) { e.preventDefault(); commit(filtered[highlight]!.value); }
    } else if (e.key === 'Escape') {
      revert();
    }
  };

  return (
    <div
      className="combobox" ref={wrapRef}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) revert(); }}
    >
      <input
        className="input" role="combobox"
        id={id} aria-label={ariaLabel} aria-expanded={open}
        aria-autocomplete="list" aria-controls={id ? `${id}-listbox` : undefined}
        aria-activedescendant={open && filtered[highlight] && id ? `${id}-opt-${highlight}` : undefined}
        autoComplete="off" placeholder={placeholder} value={text} disabled={disabled}
        onFocus={() => { if (!disabled) setOpen(true); }}
        onChange={e => { setText(e.target.value); setOpen(true); }}
        onKeyDown={onKeyDown}
      />
      {open && !disabled && (
        <ul className="combobox-list" role="listbox" id={id ? `${id}-listbox` : undefined} aria-label={ariaLabel}>
          {filtered.length === 0 && <li className="combobox-empty" role="option" aria-selected="false">{noResultsText}</li>}
          {filtered.map((o, i) => (
            <li
              key={o.value} role="option" id={id ? `${id}-opt-${i}` : undefined}
              aria-selected={o.value === value}
              className={`combobox-option${i === highlight ? ' combobox-option-active' : ''}${o.value === value ? ' combobox-option-selected' : ''}`}
              onMouseDown={e => { e.preventDefault(); commit(o.value); }}
              onMouseEnter={() => setHighlight(i)}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
export const Textarea:React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (p)=><textarea className="input" rows={3} {...p}/>;
export const Badge:React.FC<{children:React.ReactNode; tone?:'gray'|'green'|'yellow'|'red'|'blue'}> = ({children,tone='gray'})=><span className={`badge badge-${tone}`}>{children}</span>;
export const StatusBadge:React.FC<{status:string}> = ({status})=>{
  const map:Record<string,string>={ACTIVE:'green',BORRADOR:'gray',PENDIENTE_GERENTE:'yellow',PENDIENTE_ALMACEN:'yellow',ALMACEN_APROBADO:'blue',PENDIENTE_CONTABILIDAD:'yellow',CONTABILIDAD_APROBADA:'blue',PROCESANDO_PROFIT:'blue',INSERTADO_PROFIT:'green',ERROR_PROFIT:'red',DEVUELTO:'red',RECHAZADO:'red',LINKED:'green',IMPORTED:'gray',PENDING_REVIEW:'yellow',REVIEW_REQUIRED:'yellow',COMPLETED:'green',RUNNING:'blue',FAILED:'red'};
  const label:Record<string,string>={BORRADOR:'Borrador',PENDIENTE_GERENTE:'Pendiente de Gerente',PENDIENTE_ALMACEN:'Pendiente de Almacén',ALMACEN_APROBADO:'Aprobación Almacén',PENDIENTE_CONTABILIDAD:'Pendiente de Contabilidad',CONTABILIDAD_APROBADA:'Contabilidad aprobada',PROCESANDO_PROFIT:'Procesando en Profit',INSERTADO_PROFIT:'Registrado en Profit',ERROR_PROFIT:'Error en Profit',DEVUELTO:'Devuelto',RECHAZADO:'Rechazado'};
  return <Badge tone={(map[status] as any)||'gray'}>{label[status]||status}</Badge>;
};
export const PriorityBadge:React.FC<{priority:number}> = ({priority})=>{
  const m={0:['Baja','gray'],1:['Media','blue'],2:['Alta','yellow'],3:['Crítica','red']} as Record<number,[string,string]>;
  const [label,tone]=m[priority]||['—','gray']; return <Badge tone={tone as any}>{label}</Badge>;
};
export const KpiCard:React.FC<{label:string;value:string|number; sub?:string; tone?:string}> = ({label,value,sub,tone})=>(
  <div className="kpi">
    <div className="kpi-label">{label}</div>
    <div className={`kpi-value ${tone||''}`}>{value}</div>
    {sub && <div className="kpi-sub">{sub}</div>}
  </div>
);
export const PageHeader:React.FC<{title:string; subtitle?:string; action?:React.ReactNode}> = ({title,subtitle,action})=>(
  <div className="page-header">
    <div><h1 className="h1">{title}</h1>{subtitle && <p className="muted">{subtitle}</p>}</div>
    <div>{action}</div>
  </div>
);
export const Tabs:React.FC<{tabs:string[];active:number;onChange:(i:number)=>void;ariaLabel?:string}> = ({tabs,active,onChange,ariaLabel})=>{
  const onKeyDown=(e:React.KeyboardEvent)=>{
    if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft') return;
    e.preventDefault();
    const dir=e.key==='ArrowRight'?1:-1;
    onChange((active+dir+tabs.length)%tabs.length);
  };
  return (
    <div className="tabs" role="tablist" aria-label={ariaLabel||'Secciones'} onKeyDown={onKeyDown}>
      {tabs.map((t,i)=>(
        <button
          key={t} role="tab" aria-selected={i===active} tabIndex={i===active?0:-1}
          className={`tab ${i===active?'tab-active':''}`} onClick={()=>onChange(i)}
        >{t}</button>
      ))}
    </div>
  );
};
export const Modal:React.FC<{open:boolean; onClose:()=>void; title:string; children:React.ReactNode; wide?:boolean}> = ({open,onClose,title,children,wide=false})=>{
  React.useEffect(()=>{
    if(!open) return;
    const onKey=(e:KeyboardEvent)=>{ if(e.key==='Escape') onClose(); };
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  },[open,onClose]);
  if(!open) return null; return <div className="modal-overlay" onClick={onClose}><div className={`modal${wide?' modal-wide':''}`} role="dialog" aria-modal="true" aria-label={title} onClick={e=>e.stopPropagation()}><div className="modal-head"><h3>{title}</h3><button className="btn btn-ghost" onClick={onClose} aria-label="Cerrar">✕</button></div><div className="modal-body">{children}</div></div></div>;
};
export const EmptyState:React.FC<{title:string; desc?:string; icon?:React.ReactNode; action?:React.ReactNode}> = ({title,desc,icon,action})=><div className="empty">{icon && <div className="empty-icon" aria-hidden="true">{icon}</div>}<div className="empty-title">{title}</div>{desc && <div className="muted">{desc}</div>}{action && <div className="empty-action">{action}</div>}</div>;
export const SearchInput:React.FC<{value:string; onChange:(v:string)=>void; placeholder?:string; ariaLabel?:string}> = ({value,onChange,placeholder,ariaLabel})=>(
  <input className="input" role="searchbox" aria-label={ariaLabel||placeholder||'Buscar'} placeholder={placeholder||'Buscar...'} value={value} onChange={e=>onChange(e.target.value)} />
);

/* ── 11A Design System: componentes base reutilizables (tokens en app/tokens.css) ── */
export const Alert:React.FC<{tone?:'success'|'warning'|'danger'|'info';children:React.ReactNode}> = ({tone='info',children})=>
  <div className={`alert alert-${tone}`} role="alert">{children}</div>;

export const Spinner:React.FC<{label?:string}> = ({label='Cargando...'})=>
  <span role="status" aria-label={label}><span className="spinner" aria-hidden="true" /></span>;

export const Skeleton:React.FC<{width?:string|number;height?:string|number;label?:string}> = ({width='100%',height=14,label='Cargando contenido...'})=>
  <div className="skeleton" role="status" aria-label={label} style={{width,height}} />;

export const ErrorState:React.FC<{title?:string;desc?:string;onRetry?:()=>void}> = ({title='No pudimos cargar la información.',desc,onRetry})=>
  <div className="error-state" role="alert">
    <div className="empty-title">{title}</div>
    {desc && <div className="muted small">{desc}</div>}
    {onRetry && <Button variant="secondary" onClick={onRetry}>Reintentar</Button>}
  </div>;

export const ConfirmDialog:React.FC<{open:boolean;title:string;desc?:string;confirmLabel?:string;onConfirm:()=>void;onCancel:()=>void;busy?:boolean;children?:React.ReactNode;confirmDisabled?:boolean}> = ({open,title,desc,confirmLabel='Confirmar',onConfirm,onCancel,busy,children,confirmDisabled})=>{
  React.useEffect(()=>{
    if(!open) return;
    const onKey=(e:KeyboardEvent)=>{ if(e.key==='Escape') onCancel(); };
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  },[open,onCancel]);
  if(!open) return null;
  return <div className="modal-overlay" onClick={onCancel}><div className="modal" role="alertdialog" aria-modal="true" aria-label={title} onClick={e=>e.stopPropagation()}><div className="modal-head"><h3>{title}</h3><button className="btn btn-ghost" onClick={onCancel} aria-label="Cerrar">✕</button></div><div className="modal-body"><div className="stack-sm">{desc && <p className="muted">{desc}</p>}{children}<div className="modal-foot"><Button variant="secondary" onClick={onCancel} disabled={busy}>Cancelar</Button><Button onClick={onConfirm} disabled={busy || confirmDisabled} loading={busy}>{busy ? 'Procesando...' : confirmLabel}</Button></div></div></div></div></div>;
};

export const Drawer:React.FC<{open:boolean;onClose:()=>void;title:string;subtitle?:string;children:React.ReactNode;size?:'default'|'narrow'}> = ({open,onClose,title,subtitle,children,size='default'})=>{
  React.useEffect(()=>{
    if(!open) return;
    const onKey=(e:KeyboardEvent)=>{ if(e.key==='Escape') onClose(); };
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  },[open,onClose]);
  if(!open) return null;
  return <div className="drawer-overlay" onClick={onClose}><div className={`drawer${size==='narrow'?' drawer-narrow':''}`} role="dialog" aria-modal="true" aria-label={title} onClick={e=>e.stopPropagation()}><div className="drawer-head"><div><h3>{title}</h3>{subtitle && <p className="muted small drawer-subtitle">{subtitle}</p>}</div><button className="btn btn-ghost" onClick={onClose} aria-label="Cerrar">✕</button></div><div className="drawer-body">{children}</div></div></div>;
};

export const Field:React.FC<{label:string;required?:boolean;helper?:string;error?:string;children:React.ReactNode}> = ({label,required,helper,error,children})=>(
  <label className={`field${required?' field-required':''}`}>
    <span>{label}</span>
    {children}
    {error ? <span className="field-error" role="alert">{error}</span> : helper ? <span className="field-helper">{helper}</span> : null}
  </label>
);

export const Page:React.FC<{title:string;desc?:string;actions?:React.ReactNode;children:React.ReactNode}> = ({title,desc,actions,children})=>(
  <div className="page page-container">
    <div className="page-head">
      <div><h1 className="page-title">{title}</h1>{desc && <p className="page-desc">{desc}</p>}</div>
      {actions && <div style={{display:'flex',gap:8}}>{actions}</div>}
    </div>
    {children}
  </div>
);

/* ── Enterprise: tarjeta de sección con encabezado uniforme (título 16-18px) ── */
export const SectionCard:React.FC<{title:string;desc?:string;actions?:React.ReactNode;children:React.ReactNode;className?:string}> = ({title,desc,actions,children,className=''})=>(
  <section className={`card p16 ${className}`}>
    <div className="section-head">
      <div><h2 className="section-card-title">{title}</h2>{desc && <p className="muted small section-card-desc">{desc}</p>}</div>
      {actions && <div className="section-card-actions">{actions}</div>}
    </div>
    {children}
  </section>
);

/* ── Enterprise: métrica oficial (converge kpi/stat/summary hacia este patrón) ── */
export const StatCard:React.FC<{label:string;value:string|number;sub?:string;tone?:'ok'|'warn'|'bad'|'info'}> = ({label,value,sub,tone})=>{
  const t=tone?` stat-${tone}`:'';
  return <div className={`stat-card${t}`}><div><div className="stat-num">{value}</div><div className="stat-label">{label}</div>{sub && <div className="muted small">{sub}</div>}</div></div>;
};

/* ── Enterprise: código técnico en JetBrains Mono (Profit, Master, contables, IDs) ── */
export const Code:React.FC<{children:React.ReactNode;className?:string}> = ({children,className=''})=>
  <code className={`mono ${className}`}>{children}</code>;

/* ── Enterprise: tabla única (encabezado, hover, códigos mono, responsive) ── */
export interface DataColumn<T>{key:string;header:string;render:(row:T)=>React.ReactNode;align?:'left'|'right';label?:string}
export function DataTable<T>({columns,rows,rowKey,loading,error,emptyTitle,emptyDesc,onRetry,loadingRows=5,caption,onRowClick}:{
  columns:DataColumn<T>[];rows:T[];rowKey:(row:T,index:number)=>string;
  loading?:boolean;error?:string|null;emptyTitle?:string;emptyDesc?:string;onRetry?:()=>void;loadingRows?:number;caption?:string;
  onRowClick?:(row:T)=>void;
}){
  if(loading){
    return <div className="card p16 stack-sm" role="status" aria-label="Cargando datos"><Skeleton height={16} width="30%"/>{Array.from({length:loadingRows}).map((_,i)=><Skeleton key={i} height={36}/>)}</div>;
  }
  if(error){
    return <div className="card p16"><ErrorState title="No pudimos cargar la información." desc={error} onRetry={onRetry}/></div>;
  }
  if(rows.length===0){
    return <div className="card p16"><EmptyState title={emptyTitle||'Sin resultados'} desc={emptyDesc||'No hay datos para mostrar con los filtros actuales.'}/></div>;
  }
  return (
    <div className="card table-card">
      <div className="table-responsive">
        <table className="table">
          {caption && <caption className="muted small table-caption">{caption}</caption>}
          <thead><tr>{columns.map(c=><th key={c.key} scope="col" className={c.align==='right'?'cell-num':''}>{c.header}</th>)}</tr></thead>
          <tbody>
            {rows.map((row,i)=>(
              <tr
                key={rowKey(row,i)}
                className={onRowClick?'clickable':''}
                onClick={onRowClick?()=>onRowClick(row):undefined}
                onKeyDown={onRowClick?(e)=>{if(e.key==='Enter'){onRowClick(row);}}:undefined}
                tabIndex={onRowClick?0:undefined}
              >
                {columns.map((c,ci)=>(
                  <td key={c.key} data-label={c.label||c.header} className={`${ci===0?'cell-primary':''}${c.align==='right'?' cell-num':''}`}>{c.render(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Enterprise: paginación única (conservar server-side: page/limit/total) ── */
export const Pagination:React.FC<{page:number;totalPages:number;total?:number;pageSize?:number;onPage:(p:number)=>void;onPageSize?:(n:number)=>void}> = ({page,totalPages,total,pageSize,onPage,onPageSize})=>{
  if(totalPages<=1 && !onPageSize) return null;
  return (
    <nav className="pager" aria-label="Paginación">
      <Button variant="secondary" size="sm" onClick={()=>onPage(Math.max(page-1,1))} disabled={page<=1}>Anterior</Button>
      <span className="muted small" aria-live="polite">Página {page} de {totalPages}{total!==undefined?` · ${total} registros`:''}</span>
      <Button variant="secondary" size="sm" onClick={()=>onPage(Math.min(page+1,totalPages))} disabled={page>=totalPages}>Siguiente</Button>
      {onPageSize && (
        <label className="muted small">Por página
          <select className="input pager-select" value={pageSize} onChange={e=>onPageSize(Number(e.target.value))} aria-label="Registros por página">
            {[10,25,50,100].map(n=><option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      )}
    </nav>
  );
};
export { ImageLightbox } from './ImageLightbox';
