import { useEffect, useRef, useState } from 'react'
import { Check, LoaderCircle, MapPin, Pencil, Trash2 } from 'lucide-react'
import { Button } from './ui/button'
import { Field } from './form-fields'
import { CepInput } from './masked-inputs'
import { Dialog } from './network'
import { addressErrors, brazilStates, digitsOnly, formatCep } from '../lib/contact-utils'
import type { Address } from '../lib/network'

export function AddressForm({ address, index, change, remove, expanded, edit, collapse, showErrors }: {
  address: Address; index: number; change: (changes: Partial<Address>) => void; remove: () => void;
  expanded: boolean; edit: () => void; collapse: () => void; showErrors: boolean;
}) {
  const [status, setStatus] = useState<{ busy: boolean; message: string }>({ busy: false, message: '' })
  const [attempt, setAttempt] = useState(0)
  const [touched, setTouched] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const latest = useRef({ address, change })
  useEffect(() => { latest.current = { address, change } }, [address, change])
  const cep = digitsOnly(address.postal_code)
  // Existing saved addresses keep manual corrections until the CEP changes or a retry is requested.
  const originalCep = useRef(cep)
  useEffect(() => {
    if (cep.length !== 8 || (cep === originalCep.current && !attempt)) return
    const controller = new AbortController()
    let active = true
    let timeout: ReturnType<typeof setTimeout>
    const timer = setTimeout(async () => {
      const baseline = { ...latest.current.address }
      setStatus({ busy: true, message: 'Consultando CEP…' })
      timeout = setTimeout(() => controller.abort(), 8000)
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: controller.signal })
        if (!response.ok) throw new Error('network')
        const data = await response.json()
        if (!active) return
        if (data.erro) { setStatus({ busy: false, message: 'CEP não encontrado. Confira o número ou preencha o endereço manualmente.' }); return }
        const fields = { street: data.logradouro, neighborhood: data.bairro, city: data.localidade, state: data.uf } as Record<string, unknown>
        const changes: Partial<Address> = {}
        for (const key of ['street', 'neighborhood', 'city', 'state'] as const) {
          if (typeof fields[key] === 'string' && fields[key] && latest.current.address[key] === baseline[key]) changes[key] = fields[key] as string
        }
        latest.current.change(changes)
        setStatus({ busy: false, message: 'CEP consultado. Confira o endereço e complete o número.' })
      } catch {
        if (active) setStatus({ busy: false, message: 'Consulta indisponível. Preencha o endereço manualmente; você pode salvar normalmente.' })
      } finally { clearTimeout(timeout) }
    }, 350)
    return () => { active = false; clearTimeout(timer); clearTimeout(timeout); controller.abort() }
  }, [cep, attempt])
  const errors = addressErrors(address)
  const validate = (key: keyof typeof errors) => showErrors || touched ? errors[key] : undefined
  return <section className={`address-form-card ${expanded ? 'expanded' : ''}`} aria-label={`Endereço ${index + 1}`}>
    <div className="contact-card-heading"><span className="contact-kind-icon"><MapPin size={19}/></span><div className="contact-card-title"><h3>{expanded ? `Endereço ${index + 1}` : address.street || `Endereço ${index + 1}`}</h3>{!expanded && <p>{[address.number, address.neighborhood, address.city, address.state, formatCep(address.postal_code)].filter(Boolean).join(' · ')}</p>}</div>{address.is_primary && <span className="primary-badge">Principal</span>}<div className="contact-card-controls">{!expanded && <Button type="button" variant="ghost" aria-label={`Editar endereço ${index + 1}`} onClick={edit}><Pencil size={16}/></Button>}<Button type="button" variant="ghost" aria-label={`Remover endereço ${index + 1}`} onClick={() => { if (address.street || address.city || address.postal_code) setConfirm(true); else remove() }}><Trash2 size={16}/></Button></div></div>
    {expanded && <div className="address-card-body">
      <div className="cep-row"><Field label={`CEP ${index + 1}`} error={validate('postal_code')} hint="Preenchimento automático ao completar oito dígitos."><CepInput value={address.postal_code} onValueChange={postal_code => change({ postal_code })}/></Field><Button type="button" variant="outline" disabled={status.busy || cep.length !== 8} onClick={() => setAttempt(n => n + 1)}>{status.busy ? <LoaderCircle className="spin" size={17}/> : 'Consultar CEP'}</Button></div>
      {status.message && <p role="status" className="cep-status">{status.message}</p>}
      <div className="form-grid address-fields">
        <Field label={`Logradouro ${index + 1}`} required error={validate('street')}><input autoComplete="address-line1" value={address.street} maxLength={300} onChange={e => change({ street: e.target.value })}/></Field>
        <Field label={`Número ${index + 1}`}><input value={address.number} maxLength={30} onChange={e => change({ number: e.target.value })} placeholder="Ex.: 120 ou s/n"/></Field>
        <Field label={`Complemento ${index + 1}`}><input autoComplete="address-line2" value={address.complement} maxLength={200} onChange={e => change({ complement: e.target.value })} placeholder="Sala, bloco, andar…"/></Field>
        <Field label={`Bairro ${index + 1}`}><input value={address.neighborhood} maxLength={200} onChange={e => change({ neighborhood: e.target.value })}/></Field>
        <Field label={`Cidade ${index + 1}`} required error={validate('city')}><input autoComplete="address-level2" value={address.city} maxLength={200} onChange={e => change({ city: e.target.value })}/></Field>
        <Field label={`UF ${index + 1}`} required error={validate('state')}><select autoComplete="address-level1" value={address.state} onChange={e => change({ state: e.target.value })}><option value="">Selecione</option>{brazilStates.map(uf => <option key={uf} value={uf}>{uf}</option>)}</select></Field>
      </div>
      <Field label={`Referência ${index + 1}`}><input value={address.reference} maxLength={300} onChange={e => change({ reference: e.target.value })} placeholder="Ex.: próximo à estação"/></Field>
      <label className="check-label"><input type="checkbox" checked={address.is_primary} onChange={e => change({ is_primary: e.target.checked })}/>Endereço principal</label>
      <Button type="button" variant="outline" className="full" onClick={() => { setTouched(true); if (!Object.values(errors).some(Boolean)) collapse() }}><Check size={17}/>Concluir endereço {index + 1}</Button>
    </div>}
    {confirm && <Dialog title="Remover endereço?" close={() => setConfirm(false)}><p>Remover este endereço do formulário? A alteração será gravada ao salvar o cadastro.</p><div className="form-actions"><Button type="button" variant="outline" onClick={() => setConfirm(false)}>Manter endereço</Button><Button type="button" onClick={() => { setConfirm(false); remove() }}>Remover endereço</Button></div></Dialog>}
  </section>
}
