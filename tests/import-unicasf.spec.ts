import { expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { test, call, login } from './fixtures/network'

test('rede importada: endereço próprio, especialidade e convênio por local e CNPJ', async ({ page, db }) => {
  const full = JSON.parse(readFileSync('data/unicasf-review/import.json', 'utf8'))
  const clinic = full.entities.find((e: {category:string;data:{trade_name?:string}}) => e.category === 'establishments' && e.data.trade_name === 'CLINICASF')
  const keys = new Set(['doctors:CRM:PA:10096', clinic.key, 'health_plans:unicasf', 'specialties:GERIATRIA'])
  const subset = { ...full, documents: [], entities: full.entities.filter((e: {key:string}) => keys.has(e.key)),
    links: full.links.filter((l: {left:string;right:string;specialty?:string}) => keys.has(l.left) && keys.has(l.right) && (!l.specialty || keys.has(l.specialty))) }
  const result = await call(db, 'execute_network_import', [JSON.stringify(subset), 'e'.repeat(64), true], '$1::jsonb,$2,$3') as {entities:{key:string;id:string}[]}
  const doctorId = result.entities.find(e => e.key === 'doctors:CRM:PA:10096')!.id
  const clinicId = result.entities.find(e => e.key === clinic.key)!.id
  await login(page)
  await page.goto(`/medicos/${doctorId}`)
  await expect(page.getByRole('heading', { name: /^Bianca Paiva Pantoja$/i })).toBeVisible()
  await expect(page.getByText('Convênios neste local: UNICASF Saúde', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Localização', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: clinic.data.name, exact: true })).toBeVisible()
  await page.goto(`/estabelecimentos/${clinicId}`)
  await expect(page.getByText('CNPJ: 04.204.285/0003-03', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Bianca Paiva Pantoja$/i })).toBeVisible()
  await expect(page.getByText('Convênios neste local: UNICASF Saúde', { exact: true })).toBeVisible()
})
