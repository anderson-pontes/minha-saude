import { AsYouType, parsePhoneNumberFromString } from 'libphonenumber-js/min'

export const contactTypes = {
  whatsapp: 'WhatsApp', mobile: 'Celular', phone: 'Telefone fixo', email: 'E-mail', other: 'Outro', website: 'Site',
} as const
export const isPhoneKind = (kind: string) => ['phone', 'mobile', 'whatsapp'].includes(kind)
export const digitsOnly = (value: string) => value.replace(/\D/g, '')

/** BR stores DDD + number; foreign numbers retain +DDI (E.164). Never truncates. */
export function normalizePhone(value: string): string {
  const text = value.trim()
  let digits = digitsOnly(text)
  const international = text.startsWith('+') || text.startsWith('00')
  if (text.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('55') && [12, 13].includes(digits.length)) return digits.slice(2)
  return international && digits ? `+${digits}` : digits
}
export function isInternationalPhone(value: string) { return normalizePhone(value).startsWith('+') }

export function formatPhone(value: string): string {
  const normalized = normalizePhone(value)
  if (normalized.startsWith('+')) return new AsYouType().input(normalized)
  if (!normalized) return ''
  if (normalized.length > 11) return value // Preserve ambiguous legacy data in full.
  if (normalized.length < 3) return `(${normalized}${normalized.length === 2 ? ')' : ''}`
  const prefixLength = normalized.length > 10 ? 5 : 4
  const local = normalized.slice(2)
  return `(${normalized.slice(0, 2)}) ${local.slice(0, prefixLength)}${local.length > prefixLength ? `-${local.slice(prefixLength)}` : ''}`
}
export function validatePhone(value: string, kind: string): string | null {
  if (!value.trim()) return 'Informe o número com DDD.'
  if (!/^[+\d\s().-]+$/.test(value)) return 'Use apenas o número de telefone, sem ramais ou letras.'
  const normalized = normalizePhone(value)
  if (normalized.startsWith('+')) {
    const phone = parsePhoneNumberFromString(normalized)
    return phone?.isPossible() ? null : 'Confira o código do país e o número internacional completo.'
  }
  const expected = kind === 'phone' ? 10 : 11
  if (normalized.length !== expected) return kind === 'phone' ? 'Use 10 dígitos: DDD + telefone fixo.' : 'Use 11 dígitos: DDD + celular com o nono dígito.'
  const phone = parsePhoneNumberFromString(normalized, 'BR')
  if (!phone?.isValid()) return 'Confira o DDD e o número de telefone.'
  if (kind !== 'phone' && normalized[2] !== '9') return 'O celular deve começar com 9 depois do DDD.'
  return null
}
export function phoneTelLink(value: string): string | undefined {
  const number = normalizePhone(value)
  if (number.startsWith('+')) return parsePhoneNumberFromString(number)?.isPossible() ? `tel:${number}` : undefined
  return [10, 11].includes(number.length) ? `tel:+55${number}` : undefined
}
export function whatsappLink(value: string): string | undefined {
  const number = normalizePhone(value)
  const tel = phoneTelLink(number)
  return tel ? `https://wa.me/${number.startsWith('+') ? number.slice(1) : `55${number}`}` : undefined
}
export function formatCep(value: string) {
  const digits = digitsOnly(value)
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits
}
export function normalizeWebsite(value: string): string | null {
  const text = value.trim()
  if (!text) return ''
  if (/\s/.test(text) || text.startsWith('//') || (/^[a-z][a-z\d+.-]*:/i.test(text) && !/^https?:\/\//i.test(text))) return null
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password) return null
    return url.href
  } catch { return null }
}
export function validateContact(contact: { kind: string; value: string }): string | null {
  if (isPhoneKind(contact.kind)) return validatePhone(contact.value, contact.kind)
  if (!contact.value.trim()) return contact.kind === 'email' ? 'Informe o e-mail.' : 'Informe o endereço ou a informação de contato.'
  if (contact.kind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.value.trim())) return 'Informe um e-mail válido, como recepcao@clinica.com.br.'
  if (contact.kind === 'website' && !normalizeWebsite(contact.value)) return 'Informe um endereço de site válido.'
  if (contact.value.length > 300) return 'Use até 300 caracteres.'
  return null
}
export function normalizedContactValue(contact: { kind: string; value: string }): string {
  if (isPhoneKind(contact.kind)) return normalizePhone(contact.value)
  if (contact.kind === 'website') return normalizeWebsite(contact.value) ?? contact.value.trim()
  return contact.value.trim()
}
export function normalizeSearchTerm(value: string) {
  return /^[+\d\s().-]+$/.test(value.trim()) && digitsOnly(value).length >= 8 ? normalizePhone(value) : value.trim()
}
export function displayContactValue(contact: { kind: string; value: string }) {
  return isPhoneKind(contact.kind) ? formatPhone(contact.value) : contact.value
}
export const brazilStates = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']
export function addressErrors(address: { postal_code: string; street: string; city: string; state: string }) {
  return {
    postal_code: address.postal_code && digitsOnly(address.postal_code).length !== 8 ? 'O CEP deve ter oito dígitos.' : '',
    street: address.street.trim() ? '' : 'Informe o logradouro.',
    city: address.city.trim() ? '' : 'Informe a cidade.',
    state: brazilStates.includes(address.state) ? '' : 'Selecione uma UF válida.',
  }
}
