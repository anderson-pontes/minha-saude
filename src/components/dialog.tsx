import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Button } from './ui/button'

export function Dialog({ title, children, close, className = '', dismissOnOutside = false }: { title: string; children: ReactNode; close: () => void; className?: string; dismissOnOutside?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const dialog=ref.current!
    if (!opener.current && document.activeElement instanceof HTMLElement && !dialog.contains(document.activeElement)) opener.current=document.activeElement
    dialog.showModal()
    return () => {
      dialog.close()
      queueMicrotask(() => {
        const modal=document.querySelector('dialog[open]')
        if (opener.current?.isConnected && (!modal || modal.contains(opener.current))) opener.current.focus({preventScroll:true})
      })
    }
  },[])
  return <dialog ref={ref} className={`network-dialog ${className}`} aria-label={title} onCancel={event => { event.preventDefault(); close() }} onClick={event => {
    if (!dismissOnOutside || event.target !== event.currentTarget) return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close()
  }}><div className="section-title"><h2>{title}</h2><Button type="button" variant="ghost" onClick={close} aria-label="Fechar">✕</Button></div>{children}</dialog>
}
