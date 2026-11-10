import type {ReactNode} from 'react'
import type {LucideIcon} from 'lucide-react'
import {Button} from './ui/button'
import {appointmentStatuses,type Appointment} from '../lib/agenda'

export function PageHeader({eyebrow,title,description,actions}:{eyebrow:string;title:string;description?:ReactNode;actions?:ReactNode}){
 return <div className="directory-heading"><div className="page-heading"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{description&&<p>{description}</p>}</div>{actions&&<div className="agenda-heading-actions">{actions}</div>}</div>
}
export function StatCard({label,value,icon:Icon,tone,onClick}:{label:string;value:ReactNode;icon:LucideIcon;tone:string;onClick:()=>void}){
 return <button type="button" className={`panel agenda-metric metric-${tone}`} onClick={onClick}><span className="stat-icon"><Icon size={20}/></span><strong>{value}</strong><span>{label}</span></button>
}
export function StatusBadge({status}:{status:Appointment['status']}){
 return <span className={`appointment-status status-${status}`}>{appointmentStatuses[status]}</span>
}
export function DetailSection({title,children}:{title:string;children:ReactNode}){
 return <section className="panel detail-section"><h2>{title}</h2>{children}</section>
}
export function Pagination({page,size,total,onPage,onSize}:{page:number;size:number;total:number;onPage:(page:number)=>void;onSize:(size:number)=>void}){
 return <nav className="agenda-pagination" aria-label="Paginação de compromissos"><span role="status">{total?`${(page-1)*size+1}–${Math.min(page*size,total)}`:'0'} de {total} compromissos</span><label>Por página<select value={size} onChange={e=>onSize(Number(e.target.value))}>{[10,20,40].map(n=><option key={n} value={n}>{n}</option>)}</select></label><Button variant="outline" disabled={page===1} onClick={()=>onPage(page-1)}>Anterior</Button><span>{page} / {Math.max(1,Math.ceil(total/size))}</span><Button variant="outline" disabled={page*size>=total} onClick={()=>onPage(page+1)}>Próxima</Button></nav>
}
