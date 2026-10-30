import { useRef, useState } from 'react'
import type { ComponentProps, ClipboardEvent } from 'react'
import { IMaskInput } from 'react-imask'
import { digitsOnly, isInternationalPhone, normalizePhone } from '../lib/contact-utils'

type InputProps = Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & { value: string; onValueChange: (value: string) => void }
export function PhoneInput({ value, onValueChange, ...props }: InputProps) {
  const [foreign, setForeign] = useState(() => isInternationalPhone(value) || digitsOnly(value).length > 13)
  const input = useRef<HTMLInputElement>(null)
  const normalized = value.trim() === '+' ? '+' : normalizePhone(value)
  const international = foreign || isInternationalPhone(value)
  const inputValue = international && normalized && !normalized.startsWith('+') ? `+${[10,11].includes(normalized.length) ? '55' : ''}${normalized}` : normalized
  function paste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text')
    const number = normalizePhone(pasted)
    // IMask handles normal edits/cursor. Full-number paste is normalized before masking.
    if (!/^[+\d\s().-]+$/.test(pasted.trim())) return
    if (digitsOnly(pasted).length < 10 && !/^\s*(\+|00)/.test(pasted)) return
    event.preventDefault()
    const needsForeign = number.startsWith('+') || number.length > 11
    setForeign(needsForeign)
    onValueChange(needsForeign && !number.startsWith('+') ? `+${number}` : number)
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(input.current.value.length, input.current.value.length) })
  }
  return <div className="phone-input-group">
    {international ? <IMaskInput {...props} key="international" inputRef={input} type="text" inputMode="tel" autoComplete="tel" value={inputValue} mask={/^\+?\d{0,15}$/} unmask={true}
      onAccept={number => { const next = String(number) === '+' ? '+' : normalizePhone(String(number)); if (next !== normalized) onValueChange(next) }} onPaste={paste} placeholder="+44 20 7946 0018"/>
      : <IMaskInput {...props} key="br" inputRef={input} type="text" inputMode="tel" autoComplete="tel" value={inputValue} mask={[{ mask: '(00) 0000-0000' }, { mask: '(00) 00000-0000' }]} unmask={true}
        onAccept={number => { if (String(number) !== normalized) onValueChange(String(number)) }} onPaste={paste} onKeyDown={event => {
          props.onKeyDown?.(event)
          if (event.key === '+') { event.preventDefault(); setForeign(true); onValueChange('+'); requestAnimationFrame(() => input.current?.focus()) }
        }} onBeforeInput={event => {
          if ((event.nativeEvent as InputEvent).data === '+') { event.preventDefault(); setForeign(true); onValueChange('+'); requestAnimationFrame(() => input.current?.focus()) }
        }} placeholder={props.placeholder || '(91) 98844-9970'}/>}
    <label className="phone-region"><span>Formato</span><select aria-label={`Formato de ${props['aria-label'] || 'telefone'}`} value={international ? 'international' : 'br'} onChange={e => {
      const next = e.target.value === 'international'; setForeign(next)
      onValueChange(next ? (normalized.startsWith('+') ? normalized : normalized ? `+55${normalized}` : '+') : digitsOnly(normalized.replace(/^\+55/, '')))
    }}><option value="br">Brasil (+55)</option><option value="international">Internacional (com DDI)</option></select></label>
  </div>
}
export function CepInput({ value, onValueChange, ...props }: InputProps) {
  return <IMaskInput {...props} type="text" inputMode="numeric" autoComplete="postal-code" mask="00000-000" value={digitsOnly(value)} unmask={true}
    onAccept={number => { if (String(number) !== digitsOnly(value)) onValueChange(String(number)) }} placeholder="00000-000"/>
}
