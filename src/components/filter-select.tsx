import { useCallback, useId, useRef, useState, type KeyboardEvent } from 'react'
import * as Popover from '@radix-ui/react-popover'
import * as Select from '@radix-ui/react-select'
import { Check, ChevronDown, LoaderCircle, X } from 'lucide-react'

type Option = { value: string; label: string; disabled?: boolean }
type Pagination = {loaded:number;total:number|null;hasMore:boolean;loading:boolean;error:boolean;loadMore:()=>void}
type Props = {
  label: string; value: string; onValueChange: (value: string) => void; options: Option[]
  placeholder?: string; disabled?: boolean; loading?: boolean; searchable?: boolean
  clearable?: boolean; emptyMessage?: string; 'aria-label'?: string; valueLabel?: string
  search?: string; onSearchChange?: (value: string) => void; onOpenChange?: (open: boolean) => void
  error?: boolean; retry?: () => void
  pagination?: Pagination; pinSelected?: boolean
}

/** Keep portals in the native dialog top layer, outside the scrolling form. */
export function FilterSelect({ label, value, onValueChange, options, placeholder = 'Todos', disabled,
  loading, searchable = false, clearable = true, emptyMessage = 'Nenhuma opção encontrada',
  'aria-label': ariaLabel, valueLabel, search, onSearchChange, onOpenChange, error, retry, pagination, pinSelected }: Props) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [localSearch, setLocalSearch] = useState('')
  const [index, setIndex] = useState(0)
  const trigger = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const boundary = container?.querySelector('.filter-scroll, .appointment-form-scroll') ?? undefined
  const term = search ?? localSearch
  const visible = onSearchChange ? options : options.filter(o => o.label.toLocaleLowerCase().includes(term.toLocaleLowerCase()))
  const pinned=pinSelected&&value&&valueLabel&&!visible.some(o=>o.value===value)?{value,label:valueLabel}:null
  const results=pinned?[pinned,...visible]:visible
  const choices: Option[] = clearable ? [{ value: '', label: placeholder }, ...results] : results
  const selectChoices: Option[] = clearable ? [{ value: '', label: placeholder }, ...options] : options
  const name = value ? valueLabel ?? options.find(o => o.value === value)?.label ?? 'Selecionado' : placeholder
  function changeSearch(next: string) { setLocalSearch(next); onSearchChange?.(next); setIndex(0) }
  function changeOpen(next: boolean) {
    if (next) setContainer(trigger.current?.closest('dialog') ?? document.body)
    setOpen(next); onOpenChange?.(next)
    if (!next) changeSearch('')
  }
  function choose(next: string) { onValueChange(next); changeOpen(false) }
  const containWheel=useCallback((node:HTMLDivElement|null)=>{
    if(!node)return
    const wheel=(event:WheelEvent)=>{
      if(event.ctrlKey)return
      const list=node.querySelector<HTMLElement>('.filter-select-options')
      const inside=!!list&&event.target instanceof Node&&list.contains(event.target)
      if(!inside||!list||list.scrollHeight<=list.clientHeight||(event.deltaY<0&&list.scrollTop<=0)||(event.deltaY>0&&list.scrollTop+list.clientHeight>=list.scrollHeight-1))event.preventDefault()
      event.stopPropagation()
    }
    node.addEventListener('wheel',wheel,{passive:false})
    return()=>node.removeEventListener('wheel',wheel)
  },[])
  function navigate(event: KeyboardEvent<HTMLInputElement>) {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      let next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : Math.max(0, Math.min(choices.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))
      while (choices[next]?.disabled && next > 0 && next < choices.length - 1) next += event.key === 'ArrowUp' ? -1 : 1
      setIndex(next)
      document.getElementById(`${id}-option-${next}`)?.scrollIntoView({ block: 'nearest' })
    }
    if (event.key === 'Enter') { event.preventDefault(); const option=choices[index]; if (!loading && option && !option.disabled) choose(option.value) }
  }
  const icon = <ChevronDown size={16}/>
  const feedback = <>{loading && <small role="status"><LoaderCircle size={14} className="spin"/> Buscando opções…</small>}{error ? <button type="button" className="lookup-retry" onClick={retry}>Falha ao buscar. Tentar novamente</button> : !loading && visible.length === 0 && <small role="status">{emptyMessage}</small>}</>
  return <div className="field filter-select-field"><label htmlFor={id}>{label}</label><div className="filter-select-control">
    {searchable ? <Popover.Root open={open} onOpenChange={changeOpen}>
      <Popover.Trigger asChild><button ref={trigger} id={id} type="button" role="combobox" aria-haspopup="listbox" aria-label={ariaLabel ?? label} aria-expanded={open} aria-controls={`${id}-list`} disabled={disabled} className={`filter-select-trigger ${value ? '' : 'is-placeholder'}`} onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();changeOpen(true)}}}><span>{name}</span>{icon}</button></Popover.Trigger>
      <Popover.Portal container={container}><Popover.Content ref={containWheel} className={`filter-select-popup ${pagination?'is-paginated':''}`} align="start" sideOffset={6} collisionPadding={8} collisionBoundary={boundary}
        onOpenAutoFocus={e => { e.preventDefault(); input.current?.focus() }}
        onEscapeKeyDown={e => { e.preventDefault(); e.stopPropagation(); changeOpen(false) }}>
        <input ref={input} className="filter-select-search" aria-label={`Pesquisar ${label}`} placeholder="Pesquisar…" value={term} onChange={e => changeSearch(e.target.value)} onKeyDown={navigate} role="combobox" aria-expanded="true" aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={`${id}-option-${index}`}/>
        <div className="filter-select-options" role="listbox" tabIndex={-1} id={`${id}-list`} aria-label={`Opções de ${label}`} aria-busy={loading}>
          {choices.map((o, i) => <div id={`${id}-option-${i}`} key={o.value} role="option" aria-selected={value === o.value} aria-disabled={o.disabled || (loading && !!o.value)} className={`filter-select-option ${i === index ? 'highlighted' : ''}`} onPointerMove={() => setIndex(i)} onMouseDown={e => e.preventDefault()} onClick={() => { if (!o.disabled && (!loading || !o.value)) choose(o.value) }}><span>{o.label}{pinned?.value===o.value&&<span className="filter-selected-caption">Selecionado</span>}</span>{value === o.value && <Check size={15}/>}</div>)}
          {feedback}
        </div>{pagination&&<footer className="filter-select-pagination"><span role="status">{pagination.total===null?(error?'Consulta indisponível.':'Consultando registros…'):`Exibindo ${pagination.loaded} de ${pagination.total}`}</span>{pagination.error&&<span role="alert">Não foi possível carregar mais opções.</span>}{pagination.hasMore&&<button type="button" onMouseDown={e=>e.preventDefault()} disabled={loading||pagination.loading} onClick={pagination.loadMore}>{pagination.loading?'Carregando…':pagination.error?'Tentar novamente':'Exibir mais 20'}</button>}</footer>}
      </Popover.Content></Popover.Portal>
    </Popover.Root> : <Select.Root value={`v:${value}`} onValueChange={next => choose(next.slice(2))} open={open} onOpenChange={changeOpen} disabled={disabled}>
      <Select.Trigger ref={trigger} id={id} aria-label={ariaLabel ?? label} className={`filter-select-trigger ${value ? '' : 'is-placeholder'}`}><Select.Value>{name}</Select.Value><Select.Icon>{icon}</Select.Icon></Select.Trigger>
      <Select.Portal container={container}><Select.Content ref={containWheel} className="filter-select-popup filter-select-conventional" position="popper" align="start" sideOffset={6} collisionPadding={8} collisionBoundary={boundary} onEscapeKeyDown={e => { e.preventDefault(); e.stopPropagation(); changeOpen(false) }}>
        <Select.Viewport className="filter-select-options">{selectChoices.map(o => <Select.Item key={o.value} value={`v:${o.value}`} disabled={o.disabled} className="filter-select-option"><Select.ItemText>{o.label}</Select.ItemText><Select.ItemIndicator><Check size={15}/></Select.ItemIndicator></Select.Item>)}</Select.Viewport>{feedback}
      </Select.Content></Select.Portal>
    </Select.Root>}{clearable && value && <button type="button" className="filter-select-clear" disabled={disabled} aria-label={`Limpar ${label}`} onClick={() => onValueChange('')}><X size={14}/></button>}
  </div></div>
}
