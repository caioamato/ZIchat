import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Layout, Kanban, Settings, BarChart3, Plus, Search, Clock,
  X, CheckCircle2, Circle, ArrowRight, AlertCircle, User,
  Calendar, Pencil, Trash2, Flag, ChevronDown, Save, RefreshCw,
  AlertTriangle, Users, LogOut, FileDown
} from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import api from './api'
import LoginPage from './LoginPage'
import UsersView from './UsersView'

const COLUMNS = [
  { id: 'Backlog',     label: 'Backlog',      color: '#94a3b8' },
  { id: 'To Do',       label: 'A Fazer',      color: '#60a5fa' },
  { id: 'Doing',       label: 'Em Andamento', color: '#f59e0b' },
  { id: 'Peer Review', label: 'Revisão',      color: '#a78bfa' },
  { id: 'Testing',     label: 'Testes',       color: '#34d399' },
  { id: 'Deploy',      label: 'Deploy',       color: '#fb923c' },
  { id: 'Done',        label: 'Concluído',    color: '#22c55e' },
]

const PRIORITIES = [
  { value: 'Low',    label: 'Baixa',   color: 'text-slate-400',  bg: 'bg-slate-100 dark:bg-slate-700/50',     dot: 'bg-slate-400'   },
  { value: 'Medium', label: 'Média',   color: 'text-blue-500',   bg: 'bg-blue-50 dark:bg-blue-900/30',        dot: 'bg-blue-500'    },
  { value: 'High',   label: 'Alta',    color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/30',    dot: 'bg-orange-500'  },
  { value: 'Urgent', label: 'Urgente', color: 'text-red-500',    bg: 'bg-red-50 dark:bg-red-900/30',          dot: 'bg-red-500'     },
]

const CATEGORIES = [
  'Geral', 'Marketing', 'Design', 'Desenvolvimento', 'Financeiro',
  'RH', 'Operações', 'Administrativo', 'Contabilidade', 'Digital', 'Outro',
]

const CARD_COLORS = [
  { value: null,      label: 'Padrão'  },
  { value: '#6366f1', label: 'Índigo'  },
  { value: '#0ea5e9', label: 'Azul'    },
  { value: '#10b981', label: 'Verde'   },
  { value: '#f59e0b', label: 'Âmbar'   },
  { value: '#ef4444', label: 'Vermelho'},
  { value: '#8b5cf6', label: 'Roxo'    },
  { value: '#ec4899', label: 'Rosa'    },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

const priorityInfo  = v  => PRIORITIES.find(p => p.value === v) || PRIORITIES[1]
const isOverdue     = d  => d && new Date(d) < new Date()
const formatDate    = d  => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : null
const initials      = n  => n ? n.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase() : '?'
const colLabel      = id => COLUMNS.find(c => c.id === id)?.label || id

const hexToRgb = hex => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]

const PRI_LABEL = { Low: 'Baixa', Medium: 'Média', High: 'Alta', Urgent: 'Urgente' }

const assigneeNames = t =>
  t.assignees?.length
    ? t.assignees.map(a => a.name).join(', ')
    : (t.assigned_to || '—')

function generatePDF(tasks, dateRange = {}) {
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const now  = new Date()
  const W    = doc.internal.pageSize.getWidth()
  const H    = doc.internal.pageSize.getHeight()
  const date = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const fmtDateBR = iso => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR') : null
  const periodLabel = dateRange.from || dateRange.to
    ? `Período: ${fmtDateBR(dateRange.from) || '…'} até ${fmtDateBR(dateRange.to) || '…'}`
    : null

  // ── Cabeçalho ──────────────────────────────────────────────────────────────
  const headerH = periodLabel ? 34 : 28
  doc.setFillColor(18, 43, 60)
  doc.rect(0, 0, W, headerH, 'F')

  doc.setFontSize(20); doc.setFont('helvetica', 'bold')
  doc.setTextColor(67, 183, 191)
  doc.text('ZItask', 14, 12)

  doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  doc.setTextColor(200, 220, 225)
  doc.text('Gestão de Atividades', 14, 18)

  doc.setFontSize(11); doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('Relatório de Atividades', W - 14, 12, { align: 'right' })
  doc.setFontSize(8); doc.setFont('helvetica', 'normal')
  doc.setTextColor(160, 210, 215)
  doc.text(`Gerado em ${date} às ${time}`, W - 14, 18, { align: 'right' })
  if (periodLabel) {
    doc.setFontSize(8)
    doc.setTextColor(67, 183, 191)
    doc.text(periodLabel, W - 14, 26, { align: 'right' })
  }

  // ── Resumo ─────────────────────────────────────────────────────────────────
  let y = headerH + 8
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(30, 30, 30)
  doc.text('Resumo por Etapa', 14, y)
  y += 4

  const stagesWithTasks = COLUMNS.map(col => ({
    col, count: tasks.filter(t => t.status === col.id).length,
  })).filter(({ count }) => count > 0)

  autoTable(doc, {
    startY: y,
    head: [['Etapa', 'Qtd.']],
    body: stagesWithTasks.map(({ col, count }) => [col.label, count]),
    foot: [['Total de atividades', tasks.length]],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [18, 43, 60], textColor: [255, 255, 255], fontStyle: 'bold' },
    footStyles: { fillColor: [235, 235, 235], textColor: [40, 40, 40], fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'center', cellWidth: 25 } },
    margin: { left: 14, right: 14 },
  })

  y = doc.lastAutoTable.finalY + 12

  // ── Tabela por etapa ───────────────────────────────────────────────────────
  COLUMNS.forEach(col => {
    const colTasks = tasks.filter(t => t.status === col.id)
    if (!colTasks.length) return

    if (y > H - 50) { doc.addPage(); y = 14 }

    const [r, g, b] = hexToRgb(col.color)
    doc.setFillColor(r, g, b)
    doc.roundedRect(14, y, W - 28, 8, 2, 2, 'F')
    doc.setTextColor(255, 255, 255); doc.setFontSize(10); doc.setFont('helvetica', 'bold')
    doc.text(`${col.label}   (${colTasks.length} atividade${colTasks.length !== 1 ? 's' : ''})`, 19, y + 5.5)
    y += 10

    autoTable(doc, {
      startY: y,
      head: [['ID', 'Título', 'Prioridade', 'Categoria', 'Responsáveis', 'Prazo']],
      body: colTasks.map(t => [
        t.task_id,
        t.title,
        PRI_LABEL[t.priority] || t.priority || '—',
        t.category || '—',
        assigneeNames(t),
        t.due_date ? new Date(t.due_date).toLocaleDateString('pt-BR') : '—',
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [240, 240, 240], textColor: [60, 60, 60], fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [252, 252, 252] },
      columnStyles: {
        0: { cellWidth: 16 },
        2: { cellWidth: 22, halign: 'center' },
        3: { cellWidth: 28 },
        4: { cellWidth: 38 },
        5: { cellWidth: 20, halign: 'center' },
      },
      margin: { left: 14, right: 14 },
    })

    y = doc.lastAutoTable.finalY + 8
  })

  // ── Rodapé de páginas ──────────────────────────────────────────────────────
  const total = doc.internal.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.setFontSize(7); doc.setTextColor(180, 180, 180)
    doc.text('ZItask — Gestão de Atividades', 14, H - 6)
    doc.text(`Página ${i} de ${total}`, W - 14, H - 6, { align: 'right' })
  }

  doc.save(`zitask-relatorio-${now.toISOString().slice(0, 10)}.pdf`)
}

// ─── Toast ───────────────────────────────────────────────────────────────────

function useToast() {
  const [toasts, setToasts] = useState([])
  const toast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }, [])
  const dismiss = id => setToasts(prev => prev.filter(t => t.id !== id))
  return { toasts, toast, dismiss }
}

function ToastList({ toasts, dismiss }) {
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium min-w-64 max-w-sm animate-in slide-in-from-right-4 ${
            t.type === 'success' ? 'bg-green-500 text-white' :
            t.type === 'error'   ? 'bg-red-500 text-white'   :
            'bg-slate-800 text-white'
          }`}
        >
          {t.type === 'success' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          <span className="flex-1">{t.message}</span>
          <button onClick={() => dismiss(t.id)} className="opacity-70 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({ title, message, onConfirm, onCancel, danger = true }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white dark:bg-dark-800 rounded-2xl shadow-2xl p-6 max-w-sm w-full border border-slate-200 dark:border-slate-700">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${danger ? 'bg-red-100 dark:bg-red-900/30' : 'bg-slate-100 dark:bg-dark-700'}`}>
          <AlertTriangle className={`w-5 h-5 ${danger ? 'text-red-500' : 'text-slate-500'}`} />
        </div>
        <h3 className="font-bold text-base mb-1">{title}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-dark-700 rounded-xl transition-colors">
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-bold rounded-xl transition-colors ${danger ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-zitask-secondary hover:bg-zitask-secondary/90 text-zitask-primary'}`}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── User Picker ─────────────────────────────────────────────────────────────

function UserPicker({ selected, members, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = m => {
    const exists = selected.some(s => s.id === m.id)
    onChange(exists ? selected.filter(s => s.id !== m.id) : [...selected, { id: m.id, name: m.name }])
  }

  return (
    <div ref={ref} className="relative">
      <div className="flex flex-wrap gap-1.5 min-h-[36px] items-center p-1.5 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-dark-700">
        {selected.map(s => (
          <span key={s.id} className="flex items-center gap-1.5 pl-1 pr-2 py-0.5 bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-600 rounded-lg text-xs font-semibold shadow-sm">
            <div className="w-4 h-4 rounded bg-gradient-to-br from-zitask-secondary to-zitask-primary text-white text-[8px] font-bold flex items-center justify-center flex-shrink-0">
              {initials(s.name)}
            </div>
            {s.name}
            <button type="button" onClick={() => toggle(s)} className="text-slate-400 hover:text-red-400 transition-colors">
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-1 px-2 py-1 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-[11px] text-slate-400 hover:border-zitask-secondary hover:text-zitask-secondary transition-all"
        >
          <Plus className="w-3 h-3" />
          {selected.length === 0 ? 'Adicionar responsável' : 'Adicionar'}
        </button>
      </div>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-full bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-xl z-20 max-h-52 overflow-y-auto">
          {members.length === 0 ? (
            <p className="text-xs text-slate-400 p-3 text-center">Nenhum usuário ativo</p>
          ) : members.map(m => {
            const sel = selected.some(s => s.id === m.id)
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggle(m)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-dark-700 transition-colors text-left ${sel ? 'bg-zitask-secondary/5' : ''}`}
              >
                <div className={`w-7 h-7 rounded-lg text-white text-xs font-bold flex items-center justify-center flex-shrink-0 transition-colors ${sel ? 'bg-zitask-secondary' : 'bg-slate-300 dark:bg-slate-600'}`}>
                  {initials(m.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{m.name}</p>
                  <p className="text-[10px] text-slate-400 truncate">{m.email}</p>
                </div>
                {sel && <CheckCircle2 className="w-4 h-4 text-zitask-secondary flex-shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Task Modal ───────────────────────────────────────────────────────────────

function TaskModal({ task, onClose, onSave, onDelete, toast }) {
  const isNew = !task
  const [form, setForm] = useState({
    title:       task?.title       || '',
    description: task?.description || '',
    status:      task?.status      || 'To Do',
    priority:    task?.priority    || 'Medium',
    category:    task?.category    || 'Geral',
    due_date:    task?.due_date    ? task.due_date.slice(0, 10) : '',
    color:       task?.color       || null,
    tags:        task?.tags        || [],
    assignees:   task?.assignees   || [],
  })
  const [tagInput, setTagInput]       = useState('')
  const [saving, setSaving]           = useState(false)
  const [confirmDelete, setConfirm]   = useState(false)
  const [members, setMembers]         = useState([])

  useEffect(() => {
    api.get('/members').then(r => setMembers(r.data)).catch(() => {})
  }, [])

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const addTag = () => {
    const t = tagInput.trim().toLowerCase()
    if (t && !form.tags.includes(t)) set('tags', [...form.tags, t])
    setTagInput('')
  }

  const handleSave = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      await onSave(task?.id, { ...form, due_date: form.due_date || '' })
      toast(isNew ? 'Atividade criada!' : 'Atividade atualizada!', 'success')
      onClose()
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Erro ao salvar. Tente novamente.'
      toast(msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    try {
      await onDelete(task.id)
      toast('Atividade excluída.', 'success')
      onClose()
    } catch {
      toast('Erro ao excluir.', 'error')
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
        <div
          className="relative bg-white dark:bg-dark-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto"
          onClick={e => e.stopPropagation()}
        >
          {/* Color strip */}
          <div className="h-1.5 rounded-t-2xl" style={{ backgroundColor: form.color || '#43B7BF' }} />

          <div className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-5">
              <div className="flex-1 mr-4">
                {task && (
                  <span className="text-[10px] font-black text-zitask-secondary bg-zitask-secondary/10 px-2 py-0.5 rounded mb-2 inline-block tracking-tighter">
                    {task.task_id}
                  </span>
                )}
                <input
                  value={form.title}
                  onChange={e => set('title', e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  className="w-full text-xl font-bold bg-transparent border-b-2 border-transparent hover:border-slate-200 dark:hover:border-slate-600 focus:border-zitask-secondary outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400 placeholder:font-normal transition-colors pb-0.5"
                  placeholder="Título da atividade..."
                  autoFocus
                />
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-700 transition-colors flex-shrink-0">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {/* Grid: Status + Priority */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="field-label">Status</label>
                <SelectField value={form.status} onChange={v => set('status', v)}>
                  {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </SelectField>
              </div>
              <div>
                <label className="field-label">Prioridade</label>
                <SelectField value={form.priority} onChange={v => set('priority', v)}>
                  {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </SelectField>
              </div>
            </div>

            {/* Grid: Category + Due date */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="field-label">Categoria</label>
                <SelectField value={form.category} onChange={v => set('category', v)}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </SelectField>
              </div>
              <div>
                <label className="field-label">Data de Entrega</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={e => set('due_date', e.target.value)}
                    className="field-input pl-8"
                  />
                </div>
              </div>
            </div>

            {/* Responsáveis */}
            <div className="mb-4">
              <label className="field-label">Responsáveis</label>
              <UserPicker
                selected={form.assignees}
                members={members}
                onChange={v => set('assignees', v)}
              />
            </div>

            {/* Cor do Card */}
            <div className="mb-4">
              <label className="field-label">Cor do Card</label>
              <div className="flex gap-2 flex-wrap pt-1.5">
                {CARD_COLORS.map(c => (
                  <button
                    key={c.value ?? 'default'}
                    onClick={() => set('color', c.value)}
                    title={c.label}
                    className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${form.color === c.value ? 'border-zitask-secondary scale-125' : 'border-slate-200 dark:border-slate-600'}`}
                    style={{ backgroundColor: c.value || '#e2e8f0' }}
                  />
                ))}
              </div>
            </div>

            {/* Description */}
            <div className="mb-4">
              <label className="field-label">Descrição</label>
              <textarea
                value={form.description}
                onChange={e => set('description', e.target.value)}
                rows={3}
                placeholder="Descreva a atividade..."
                className="field-input resize-none"
              />
            </div>

            {/* Tags */}
            <div className="mb-6">
              <label className="field-label">Tags</label>
              {form.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {form.tags.map(t => (
                    <span key={t} className="flex items-center gap-1 px-2 py-0.5 bg-zitask-secondary/10 text-zitask-secondary rounded-full text-xs font-medium">
                      #{t}
                      <button onClick={() => set('tags', form.tags.filter(x => x !== t))} className="hover:text-red-400 transition-colors">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                  placeholder="Digite e pressione Enter..."
                  className="field-input flex-1"
                />
                <button onClick={addTag} className="px-3 py-2 bg-slate-100 dark:bg-dark-700 rounded-xl hover:bg-slate-200 dark:hover:bg-dark-600 transition-colors">
                  <Plus className="w-3.5 h-3.5 text-slate-500" />
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-700">
              {!isNew ? (
                <button
                  onClick={() => setConfirm(true)}
                  className="flex items-center gap-1.5 px-3 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl text-sm font-medium transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Excluir
                </button>
              ) : <div />}
              <div className="flex gap-2">
                <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-dark-700 rounded-xl transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.title.trim()}
                  className="flex items-center gap-2 px-5 py-2 bg-zitask-secondary text-zitask-primary font-bold rounded-xl text-sm transition-colors shadow-md hover:bg-zitask-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {saving ? 'Salvando…' : isNew ? 'Criar' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Excluir atividade"
          message={`"${task.title}" será excluída permanentemente.`}
          onConfirm={handleDelete}
          onCancel={() => setConfirm(false)}
        />
      )}
    </>
  )
}

// ─── Reusable field components ────────────────────────────────────────────────

function SelectField({ value, onChange, children }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="field-input appearance-none pr-8 cursor-pointer"
      >
        {children}
      </select>
      <ChevronDown className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
    </div>
  )
}

// ─── Task Card ────────────────────────────────────────────────────────────────

function TaskCard({ task, onEdit, onDragStart }) {
  const pri    = priorityInfo(task.priority)
  const overdue = isOverdue(task.due_date) && task.status !== 'Done'

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData('taskId', String(task.id)); onDragStart?.() }}
      onClick={() => onEdit(task)}
      className="bg-white dark:bg-dark-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 hover:border-zitask-secondary dark:hover:border-zitask-secondary transition-all cursor-pointer group hover:shadow-md hover:-translate-y-0.5 overflow-hidden select-none"
    >
      {task.color && <div className="h-1" style={{ backgroundColor: task.color }} />}

      <div className="p-3.5">
        {/* Top */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] font-black text-zitask-primary dark:text-zitask-secondary bg-zitask-secondary/10 px-1.5 py-0.5 rounded tracking-tighter">
            {task.task_id}
          </span>
          <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${pri.bg} ${pri.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${pri.dot}`} />
            {pri.label}
          </span>
        </div>

        {/* Title */}
        <h4 className="font-semibold text-sm leading-snug mb-1.5 group-hover:text-zitask-secondary transition-colors line-clamp-2">
          {task.title}
        </h4>

        {/* Description preview */}
        {task.description && (
          <p className="text-[11px] text-slate-400 line-clamp-1 mb-2">{task.description}</p>
        )}

        {/* Tags */}
        {task.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {task.tags.slice(0, 3).map(t => (
              <span key={t} className="px-1.5 py-0.5 bg-slate-100 dark:bg-dark-700 text-slate-500 rounded text-[9px] font-medium">#{t}</span>
            ))}
            {task.tags.length > 3 && <span className="text-[9px] text-slate-400">+{task.tags.length - 3}</span>}
          </div>
        )}

        {/* Category badge */}
        {task.category && task.category !== 'Geral' && (
          <span className="inline-block px-1.5 py-0.5 bg-zitask-primary/10 text-zitask-primary dark:text-zitask-secondary rounded-full text-[9px] font-bold uppercase tracking-wide mb-2">
            {task.category}
          </span>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2.5 mt-1 border-t border-slate-100 dark:border-slate-700/50">
          {task.due_date ? (
            <span className={`flex items-center text-[10px] font-medium ${overdue ? 'text-red-500' : 'text-slate-400'}`}>
              <Calendar className="w-3 h-3 mr-1" />
              {formatDate(task.due_date)}
              {overdue && <span className="ml-1 text-red-500">⚠</span>}
            </span>
          ) : (
            <span className="flex items-center text-[10px] text-slate-300 dark:text-slate-600">
              <Clock className="w-3 h-3 mr-1" />
              {new Date(task.created_at).toLocaleDateString('pt-BR')}
            </span>
          )}
          {task.assignees?.length > 0 ? (
            <div className="flex -space-x-1.5">
              {task.assignees.slice(0, 3).map(a => (
                <div
                  key={a.id}
                  title={a.name}
                  className="w-5 h-5 rounded-lg bg-gradient-to-br from-zitask-secondary to-zitask-primary flex items-center justify-center text-[8px] text-white font-bold flex-shrink-0 ring-1 ring-white dark:ring-dark-800"
                >
                  {initials(a.name)}
                </div>
              ))}
              {task.assignees.length > 3 && (
                <div className="w-5 h-5 rounded-lg bg-slate-200 dark:bg-dark-700 flex items-center justify-center text-[8px] text-slate-500 font-bold ring-1 ring-white dark:ring-dark-800">
                  +{task.assignees.length - 3}
                </div>
              )}
            </div>
          ) : (
            <div className="w-5 h-5 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center flex-shrink-0">
              <User className="w-2.5 h-2.5 text-slate-300 dark:text-slate-600" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Kanban View ──────────────────────────────────────────────────────────────

function KanbanView({ tasks, loading, loadError, onRetry, onAddTask, onMoveTask, onDeleteTask, onEditTask, toast, currentUser }) {
  const [addingCol,    setAddingCol]   = useState(null)
  const [quickTitle,   setQuickTitle]  = useState('')
  const [search,       setSearch]      = useState('')
  const [filterPri,    setFilterPri]   = useState('')
  const [filterCat,    setFilterCat]   = useState('')
  const [filterMine,   setFilterMine]  = useState(false)
  const [dragOver,     setDragOver]    = useState(null)
  const [editTask,     setEditTask]    = useState(null)
  const [showNew,      setShowNew]     = useState(false)

  const filtered = tasks.filter(t => {
    const q = search.trim().toLowerCase()
    return (
      (!q || t.title.toLowerCase().includes(q) || t.task_id.toLowerCase().includes(q) || (t.tags || []).some(tag => tag.includes(q))) &&
      (!filterPri || t.priority === filterPri) &&
      (!filterCat || t.category === filterCat) &&
      (!filterMine || t.assignees?.some(a => a.id === currentUser?.id))
    )
  })

  const handleQuickAdd = async colId => {
    if (!quickTitle.trim()) return
    const title = quickTitle
    setQuickTitle('')
    setAddingCol(null)
    await onAddTask(colId, title, {})
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Filter bar */}
      <div className="flex items-center gap-2.5 px-6 py-3 bg-white dark:bg-dark-800 border-b border-slate-200 dark:border-slate-700 flex-shrink-0 flex-wrap">
        <div className="flex items-center bg-slate-100 dark:bg-dark-700 rounded-full px-3 py-1.5 border border-transparent focus-within:border-zitask-secondary transition-all">
          <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar atividade, ID ou #tag…"
            className="bg-transparent border-none focus:ring-0 text-sm ml-2 w-48 placeholder:text-slate-400 outline-none"
          />
          {search && <button onClick={() => setSearch('')}><X className="w-3 h-3 text-slate-400" /></button>}
        </div>

        <select value={filterPri} onChange={e => setFilterPri(e.target.value)}
          className="text-xs bg-slate-100 dark:bg-dark-700 border-none rounded-full px-3 py-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-zitask-secondary cursor-pointer">
          <option value="">Todas as prioridades</option>
          {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>

        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
          className="text-xs bg-slate-100 dark:bg-dark-700 border-none rounded-full px-3 py-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-zitask-secondary cursor-pointer">
          <option value="">Todas as categorias</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <button
          onClick={() => setFilterMine(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${filterMine ? 'bg-zitask-secondary text-zitask-primary shadow-md' : 'bg-slate-100 dark:bg-dark-700 text-slate-500 hover:bg-slate-200 dark:hover:bg-dark-600'}`}
        >
          <User className="w-3 h-3" />
          Minhas atividades
        </button>

        {(search || filterPri || filterCat || filterMine) && (
          <button onClick={() => { setSearch(''); setFilterPri(''); setFilterCat(''); setFilterMine(false) }}
            className="text-xs text-slate-400 hover:text-slate-600 underline">
            Limpar filtros
          </button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-slate-400">{filtered.length} atividade{filtered.length !== 1 ? 's' : ''}</span>
          <button onClick={() => setShowNew(true)}
            className="flex items-center px-4 py-1.5 bg-zitask-secondary hover:bg-zitask-secondary/90 text-zitask-primary font-bold rounded-full text-sm transition-all shadow-md">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Nova Atividade
          </button>
        </div>
      </div>

      {/* Error state */}
      {loadError && (
        <div className="flex items-center justify-center flex-1">
          <div className="text-center">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="font-semibold text-slate-600 dark:text-slate-300 mb-1">Não foi possível carregar as atividades</p>
            <p className="text-sm text-slate-400 mb-4">Verifique se a API está online</p>
            <button onClick={onRetry} className="flex items-center gap-2 mx-auto px-4 py-2 bg-zitask-secondary text-zitask-primary font-bold rounded-xl text-sm">
              <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
            </button>
          </div>
        </div>
      )}

      {/* Board */}
      {!loadError && (
        <div className="flex-1 overflow-x-auto p-5 bg-slate-50 dark:bg-dark-900/50">
          <div className="flex gap-4 min-w-max pb-4 h-full items-start">
            {COLUMNS.map(col => {
              const colTasks = filtered.filter(t => t.status === col.id)
              return (
                <div
                  key={col.id}
                  className={`w-68 flex-shrink-0 flex flex-col rounded-2xl p-1.5 transition-all ${dragOver === col.id ? 'bg-zitask-secondary/10 ring-2 ring-zitask-secondary/40' : ''}`}
                  style={{ minWidth: '272px', maxWidth: '272px' }}
                  onDragOver={e => { e.preventDefault(); setDragOver(col.id) }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={e => { e.preventDefault(); setDragOver(null); onMoveTask(e.dataTransfer.getData('taskId'), col.id) }}
                >
                  {/* Column header */}
                  <div className="flex items-center justify-between mb-2.5 px-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
                      <span className="font-bold text-slate-600 dark:text-slate-300 text-xs uppercase tracking-widest">{col.label}</span>
                      <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-dark-700 text-slate-500 text-[9px] font-bold rounded-full">{colTasks.length}</span>
                    </div>
                    <button onClick={() => { setAddingCol(col.id); setQuickTitle('') }}
                      className="p-1 hover:bg-slate-200 dark:hover:bg-dark-700 rounded-lg transition-colors">
                      <Plus className="w-3 h-3 text-slate-400" />
                    </button>
                  </div>

                  {/* Cards */}
                  <div className="space-y-2.5 min-h-12">
                    {loading ? (
                      <div className="flex justify-center py-8">
                        <div className="w-6 h-6 border-2 border-zitask-secondary border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : (
                      colTasks.map(task => (
                        <TaskCard key={task.id} task={task} onEdit={setEditTask} />
                      ))
                    )}

                    {!loading && colTasks.length === 0 && !addingCol && (
                      <div className="py-6 text-center text-[10px] text-slate-300 dark:text-slate-600 select-none">
                        Solte aqui
                      </div>
                    )}

                    {/* Quick add */}
                    {addingCol === col.id ? (
                      <div className="p-3 bg-white dark:bg-dark-800 rounded-xl border-2 border-zitask-secondary shadow-lg">
                        <input
                          autoFocus
                          value={quickTitle}
                          onChange={e => setQuickTitle(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleQuickAdd(col.id)
                            if (e.key === 'Escape') setAddingCol(null)
                          }}
                          placeholder="Título da atividade…"
                          className="w-full text-sm bg-transparent border-none focus:ring-0 p-0 mb-2 outline-none"
                        />
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] text-slate-400">Enter para salvar, Esc para cancelar</span>
                          <div className="flex gap-2">
                            <button onClick={() => setAddingCol(null)} className="px-2 py-1 text-[10px] font-bold text-slate-400 hover:text-slate-600">Cancelar</button>
                            <button onClick={() => handleQuickAdd(col.id)} className="px-3 py-1 text-[10px] font-bold bg-zitask-secondary text-zitask-primary rounded-lg">Salvar</button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAddingCol(col.id); setQuickTitle('') }}
                        className="w-full py-2 border-2 border-dashed border-slate-200 dark:border-slate-700/50 rounded-xl text-[10px] font-bold text-slate-400 hover:border-zitask-secondary hover:text-zitask-secondary transition-all"
                      >
                        + Adicionar
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editTask && (
        <TaskModal
          task={editTask}
          toast={toast}
          onClose={() => setEditTask(null)}
          onSave={onEditTask}
          onDelete={onDeleteTask}
        />
      )}

      {/* New task modal */}
      {showNew && (
        <TaskModal
          task={null}
          toast={toast}
          onClose={() => setShowNew(false)}
          onSave={(_, form) => onAddTask(form.status, form.title, form)}
          onDelete={() => {}}
        />
      )}
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function DashboardView({ tasks }) {
  const total    = tasks.length
  const done     = tasks.filter(t => t.status === 'Done').length
  const doing    = tasks.filter(t => ['Doing', 'Peer Review', 'Testing'].includes(t.status)).length
  const urgent   = tasks.filter(t => t.priority === 'Urgent' && t.status !== 'Done').length
  const overdue  = tasks.filter(t => isOverdue(t.due_date) && t.status !== 'Done').length
  const progress = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="flex-1 overflow-y-auto p-7 bg-slate-50 dark:bg-dark-900/50">
      <h2 className="text-2xl font-bold mb-1">Dashboard</h2>
      <p className="text-sm text-slate-400 mb-7">Visão geral de todas as atividades</p>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
        {[
          { label: 'Total de Atividades', value: total,  icon: <Circle className="w-5 h-5" />,      color: 'text-slate-400',  bg: 'bg-slate-100 dark:bg-slate-700/50' },
          { label: 'Em Andamento',        value: doing,  icon: <ArrowRight className="w-5 h-5" />,  color: 'text-zitask-secondary', bg: 'bg-zitask-secondary/10' },
          { label: 'Urgentes',            value: urgent, icon: <Flag className="w-5 h-5" />,         color: 'text-red-500',    bg: 'bg-red-50 dark:bg-red-900/20' },
          { label: 'Atrasadas',           value: overdue,icon: <AlertCircle className="w-5 h-5" />, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20' },
        ].map(c => (
          <div key={c.label} className="bg-white dark:bg-dark-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${c.bg} ${c.color}`}>{c.icon}</div>
            <p className="text-3xl font-black mb-0.5">{c.value}</p>
            <p className="text-xs text-slate-400 font-medium">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Progress */}
        <div className="bg-white dark:bg-dark-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex justify-between mb-3">
            <h3 className="font-bold text-sm">Progresso Geral</h3>
            <span className="font-black text-sm text-zitask-secondary">{progress}%</span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-dark-700 rounded-full h-3 mb-2">
            <div className="bg-zitask-secondary h-3 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-slate-400">{done} de {total} concluídas</p>
        </div>

        {/* By priority */}
        <div className="bg-white dark:bg-dark-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
          <h3 className="font-bold text-sm mb-4">Por Prioridade</h3>
          <div className="space-y-3">
            {PRIORITIES.map(p => {
              const count = tasks.filter(t => t.priority === p.value).length
              return (
                <div key={p.value} className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${p.dot}`} />
                  <span className="text-xs font-medium w-14">{p.label}</span>
                  <div className="flex-1 bg-slate-100 dark:bg-dark-700 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full transition-all ${p.dot}`} style={{ width: total > 0 ? `${(count / total) * 100}%` : '0%' }} />
                  </div>
                  <span className="text-xs font-bold w-4 text-right text-slate-500">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* By column */}
      <div className="bg-white dark:bg-dark-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
        <h3 className="font-bold text-sm mb-4">Por Coluna</h3>
        <div className="space-y-3">
          {COLUMNS.map(col => {
            const count = tasks.filter(t => t.status === col.id).length
            return (
              <div key={col.id} className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: col.color }} />
                <span className="text-xs font-medium w-28">{col.label}</span>
                <div className="flex-1 bg-slate-100 dark:bg-dark-700 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full transition-all" style={{ width: total > 0 ? `${(count / total) * 100}%` : '0%', backgroundColor: col.color }} />
                </div>
                <span className="text-xs font-bold w-4 text-right text-slate-500">{count}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Analytics View ───────────────────────────────────────────────────────────

function AnalyticsView({ tasks, onEditTask, onDeleteTask, toast }) {
  const [sortBy,        setSortBy]       = useState('created_at')
  const [filterStatus,  setFilterStatus] = useState('')
  const [filterDateFrom,setDateFrom]     = useState('')
  const [filterDateTo,  setDateTo]       = useState('')
  const [editTask,      setEditTask]     = useState(null)
  const [confirm,       setConfirm]      = useState(null)

  const sorted = [...tasks]
    .filter(t => !filterStatus || t.status === filterStatus)
    .filter(t => {
      if (!filterDateFrom && !filterDateTo) return true
      const d = new Date(t.created_at)
      if (filterDateFrom && d < new Date(filterDateFrom + 'T00:00:00')) return false
      if (filterDateTo   && d > new Date(filterDateTo   + 'T23:59:59')) return false
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'created_at') return new Date(b.created_at) - new Date(a.created_at)
      if (sortBy === 'priority') {
        const o = { Urgent: 0, High: 1, Medium: 2, Low: 3 }
        return (o[a.priority] ?? 2) - (o[b.priority] ?? 2)
      }
      if (sortBy === 'title')    return a.title.localeCompare(b.title)
      if (sortBy === 'due_date') {
        if (!a.due_date) return 1; if (!b.due_date) return -1
        return new Date(a.due_date) - new Date(b.due_date)
      }
      return 0
    })

  const hasDateFilter = filterDateFrom || filterDateTo

  return (
    <div className="flex-1 overflow-y-auto p-7 bg-slate-50 dark:bg-dark-900/50">
      <div className="flex items-start justify-between mb-1">
        <h2 className="text-2xl font-bold">Analytics</h2>
        <button
          onClick={() => generatePDF(sorted, { from: filterDateFrom, to: filterDateTo })}
          className="flex items-center gap-2 px-4 py-2 bg-zitask-secondary text-zitask-primary font-bold rounded-xl text-sm hover:bg-zitask-secondary/90 transition-colors shadow-md"
        >
          <FileDown className="w-4 h-4" />
          Exportar PDF {sorted.length < tasks.length && `(${sorted.length})`}
        </button>
      </div>
      <p className="text-sm text-slate-400 mb-6">Histórico e métricas</p>

      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="text-xs bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 focus:outline-none focus:border-zitask-secondary">
          <option value="">Todos os status</option>
          {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          className="text-xs bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 focus:outline-none focus:border-zitask-secondary">
          <option value="created_at">Mais recentes</option>
          <option value="priority">Prioridade</option>
          <option value="title">Título A–Z</option>
          <option value="due_date">Prazo</option>
        </select>

        {/* Filtro de período */}
        <div className="flex items-center gap-1.5 bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5">
          <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <input
            type="date"
            value={filterDateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="text-xs bg-transparent outline-none text-slate-600 dark:text-slate-300 w-28"
          />
          <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
          <input
            type="date"
            value={filterDateTo}
            onChange={e => setDateTo(e.target.value)}
            className="text-xs bg-transparent outline-none text-slate-600 dark:text-slate-300 w-28"
          />
          {hasDateFilter && (
            <button onClick={() => { setDateFrom(''); setDateTo('') }} className="text-slate-400 hover:text-red-400 transition-colors ml-1">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <span className="text-xs text-slate-400">{sorted.length} resultado{sorted.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-slate-400 bg-slate-50 dark:bg-dark-700/50 border-b border-slate-100 dark:border-slate-700">
              {['ID', 'Título', 'Status', 'Prioridade', 'Categoria', 'Responsável', 'Prazo', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(task => {
              const pri = priorityInfo(task.priority)
              const od  = isOverdue(task.due_date) && task.status !== 'Done'
              return (
                <tr key={task.id} className="border-b border-slate-50 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-dark-700/30 transition-colors group">
                  <td className="px-4 py-3 font-black text-[10px] text-zitask-secondary">{task.task_id}</td>
                  <td className="px-4 py-3 font-medium max-w-xs">
                    <span className="truncate block">{task.title}</span>
                    {task.tags?.length > 0 && (
                      <div className="flex gap-1 mt-0.5">
                        {task.tags.slice(0, 2).map(t => (
                          <span key={t} className="text-[9px] text-slate-400">#{t}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-slate-100 dark:bg-dark-700 rounded-full text-[10px] font-bold">{colLabel(task.status)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`flex items-center gap-1 text-[10px] font-bold w-fit ${pri.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${pri.dot}`} />
                      {pri.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[10px] text-slate-400">{task.category || '—'}</td>
                  <td className="px-4 py-3 text-[10px] text-slate-400">{assigneeNames(task)}</td>
                  <td className={`px-4 py-3 text-[10px] font-medium ${od ? 'text-red-500' : 'text-slate-400'}`}>
                    {task.due_date ? formatDate(task.due_date) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button onClick={() => setEditTask(task)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-700 text-slate-400 hover:text-zitask-secondary transition-colors">
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button onClick={() => setConfirm(task)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <p className="text-center text-slate-400 py-12 text-sm">Nenhuma atividade encontrada.</p>
        )}
      </div>

      {editTask && (
        <TaskModal task={editTask} toast={toast} onClose={() => setEditTask(null)} onSave={onEditTask} onDelete={onDeleteTask} />
      )}
      {confirm && (
        <ConfirmDialog
          title="Excluir atividade"
          message={`"${confirm.title}" será excluída permanentemente.`}
          onConfirm={async () => { await onDeleteTask(confirm.id); toast('Atividade excluída.', 'success'); setConfirm(null) }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}

// ─── Settings View ────────────────────────────────────────────────────────────

function SettingsView({ isDarkMode, setIsDarkMode }) {
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex-1 overflow-y-auto p-7 bg-slate-50 dark:bg-dark-900/50">
      <h2 className="text-2xl font-bold mb-1">Configurações</h2>
      <p className="text-sm text-slate-400 mb-7">Preferências do sistema</p>

      <div className="max-w-lg space-y-4">
        {/* Theme toggle */}
        <div className="bg-white dark:bg-dark-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
          <h3 className="font-bold text-sm mb-4">Aparência</h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Modo Escuro</p>
              <p className="text-xs text-slate-400 mt-0.5">Alternado automaticamente entre claro e escuro</p>
            </div>
            <button
              onClick={() => setIsDarkMode(v => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${isDarkMode ? 'bg-zitask-secondary' : 'bg-slate-200'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${isDarkMode ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
        </div>

        {/* Workspace info */}
        <div className="bg-white dark:bg-dark-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
          <h3 className="font-bold text-sm mb-4">Workspace</h3>
          <div className="space-y-3">
            {[
              { label: 'Nome do Workspace', key: 'workspace', placeholder: 'Meu Workspace' },
              { label: 'Nome do Projeto',   key: 'project',   placeholder: 'Projeto Principal' },
            ].map(f => (
              <div key={f.key}>
                <label className="field-label">{f.label}</label>
                <input
                  defaultValue={localStorage.getItem(`zitask_${f.key}`) || f.placeholder}
                  onChange={e => localStorage.setItem(`zitask_${f.key}`, e.target.value)}
                  className="field-input"
                />
              </div>
            ))}
          </div>
        </div>

        {/* About */}
        <div className="bg-white dark:bg-dark-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
          <h3 className="font-bold text-sm mb-3">Sobre</h3>
          <div className="space-y-1.5 text-sm text-slate-500">
            <p><span className="font-medium">Versão:</span> ZItask v0.2.0</p>
            <p><span className="font-medium">API:</span> {import.meta.env.VITE_API_URL || 'http://localhost:8000'}</p>
          </div>
        </div>

        <button
          onClick={handleSave}
          className={`w-full py-2.5 rounded-xl font-bold text-sm transition-all ${saved ? 'bg-green-500 text-white' : 'bg-zitask-secondary text-zitask-primary hover:bg-zitask-secondary/90'}`}
        >
          {saved ? '✓ Salvo!' : 'Salvar Configurações'}
        </button>
      </div>
    </div>
  )
}

// ─── App Shell ────────────────────────────────────────────────────────────────

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('zitask_dark')
    return saved !== null ? saved === 'true' : true
  })
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('zitask_user')) } catch { return null }
  })
  const [activeView, setActiveView] = useState('kanban')
  const [tasks,      setTasks]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [loadError,  setLoadError]  = useState(false)
  const { toasts, toast, dismiss }  = useToast()

  const isAdmin = currentUser?.role === 'admin_master'

  const handleLogin = user => {
    setCurrentUser(user)
    fetchTasks()
  }

  const handleLogout = () => {
    localStorage.removeItem('zitask_token')
    localStorage.removeItem('zitask_user')
    setCurrentUser(null)
    setTasks([])
  }

  useEffect(() => {
    if (!currentUser) return
    fetchTasks()
  }, [currentUser])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode)
    localStorage.setItem('zitask_dark', String(isDarkMode))
  }, [isDarkMode])

  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} />
  }

  const fetchTasks = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const { data } = await api.get('/tasks')
      setTasks(data)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  const handleAddTask = async (columnId, title, extra = {}) => {
    if (!title?.trim()) return
    try {
      const { data } = await api.post('/tasks', {
        title,
        status:      columnId,
        priority:    extra.priority    || 'Medium',
        category:    extra.category    || 'Geral',
        description: extra.description || '',
        due_date:    extra.due_date    || null,
        color:       extra.color       || null,
        tags:        extra.tags        || [],
        assignees:   extra.assignees   || [],
      })
      setTasks(prev => [...prev, data])
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Erro ao criar atividade.'
      throw new Error(msg)
    }
  }

  const handleEditTask = async (id, form) => {
    try {
      const { data } = await api.patch(`/tasks/${id}`, form)
      setTasks(prev => prev.map(t => t.id === id ? data : t))
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Erro ao atualizar atividade.'
      throw new Error(msg)
    }
  }

  const handleMoveTask = async (taskId, newStatus) => {
    const id   = parseInt(taskId)
    const task = tasks.find(t => t.id === id)
    if (!task || task.status === newStatus) return
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: newStatus } : t))
    try {
      await api.patch(`/tasks/${id}`, { status: newStatus })
    } catch {
      toast('Erro ao mover atividade. Atualizando…', 'error')
      fetchTasks()
    }
  }

  const handleDeleteTask = async (taskId) => {
    try {
      await api.delete(`/tasks/${taskId}`)
      setTasks(prev => prev.filter(t => t.id !== taskId))
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Erro ao excluir atividade.'
      throw new Error(msg)
    }
  }

  const NAV = [
    { id: 'dashboard', label: 'Dashboard',     Icon: Layout    },
    { id: 'kanban',    label: 'Board Kanban',   Icon: Kanban    },
    { id: 'analytics', label: 'Analytics',      Icon: BarChart3 },
    ...(isAdmin ? [{ id: 'users', label: 'Usuários', Icon: Users }] : []),
    { id: 'settings',  label: 'Configurações',  Icon: Settings  },
  ]

  const workspaceName = localStorage.getItem('zitask_workspace') || 'Meu Workspace'
  const roleLabel = currentUser?.role === 'admin_master' ? 'Admin Master' : 'Colaborador'

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-dark-900 text-slate-800 dark:text-slate-100">
      {/* Sidebar */}
      <aside className="w-56 bg-zitask-primary text-white flex flex-col shadow-xl flex-shrink-0">
        <div className="p-5 border-b border-white/10">
          <h1 className="text-xl font-black tracking-tight">ZItask</h1>
          <p className="text-[9px] text-zitask-secondary font-bold uppercase tracking-widest opacity-80 mt-0.5">Gestão de Atividades</p>
        </div>

        <div className="px-4 pt-4 pb-1">
          <p className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-1">Workspace</p>
          <p className="text-xs font-semibold text-white/80 truncate">{workspaceName}</p>
        </div>

        <nav className="flex-1 px-3 py-3 space-y-0.5">
          {NAV.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveView(id)}
              className={`w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-all ${
                activeView === id
                  ? 'bg-white/10 text-zitask-secondary'
                  : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4 mr-3 flex-shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        {/* User info + logout */}
        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-2.5 px-1 mb-2">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shadow-md flex-shrink-0 border border-white/20 ${isAdmin ? 'bg-gradient-to-br from-purple-400 to-purple-700' : 'bg-gradient-to-br from-zitask-secondary to-zitask-primary'}`}>
              {initials(currentUser?.name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold truncate">{currentUser?.name}</p>
              <p className="text-[10px] text-white/40 truncate">{roleLabel}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-white/50 hover:text-white hover:bg-white/5 transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-14 bg-white dark:bg-dark-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6 flex-shrink-0">
          <h2 className="font-bold text-sm text-slate-600 dark:text-slate-300">
            {NAV.find(n => n.id === activeView)?.label}
          </h2>
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[10px] text-white shadow-sm ${isAdmin ? 'bg-gradient-to-br from-purple-400 to-purple-700' : 'bg-gradient-to-br from-zitask-secondary to-zitask-primary'}`}>
            {initials(currentUser?.name)}
          </div>
        </header>

        {activeView === 'dashboard' && <DashboardView tasks={tasks} />}
        {activeView === 'kanban'    && (
          <KanbanView
            tasks={tasks}
            loading={loading}
            loadError={loadError}
            onRetry={fetchTasks}
            onAddTask={handleAddTask}
            onMoveTask={handleMoveTask}
            onDeleteTask={handleDeleteTask}
            onEditTask={handleEditTask}
            toast={toast}
            currentUser={currentUser}
          />
        )}
        {activeView === 'analytics' && (
          <AnalyticsView tasks={tasks} onEditTask={handleEditTask} onDeleteTask={handleDeleteTask} toast={toast} />
        )}
        {activeView === 'users'     && isAdmin && (
          <UsersView currentUser={currentUser} toast={toast} />
        )}
        {activeView === 'settings'  && <SettingsView isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />}
      </main>

      <ToastList toasts={toasts} dismiss={dismiss} />
    </div>
  )
}
