import * as React from 'react';
export const Button:React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'primary'|'secondary'|'ghost'|'danger';size?:'sm'|'md'}> = ({variant='primary',size='md',className='',...p})=>{
  const v={primary:'btn-primary',secondary:'btn-secondary',ghost:'btn-ghost',danger:'btn-danger'}[variant];
  const s=size==='sm'?'btn-sm':''; return <button className={`btn ${v} ${s} ${className}`} {...p}/>;
};
export const Input:React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (p)=><input className="input" {...p}/>;
export const Select:React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (p)=><select className="input" {...p}/>;
export const Textarea:React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (p)=><textarea className="input" rows={3} {...p}/>;
export const Badge:React.FC<{children:React.ReactNode; tone?:'gray'|'green'|'yellow'|'red'|'blue'}> = ({children,tone='gray'})=><span className={`badge badge-${tone}`}>{children}</span>;
export const StatusBadge:React.FC<{status:string}> = ({status})=>{
  const map:Record<string,string>={ACTIVE:'green',BORRADOR:'gray',PENDIENTE_GERENTE:'yellow',PENDIENTE_ALMACEN:'yellow',ALMACEN_APROBADO:'blue',PENDIENTE_CONTABILIDAD:'yellow',PENDIENTE_VALIDACION_MAESTRA:'yellow',APROBADO_FINAL:'blue',PROCESANDO_PROFIT:'blue',REGISTRADO_PROFIT:'green',ERROR_PROFIT:'red',DEVUELTO:'red',RECHAZADO:'red',LINKED:'green',IMPORTED:'gray',PENDING_REVIEW:'yellow',REVIEW_REQUIRED:'yellow',COMPLETED:'green',RUNNING:'blue',FAILED:'red'};
  const label:Record<string,string>={BORRADOR:'Borrador',PENDIENTE_GERENTE:'Pendiente de Gerente',PENDIENTE_ALMACEN:'Pendiente de Almacén',ALMACEN_APROBADO:'Almacén aprobado',PENDIENTE_CONTABILIDAD:'Pendiente de Contabilidad',PENDIENTE_VALIDACION_MAESTRA:'Pendiente de Validación Maestra',APROBADO_FINAL:'Aprobación Final',PROCESANDO_PROFIT:'Procesando en Profit',REGISTRADO_PROFIT:'Registrado en Profit',ERROR_PROFIT:'Error en Profit',DEVUELTO:'Devuelto',RECHAZADO:'Rechazado'};
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
export const Tabs:React.FC<{tabs:string[];active:number;onChange:(i:number)=>void}> = ({tabs,active,onChange})=>(
  <div className="tabs">{tabs.map((t,i)=><button key={t} className={`tab ${i===active?'tab-active':''}`} onClick={()=>onChange(i)}>{t}</button>)}</div>
);
export const Modal:React.FC<{open:boolean; onClose:()=>void; title:string; children:React.ReactNode}> = ({open,onClose,title,children})=>{
  if(!open) return null; return <div className="modal-overlay" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><h3>{title}</h3><button className="btn btn-ghost" onClick={onClose}>✕</button></div><div className="modal-body">{children}</div></div></div>;
};
export const EmptyState:React.FC<{title:string; desc?:string}> = ({title,desc})=><div className="empty"><div className="empty-title">{title}</div>{desc && <div className="muted">{desc}</div>}</div>;
export const SearchInput:React.FC<{value:string; onChange:(v:string)=>void; placeholder?:string}> = ({value,onChange,placeholder})=>(
  <input className="input" placeholder={placeholder||'Buscar...'} value={value} onChange={e=>onChange(e.target.value)} />
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

export const ConfirmDialog:React.FC<{open:boolean;title:string;desc?:string;confirmLabel?:string;onConfirm:()=>void;onCancel:()=>void;busy?:boolean}> = ({open,title,desc,confirmLabel='Confirmar',onConfirm,onCancel,busy})=>{
  if(!open) return null;
  return <div className="modal-overlay" onClick={onCancel}><div className="modal" role="alertdialog" aria-label={title} onClick={e=>e.stopPropagation()}><div className="modal-head"><h3>{title}</h3><button className="btn btn-ghost" onClick={onCancel} aria-label="Cerrar">✕</button></div><div className="modal-body"><div className="stack-sm">{desc && <p className="muted">{desc}</p>}<div style={{display:'flex',gap:8,justifyContent:'flex-end'}}><Button variant="secondary" onClick={onCancel} disabled={busy}>Cancelar</Button><Button onClick={onConfirm} disabled={busy}>{busy ? 'Procesando...' : confirmLabel}</Button></div></div></div></div></div>;
};

export const Drawer:React.FC<{open:boolean;onClose:()=>void;title:string;children:React.ReactNode}> = ({open,onClose,title,children})=>{
  if(!open) return null;
  return <div className="drawer-overlay" onClick={onClose}><div className="drawer" role="dialog" aria-label={title} onClick={e=>e.stopPropagation()}><div className="drawer-head"><h3>{title}</h3><button className="btn btn-ghost" onClick={onClose} aria-label="Cerrar">✕</button></div><div className="drawer-body">{children}</div></div></div>;
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
export { ImageLightbox } from './ImageLightbox';
