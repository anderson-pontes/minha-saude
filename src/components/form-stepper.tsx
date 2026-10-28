import { Building2, Check, HeartHandshake, MapPin, Phone, Tags } from 'lucide-react'

export function FormStepper({ steps, current, completed, navigate, disabled }: {
  steps: string[]; current: number; completed: number[]; navigate: (step: number) => void; disabled: boolean;
}) {
  return <div className="professional-stepper">
    <div className="mobile-step-heading" aria-live="polite"><span>Etapa {current + 1} de {steps.length}</span><strong>{steps[current]}</strong></div>
    <nav className="form-steps" aria-label="Etapas do cadastro">{steps.map((step, index) => {
      const Icon = step === 'Contatos' ? Phone : step === 'Endereços' ? MapPin : step === 'Especialidades' ? Tags : index === 0 ? Building2 : HeartHandshake
      return <button type="button" key={step} disabled={disabled} aria-current={current === index ? 'step' : undefined} onClick={() => navigate(index)} className={completed.includes(index) && index !== current ? 'step-completed' : ''}>
        <span className="step-icon">{completed.includes(index) && index !== current ? <Check size={18}/> : <Icon size={18}/>}</span><span>{index + 1}. {step}</span>
      </button>
    })}</nav>
    <div className="step-progress"><progress value={current + 1} max={steps.length} aria-label={`Etapa ${current + 1} de ${steps.length}: ${steps[current]}`}/><span className="desktop-step-count">{current + 1}/{steps.length}</span></div>
  </div>
}
