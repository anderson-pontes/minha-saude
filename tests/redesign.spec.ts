import {expect} from '@playwright/test'
import {DateTime} from 'luxon'
import {test,login,call,noOverflow} from './fixtures/network'

test('list pagination preserves filters and reports its interval',async({page,db})=>{
 const date=DateTime.now().setZone('America/Belem').startOf('month').plus({days:10,hours:9})
 for(let i=0;i<23;i++)await call(db,'agenda_save',[crypto.randomUUID(),JSON.stringify({tipo:'exame',titulo:`Exame ${String(i).padStart(2,'0')}`,inicio_em:date.toUTC().toISO(),fim_em:date.plus({hours:1}).toUTC().toISO()}),null,true],'$1,$2::jsonb,$3,$4')
 await login(page,'/agenda')
 await expect(page.getByRole('combobox',{name:'Filtrar médico',exact:true})).toBeHidden()
 await page.getByRole('button',{name:'Lista',exact:true}).click()
 const pagination=page.getByRole('navigation',{name:'Paginação de compromissos'})
 await expect(pagination).toContainText('1–20 de 23 compromissos')
 await pagination.getByRole('combobox').selectOption('10')
 await expect(page.locator('.agenda-main .appointment-row')).toHaveCount(10)
 await pagination.getByRole('button',{name:'Próxima',exact:true}).click()
 await expect(pagination).toContainText('11–20 de 23 compromissos')
 await pagination.getByRole('button',{name:'Próxima',exact:true}).click()
 await expect(page.locator('.agenda-main .appointment-row')).toHaveCount(3)
 await expect(pagination.getByRole('button',{name:'Próxima',exact:true})).toBeDisabled()
 await page.getByRole('combobox',{name:'Tipo de atendimento',exact:true}).click()
 await page.getByRole('option',{name:'Consulta médica',exact:true}).click()
 await expect(pagination).toContainText('0 de 0 compromissos')
 await page.getByRole('button',{name:'Remover filtro tipo',exact:true}).click()
 await expect(pagination).toContainText('1–10 de 23 compromissos')
})

for(const width of [360,390,768,1024,1440,1920])test(`dashboard and compact calendar composition at ${width}px`,async({page,db})=>{
 void db
 await page.setViewportSize({width,height:900})
 await login(page,'/')
 await expect(page.locator('.record-total')).toHaveCount(4)
 await noOverflow(page)
 await page.screenshot({path:`test-results/redesign-home-${width}.png`,fullPage:true})
 await page.goto('/agenda')
 await page.getByRole('button',{name:'Mês',exact:true}).click()
 await expect(page.locator('.fc-daygrid-day').first()).toBeVisible()
 const heights=await page.locator('.agenda-metric').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height))
 expect(Math.max(...heights)-Math.min(...heights)).toBeLessThan(1)
 const cell=await page.locator('.fc-daygrid-day-frame').first().boundingBox()
 expect(cell!.height).toBeLessThan(110)
 await noOverflow(page)
 await page.screenshot({path:`test-results/redesign-agenda-${width}.png`,fullPage:true})
})
