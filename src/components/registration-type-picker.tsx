import { useId } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Building2, HeartHandshake, Stethoscope, Tags } from 'lucide-react'
import { Dialog } from './network'
import { categories } from '../lib/network'

const options = [
  { category: 'establishments', Icon: Building2, color: 'teal', description: 'Clínicas, hospitais, laboratórios e consultórios.' },
  { category: 'doctors', Icon: Stethoscope, color: 'blue', description: 'Profissionais, especialidades e locais de atendimento.' },
  { category: 'specialties', Icon: Tags, color: 'purple', description: 'Áreas médicas para organizar sua rede.' },
  { category: 'health_plans', Icon: HeartHandshake, color: 'cyan', description: 'Planos e redes de atendimento.' },
] as const
export function RegistrationTypePicker({ close }: { close: () => void }) {
  const id = useId()
  return <Dialog title="Novo cadastro" close={close} className="registration-picker" dismissOnOutside>
    <p className="picker-intro">O que você quer adicionar à sua rede?</p>
    <div className="registration-options">{options.map(({ category, Icon, color, description }) => <Link key={category} className="registration-option" to={`${categories[category].path}/novo`} aria-label={categories[category].singular} aria-describedby={`${id}-${category}`}>
      <span className={`category-icon ${color}`}><Icon size={23}/></span><ArrowUpRight className="option-arrow" size={18}/><strong>{categories[category].singular}</strong><span id={`${id}-${category}`}>{description}</span>
    </Link>)}</div>
  </Dialog>
}
