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
  const map:Record<string,string>={ACTIVE:'green',PENDING_MANAGER:'yellow',PENDING_WAREHOUSE:'yellow',PENDING_ACCOUNTING:'yellow',PENDING_FINAL_REVIEW:'yellow',APPROVED:'blue',MASTER_ACTIVE:'green',RETURNED:'red',REJECTED:'red',DRAFT:'gray',LINKED:'green',IMPORTED:'gray',REVIEW_REQUIRED:'yellow',COMPLETED:'green',RUNNING:'blue',FAILED:'red'};
  return <Badge tone={(map[status] as any)||'gray'}>{status}</Badge>;
};
export const PriorityBadge:React.FC<{priority:number}> = ({priority})=>{
  const m={0:['Baja','gray'],1:['Media','blue'],2:['Alta','yellow'],3:['Crítica','red']} as Record<number,[string,string]>;
  const [label,tone]=m[priority]||['—','gray']; return <Badge tone={tone as any}>{label}</Badge>;
};
export const Card:React.FC<{children:React.ReactNode; className?:string}> = ({children,className=''})=><div className={`card ${className}`}>{children}</div>;
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
export const FilterBar:React.FC<{children:React.ReactNode}> = ({children})=><div className="filterbar">{children}</div>;
