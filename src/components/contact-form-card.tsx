import { useId, useState } from 'react'
import { Check, ChevronDown, Globe, Mail, MessageCircle, Pencil, Phone, Smartphone, Trash2, Link2 } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog } from './network'
import { Field } from './form-fields'
import { PhoneInput } from './masked-inputs'
import { contactTypes, displayContactValue, isPhoneKind, validateContact } from '../lib/contact-utils'
import type { Contact } from '../lib/network'

// eslint-disable-next-line react-refresh/only-export-components
export const contactIcons = { whatsapp: MessageCircle, mobile: Smartphone, phone: Phone, email: Mail, website: Globe, other: Link2 }
export function ContactTypeSelector({ value, onChange, index }: { value: string; onChange: (kind: string) => void; index: number }) {
  const name = useId()
  return <fieldset className="contact-type-field"><legend>Tipo de contato</legend><div className="contact-type-selector" role="radiogroup" aria-label={`Tipo do contato ${index + 1}`}>
    {Object.entries(contactTypes).filter(([key]) => key !== 'website' || value === 'website').map(([kind, label]) => {
      const Icon = contactIcons[kind as keyof typeof contactIcons]
      return <label key={kind} className={value === kind ? 'contact-type selected' : 'contact-type'}>
        <input type="radio" name={name} value={kind} checked={value === kind} onChange={() => onChange(kind)}/><Icon size={17}/><span>{label}</span>
      </label>
    })}
  </div></fieldset>
}
export function ContactFormCard({ contact, index, expanded, edit, collapse, change, remove, showErrors }: {
  contact: Contact; index: number; expanded: boolean; edit: () => void; collapse: () => void;
  change: (changes: Partial<Contact>) => void; remove: () => void; showErrors: boolean;
}) {
  const [touched, setTouched] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const list = useId()
  const error = showErrors || touched ? validateContact(contact) : null
  const Icon = contactIcons[contact.kind as keyof typeof contactIcons] ?? Link2
  const typeLabel = contactTypes[contact.kind as keyof typeof contactTypes] ?? 'Contato'
  const numberLabel = isPhoneKind(contact.kind) ? 'Número de telefone' : contact.kind === 'email' ? 'E-mail' : contact.kind === 'website' ? 'Website do contato' : 'Informação de contato'
  return <section className={`contact-form-card ${expanded ? 'expanded' : ''}`} aria-label={`Contato ${index + 1}`}>
    <div className="contact-card-heading"><span className="contact-kind-icon"><Icon size={19}/></span><div className="contact-card-title"><h3>{expanded ? `Contato ${index + 1}` : contact.label || typeLabel}</h3>{!expanded && <p>{displayContactValue(contact) || 'Contato incompleto'}</p>}</div>{contact.is_primary && <span className="primary-badge"><Check size={12}/>Principal</span>}<div className="contact-card-controls">{!expanded && <Button type="button" variant="ghost" aria-label={`Editar contato ${index + 1}`} onClick={edit}><Pencil size={16}/></Button>}<Button type="button" variant="ghost" aria-label={`Remover contato ${index + 1}`} onClick={() => { if (contact.value || contact.label) setConfirm(true); else remove() }}><Trash2 size={16}/></Button></div></div>
    {!expanded && error && <p className="field-error">{error}</p>}
    {expanded && <div className="contact-card-body">
      <ContactTypeSelector value={contact.kind} index={index} onChange={kind => { change({ kind }); setTouched(false) }}/>
      <Field label={`${numberLabel} ${index + 1}`} required error={error} hint={isPhoneKind(contact.kind) ? contact.kind === 'phone' ? 'Com DDD: (91) 3333-4444.' : 'Com DDD: (91) 98844-9970. Cole com ou sem pontuação.' : undefined}>
        {isPhoneKind(contact.kind) ? <PhoneInput value={contact.value} onValueChange={value => change({ value })} aria-label={`${numberLabel} ${index + 1}`} onBlur={() => setTouched(true)}/> :
          <input type={contact.kind === 'email' ? 'email' : 'text'} inputMode={contact.kind === 'email' ? 'email' : undefined} autoComplete={contact.kind === 'email' ? 'email' : 'off'} value={contact.value} maxLength={300} onChange={e => change({ value: e.target.value })} onBlur={() => setTouched(true)} placeholder={contact.kind === 'email' ? 'recepcao@clinica.com.br' : contact.kind === 'website' ? 'clinica.com.br' : 'Ex.: canal de atendimento'}/>}
      </Field>
      <Field label={`Identificação ${index + 1}`} hint="Escolha uma sugestão ou escreva sua própria descrição.">
        <input value={contact.label ?? ''} maxLength={200} list={list} onChange={e => change({ label: e.target.value })} placeholder="Ex.: Agendamento de consultas"/>
      </Field>
      <datalist id={list}>{['Recepção', 'Agendamento de consultas', 'Agendamento de exames', 'Atendimento geral', 'Financeiro', 'Emergência', 'Contato particular'].map(label => <option key={label} value={label}/>)}</datalist>
      <label className="check-label"><input type="checkbox" checked={contact.is_primary} onChange={e => change({ is_primary: e.target.checked })}/>Definir como contato principal</label>
      <details className="optional-details" open={contact.notes ? true : undefined}><summary>Observações opcionais <ChevronDown size={14}/></summary><Field label={`Observações do contato ${index + 1}`}><textarea rows={2} maxLength={5000} value={contact.notes ?? ''} onChange={e => change({ notes: e.target.value })}/></Field></details>
      <Button type="button" variant="outline" className="full" onClick={() => { setTouched(true); if (!validateContact(contact)) collapse() }}><Check size={17}/>Concluir contato {index + 1}</Button>
    </div>}
    {confirm && <Dialog title="Remover contato?" close={() => setConfirm(false)}><p>Remover {contact.label || typeLabel} {displayContactValue(contact)} deste formulário? A alteração será gravada ao salvar o cadastro.</p><div className="form-actions"><Button type="button" variant="outline" onClick={() => setConfirm(false)}>Manter contato</Button><Button type="button" onClick={() => { setConfirm(false); remove() }}>Remover contato</Button></div></Dialog>}
  </section>
}
