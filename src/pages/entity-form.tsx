import { useRef, useState } from 'react'
import { Link, useBeforeUnload, useBlocker, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Check, ChevronDown, ClipboardCheck, LoaderCircle, Plus, Save } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Loading } from '../components/feedback'
import { Dialog, QueryError } from '../components/network'
import { Field } from '../components/form-fields'
import { ContactFormCard } from '../components/contact-form-card'
import { AddressForm } from '../components/address-form'
import { FormStepper } from '../components/form-stepper'
import { EntityMultiSelect } from '../components/entity-select'
import { addressErrors, brazilStates, digitsOnly, normalizedContactValue, normalizeWebsite, validateContact } from '../lib/contact-utils'
import { categories, errorMessage, kinds, rpc, useEntity } from '../lib/network'
import type { Address, Category, Contact, Entity } from '../lib/network'

type ContactDraft = Contact & { _key: string }
type AddressDraft = Address & { _key: string }
type Draft = Omit<Entity, 'contacts' | 'addresses'> & { contacts: ContactDraft[]; addresses: AddressDraft[] }
function draftFrom(entity: Entity): Draft {
  return { ...entity, name: entity.name || '', active: entity.active !== false,
    contacts: (entity.contacts ?? []).map(c => ({ ...c, _key: crypto.randomUUID(), label: c.label ?? '', notes: c.notes ?? '' })),
    addresses: (entity.addresses ?? []).map(a => ({ ...a, _key: crypto.randomUUID(), postal_code: a.postal_code ?? '', street: a.street ?? '', number: a.number ?? '', complement: a.complement ?? '', neighborhood: a.neighborhood ?? '', city: a.city ?? '', state: a.state ?? '', reference: a.reference ?? '', is_primary: !!a.is_primary })),
  }
}
function persisted<T extends { _key: string }>(item: T): Omit<T, '_key'> { const { _key, ...data } = item; void _key; return data }

export function EntityFormPage({ category }: { category: Category }) {
  const { id } = useParams()
  const query = useEntity(category, id)
  if (id && query.isPending) return <Loading/>
  if (id && query.isError) return <QueryError error={query.error} retry={() => void query.refetch()}/>
  if (id && !query.data) return <section className="panel"><h1>Registro não encontrado ou acesso indisponível</h1><Link to="/cadastros">Voltar à minha rede</Link></section>
  return <EntityForm key={`${category}-${id ?? 'new'}`} category={category} initial={query.data ?? { name: '', kind: 'clinic', active: true, contacts: [], addresses: [], specialties: [], doctors: [], establishments: [], health_plans: [], favorite: false }}/>
}
function EntityForm({ category, initial }: { category: Category; initial: Entity }) {
  const [baseline] = useState(() => draftFrom(initial))
  const [value, setValue] = useState<Draft>(() => structuredClone(baseline))
  const [step, setStep] = useState(0)
  const [completed, setCompleted] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showErrors, setShowErrors] = useState(false)
  const [activeContact, setActiveContact] = useState<string | null>(null)
  const [activeAddress, setActiveAddress] = useState<string | null>(null)
  const navigate = useNavigate()
  const client = useQueryClient()
  const sending = useRef(false)
  const saved = useRef(false)
  const stepRef = useRef<HTMLDivElement>(null)
  const dirty = JSON.stringify(value) !== JSON.stringify(baseline)
  useBeforeUnload(e => { if (dirty && !saved.current) { e.preventDefault(); e.returnValue = '' } })
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !saved.current && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search))
  const isPlace = category === 'establishments'
  const isPerson = category === 'doctors'
  const complex = isPlace || isPerson
  const steps = isPlace ? ['Informações gerais', 'Contatos', 'Endereços', 'Especialidades', 'Médicos e convênios'] : isPerson ? ['Informações gerais', 'Contatos', 'Especialidades', 'Locais e convênios'] : ['Informações gerais']
  function patch(changes: Partial<Draft>) { setValue(v => ({ ...v, ...changes })); setError('') }
  function updateContact(index: number, changes: Partial<Contact>) {
    setValue(v => ({ ...v, contacts: v.contacts.map((c, i) => i === index ? { ...c, ...changes } : changes.is_primary ? { ...c, is_primary: false } : c) })); setError('')
  }
  function updateAddress(index: number, changes: Partial<Address>) {
    setValue(v => ({ ...v, addresses: v.addresses.map((a, i) => i === index ? { ...a, ...changes } : changes.is_primary ? { ...a, is_primary: false } : a) })); setError('')
  }
  const nameError = !value.name.trim() ? isPlace ? 'Informe o nome do estabelecimento.' : 'Informe o nome.' : value.name.trim().length > 200 ? 'Use até 200 caracteres.' : ''
  const websiteError = value.website && normalizeWebsite(value.website) === null ? 'Informe um domínio válido, como clinica.com.br.' : ''
  function stepIssue(index: number): string | null {
    if (index === 0) {
      if (nameError) return nameError
      if (isPlace && !kinds[value.kind ?? '']) return 'Selecione o tipo de estabelecimento.'
      if (websiteError) return websiteError
      if (isPerson && value.registration_state && !brazilStates.includes(value.registration_state)) return 'Confira a UF do CRM.'
    }
    if (complex && index === 1) {
      const invalid = value.contacts.find(c => validateContact(c))
      if (invalid) return validateContact(invalid)
    }
    if (isPlace && index === 2) {
      for (const address of value.addresses) { const issue = Object.values(addressErrors(address)).find(Boolean); if (issue) return issue }
    }
    return null
  }
  function revealIssue(index: number, message: string) {
    setShowErrors(true); setStep(index); setError(message)
    if (index === 1) setActiveContact(value.contacts.find(c => validateContact(c))?._key ?? null)
    if (isPlace && index === 2) setActiveAddress(value.addresses.find(a => Object.values(addressErrors(a)).some(Boolean))?._key ?? null)
    requestAnimationFrame(() => { stepRef.current?.scrollIntoView({ block: 'start' }); stepRef.current?.querySelector<HTMLElement>('[aria-invalid=true]')?.focus() })
  }
  function goStep(next: number) {
    if (busy || next < 0 || next >= steps.length) return
    if (next > step) { const issue = stepIssue(step); if (issue) { revealIssue(step, issue); return } setCompleted(v => [...new Set([...v, step])]) }
    setStep(next); setError(''); setShowErrors(false)
    requestAnimationFrame(() => stepRef.current?.scrollIntoView({ block: 'start' }))
  }
  async function save() {
    if (sending.current) return
    for (let i = 0; i < steps.length; i++) { const issue = stepIssue(i); if (issue) { revealIssue(i, issue); return } }
    sending.current = true; setBusy(true); setError('')
    try {
      const payload = { ...value, name: value.name.trim(), website: normalizeWebsite(value.website ?? '') || '',
        contacts: value.contacts.map(c => ({ ...persisted(c), value: normalizedContactValue(c) })),
        addresses: value.addresses.map(a => ({ ...persisted(a), postal_code: digitsOnly(a.postal_code) })),
      }
      const id = await rpc<string>('save_network_entity', { p_type: category, p_id: value.id ?? null, p_data: payload })
      saved.current = true
      await client.invalidateQueries()
      navigate(`${categories[category].path}/${id}`, { replace: true, state: { message: value.id ? 'Cadastro atualizado com sucesso.' : 'Cadastro criado com sucesso.' } })
    } catch (e) { setError(errorMessage(e)) } finally { sending.current = false; setBusy(false) }
  }
  function addContact() {
    const contact: ContactDraft = { _key: crypto.randomUUID(), kind: 'whatsapp', label: '', value: '', notes: '', is_primary: value.contacts.length === 0 }
    patch({ contacts: [...value.contacts, contact] }); setActiveContact(contact._key)
  }
  function addAddress() {
    const address: AddressDraft = { _key: crypto.randomUUID(), postal_code: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '', reference: '', is_primary: value.addresses.length === 0 }
    patch({ addresses: [...value.addresses, address] }); setActiveAddress(address._key)
  }
  const summary: [string, number, number][] = [
    ['Contatos', value.contacts.length, 1], ...(isPlace ? [['Endereços', value.addresses.length, 2] as [string, number, number]] : []),
    ['Especialidades', value.specialties?.length ?? 0, isPlace ? 3 : 2],
    [isPlace ? 'Médicos' : 'Locais', (isPlace ? value.doctors : value.establishments)?.length ?? 0, isPlace ? 4 : 3],
    ['Convênios', value.health_plans?.length ?? 0, isPlace ? 4 : 3],
  ]
  return <>
    <Link className="form-back" to={categories[category].path}><ArrowLeft size={16}/>Voltar para {categories[category].title.toLowerCase()}</Link>
    <div className="page-heading form-page-heading"><span className="eyebrow">SUA REDE, SEM COMPLICAÇÃO</span><h1>{value.id ? 'Editar' : 'Cadastrar'} {categories[category].singular.toLowerCase()}</h1><p>Comece pelo essencial. Os demais detalhes são opcionais.</p></div>
    <section className="panel unified-form" ref={stepRef}>
      <FormStepper steps={steps} current={step} completed={completed} navigate={goStep} disabled={busy}/>
      <form noValidate onSubmit={e => { e.preventDefault(); void save() }}>
        <fieldset disabled={busy} className="form-step-content">
          <div className="step-section-heading"><h2>{steps[step]}</h2><p>{step === 0 ? 'Campos com * são obrigatórios.' : step === 1 ? 'Organize recepção, consultas e exames. Adicione quantos contatos precisar.' : isPlace && step === 2 ? 'Consulte o CEP ou preencha o endereço manualmente.' : 'Selecione registros existentes ou crie novos sem sair deste cadastro.'}</p></div>
          {step === 0 && <>
            <Field label={isPlace ? 'Nome do estabelecimento' : `${categories[category].singular} — nome`} required error={showErrors ? nameError : undefined}><input value={value.name} autoComplete="organization" maxLength={200} required onChange={e => patch({ name: e.target.value })} placeholder={isPlace ? 'Ex.: Clínica Bem Viver' : 'Nome do cadastro'}/></Field>
            {isPlace && <><div className="form-grid"><Field label="Tipo de estabelecimento" required><select value={value.kind ?? 'clinic'} onChange={e => patch({ kind: e.target.value })}>{Object.entries(kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field><Field label="Nome fantasia"><input value={value.trade_name ?? ''} maxLength={200} onChange={e => patch({ trade_name: e.target.value })} placeholder="Se diferente do nome principal"/></Field></div><Field label="Website" error={showErrors ? websiteError : undefined} hint="Pode informar somente o domínio. Ex.: clinica.com.br"><input inputMode="url" autoComplete="url" value={value.website ?? ''} maxLength={300} onChange={e => patch({ website: e.target.value })} placeholder="clinica.com.br"/></Field></>}
            {isPerson && <div className="form-grid"><Field label="Conselho profissional"><input value={value.professional_council ?? ''} maxLength={20} onChange={e => patch({ professional_council: e.target.value })} placeholder="CRM"/></Field><Field label="Número do CRM"><input value={value.registration_number ?? ''} maxLength={30} onChange={e => patch({ registration_number: e.target.value })}/></Field><Field label="UF do CRM"><select value={value.registration_state ?? ''} onChange={e => patch({ registration_state: e.target.value })}><option value="">Selecione</option>{brazilStates.map(uf => <option key={uf} value={uf}>{uf}</option>)}</select></Field></div>}
            {(isPlace || category === 'specialties') && <Field label="Descrição"><textarea rows={2} maxLength={5000} value={value.description ?? ''} onChange={e => patch({ description: e.target.value })} placeholder="Uma breve descrição"/></Field>}
            {category !== 'specialties' && <Field label="Observações"><textarea rows={2} maxLength={5000} value={value.notes ?? ''} onChange={e => patch({ notes: e.target.value })} placeholder="Informações úteis para consultar depois"/></Field>}
            <div className="check-row"><label className="check-label"><input type="checkbox" checked={value.active !== false} onChange={e => patch({ active: e.target.checked })}/>Cadastro ativo</label>{complex && <label className="check-label"><input type="checkbox" checked={!!value.favorite} onChange={e => patch({ favorite: e.target.checked })}/>Favorito</label>}</div>
          </>}
          {complex && step === 1 && <div className="contact-collection">
            {!value.contacts.length && <div className="inline-empty"><strong>Como entrar em contato?</strong><p>Adicione um telefone, WhatsApp ou e-mail. Você também pode completar depois.</p></div>}
            {value.contacts.map((contact, index) => <ContactFormCard key={contact._key} contact={contact} index={index} expanded={activeContact === contact._key} edit={() => setActiveContact(contact._key)} collapse={() => setActiveContact(null)} showErrors={showErrors} change={changes => updateContact(index, changes)} remove={() => patch({ contacts: value.contacts.filter(c => c._key !== contact._key) })}/>)}
            <Button type="button" variant="outline" className="add-item-button" onClick={addContact}><Plus size={18}/>Adicionar contato</Button>
          </div>}
          {isPlace && step === 2 && <div className="address-collection">
            {!value.addresses.length && <div className="inline-empty"><strong>Onde fica o estabelecimento?</strong><p>Salve o endereço para abrir o mapa em um toque.</p></div>}
            {value.addresses.map((address, index) => <AddressForm key={address._key} address={address} index={index} expanded={activeAddress === address._key} edit={() => setActiveAddress(address._key)} collapse={() => setActiveAddress(null)} showErrors={showErrors} change={changes => updateAddress(index, changes)} remove={() => patch({ addresses: value.addresses.filter(a => a._key !== address._key) })}/>)}
            <Button type="button" variant="outline" className="add-item-button" onClick={addAddress}><Plus size={18}/>{value.addresses.length ? 'Adicionar outro endereço' : 'Adicionar endereço'}</Button>
          </div>}
          {complex && step === (isPlace ? 3 : 2) && <EntityMultiSelect category="specialties" value={value.specialties ?? []} change={specialties => patch({ specialties })}/>}
          {complex && step === (isPlace ? 4 : 3) && <><EntityMultiSelect category={isPlace ? 'doctors' : 'establishments'} value={(isPlace ? value.doctors : value.establishments) ?? []} change={items => patch(isPlace ? { doctors: items } : { establishments: items })} notes/><EntityMultiSelect category="health_plans" value={value.health_plans ?? []} change={health_plans => patch({ health_plans })} notes/></>}
        </fieldset>
        {error && <p role="alert" className="notice field-error">{error}</p>}
        {complex && <details className="compact-review"><summary><ClipboardCheck size={17}/>Resumo do cadastro<ChevronDown size={16}/></summary><div className="review-content"><button type="button" onClick={() => goStep(0)}><strong>{value.name || 'Nome ainda não informado'}</strong><span>{isPlace ? kinds[value.kind ?? 'clinic'] : categories[category].singular} · Editar</span></button><div className="review-counts">{summary.map(([label, count, target]) => <button type="button" key={label} onClick={() => goStep(target)}><strong>{count}</strong><span>{label}</span></button>)}</div></div></details>}
        <div className="form-actionbar">
          <div className="step-navigation"><Button type="button" variant="outline" disabled={busy || step === 0} onClick={() => goStep(step - 1)}><ArrowLeft size={16}/>Voltar</Button>{step < steps.length - 1 && <Button type="button" disabled={busy} onClick={() => goStep(step + 1)}>Continuar<ArrowRight size={16}/></Button>}{step === steps.length - 1 && <span className="ready-to-save"><Check size={15}/>Pronto para salvar</span>}</div>
          <Button type="submit" className="save-registration" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18}/> : <Save size={18}/>}<span>{busy ? 'Salvando…' : `Salvar ${categories[category].singular.toLowerCase()}`}</span></Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => navigate(categories[category].path)}>Cancelar</Button>
        </div>
      </form>
    </section>
    {blocker.state === 'blocked' && <Dialog title="Alterações não salvas" close={() => blocker.reset()}><p>Há alterações não salvas. Deseja sair e descartá-las?</p><div className="form-actions"><Button type="button" variant="outline" onClick={() => blocker.reset()}>Continuar editando</Button><Button type="button" onClick={() => blocker.proceed()}>Descartar e sair</Button></div></Dialog>}
  </>
}
