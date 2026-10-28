import { useEffect, useId, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Check, Plus, Search, X } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, QueryError } from './network'
import { Field } from './form-fields'
import { categories, normalize, useNetwork } from '../lib/network'
import type { Category, Entity } from '../lib/network'

export function EntityMultiSelect({ category, value, change, notes = false }: {
  category: Category; value: Entity[]; change: (items: Entity[]) => void; notes?: boolean;
}) {
  const id = useId()
  const [term, setTerm] = useState('')
  const [search, setSearch] = useState('')
  const [focused, setFocused] = useState(false)
  const [quick, setQuick] = useState(false)
  const [draft, setDraft] = useState<Entity>({ name: '', specialties: [] })
  useEffect(() => { const timer = setTimeout(() => setSearch(term), 250); return () => clearTimeout(timer) }, [term])
  const query = useNetwork({ category, q: search }, 1, 20)
  const open = focused || !!term
  function add(entity: Entity) {
    if (!value.some(item => entity.id ? item.id === entity.id : normalize(item.name) === normalize(entity.name))) change([...value, entity])
    setTerm(''); setFocused(false)
  }
  function keyboard(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      const first = query.data?.items.find(({ data }) => !value.some(v => v.id === data.id))
      if (term && first) add(first.data)
    } else if (event.key === 'Escape') { setTerm(''); setFocused(false) }
    else if (event.key === 'ArrowDown') {
      event.preventDefault(); setFocused(true)
      requestAnimationFrame(() => document.getElementById(`${id}-options`)?.querySelector<HTMLButtonElement>('[role=option]:not(:disabled)')?.focus())
    }
  }
  const title = categories[category].title
  return <div className="multi-select" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setFocused(false) }}>
    <label htmlFor={id}>Buscar {title.toLowerCase()}</label>
    <div className="selector-search"><Search size={17}/><input id={id} role="combobox" aria-expanded={open} aria-controls={open ? `${id}-options` : undefined} aria-autocomplete="list" onKeyDown={keyboard} value={term} onFocus={() => setFocused(true)} onChange={e => setTerm(e.target.value)} placeholder={`Pesquisar ${title.toLowerCase()}`}/></div>
    {open && <div role="listbox" id={`${id}-options`} aria-label={title} className="lookup-options">
      {query.isPending ? <p>Buscando…</p> : query.isError ? <QueryError error={query.error} retry={() => void query.refetch()}/> : query.data.items.map(({ data: entity }) => {
        const selected = value.some(item => item.id === entity.id || normalize(item.name) === normalize(entity.name))
        return <button type="button" role="option" aria-selected={selected} disabled={selected} key={entity.id} onClick={() => add(entity)}><span>{entity.name}</span>{selected ? <Check size={16}/> : <Plus size={16}/>}</button>
      })}
      {query.isSuccess && !query.data.items.length && <p>Nenhum cadastro encontrado. Você pode criar um novo abaixo.</p>}
    </div>}
    <div className="chips">{value.map((entity, index) => <div className={notes ? 'association-selection' : 'selection-inline'} key={entity.id ?? `${entity.name}-${index}`}>
      <span className="chip">{entity.name}{!entity.id && <small>novo</small>}<button type="button" aria-label={`Remover ${entity.name}`} onClick={() => change(value.filter((_, i) => i !== index))}><X size={14}/></button></span>
      {notes && <details className="association-notes" open={entity.link_notes ? true : undefined}><summary>{category === 'health_plans' ? 'Cobertura e atendimento' : 'Dias, horários e atendimento'}</summary><Field label={`Observações de atendimento — ${entity.name}`} hint={category === 'health_plans' ? 'Informações sobre a aceitação neste local ou profissional.' : 'Ex.: terças, das 8h às 12h; sala 204.'}><textarea rows={2} value={entity.link_notes ?? ''} maxLength={5000} onChange={e => change(value.map((item, i) => i === index ? { ...item, link_notes: e.target.value } : item))}/></Field></details>}
    </div>)}</div>
    {category !== 'establishments' && <Button type="button" variant="ghost" className="quick-create" onClick={() => { setDraft({ name: term, specialties: [], contacts: [], active: true }); setQuick(true); setFocused(false) }}><Plus size={16}/>Cadastro rápido de {categories[category].singular.toLowerCase()}</Button>}
    {quick && <Dialog title={`Cadastro rápido: ${categories[category].singular}`} close={() => setQuick(false)}>
      <Field label="Nome" required><input value={draft.name} maxLength={200} onChange={e => setDraft({ ...draft, name: e.target.value })}/></Field>
      {category === 'doctors' && <><div className="form-grid"><Field label="CRM"><input value={draft.registration_number ?? ''} onChange={e => setDraft({ ...draft, registration_number: e.target.value, professional_council: 'CRM' })}/></Field><Field label="UF do CRM"><input maxLength={2} value={draft.registration_state ?? ''} onChange={e => setDraft({ ...draft, registration_state: e.target.value.toUpperCase() })}/></Field></div><EntityMultiSelect category="specialties" value={draft.specialties ?? []} change={specialties => setDraft({ ...draft, specialties })}/></>}
      <p className="field-hint">Será gravado junto com o cadastro principal. Nenhum dado preenchido será perdido.</p>
      <Button type="button" className="full" disabled={!draft.name.trim() || value.some(item => normalize(item.name) === normalize(draft.name))} onClick={() => { add({ ...draft, name: draft.name.trim() }); setQuick(false) }}>Adicionar ao formulário</Button>
    </Dialog>}
  </div>
}
