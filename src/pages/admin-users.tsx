import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, UserCheck, UserX } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useAccess } from '../lib/access'
import type { Profile } from '../lib/access'
import { errorMessage, rpc } from '../lib/network'
import { Button } from '../components/ui/button'
import { Loading } from '../components/feedback'
import { Dialog, QueryError } from '../components/network'
type UserProfile = Profile & { email: string }
export function AdminUsersPage() {
  const { session } = useAuth(); const { canAdmin } = useAccess(); const client = useQueryClient()
  const [page, setPage] = useState(1); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [failure, setFailure] = useState('')
  const [action, setAction] = useState<{ user: UserProfile; role: Profile['role']; status: Profile['status'] } | null>(null)
  const query = useQuery({ queryKey: ['admin-users', session?.user.id, page], enabled: canAdmin,
    queryFn: () => rpc<{ items: UserProfile[]; total: number }>('admin_list_users', { p_page: page, p_size: 20 }),
  })
  function choose(user: UserProfile, role: Profile['role'], status: Profile['status']) { setFailure(''); setAction({ user, role, status }) }
  async function confirm() {
    if (!action || busy) return
    setBusy(true); setFailure('')
    try { await rpc('admin_set_access', { p_id: action.user.id, p_role: action.role, p_status: action.status }); setMessage('Permissões atualizadas.'); setAction(null); await client.invalidateQueries() }
    catch (error) { setFailure(errorMessage(error)) } finally { setBusy(false) }
  }
  if (!canAdmin) return <div className="state"><h1>Acesso administrativo necessário</h1><Link to="/cadastros">Voltar à rede</Link></div>
  return <><div className="page-heading"><span className="eyebrow">ADMINISTRAÇÃO</span><h1>Usuários e acessos</h1><p>Somente pessoas autorizadas podem consultar a base compartilhada.</p></div><p className="notice">As contas são criadas pelo administrador no Supabase Auth. Novas contas começam bloqueadas, sem cadastro público. Autorizar permite consultar; promover permite gerenciar a rede e os acessos.</p>{message && <p role="status" className="success">{message}</p>}
    {query.isPending ? <Loading/> : query.isError ? <QueryError error={query.error} retry={() => void query.refetch()}/> : <><div className="admin-users">{query.data.items.map(user => <article key={user.id} className="panel admin-user-card"><div><h2>{user.display_name || user.email}</h2>{user.display_name && <p>{user.email}</p>}<div className="chips"><span className="chip">{user.role === 'admin' ? 'Administrador' : 'Consulta'}</span><span className={`access-status ${user.status}`}>{user.status === 'active' ? 'Ativo' : 'Bloqueado'}</span></div></div>{user.id === session?.user.id ? <p className="field-hint">Sua conta. Suas permissões são protegidas contra alteração pelo próprio usuário.</p> : <div className="entity-actions"><Button variant="outline" disabled={busy || (user.status === 'active' && user.role === 'viewer')} onClick={() => choose(user, 'viewer', 'active')}><UserCheck size={16}/>Autorizar consulta</Button><Button variant="outline" disabled={busy || user.status === 'blocked'} onClick={() => choose(user, user.role, 'blocked')}><UserX size={16}/>Revogar acesso</Button><Button variant="ghost" disabled={busy || (user.role === 'admin' && user.status === 'active')} onClick={() => choose(user, 'admin', 'active')}><ShieldCheck size={16}/>Promover a administrador</Button></div>}</article>)}</div><div className="pagination"><Button variant="outline" disabled={page === 1} onClick={() => setPage(v => v - 1)}>Anterior</Button><span>Página {page}</span><Button variant="outline" disabled={page * 20 >= query.data.total} onClick={() => setPage(v => v + 1)}>Próxima</Button></div></>}
    {action && <Dialog title={action.role === 'admin' && action.status === 'active' ? 'Promover a administrador?' : action.status === 'blocked' ? 'Revogar acesso?' : 'Autorizar consulta?'} close={() => { if (!busy) setAction(null) }}><p>{action.user.email}</p><p>{action.role === 'admin' && action.status === 'active' ? 'Esta pessoa poderá criar, editar e excluir cadastros, além de gerenciar as permissões dos usuários.' : action.status === 'blocked' ? 'Esta pessoa perderá acesso às consultas, mesmo com uma sessão já aberta.' : 'Esta pessoa poderá consultar a mesma rede e manter seus próprios favoritos, sem modificar os cadastros.'}</p>{failure && <p role="alert" className="field-error">{failure}</p>}<div className="form-actions"><Button variant="outline" disabled={busy} onClick={() => setAction(null)}>Cancelar</Button><Button disabled={busy} onClick={() => void confirm()}>{busy ? 'Atualizando…' : 'Confirmar alteração'}</Button></div></Dialog>}
  </>
}
