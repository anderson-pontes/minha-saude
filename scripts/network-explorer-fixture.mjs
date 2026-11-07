// Synthetic data, shared by SQL and browser tests. Never run against production.
export async function seedExplorer(db) {
  const insert=async(table,values)=>(await db.query(`insert into public.${table}(${Object.keys(values).join(',')}) values(${Object.keys(values).map((_,i)=>'$'+(i+1)).join(',')}) returning id`,Object.values(values))).rows[0].id
  const plan=await insert('health_plans',{name:'UNICASF Saúde',notes:'Operadora: Caixa de Assistência dos Funcionários do Banco da Amazônia (CASF). Registro apresentado: 47971/018-8. Referência: março/2026.'})
  const specialty=await insert('specialties',{name:'Cardiologia'})
  const otherSpecialty=await insert('specialties',{name:'Dermatologia'})
  const establishments=[];const doctors=[]
  for(let n=1;n<=35;n++) {
    const est=await insert('establishments',{name:`Clínica ${String(n).padStart(2,'0')}`,kind:n%2?'clinic':'hospital'})
    const doc=await insert('doctors',{name:`Profissional ${String(n).padStart(2,'0')}`,professional_council:'CRM',registration_number:String(1000+n),registration_state:'PA'})
    establishments.push(est);doctors.push(doc)
    await insert('addresses',{street:'Rua de teste',establishment_id:est,city:n%2?'Belém':'Ananindeua',state:'PA',neighborhood:n%2?'Centro':'Cidade Nova'})
    await insert('establishment_health_plans',{establishment_id:est,health_plan_id:plan})
    await insert('establishment_specialties',{establishment_id:est,specialty_id:specialty})
    await insert('doctor_establishments',{doctor_id:doc,establishment_id:est})
    await insert('doctor_specialties',{doctor_id:doc,specialty_id:specialty})
    await insert('doctor_establishment_specialties',{doctor_id:doc,establishment_id:est,specialty_id:specialty})
    await insert('doctor_establishment_health_plans',{doctor_id:doc,establishment_id:est,health_plan_id:plan})
  }
  // The first doctor's Dermatologia at another clinic must never leak into this plan.
  const unrelated=await insert('establishments',{name:'Consultório particular sem convênio',kind:'office'})
  await insert('addresses',{street:'Outra rua de teste',establishment_id:unrelated,city:'São Paulo',state:'SP',neighborhood:'Bela Vista'})
  await insert('doctor_establishments',{doctor_id:doctors[0],establishment_id:unrelated})
  await insert('doctor_specialties',{doctor_id:doctors[0],specialty_id:otherSpecialty})
  await insert('doctor_establishment_specialties',{doctor_id:doctors[0],establishment_id:unrelated,specialty_id:otherSpecialty})
  const unaccredited=await insert('doctors',{name:'Profissional sem vínculo com o plano'})
  await insert('doctor_establishments',{doctor_id:unaccredited,establishment_id:establishments[0]})
  return {plan,specialty,otherSpecialty,establishments,doctors,unrelated,unaccredited}
}
