export const categories = {
  establishments: { title: 'Estabelecimentos', singular: 'Estabelecimento', path: '/estabelecimentos' },
  doctors: { title: 'Médicos', singular: 'Médico', path: '/medicos' },
  specialties: { title: 'Especialidades', singular: 'Especialidade', path: '/especialidades' },
  health_plans: { title: 'Convênios', singular: 'Convênio', path: '/convenios' },
} as const
export type Category = keyof typeof categories
export const kinds: Record<string, string> = { clinic: 'Clínica', hospital: 'Hospital', laboratory: 'Laboratório', office: 'Consultório', other: 'Outro' }
