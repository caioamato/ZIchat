import { useState, useEffect, useRef } from 'react'
import {
  Plus, Trash2, Pencil, X, Save, ShieldCheck, User,
  CheckCircle2, AlertTriangle, RefreshCw, ChevronDown, Eye, EyeOff,
  Users, Layers, Check
} from 'lucide-react'
import api from './api'

const ROLE_INFO = {
  admin_master: { label: 'Admin Master', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/30', icon: <ShieldCheck className="w-3 h-3" /> },
  gerente:      { label: 'Gerente',      color: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-100 dark:bg-blue-900/30',    icon: <ShieldCheck className="w-3 h-3" /> },
  colaborador:  { label: 'Colaborador',  color: 'text-amber-700 dark:text-amber-400',  bg: 'bg-amber-100 dark:bg-amber-900/30',  icon: <User className="w-3 h-3" /> },
  convidado:    { label: 'Convidado',    color: 'text-green-600 dark:text-green-400',  bg: 'bg-green-100 dark:bg-green-900/30',  icon: <User className="w-3 h-3" /> },
}

function roleInfo(role) {
  return ROLE_INFO[role] || ROLE_INFO.colaborador
}

function initials(name) {
  return name ? name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() : '?'
}

// ─── User Modal ───────────────────────────────────────────────────────────────

function UserModal({ user, onClose, onSave, toast }) {
  const isNew = !user
  const [form, setForm]       = useState({
    name:     user?.name     || '',
    email:    user?.email    || '',
    password: '',
    role:     user?.role     || 'colaborador',
    is_active: user?.is_active ?? true,
  })
  const [showPass, setShowPass] = useState(false)
  const [saving,   setSaving]   = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) return
    if (isNew && !form.password.trim()) return
    setSaving(true)
    try {
      const payload = {
        name:      form.name,
        email:     form.email,
        role:      form.role,
        is_active: form.is_active,
      }
      if (form.password.trim()) payload.password = form.password
      await onSave(user?.id, payload, isNew)
      toast(isNew ? 'Usuário criado com sucesso!' : 'Usuário atualizado!', 'success')
      onClose()
    } catch (err) {
      toast(err?.response?.data?.detail || 'Erro ao salvar usuário.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative bg-white dark:bg-dark-800 shadow-2xl w-full max-h-[92vh] overflow-y-auto
                   rounded-t-2xl md:rounded-2xl md:max-w-md border border-slate-200 dark:border-slate-700"
      >
        {/* Mobile drag handle */}
        <div className="md:hidden flex justify-center pt-2 pb-0">
          <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-slate-600" />
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-bold text-base">{isNew ? 'Novo Usuário' : 'Editar Usuário'}</h3>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-700 transition-colors">
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="field-label">Nome completo</label>
              <input value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="Ex: João Silva" className="field-input" autoFocus={isNew} />
            </div>

            <div>
              <label className="field-label">Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                placeholder="joao@empresa.com" className="field-input" />
            </div>

            <div>
              <label className="field-label">{isNew ? 'Senha' : 'Nova senha (deixe vazio para não alterar)'}</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  placeholder={isNew ? 'Mínimo 6 caracteres' : '••••••••'}
                  className="field-input pr-10"
                />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="field-label">Perfil</label>
              <div className="relative">
                <select value={form.role} onChange={e => set('role', e.target.value)}
                  className="field-input appearance-none pr-8 cursor-pointer">
                  <option value="colaborador">Colaborador</option>
                  <option value="gerente">Gerente</option>
                  <option value="admin_master">Admin Master</option>
                  <option value="convidado">Convidado</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5">
                {form.role === 'admin_master'
                  ? 'Admin Master pode criar, editar e excluir usuários além de todas as atividades.'
                  : form.role === 'gerente'
                  ? 'Gerente visualiza e filtra atividades de todos os usuários do seu setor no dashboard.'
                  : form.role === 'convidado'
                  ? 'Convidado vê apenas suas próprias tarefas e analytics, isolado dos demais usuários.'
                  : 'Colaborador pode gerenciar atividades mas não tem acesso ao gerenciamento de usuários.'}
              </p>
            </div>

            {!isNew && (
              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-dark-700 rounded-xl">
                <div>
                  <p className="text-sm font-medium">Conta ativa</p>
                  <p className="text-xs text-slate-400">Usuários inativos não conseguem fazer login</p>
                </div>
                <button
                  onClick={() => set('is_active', !form.is_active)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${form.is_active ? 'bg-zitask-secondary' : 'bg-slate-300 dark:bg-slate-600'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100 dark:border-slate-700">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-dark-700 rounded-xl transition-colors">
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.name.trim() || !form.email.trim() || (isNew && !form.password.trim())}
              className="flex items-center gap-2 px-5 py-2 bg-zitask-secondary text-zitask-primary font-bold rounded-xl text-sm hover:bg-zitask-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
            >
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? 'Salvando…' : isNew ? 'Criar usuário' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({ title, message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white dark:bg-dark-800 rounded-2xl shadow-2xl p-6 max-w-sm w-full border border-slate-200 dark:border-slate-700">
        <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
          <AlertTriangle className="w-5 h-5 text-red-500" />
        </div>
        <h3 className="font-bold text-base mb-1">{title}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-dark-700 rounded-xl transition-colors">
            Cancelar
          </button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm font-bold bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors">
            Excluir
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Groups Panel ─────────────────────────────────────────────────────────────

function GroupsPanel({ users, toast, onUsersChange }) {
  const [groups,       setGroups]       = useState([])
  const [loading,      setLoading]      = useState(true)
  const [newName,      setNewName]      = useState('')
  const [creating,     setCreating]     = useState(false)
  const [editingId,    setEditingId]    = useState(null)
  const [editingName,  setEditingName]  = useState('')
  const [confirmDel,   setConfirmDel]   = useState(null)
  const [expanded,     setExpanded]     = useState(null)
  const addInputRef = useRef(null)

  const fetchGroups = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/groups')
      setGroups(data)
    } catch { toast('Erro ao carregar grupos.', 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchGroups() }, [])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const { data } = await api.post('/groups', { name: newName.trim() })
      setGroups(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setNewName('')
      setExpanded(data.id)
      toast(`Grupo "${data.name}" criado!`, 'success')
    } catch (e) {
      toast(e?.response?.data?.detail || 'Erro ao criar grupo.', 'error')
    } finally { setCreating(false) }
  }

  const handleRename = async (id) => {
    if (!editingName.trim()) { setEditingId(null); return }
    try {
      const { data } = await api.patch(`/groups/${id}`, { name: editingName.trim() })
      setGroups(prev => prev.map(g => g.id === id ? data : g).sort((a, b) => a.name.localeCompare(b.name)))
      setEditingId(null)
      toast('Grupo renomeado.', 'success')
    } catch (e) {
      toast(e?.response?.data?.detail || 'Erro ao renomear.', 'error')
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.delete(`/groups/${id}`)
      setGroups(prev => prev.filter(g => g.id !== id))
      setConfirmDel(null)
      onUsersChange()
      toast('Grupo excluído.', 'success')
    } catch (e) {
      toast(e?.response?.data?.detail || 'Erro ao excluir.', 'error')
    }
  }

  const handleAddMember = async (groupId, userId) => {
    try {
      const { data } = await api.post(`/groups/${groupId}/members`, { user_id: userId })
      setGroups(prev => prev.map(g => g.id === groupId ? data : g))
      onUsersChange()
    } catch (e) {
      toast(e?.response?.data?.detail || 'Erro ao adicionar membro.', 'error')
    }
  }

  const handleRemoveMember = async (groupId, userId) => {
    try {
      const { data } = await api.delete(`/groups/${groupId}/members/${userId}`)
      setGroups(prev => prev.map(g => g.id === groupId ? data : g))
      onUsersChange()
    } catch (e) {
      toast(e?.response?.data?.detail || 'Erro ao remover membro.', 'error')
    }
  }

  const memberIds = new Set(groups.flatMap(g => g.members.map(m => m.id)))
  const unassigned = users.filter(u => !memberIds.has(u.id))

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-7 h-7 border-2 border-zitask-secondary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Create group */}
      <div className="bg-white dark:bg-dark-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
        <h3 className="font-bold text-sm mb-3">Novo Grupo / Setor</h3>
        <div className="flex gap-2">
          <input
            ref={addInputRef}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="Ex: Desenvolvimento, Marketing…"
            className="field-input flex-1"
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-zitask-secondary text-zitask-primary font-bold rounded-xl text-sm hover:bg-zitask-secondary/90 disabled:opacity-40 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Criar
          </button>
        </div>
      </div>

      {/* Groups list */}
      {groups.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">
          Nenhum grupo criado ainda.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(group => (
            <div key={group.id} className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              {/* Group header */}
              <div className="flex items-center gap-3 px-5 py-3.5">
                <div className="w-7 h-7 rounded-lg bg-zitask-secondary/10 flex items-center justify-center flex-shrink-0">
                  <Layers className="w-3.5 h-3.5 text-zitask-secondary" />
                </div>

                {editingId === group.id ? (
                  <input
                    autoFocus
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    onBlur={() => handleRename(group.id)}
                    onKeyDown={e => { if (e.key === 'Enter') handleRename(group.id); if (e.key === 'Escape') setEditingId(null) }}
                    className="flex-1 text-sm font-bold bg-transparent border-b-2 border-zitask-secondary outline-none"
                  />
                ) : (
                  <button
                    className="flex-1 text-left font-bold text-sm hover:text-zitask-secondary transition-colors"
                    onClick={() => setExpanded(v => v === group.id ? null : group.id)}
                  >
                    {group.name}
                  </button>
                )}

                <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-dark-700 px-2 py-0.5 rounded-full font-bold">
                  {group.members.length} membro{group.members.length !== 1 ? 's' : ''}
                </span>

                <div className="flex items-center gap-1 ml-1">
                  <button
                    onClick={() => { setEditingId(group.id); setEditingName(group.name) }}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-700 text-slate-400 hover:text-zitask-secondary transition-colors"
                    title="Renomear"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => setConfirmDel(group)}
                    className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors"
                    title="Excluir grupo"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Expanded: members + add */}
              {expanded === group.id && (
                <div className="px-5 pb-4 border-t border-slate-100 dark:border-slate-700 pt-3">
                  {/* Current members */}
                  {group.members.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {group.members.map(m => (
                        <div key={m.id} className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 bg-slate-100 dark:bg-dark-700 rounded-full text-xs font-medium">
                          <div className="w-4 h-4 rounded bg-gradient-to-br from-zitask-secondary to-zitask-primary flex items-center justify-center text-[8px] text-white font-bold flex-shrink-0">
                            {m.name[0].toUpperCase()}
                          </div>
                          {m.name}
                          <button
                            onClick={() => handleRemoveMember(group.id, m.id)}
                            className="ml-0.5 hover:text-red-400 transition-colors text-slate-400"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add member dropdown */}
                  {unassigned.length > 0 && (
                    <div className="flex items-center gap-2">
                      <select
                        defaultValue=""
                        onChange={e => { if (e.target.value) { handleAddMember(group.id, Number(e.target.value)); e.target.value = '' } }}
                        className="text-xs bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-1.5 focus:outline-none focus:border-zitask-secondary flex-1"
                      >
                        <option value="" disabled>+ Adicionar usuário ao grupo…</option>
                        {unassigned.map(u => (
                          <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {unassigned.length === 0 && group.members.length === 0 && (
                    <p className="text-xs text-slate-400">Todos os usuários já estão em grupos.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Confirm delete group */}
      {confirmDel && (
        <ConfirmDialog
          title={`Excluir grupo "${confirmDel.name}"?`}
          message={confirmDel.members.length > 0
            ? `${confirmDel.members.length} membro(s) ficarão sem grupo atribuído.`
            : 'Esta ação não pode ser desfeita.'}
          onConfirm={() => handleDelete(confirmDel.id)}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </div>
  )
}

// ─── Users View ───────────────────────────────────────────────────────────────

export default function UsersView({ currentUser, toast }) {
  const [users,   setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [tab,     setTab]     = useState('users') // 'users' | 'groups'

  useEffect(() => { fetchUsers() }, [])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/users')
      setUsers(data)
    } catch {
      toast('Erro ao carregar usuários.', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (id, payload, isNew) => {
    if (isNew) {
      const { data } = await api.post('/users', payload)
      setUsers(prev => [...prev, data])
    } else {
      const { data } = await api.patch(`/users/${id}`, payload)
      setUsers(prev => prev.map(u => u.id === id ? data : u))
    }
  }

  const handleDelete = async () => {
    const user = confirm
    try {
      await api.delete(`/users/${user.id}`)
      setUsers(prev => prev.filter(u => u.id !== user.id))
      toast('Usuário excluído.', 'success')
    } catch (err) {
      toast(err?.response?.data?.detail || 'Erro ao excluir usuário.', 'error')
    } finally {
      setConfirm(null)
    }
  }

  const admins     = users.filter(u => u.role === 'admin_master')
  const gerentes   = users.filter(u => u.role === 'gerente')
  const collabs    = users.filter(u => u.role === 'colaborador')
  const convidados = users.filter(u => u.role === 'convidado')

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-7 bg-slate-50 dark:bg-dark-900/50">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold mb-1">Usuários</h2>
          <p className="text-sm text-slate-400">Gerencie acesso e setores</p>
        </div>
        {tab === 'users' && (
          <button
            onClick={() => setModal('new')}
            className="flex items-center gap-2 px-4 py-2 bg-zitask-secondary text-zitask-primary font-bold rounded-xl text-sm hover:bg-zitask-secondary/90 transition-colors shadow-md flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            Novo Usuário
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 dark:bg-dark-700 rounded-xl p-1 w-fit">
        {[
          { id: 'users',  label: 'Usuários', Icon: Users  },
          { id: 'groups', label: 'Grupos',   Icon: Layers },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              tab === id
                ? 'bg-white dark:bg-dark-800 text-zitask-primary dark:text-zitask-secondary shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            {[
              { label: 'Total',        value: users.length,       color: 'text-slate-600 dark:text-slate-300'    },
              { label: 'Admins',       value: admins.length,      color: 'text-purple-600 dark:text-purple-400' },
              { label: 'Gerentes',     value: gerentes.length,    color: 'text-blue-600 dark:text-blue-400'     },
              { label: 'Colaboradores',value: collabs.length,     color: 'text-amber-700 dark:text-amber-400'   },
              { label: 'Convidados',   value: convidados.length,  color: 'text-green-600 dark:text-green-400'   },
            ].map(s => (
              <div key={s.label} className="bg-white dark:bg-dark-800 rounded-2xl p-4 md:p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
                <p className={`text-2xl md:text-3xl font-black mb-0.5 ${s.color}`}>{s.value}</p>
                <p className="text-[10px] md:text-xs text-slate-400 font-medium">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Users table */}
          <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex justify-center py-16">
                <div className="w-7 h-7 border-2 border-zitask-secondary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-slate-400 bg-slate-50 dark:bg-dark-700/50 border-b border-slate-100 dark:border-slate-700">
                    <th className="text-left px-5 py-3 font-bold">Usuário</th>
                    <th className="text-left px-5 py-3 font-bold">Email</th>
                    <th className="text-left px-5 py-3 font-bold">Perfil</th>
                    <th className="text-left px-5 py-3 font-bold">Setor</th>
                    <th className="text-left px-5 py-3 font-bold">Status</th>
                    <th className="text-left px-5 py-3 font-bold">Criado em</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => {
                    const ri = roleInfo(user.role)
                    const isSelf = user.id === currentUser.id
                    return (
                      <tr key={user.id} className="border-b border-slate-50 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-dark-700/20 transition-colors group">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${user.role === 'admin_master' ? 'bg-gradient-to-br from-purple-500 to-purple-800' : user.role === 'gerente' ? 'bg-gradient-to-br from-blue-400 to-blue-700' : user.role === 'convidado' ? 'bg-gradient-to-br from-green-400 to-green-600' : 'bg-gradient-to-br from-amber-600 to-amber-900'}`}>
                              {initials(user.name)}
                            </div>
                            <div>
                              <p className="font-semibold text-sm leading-tight">
                                {user.name}
                                {isSelf && <span className="ml-2 text-[9px] font-bold text-zitask-secondary bg-zitask-secondary/10 px-1.5 py-0.5 rounded">Você</span>}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-slate-500 text-xs">{user.email}</td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${ri.bg} ${ri.color}`}>
                            {ri.icon}
                            {ri.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          {user.group_name
                            ? <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-zitask-secondary/10 text-zitask-secondary rounded-full text-[10px] font-bold">{user.group_name}</span>
                            : <span className="text-[10px] text-slate-300 dark:text-slate-600">—</span>
                          }
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold ${user.is_active ? 'text-green-600 dark:text-green-400' : 'text-slate-400'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${user.is_active ? 'bg-green-500' : 'bg-slate-400'}`} />
                            {user.is_active ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-[10px] text-slate-400">
                          {new Date(user.created_at).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all justify-end">
                            <button
                              onClick={() => setModal(user)}
                              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-700 text-slate-400 hover:text-zitask-secondary transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            {!isSelf && (
                              <button
                                onClick={() => setConfirm(user)}
                                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
            )}
            {!loading && users.length === 0 && (
              <p className="text-center text-slate-400 py-12 text-sm">Nenhum usuário encontrado.</p>
            )}
          </div>
        </>
      )}

      {tab === 'groups' && (
        <GroupsPanel users={users} toast={toast} onUsersChange={fetchUsers} />
      )}

      {/* Modals */}
      {modal && (
        <UserModal
          user={modal === 'new' ? null : modal}
          toast={toast}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title="Excluir usuário"
          message={`"${confirm.name}" (${confirm.email}) será excluído permanentemente e perderá o acesso ao sistema.`}
          onConfirm={handleDelete}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
