import {expect} from '@playwright/test'
import {test,call,login} from './fixtures/network'
const viewer='11111111-1111-4111-8111-111111111111'
const other='55555555-5555-4555-8555-555555555555'
async function role(db:Parameters<typeof call>[0],next:'viewer'|'blocked'){
 await db.exec('reset role')
 await db.query('insert into auth.users(id,email) values($1,$2)',[other,'other-admin@example.invalid'])
 await db.query("update public.profiles set role='admin',status='active' where id=$1",[other])
 await db.query("update public.profiles set role='viewer',status=$1 where id=$2",[next==='viewer'?'active':'blocked',viewer])
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${viewer}',false)`)
}
test('viewer reads shared data, favorites and has no administrative UI or forms',async({page,db})=>{
 const id=await call(db,'save_network_entity',['establishments',null,JSON.stringify({name:'Rede compartilhada',kind:'clinic',contacts:[{kind:'phone',value:'9133334444'}]})],'$1,$2,$3::jsonb')
 await role(db,'viewer');await login(page,`/estabelecimentos/${id}`)
 await expect(page.getByRole('heading',{name:'Rede compartilhada',exact:true})).toBeVisible()
 await expect(page.getByRole('link',{name:'Editar',exact:true})).toHaveCount(0)
 await expect(page.getByRole('button',{name:/Excluir/})).toHaveCount(0)
 await expect(page.getByRole('link',{name:'Ligar',exact:true})).toHaveAttribute('href','tel:+559133334444')
  const bypass=await page.evaluate(async()=>{const r=await fetch('https://foundation-test.supabase.co/rest/v1/establishments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Bypass direto',kind:'clinic'})});return {status:r.status,body:await r.json()}})
  expect(bypass.body.code).toBe('42501')
 await page.getByRole('button',{name:'Favoritar',exact:true}).click();await expect(page.getByRole('button',{name:'Desfavoritar',exact:true})).toBeVisible()
 await page.goto('/');await expect(page.getByRole('button',{name:'Novo cadastro',exact:true})).toHaveCount(0)
 await page.goto('/estabelecimentos/novo');await expect(page.getByRole('heading',{name:'Área restrita a administradores'})).toBeVisible();await expect(page.getByLabel('Nome do estabelecimento')).toHaveCount(0)
 await page.goto('/administracao/usuarios');await expect(page.getByRole('heading',{name:'Área restrita a administradores'})).toBeVisible()
})
test('iOS installation guide is manual and standalone hides installation',async({page,db})=>{
 void db
 await page.addInitScript(()=>Object.defineProperty(navigator,'userAgent',{get:()=> 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1'}))
 await login(page,'/');await page.getByRole('button',{name:'Como adicionar à Tela de Início'}).click();await expect(page.getByRole('dialog')).toContainText('Compartilhar');await expect(page.getByRole('dialog')).toContainText('Adicionar à Tela de Início');await expect(page.getByRole('button',{name:'Instalar Minha Saúde',exact:true})).toHaveCount(0)
 await page.getByRole('button',{name:'Fechar',exact:true}).click()
 await page.addInitScript(()=>Object.defineProperty(navigator,'standalone',{get:()=>true}))
 await page.reload();await page.getByLabel('Menu da conta').click();await expect(page.getByRole('button',{name:'Adicionar à Tela de Início',exact:true})).toHaveCount(0)
})
test('blocked account cannot reach the health directory',async({page,db})=>{
 await role(db,'blocked');await login(page,'/cadastros');await expect(page.getByRole('heading',{name:'Acesso aguardando autorização'})).toBeVisible();await expect(page.getByLabel('Busca universal')).toHaveCount(0)
})
test('admin authorizes, promotes and revokes existing accounts with confirmation',async({page,db})=>{
 await db.exec('reset role');await db.query('insert into auth.users(id,email) values($1,$2)',[other,'new@example.invalid']);await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${viewer}',false)`)
 await login(page,'/administracao/usuarios')
 const card=page.getByRole('article').filter({hasText:'new@example.invalid'})
 await expect(card).toContainText('Bloqueado')
 await card.getByRole('button',{name:'Autorizar consulta'}).click();await page.getByRole('button',{name:'Confirmar alteração'}).click();await expect(card).toContainText('Ativo')
 await card.getByRole('button',{name:'Promover a administrador'}).click();await expect(page.getByRole('dialog')).toContainText('gerenciar as permissões');await page.getByRole('button',{name:'Confirmar alteração'}).click();await expect(card).toContainText('Administrador')
 await card.getByRole('button',{name:'Revogar acesso'}).click();await page.getByRole('button',{name:'Confirmar alteração'}).click();await expect(card).toContainText('Bloqueado')
})
test('install invitation is user initiated, respects deferral and hides after installation',async({page,db})=>{
 void db;await login(page,'/')
 const dispatch=async(outcome:'accepted'|'dismissed')=>page.evaluate(value=>{const event=new Event('beforeinstallprompt',{cancelable:true});Object.assign(event,{prompt:async()=>{document.documentElement.dataset.prompts=String(Number(document.documentElement.dataset.prompts||0)+1)},userChoice:Promise.resolve({outcome:value})});window.dispatchEvent(event)},outcome)
 await dispatch('dismissed');await expect(page.getByRole('button',{name:'Instalar aplicativo',exact:true})).toBeVisible();expect(await page.locator('html').getAttribute('data-prompts')).toBe(null)
 await page.getByRole('button',{name:'Instalar aplicativo',exact:true}).click();await page.getByRole('button',{name:'Instalar Minha Saúde',exact:true}).click();expect(await page.locator('html').getAttribute('data-prompts')).toBe('1')
 await expect(page.getByRole('button',{name:'Instalar aplicativo',exact:true})).toHaveCount(0)
 await dispatch('accepted');await expect(page.getByRole('button',{name:'Instalar aplicativo',exact:true})).toHaveCount(0)
 await page.getByLabel('Menu da conta').click();await page.getByRole('button',{name:'Instalar Minha Saúde',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Instalar Minha Saúde',exact:true}).click()
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'Instalar Minha Saúde',exact:true})).toHaveCount(0)
})
