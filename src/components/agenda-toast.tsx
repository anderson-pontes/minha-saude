import {CheckCircle2,X} from 'lucide-react'
import {Button} from './ui/button'
export function AgendaToast({message,dismiss}:{message:string;dismiss:()=>void}){
 if(!message)return null
 return <div className="agenda-toast" role="status" aria-live="polite"><CheckCircle2 size={20}/><span>{message}</span><Button variant="ghost" aria-label="Dispensar mensagem" onClick={dismiss}><X size={16}/></Button></div>
}
