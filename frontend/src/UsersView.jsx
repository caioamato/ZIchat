import { useState, useEffect } from 'react'
import {
  Plus, Trash2, Pencil, X, Save, ShieldCheck, User,
  CheckCircle2, AlertTriangle, RefreshCw, ChevronDown, Eye, EyeOff
} from 'lucide-react'
import api from './api'

const ROLE_INFO = {
  admin_master: { label: 'Admin Master', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/30', icon: <ShieldCheck className="w-3 h-3" /> },
  colaborador:  { label: 'Colaborador',  color: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-100 dark:bg-blue-900/30',    icon: <User className="w-3 h-3" /> },
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white dark:bg-dark-800 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700"
        onClick={e => e.stopPropagation()}
      >
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
                  <option value="admin_master">Admin Master</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5">
                {form.role === 'admin_master'
                  ? 'Admin Master pode criar, editar e excluir usuários além de todas as atividades.'
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

// ─── Users View ───────────────────────────────────────────────────────────────

export default function UsersView({ currentUser, toast }) {
  const [users,   setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(null)   // null | 'new' | user object
  const [confirm, setConfirm] = useState(null)   // null | user object

  useEffect(() => { fetchUsers() }, [])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/users')
      setUsers(data)
    } catch (err) {
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

  const admins  = users.filter(u => u.role === 'admin_master')
  const collabs = users.filter(u => u.role === 'colaborador')

  return (
    <div className="flex-1 overflow-y-auto p-7 bg-slate-50 dark:bg-dark-900/50">
      <div className="flex items-start justify-between mb-7">
        <div>
          <h2 className="text-2xl font-bold mb-1">Usuários</h2>
          <p className="text-sm text-slate-400">Gerencie quem tem acesso ao ZItask</p>
        </div>
        <button
          onClick={() => setModal('new')}
          className="flex items-center gap-2 px-4 py-2 bg-zitask-secondary text-zitask-primary font-bold rounded-xl text-sm hover:bg-zitask-secondary/90 transition-colors shadow-md"
        >
          <Plus className="w-4 h-4" />
          Novo Usuário
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-7">
        {[
          { label: 'Total de usuários', value: users.length,                               color: 'text-slate-600 dark:text-slate-300' },
          { label: 'Admins Master',     value: admins.length,                               color: 'text-purple-600 dark:text-purple-400' },
          { label: 'Colaboradores',     value: collabs.length,                              color: 'text-blue-600 dark:text-blue-400' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-dark-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
            <p className={`text-3xl font-black mb-0.5 ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-400 font-medium">{s.label}</p>
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
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-slate-400 bg-slate-50 dark:bg-dark-700/50 border-b border-slate-100 dark:border-slate-700">
                <th className="text-left px-5 py-3 font-bold">Usuário</th>
                <th className="text-left px-5 py-3 font-bold">Email</th>
                <th className="text-left px-5 py-3 font-bold">Perfil</th>
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
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${user.role === 'admin_master' ? 'bg-gradient-to-br from-purple-500 to-purple-700' : 'bg-gradient-to-br from-zitask-secondary to-zitask-primary'}`}>
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
        )}
        {!loading && users.length === 0 && (
          <p className="text-center text-slate-400 py-12 text-sm">Nenhum usuário encontrado.</p>
        )}
      </div>

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
