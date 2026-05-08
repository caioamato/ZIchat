import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Layout, Kanban, Settings, Plus, Search, Clock,
  X, CheckCircle2, Circle, ArrowRight, AlertCircle, User,
  Calendar, Pencil, Trash2, Flag, ChevronDown, Save, RefreshCw,
  AlertTriangle, Users, LogOut, FileDown, Link2, ExternalLink, GripVertical,
  Menu, SlidersHorizontal, Eye, EyeOff, Check
} from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import api from './api'
import LoginPage from './LoginPage'
import UsersView from './UsersView'

const DEFAULT_COLUMNS = [
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

const CATEGORY_PALETTE = [
  '#ef4444','#f97316','#f59e0b','#eab308','#84cc16',
  '#22c55e','#10b981','#14b8a6','#06b6d4','#0ea5e9',
  '#3b82f6','#6366f1','#8b5cf6','#a855f7','#d946ef',
  '#ec4899','#f43f5e','#fb923c','#fbbf24','#a3e635',
  '#4ade80','#34d399','#2dd4bf','#38bdf8','#60a5fa',
  '#818cf8','#a78bfa','#c084fc','#e879f9','#f472b6',
  '#dc2626','#ea580c','#d97706','#ca8a04','#65a30d',
  '#16a34a','#059669','#0d9488','#0284c7','#2563eb',
  '#4f46e5','#7c3aed','#9333ea','#c026d3','#db2777',
  '#be123c','#9f1239','#7f1d1d','#78350f','#854d0e',
  '#365314','#14532d','#064e3b','#164e63','#0c4a6e',
  '#1e1b4b','#2e1065','#3b0764','#4a044e','#831843',
]

const DEFAULT_CATEGORIES = [
  { name: 'Geral',          color: '#94a3b8' },
  { name: 'Marketing',      color: '#ec4899' },
  { name: 'Design',         color: '#8b5cf6' },
  { name: 'Desenvolvimento',color: '#6366f1' },
  { name: 'Financeiro',     color: '#10b981' },
  { name: 'RH',             color: '#f97316' },
  { name: 'Operações',      color: '#0ea5e9' },
  { name: 'Administrativo', color: '#f59e0b' },
  { name: 'Contabilidade',  color: '#14b8a6' },
  { name: 'Digital',        color: '#06b6d4' },
  { name: 'Outro',          color: '#94a3b8' },
]


const loadCategories = userId => {
  try {
    const saved = localStorage.getItem(`zitask_categories_${userId}`)
    if (saved) return JSON.parse(saved)
  } catch {}
  return DEFAULT_CATEGORIES
}

const persistCategories = (userId, cats) =>
  localStorage.setItem(`zitask_categories_${userId}`, JSON.stringify(cats))

const GOOGLE_COLORS = ['#4285F4', '#EA4335', '#FBBC05', '#34A853']

const DEFAULT_SYSTEMS = [
  { name: 'PROTHEUS',   color: '#2563eb', fixed: true },
  { name: 'SUITA',      color: '#7c3aed', fixed: true },
  { name: 'ADSIM',      color: '#f97316', fixed: true },
  { name: 'MIDIA+',     color: '#ea580c', fixed: true },
  { name: 'GLPI',       color: '#16a34a', fixed: true },
  { name: 'POWER B.I',  color: '#eab308', fixed: true },
  { name: 'APP SCRIPT', color: 'google',  fixed: true },
  { name: 'N8N',        color: '#e2e8f0', fixed: true },
]

const loadSystems = userId => {
  try {
    const saved = localStorage.getItem(`zitask_systems_${userId}`)
    if (saved) {
      const parsed = JSON.parse(saved).map(s => typeof s === 'string' ? { name: s, color: '#94a3b8' } : s)
      const extras = parsed.filter(s => !DEFAULT_SYSTEMS.some(d => d.name === s.name))
      return [...DEFAULT_SYSTEMS, ...extras]
    }
  } catch {}
  return DEFAULT_SYSTEMS
}

const systemColor = (name, sysList) => sysList?.find(s => s.name === name)?.color || '#94a3b8'

const SystemLabel = ({ name, sysList, className = '' }) => {
  const color = systemColor(name, sysList)
  if (color === 'google') {
    return (
      <span className={className}>
        {name.split('').map((ch, i) => (
          <span key={i} style={{ color: GOOGLE_COLORS[i % GOOGLE_COLORS.length] }}>{ch}</span>
        ))}
      </span>
    )
  }
  return <span className={className}>{name}</span>
}

const persistSystems = (userId, sys) =>
  localStorage.setItem(`zitask_systems_${userId}`, JSON.stringify(sys))

const DONE_COL = { id: 'Done', label: 'Concluído', color: '#22c55e' }

const ensureDoneAtEnd = cols => {
  const without = cols.filter(c => c.id !== 'Done')
  return [...without, DONE_COL]
}

const loadColumns = userId => {
  try {
    const saved = localStorage.getItem(`zitask_columns_${userId}`)
    if (saved) return ensureDoneAtEnd(JSON.parse(saved))
  } catch {}
  return DEFAULT_COLUMNS
}

const persistColumns = (userId, cols) =>
  localStorage.setItem(`zitask_columns_${userId}`, JSON.stringify(ensureDoneAtEnd(cols)))

const categoryColor = (name, cats) => cats?.find(c => c.name === name)?.color || '#94a3b8'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const priorityInfo  = v  => PRIORITIES.find(p => p.value === v) || PRIORITIES[1]
const isOverdue     = d  => d && new Date(d) < new Date()
const formatDate    = d  => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : null
const initials      = n  => n ? n.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase() : '?'
const colLabel      = (id, cols) => (cols || DEFAULT_COLUMNS).find(c => c.id === id)?.label || id

const hexToRgb = hex => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]

const PRI_LABEL = { Low: 'Baixa', Medium: 'Média', High: 'Alta', Urgent: 'Urgente' }

const TIERS = [
  { name: 'Gold',   min: 75, color: '#FFD700', glow: '0 0 0 2.5px #FFD700, 0 0 10px #FFD700, 0 0 20px #FFD70088', emoji: '🥇', label: 'Ouro'   },
  { name: 'Silver', min: 50, color: '#C0C0C0', glow: '0 0 0 2.5px #C0C0C0, 0 0 10px #C0C0C0, 0 0 18px #C0C0C066', emoji: '🥈', label: 'Prata'  },
  { name: 'Bronze', min: 25, color: '#CD7F32', glow: '0 0 0 2.5px #CD7F32, 0 0 10px #CD7F32, 0 0 16px #CD7F3255', emoji: '🥉', label: 'Bronze' },
]

const getTier = (doneTasks) => TIERS.find(t => doneTasks >= t.min) || null

const assigneeNames = t =>
  t.assignees?.length
    ? t.assignees.map(a => a.name).join(', ')
    : (t.assigned_to || '—')

function generatePDF(tasks, columns, dateRange = {}) {
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

  const stagesWithTasks = columns.map(col => ({
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
  columns.forEach(col => {
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

function TaskModal({ task, onClose, onSave, onDelete, toast, categories, onAddCategory, onDeleteCategory, systems, onAddSystem, onDeleteSystem, columns, currentUser }) {
  const isNew = !task
  const [form, setForm] = useState({
    title:       task?.title       || '',
    description: task?.description || '',
    status:      task?.status      || 'To Do',
    priority:    task?.priority    || 'Medium',
    category:    task?.category    || 'Geral',
    due_date:    task?.due_date    ? task.due_date.slice(0, 10) : '',
    action_link: task?.action_link || '',
    tags:        task?.tags        || [],
    assignees:   task?.assignees   || [],
    systems:     task?.systems     || [],
  })
  const [tagInput, setTagInput]       = useState('')
  const [newCatInput, setNewCatInput] = useState('')
  const [newSysInput, setNewSysInput]       = useState('')
  const [saving, setSaving]                 = useState(false)
  const [aiImproving, setAiImproving]       = useState(false)
  const [aiImprovingTitle, setAiImprovingTitle] = useState(false)
  const [confirmDelete, setConfirm]         = useState(false)
  const [members, setMembers]         = useState([])

  useEffect(() => {
    api.get('/members').then(r => {
      const all = r.data
      const isConvidado = currentUser?.role === 'convidado'
      if (isConvidado) {
        setMembers(all.filter(m => m.id === currentUser?.id))
      } else if (currentUser?.group_id) {
        setMembers(all.filter(m => m.group_id === currentUser.group_id))
      } else {
        setMembers(all)
      }
    }).catch(() => {})
  }, [currentUser?.id])

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleAddCat = () => {
    const name = newCatInput.trim()
    if (!name) return
    onAddCategory(name)
    set('category', name)
    setNewCatInput('')
  }

  const handleDeleteCat = (name, e) => {
    e.stopPropagation()
    onDeleteCategory(name)
    if (form.category === name) {
      const remaining = categories.filter(c => c.name !== name)
      set('category', remaining[0]?.name || 'Geral')
    }
  }

  const handleAddSys = () => {
    const name = newSysInput.trim().toUpperCase()
    if (!name) return
    onAddSystem(name)
    if (!form.systems.includes(name)) set('systems', [...form.systems, name])
    setNewSysInput('')
  }

  const toggleSystem = name => {
    set('systems', form.systems.includes(name)
      ? form.systems.filter(s => s !== name)
      : [...form.systems, name])
  }

  const isLightColor = hex => {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
    return (r*299 + g*587 + b*114) / 1000 > 180
  }
  const sysStyle = (s, selected) => {
    if (s.color === 'google') return selected
      ? { backgroundColor: '#f8f9ff', border: '1.5px solid #4285F4aa' }
      : {}
    const light = isLightColor(s.color)
    return selected
      ? { backgroundColor: s.color + (light ? 'cc' : '22'), border: `1.5px solid ${s.color}99`, color: light ? '#1e293b' : s.color }
      : {}
  }

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
      {/* Desktop: centered modal. Mobile: bottom sheet */}
      <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-4">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div
          className="relative bg-white dark:bg-dark-800 shadow-2xl w-full max-h-[92vh] overflow-y-auto
                     rounded-t-2xl md:rounded-2xl md:max-w-2xl"
        >
          {/* Mobile drag indicator */}
          <div className="md:hidden flex justify-center pt-2">
            <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-slate-600" />
          </div>
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
                <div className="flex items-center gap-2">
                  <input
                    value={form.title}
                    onChange={e => set('title', e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                    className="flex-1 text-xl font-bold bg-transparent border-b-2 border-transparent hover:border-slate-200 dark:hover:border-slate-600 focus:border-zitask-secondary outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400 placeholder:font-normal transition-colors pb-0.5"
                    placeholder="Título da atividade..."
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!form.title.trim() || aiImprovingTitle) return
                      setAiImprovingTitle(true)
                      try {
                        const { data } = await api.post('/ai/improve', { text: form.title, mode: 'title' })
                        set('title', data.improved)
                        toast('AzorpaIA melhorou o título!', 'success')
                      } catch (err) {
                        toast(err?.response?.data?.detail || 'Erro ao contatar AzorpaIA.', 'error')
                      } finally {
                        setAiImprovingTitle(false)
                      }
                    }}
                    disabled={!form.title.trim() || aiImprovingTitle}
                    className="relative flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black transition-all disabled:cursor-not-allowed overflow-hidden flex-shrink-0"
                    style={{
                      background: aiImprovingTitle ? 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' : 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
                      color: '#43B7BF',
                      boxShadow: aiImprovingTitle ? '0 0 10px #43B7BF55' : '0 0 0px transparent',
                      transition: 'all 0.3s ease',
                    }}
                    title="Melhorar título com AzorpaIA"
                  >
                    {aiImprovingTitle && (
                      <span className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(90deg, transparent 0%, #43B7BF22 50%, transparent 100%)', animation: 'azorpa-sweep 1.2s linear infinite' }} />
                    )}
                    <span className="text-[10px] relative z-10" style={{ animation: aiImprovingTitle ? 'azorpa-spin 1.5s linear infinite' : 'none' }}>✦</span>
                    <span className="relative z-10">{aiImprovingTitle ? '…' : 'IA'}</span>
                  </button>
                </div>
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
                  {columns.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </SelectField>
              </div>
              <div>
                <label className="field-label">Prioridade</label>
                <SelectField value={form.priority} onChange={v => set('priority', v)}>
                  {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </SelectField>
              </div>
            </div>

            {/* Categoria dropdown */}
            <div className="mb-4">
              <label className="field-label">Categoria</label>
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <select
                    value={form.category}
                    onChange={e => set('category', e.target.value)}
                    className="field-input appearance-none pr-8 cursor-pointer"
                  >
                    {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                </div>
                <input
                  value={newCatInput}
                  onChange={e => setNewCatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCat() } }}
                  placeholder="Nova categoria…"
                  className="field-input w-36 text-xs py-1.5"
                />
                <button
                  type="button"
                  onClick={handleAddCat}
                  disabled={!newCatInput.trim()}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 dark:bg-dark-700 hover:bg-slate-200 dark:hover:bg-dark-600 rounded-xl text-xs font-bold transition-colors disabled:opacity-40 whitespace-nowrap"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Sistemas multi-select */}
            <div className="mb-4">
              <label className="field-label">Sistemas</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(systems || []).map(s => {
                  const selected = form.systems.includes(s.name)
                  return (
                    <button
                      key={s.name}
                      type="button"
                      onClick={() => toggleSystem(s.name)}
                      className={`group flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold transition-all border ${
                        selected
                          ? 'shadow-sm'
                          : 'bg-slate-100 dark:bg-dark-700 text-slate-500 dark:text-slate-300 border-transparent hover:border-slate-300 dark:hover:border-slate-500'
                      }`}
                      style={sysStyle(s, selected)}
                    >
                      {selected && s.color !== 'google' && <Check className="w-2.5 h-2.5 flex-shrink-0" />}
                      <SystemLabel name={s.name} sysList={systems} />
                      {!s.fixed && (
                        <span
                          role="button"
                          onClick={e => { e.stopPropagation(); onDeleteSystem(s.name); if (form.systems.includes(s.name)) set('systems', form.systems.filter(x => x !== s.name)) }}
                          className="ml-0.5 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
                        >
                          <X className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              <div className="flex gap-1.5">
                <input
                  value={newSysInput}
                  onChange={e => setNewSysInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddSys() } }}
                  placeholder="Novo sistema…"
                  className="field-input flex-1 text-xs py-1.5"
                />
                <button
                  type="button"
                  onClick={handleAddSys}
                  disabled={!newSysInput.trim()}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 dark:bg-dark-700 hover:bg-slate-200 dark:hover:bg-dark-600 rounded-xl text-xs font-bold transition-colors disabled:opacity-40 whitespace-nowrap"
                >
                  <Plus className="w-3 h-3" />
                  Sistema
                </button>
              </div>
            </div>

            {/* Due date */}
            <div className="mb-4 max-w-xs">
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

            {/* Responsáveis */}
            <div className="mb-4">
              <label className="field-label">Responsáveis</label>
              <UserPicker
                selected={form.assignees}
                members={members}
                onChange={v => set('assignees', v)}
              />
            </div>

            {/* Link de Ação */}
            <div className="mb-4">
              <label className="field-label">Link de Ação</label>
              <div className="relative flex items-center">
                <Link2 className="absolute left-3 w-3.5 h-3.5 text-slate-400 pointer-events-none flex-shrink-0" />
                <input
                  type="url"
                  value={form.action_link}
                  onChange={e => set('action_link', e.target.value)}
                  placeholder="https://..."
                  className="field-input pl-8 pr-20"
                />
                {form.action_link && (
                  <a
                    href={form.action_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute right-2 flex items-center gap-1 px-2 py-1 bg-zitask-secondary/10 text-zitask-secondary rounded-lg text-[10px] font-bold hover:bg-zitask-secondary/20 transition-colors"
                    onClick={e => e.stopPropagation()}
                  >
                    <ExternalLink className="w-2.5 h-2.5" />
                    Abrir
                  </a>
                )}
              </div>
            </div>

            {/* Description */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <label className="field-label mb-0">Descrição</label>
                <button
                  type="button"
                  onClick={async () => {
                    if (!form.description.trim() || aiImproving) return
                    setAiImproving(true)
                    try {
                      const { data } = await api.post('/ai/improve', { text: form.description })
                      set('description', data.improved)
                      toast('AzorpaIA revisou a descrição!', 'success')
                    } catch (err) {
                      toast(err?.response?.data?.detail || 'Erro ao contatar AzorpaIA.', 'error')
                    } finally {
                      setAiImproving(false)
                    }
                  }}
                  disabled={!form.description.trim() || aiImproving}
                  className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black transition-all disabled:cursor-not-allowed overflow-hidden"
                  style={{
                    background: aiImproving
                      ? 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)'
                      : 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
                    color: '#43B7BF',
                    boxShadow: aiImproving ? '0 0 12px #43B7BF55' : '0 0 0px transparent',
                    transition: 'all 0.3s ease',
                  }}
                  title="Revisar com AzorpaIA"
                >
                  {/* shimmer sweep when loading */}
                  {aiImproving && (
                    <span
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background: 'linear-gradient(90deg, transparent 0%, #43B7BF22 50%, transparent 100%)',
                        animation: 'azorpa-sweep 1.2s linear infinite',
                      }}
                    />
                  )}
                  <span
                    className="text-[13px] relative z-10"
                    style={{ animation: aiImproving ? 'azorpa-spin 1.5s linear infinite' : 'none' }}
                  >✦</span>
                  <span className="relative z-10">
                    {aiImproving ? 'Revisando…' : 'AzorpaIA'}
                  </span>
                </button>
              </div>
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

function TaskCard({ task, onEdit, onDragStart, categories, systems }) {
  const pri    = priorityInfo(task.priority)
  const overdue = isOverdue(task.due_date) && task.status !== 'Done'

  return (
    <div
      draggable
      onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('taskId', String(task.id)); onDragStart?.() }}
      onClick={() => onEdit(task)}
      className="bg-white dark:bg-dark-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 hover:border-zitask-secondary dark:hover:border-zitask-secondary transition-all cursor-pointer group hover:shadow-md hover:-translate-y-0.5 overflow-hidden select-none"
    >
      <div className="h-1" style={{ backgroundColor: task.color || '#43B7BF' }} />

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
        {task.category && task.category !== 'Geral' && (() => {
          const cc = categoryColor(task.category, categories)
          return (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide mb-2"
              style={{ backgroundColor: cc + '25', color: cc }}
            >
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: cc }} />
              {task.category}
            </span>
          )
        })()}

        {/* Sistemas */}
        {task.systems?.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {task.systems.map(name => {
              const sys = systems?.find(s => s.name === name)
              const color = sys?.color || '#94a3b8'
              const isGoogle = color === 'google'
              const light = !isGoogle && (() => { const r=parseInt(color.slice(1,3),16),g=parseInt(color.slice(3,5),16),b=parseInt(color.slice(5,7),16); return (r*299+g*587+b*114)/1000>180 })()
              return (
                <span
                  key={name}
                  className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide"
                  style={isGoogle
                    ? { backgroundColor: '#f0f4ff', border: '1px solid #4285F433' }
                    : { backgroundColor: color + (light ? 'cc' : '22'), color: light ? '#1e293b' : color, border: `1px solid ${color}55` }
                  }
                >
                  <SystemLabel name={name} sysList={systems} />
                </span>
              )
            })}
          </div>
        )}

        {/* Link de Ação */}
        {task.action_link && (
          <a
            href={task.action_link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-1 px-2 py-1 mb-2 bg-zitask-secondary/10 text-zitask-secondary rounded-lg text-[9px] font-bold hover:bg-zitask-secondary/20 transition-colors w-fit"
          >
            <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
            <span className="truncate max-w-[140px]">{(() => { try { return new URL(task.action_link).hostname } catch { return task.action_link } })()}</span>
          </a>
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

function DeleteColConfirm({ colId, columns, tasks, onConfirm, onCancel }) {
  const col       = columns.find(c => c.id === colId)
  const taskCount = tasks.filter(t => t.status === colId).length
  const fallback  = columns.find(c => c.id !== colId)
  const msg = taskCount > 0
    ? `Esta etapa tem ${taskCount} atividade${taskCount !== 1 ? 's' : ''} que ser${taskCount !== 1 ? 'ão' : 'á'} movida${taskCount !== 1 ? 's' : ''} para "${fallback?.label}".`
    : 'Esta ação não pode ser desfeita.'
  return (
    <ConfirmDialog
      title={`Apagar etapa "${col?.label}"?`}
      message={msg}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}

const COL_COLORS = [
  '#94a3b8','#60a5fa','#f59e0b','#a78bfa','#34d399',
  '#fb923c','#22c55e','#f472b6','#38bdf8','#818cf8',
  '#ef4444','#10b981','#06b6d4','#e879f9','#fbbf24',
]

function KanbanView({ tasks, loading, loadError, onRetry, onAddTask, onMoveTask, onDeleteTask, onEditTask, toast, currentUser, categories, onAddCategory, onDeleteCategory, systems, onAddSystem, onDeleteSystem, columns, onRenameColumn, onDeleteColumn, onAddColumn, onReorderColumns }) {
  const [addingCol,      setAddingCol]      = useState(null)
  const [quickTitle,     setQuickTitle]     = useState('')
  const [search,         setSearch]         = useState('')
  const [filterPri,      setFilterPri]      = useState('')
  const [filterCat,      setFilterCat]      = useState('')
  const [filterMine,     setFilterMine]     = useState(true)
  const [filterDone,     setFilterDone]     = useState(false)
  const [showFilters,    setShowFilters]    = useState(false)
  const [dragOver,       setDragOver]       = useState(null)
  const [dragOverCol,    setDragOverCol]    = useState(null)
  const draggingColRef                      = useRef(null)
  const [editTask,       setEditTask]       = useState(null)
  const [showNew,        setShowNew]        = useState(false)
  const [editingCol,     setEditingCol]     = useState(null)
  const [editingLabel,   setEditingLabel]   = useState('')
  const [confirmDelCol,  setConfirmDelCol]  = useState(null)
  const [addingNewCol,   setAddingNewCol]   = useState(false)
  const [newColLabel,    setNewColLabel]    = useState('')
  const [newColColor,    setNewColColor]    = useState(COL_COLORS[0])

  const commitRename = () => {
    const label = editingLabel.trim()
    if (label && editingCol) onRenameColumn(editingCol, label)
    setEditingCol(null)
  }

  const commitNewCol = () => {
    if (!newColLabel.trim()) { setAddingNewCol(false); return }
    onAddColumn(newColLabel, newColColor)
    setNewColLabel('')
    setNewColColor(COL_COLORS[0])
    setAddingNewCol(false)
  }

  const filtered = tasks.filter(t => {
    const q = search.trim().toLowerCase()
    return (
      (!q || t.title.toLowerCase().includes(q) || t.task_id.toLowerCase().includes(q) || (t.tags || []).some(tag => tag.includes(q))) &&
      (!filterPri || t.priority === filterPri) &&
      (!filterCat || t.category === filterCat) &&
      (!filterMine || String(t.created_by) === String(currentUser?.id) || t.assignees?.some(a => a.id === currentUser?.id)) &&
      (filterDone || t.status !== 'Done')
    )
  })

  const visibleColumns = filterDone ? columns : columns.filter(c => c.id !== 'Done')

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
      <div className="px-3 md:px-6 py-3 bg-white dark:bg-dark-800 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">

        {/* Row 1 — busca + botão Nova */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 dark:bg-dark-700 rounded-full px-3 py-1.5 border border-transparent focus-within:border-zitask-secondary transition-all flex-1 md:flex-none md:w-52">
            <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar atividade, ID ou #tag…"
              className="bg-transparent border-none focus:ring-0 text-sm ml-2 w-full placeholder:text-slate-400 outline-none"
            />
            {search && <button onClick={() => setSearch('')}><X className="w-3 h-3 text-slate-400" /></button>}
          </div>

          {/* Desktop filters inline */}
          <div className="hidden md:contents">
            <select value={filterPri} onChange={e => setFilterPri(e.target.value)}
              className="text-xs bg-slate-100 dark:bg-dark-700 border-none rounded-full px-3 py-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-zitask-secondary cursor-pointer">
              <option value="">Todas as prioridades</option>
              {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>

            <div className="flex items-center gap-1.5">
              {filterCat && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: categoryColor(filterCat, categories) }} />}
              <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
                className="text-xs bg-slate-100 dark:bg-dark-700 border-none rounded-full px-3 py-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-zitask-secondary cursor-pointer">
                <option value="">Todas as categorias</option>
                {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>

            <button
              onClick={() => setFilterMine(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${filterMine ? 'bg-zitask-secondary text-zitask-primary shadow-md' : 'bg-slate-100 dark:bg-dark-700 text-slate-500 hover:bg-slate-200 dark:hover:bg-dark-600'}`}
            >
              <User className="w-3 h-3" />
              Minhas atividades
            </button>

            <button
              onClick={() => setFilterDone(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${filterDone ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 shadow-md' : 'bg-slate-100 dark:bg-dark-700 text-slate-500 hover:bg-slate-200 dark:hover:bg-dark-600'}`}
            >
              <Check className="w-3 h-3" />
              Concluídas
            </button>

            {(search || filterPri || filterCat || filterMine || filterDone) && (
              <button onClick={() => { setSearch(''); setFilterPri(''); setFilterCat(''); setFilterMine(false); setFilterDone(false) }}
                className="text-xs text-slate-400 hover:text-slate-600 underline">
                Limpar filtros
              </button>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden md:inline text-xs text-slate-400">{filtered.length} atividade{filtered.length !== 1 ? 's' : ''}</span>
            <button onClick={() => setShowNew(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-dark-700 hover:bg-slate-200 dark:hover:bg-dark-600 text-slate-600 dark:text-slate-300 font-bold rounded-full text-sm transition-all border border-slate-200 dark:border-slate-600">
              + Atividade
            </button>
            <button
              onClick={() => { setAddingNewCol(v => !v); setNewColLabel(''); setNewColColor(COL_COLORS[0]) }}
              className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 font-bold rounded-full text-sm transition-all border ${addingNewCol ? 'bg-zitask-primary text-zitask-secondary border-zitask-primary shadow-md' : 'bg-slate-100 dark:bg-dark-700 hover:bg-slate-200 dark:hover:bg-dark-600 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600'}`}
            >
              + Etapa
            </button>
          </div>
        </div>

        {/* Row 2 — mobile: filtros toggle + contador (sempre visível no mobile) */}
        <div className="md:hidden flex items-center gap-2 mt-2">
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${(showFilters || filterPri || filterCat || filterMine || filterDone) ? 'bg-zitask-secondary text-zitask-primary' : 'bg-slate-100 dark:bg-dark-700 text-slate-500'}`}
          >
            <SlidersHorizontal className="w-3 h-3" />
            Filtros
            {(filterPri || filterCat || filterMine || filterDone) && (
              <span className="w-4 h-4 rounded-full bg-zitask-primary text-white text-[9px] flex items-center justify-center font-black">
                {[filterPri, filterCat, filterMine, filterDone].filter(Boolean).length}
              </span>
            )}
          </button>
          <span className="text-xs text-slate-400">{filtered.length} atividade{filtered.length !== 1 ? 's' : ''}</span>
          {(search || filterPri || filterCat || filterMine || filterDone) && (
            <button onClick={() => { setSearch(''); setFilterPri(''); setFilterCat(''); setFilterMine(false); setFilterDone(false) }}
              className="ml-auto text-xs text-slate-400 hover:text-slate-600 underline">
              Limpar
            </button>
          )}
        </div>

        {/* Row 3 — mobile filters expandidos */}
        {showFilters && (
          <div className="md:hidden flex flex-col gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
            <select value={filterPri} onChange={e => setFilterPri(e.target.value)}
              className="text-xs bg-slate-100 dark:bg-dark-700 border-none rounded-xl px-3 py-2 font-medium focus:outline-none cursor-pointer w-full">
              <option value="">Todas as prioridades</option>
              {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>

            <div className="flex items-center gap-1.5">
              {filterCat && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: categoryColor(filterCat, categories) }} />}
              <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
                className="text-xs bg-slate-100 dark:bg-dark-700 border-none rounded-xl px-3 py-2 font-medium focus:outline-none cursor-pointer flex-1">
                <option value="">Todas as categorias</option>
                {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setFilterMine(v => !v)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${filterMine ? 'bg-zitask-secondary text-zitask-primary shadow-md' : 'bg-slate-100 dark:bg-dark-700 text-slate-500'}`}
              >
                <User className="w-3 h-3" />
                Minhas atividades
              </button>
              <button
                onClick={() => setFilterDone(v => !v)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${filterDone ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 shadow-md' : 'bg-slate-100 dark:bg-dark-700 text-slate-500'}`}
              >
                <Check className="w-3 h-3" />
                Concluídas
              </button>
            </div>
          </div>
        )}
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
            {visibleColumns.map(col => {
              const isDoneCol = col.id === 'Done'
              const colTasks = filtered.filter(t => t.status === col.id)
              const allColTasks = tasks.filter(t => t.status === col.id)
              return (
                <div
                  key={col.id}
                  className={`w-68 flex-shrink-0 flex flex-col rounded-2xl p-1.5 transition-all
                    ${dragOver === col.id && !draggingColRef.current ? 'bg-zitask-secondary/10 ring-2 ring-zitask-secondary/40' : ''}
                    ${dragOverCol === col.id && draggingColRef.current ? 'ring-2 ring-zitask-secondary border-l-4 border-zitask-secondary' : ''}`}
                  style={{ minWidth: '272px', maxWidth: '272px' }}
                  onDragOver={e => {
                    e.preventDefault()
                    const isColDrag = e.dataTransfer.types.includes('col_drag')
                    if (isColDrag) setDragOverCol(col.id)
                    else setDragOver(col.id)
                  }}
                  onDragLeave={() => { setDragOver(null); setDragOverCol(null) }}
                  onDrop={e => {
                    e.preventDefault()
                    const fromColId = e.dataTransfer.getData('col_drag')
                    if (fromColId) {
                      onReorderColumns(fromColId, col.id)
                      draggingColRef.current = null
                      setDragOverCol(null)
                    } else {
                      setDragOver(null)
                      onMoveTask(e.dataTransfer.getData('taskId'), col.id)
                    }
                  }}
                >
                  {/* Column header */}
                  <div className="flex items-center justify-between mb-2.5 px-1">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {isDoneCol ? (
                        <span className="w-3.5 h-3.5 flex-shrink-0" />
                      ) : (
                        <span
                          draggable
                          onDragStart={e => {
                            e.stopPropagation()
                            draggingColRef.current = col.id
                            e.dataTransfer.effectAllowed = 'move'
                            e.dataTransfer.setData('col_drag', col.id)
                          }}
                          onDragEnd={() => { draggingColRef.current = null; setDragOverCol(null) }}
                          className="flex-shrink-0 cursor-grab active:cursor-grabbing touch-manipulation"
                        >
                          <GripVertical className="w-3.5 h-3.5 text-slate-300 hover:text-slate-500 transition-colors pointer-events-none" />
                        </span>
                      )}
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: col.color }} />
                      {!isDoneCol && editingCol === col.id ? (
                        <input
                          autoFocus
                          value={editingLabel}
                          onChange={e => setEditingLabel(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitRename()
                            if (e.key === 'Escape') setEditingCol(null)
                          }}
                          className="font-bold text-xs uppercase tracking-widest bg-transparent border-b-2 border-zitask-secondary outline-none text-slate-600 dark:text-slate-300 w-28"
                        />
                      ) : (
                        <span
                          className={`font-bold text-slate-600 dark:text-slate-300 text-xs uppercase tracking-widest truncate ${isDoneCol ? 'cursor-default' : 'cursor-pointer hover:text-zitask-secondary transition-colors'}`}
                          onClick={isDoneCol ? undefined : () => { setEditingCol(col.id); setEditingLabel(col.label) }}
                          title={isDoneCol ? 'Coluna fixa' : 'Clique para renomear'}
                        >
                          {col.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5">
                      {!isDoneCol && columns.length > 1 && (
                        <button
                          onClick={() => setConfirmDelCol(col.id)}
                          className="p-1 rounded-lg transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                          title="Apagar etapa"
                        >
                          <Trash2 className="w-3 h-3 text-slate-300 hover:text-red-400 transition-colors" />
                        </button>
                      )}
                      <button onClick={() => { setAddingCol(col.id); setQuickTitle('') }}
                        className="p-1 hover:bg-slate-200 dark:hover:bg-dark-700 rounded-lg transition-colors flex-shrink-0">
                        <Plus className="w-3 h-3 text-slate-400" />
                      </button>
                    </div>
                  </div>

                  {/* Cards */}
                  <div className="space-y-2.5 min-h-12">
                    {loading ? (
                      <div className="flex justify-center py-8">
                        <div className="w-6 h-6 border-2 border-zitask-secondary border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : (
                      colTasks.map(task => (
                        <TaskCard key={task.id} task={task} onEdit={setEditTask} categories={categories} systems={systems} />
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

            {/* Form nova etapa — só aparece quando addingNewCol está ativo */}
            {addingNewCol && (
              <div className="flex-shrink-0" style={{ minWidth: '208px' }}>
                <div className="bg-white dark:bg-dark-800 rounded-2xl p-4 border-2 border-zitask-secondary shadow-lg w-52">
                  <input
                    autoFocus
                    value={newColLabel}
                    onChange={e => setNewColLabel(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitNewCol()
                      if (e.key === 'Escape') { setAddingNewCol(false); setNewColLabel('') }
                    }}
                    placeholder="Nome da etapa…"
                    className="w-full text-sm font-bold bg-transparent border-none focus:ring-0 p-0 mb-3 outline-none placeholder:font-normal"
                  />
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {COL_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => setNewColColor(c)}
                        className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                        style={{ backgroundColor: c, borderColor: newColColor === c ? '#fff' : 'transparent', outline: newColColor === c ? `2px solid ${c}` : 'none' }}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between items-center">
                    <button onClick={() => { setAddingNewCol(false); setNewColLabel('') }} className="text-[10px] font-bold text-slate-400 hover:text-slate-600">Cancelar</button>
                    <button onClick={commitNewCol} className="px-3 py-1 text-[10px] font-bold bg-zitask-secondary text-zitask-primary rounded-lg">Criar</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirm delete column */}
      {confirmDelCol && <DeleteColConfirm
        colId={confirmDelCol}
        columns={columns}
        tasks={tasks}
        onConfirm={() => { onDeleteColumn(confirmDelCol); setConfirmDelCol(null) }}
        onCancel={() => setConfirmDelCol(null)}
      />}

      {/* Edit modal */}
      {editTask && (
        <TaskModal
          task={editTask}
          toast={toast}
          onClose={() => setEditTask(null)}
          onSave={onEditTask}
          onDelete={onDeleteTask}
          categories={categories}
          onAddCategory={onAddCategory}
          onDeleteCategory={onDeleteCategory}
          systems={systems}
          onAddSystem={onAddSystem}
          onDeleteSystem={onDeleteSystem}
          columns={columns}
          currentUser={currentUser}
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
          categories={categories}
          onAddCategory={onAddCategory}
          onDeleteCategory={onDeleteCategory}
          systems={systems}
          onAddSystem={onAddSystem}
          onDeleteSystem={onDeleteSystem}
          columns={columns}
          currentUser={currentUser}
        />
      )}
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function DashboardView({ tasks, currentUser, columns, myDoneTasks, isGerente, onEditTask, onDeleteTask, toast, categories, onAddCategory, onDeleteCategory, systems, onAddSystem, onDeleteSystem }) {
  const isAdmin    = currentUser?.role === 'admin_master'
  const canSeeAll  = isAdmin || isGerente

  const [filterAssignee, setFilterAssignee] = useState('')
  const [filterDateFrom, setDateFrom]       = useState('')
  const [filterDateTo,   setDateTo]         = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterStatus,   setFilterStatus]   = useState('')
  const [sortBy,         setSortBy]         = useState('created_at')
  const [editTask,       setEditTask]       = useState(null)
  const [confirm,        setConfirm]        = useState(null)
  const [userStats,      setUserStats]      = useState([])
  const [loadingStats,   setLoadingStats]   = useState(false)

  useEffect(() => {
    if (!canSeeAll) return
    setLoadingStats(true)
    api.get('/users/stats')
      .then(r => setUserStats(r.data))
      .catch(() => {})
      .finally(() => setLoadingStats(false))
  }, [canSeeAll])

  const assigneeOptions = [...new Map(
    tasks.flatMap(t => (t.assignees || []).map(a => [a.id, a]))
  ).values()].sort((a, b) => a.name.localeCompare(b.name))

  const hasDateFilter = filterDateFrom || filterDateTo
  const hasAnyFilter  = filterAssignee || filterDateFrom || filterDateTo || filterPriority

  // Base filter: date + assignee + priority → cards + charts + table
  const displayTasks = tasks.filter(t => {
    if (hasDateFilter) {
      const d = new Date(t.created_at)
      if (filterDateFrom && d < new Date(filterDateFrom + 'T00:00:00')) return false
      if (filterDateTo   && d > new Date(filterDateTo   + 'T23:59:59')) return false
    }
    if (filterAssignee && !(t.assignees || []).some(a => String(a.id) === filterAssignee)) return false
    if (filterPriority && t.priority !== filterPriority) return false
    return true
  })

  // Table also applies status filter + sort
  const sorted = [...displayTasks]
    .filter(t => !filterStatus || t.status === filterStatus)
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

  const total   = displayTasks.length
  const done    = displayTasks.filter(t => t.status === 'Done').length
  const doing   = displayTasks.filter(t => ['Doing', 'Peer Review', 'Testing'].includes(t.status)).length
  const urgent  = displayTasks.filter(t => t.priority === 'Urgent' && t.status !== 'Done').length
  const overdue = displayTasks.filter(t => isOverdue(t.due_date) && t.status !== 'Done').length
  const pct     = total > 0 ? Math.round((done / total) * 100) : 0

  const selectedUserName = userStats.find(u => String(u.id) === filterAssignee)?.name || ''

  return (
    <div className="flex-1 overflow-y-auto p-7 bg-slate-50 dark:bg-dark-900/50">

      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-xl font-black text-yellow-500 mb-0.5">
            {(() => { const h = new Date().getHours(); return h >= 6 && h < 12 ? 'Bom dia!' : h >= 12 && h < 18 ? 'Boa Tarde!' : h >= 18 || h < 1 ? 'Boa Noite!' : 'Tá trabalhando agora?' })()}
          </h2>
          <p className="text-sm text-slate-400">
            {canSeeAll
              ? selectedUserName ? `Atividades de ${selectedUserName}` : isAdmin ? 'Visão geral de todas as atividades' : 'Atividades do meu setor'
              : 'Minhas atividades'}
          </p>
        </div>
        <button
          onClick={() => generatePDF(sorted, columns, { from: filterDateFrom, to: filterDateTo })}
          className="flex items-center gap-2 px-4 py-2 bg-zitask-secondary text-zitask-primary font-bold rounded-xl text-sm hover:bg-zitask-secondary/90 transition-colors shadow-md"
        >
          <FileDown className="w-4 h-4" />
          Exportar PDF{sorted.length < tasks.length ? ` (${sorted.length})` : ''}
        </button>
      </div>

      {/* Filter bar — shared by cards, charts and table */}
      <div className="flex gap-2.5 mb-5 flex-wrap items-center">
        {canSeeAll && (
          <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}
            className="text-xs bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 focus:outline-none focus:border-zitask-secondary">
            <option value="">{isAdmin ? 'Todos os usuários' : 'Todo o setor'}</option>
            {assigneeOptions.map(a => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
          </select>
        )}

        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
          className="text-xs bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 focus:outline-none focus:border-zitask-secondary">
          <option value="">Todas as prioridades</option>
          <option value="Urgent">Urgente</option>
          <option value="High">Alta</option>
          <option value="Medium">Média</option>
          <option value="Low">Baixa</option>
        </select>

        <div className="flex items-center gap-1.5 bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5">
          <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <input type="date" value={filterDateFrom} onChange={e => setDateFrom(e.target.value)}
            className="text-xs bg-transparent outline-none text-slate-600 dark:text-slate-300 w-28" />
          <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
          <input type="date" value={filterDateTo} onChange={e => setDateTo(e.target.value)}
            className="text-xs bg-transparent outline-none text-slate-600 dark:text-slate-300 w-28" />
          {hasDateFilter && (
            <button onClick={() => { setDateFrom(''); setDateTo('') }} className="text-slate-400 hover:text-red-400 transition-colors ml-1">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {hasAnyFilter && (
          <button
            onClick={() => { setFilterAssignee(''); setFilterPriority(''); setDateFrom(''); setDateTo('') }}
            className="text-xs text-slate-400 hover:text-red-400 transition-colors flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Limpar
          </button>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {[
          { label: hasDateFilter ? 'No Período' : 'Total',  value: total,   icon: <Circle className="w-5 h-5" />,        color: 'text-slate-400',        bg: 'bg-slate-100 dark:bg-slate-700/50'   },
          { label: 'Concluídas',                             value: done,    icon: <CheckCircle2 className="w-5 h-5" />,  color: 'text-green-500',        bg: 'bg-green-50 dark:bg-green-900/20'    },
          { label: 'Em Andamento',                           value: doing,   icon: <ArrowRight className="w-5 h-5" />,   color: 'text-zitask-secondary', bg: 'bg-zitask-secondary/10'              },
          { label: 'Atrasadas',                              value: overdue, icon: <AlertCircle className="w-5 h-5" />,  color: 'text-red-500',          bg: 'bg-red-50 dark:bg-red-900/20'        },
        ].map(c => (
          <div key={c.label} className="bg-white dark:bg-dark-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${c.bg} ${c.color}`}>{c.icon}</div>
            <p className="text-3xl font-black mb-0.5">{c.value}</p>
            <p className="text-xs text-slate-400 font-medium">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Gamificação — sempre do usuário logado */}
      {(() => {
        const currentTier = getTier(myDoneTasks)
        const nextTier    = TIERS.slice().reverse().find(t => myDoneTasks < t.min)
        const barMax      = nextTier ? nextTier.min : (currentTier ? currentTier.min : 25)
        const barVal      = currentTier && !nextTier ? barMax : Math.min(myDoneTasks, barMax)
        const barPct      = Math.round((barVal / barMax) * 100)
        const barColor    = nextTier ? nextTier.color : (currentTier ? currentTier.color : '#CD7F32')
        return (
          <div className="bg-white dark:bg-dark-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm mb-5">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 text-center">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-md"
                  style={currentTier ? { boxShadow: currentTier.glow, background: '#0f172a' } : { background: '#f1f5f9' }}
                >
                  {currentTier ? currentTier.emoji : '🏅'}
                </div>
                <p className="text-[10px] font-bold mt-1" style={{ color: currentTier ? currentTier.color : '#94a3b8' }}>
                  {currentTier ? currentTier.label.toUpperCase() : 'SEM TIER'}
                </p>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-bold">
                    {currentTier && !nextTier ? 'Nível máximo atingido!' : nextTier ? `Próximo: ${nextTier.emoji} ${nextTier.label}` : 'Conquiste o Bronze'}
                  </p>
                  <span className="text-xs font-black" style={{ color: barColor }}>
                    {myDoneTasks}{nextTier ? `/${nextTier.min}` : ''}
                  </span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-dark-700 rounded-full h-3.5 overflow-hidden">
                  <div className="h-3.5 rounded-full transition-all duration-700"
                    style={{ width: `${barPct}%`, background: `linear-gradient(90deg, ${barColor}99, ${barColor})`, boxShadow: `0 0 8px ${barColor}66` }} />
                </div>
                <div className="flex justify-between mt-1.5">
                  <p className="text-[10px] text-slate-400">{myDoneTasks} tarefas concluídas</p>
                  {nextTier && <p className="text-[10px] text-slate-400">{nextTier.min - myDoneTasks} para o próximo nível</p>}
                </div>
              </div>
              <div className="hidden sm:flex flex-col gap-1.5 flex-shrink-0">
                {TIERS.slice().reverse().map(t => (
                  <div key={t.name} className="flex items-center gap-1.5">
                    <span className="text-base">{t.emoji}</span>
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: myDoneTasks >= t.min ? t.color : '#cbd5e1' }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Taxa de conclusão + Distribuição por etapa */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div className="bg-white dark:bg-dark-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm">Taxa de conclusão{hasDateFilter ? ' do período' : ''}</h3>
            <span className="text-xl font-black text-zitask-secondary">{pct}%</span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-dark-700 rounded-full h-3 overflow-hidden mb-2">
            <div className="h-3 rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #43B7BF99, #43B7BF)' }} />
          </div>
          <p className="text-xs text-slate-400">{done} de {total} atividades concluídas</p>
          {overdue > 0 && <p className="text-xs text-red-400 font-medium mt-1">{overdue} atividade{overdue !== 1 ? 's' : ''} em atraso</p>}
        </div>

        <div className="bg-white dark:bg-dark-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
          <h3 className="font-bold text-sm mb-4">Distribuição por etapa</h3>
          {total === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">Nenhuma atividade no período</p>
          ) : (
            <div className="flex items-end gap-1.5 h-24">
              {columns.map(col => {
                const count  = displayTasks.filter(t => t.status === col.id).length
                const barPct = total > 0 ? (count / total) * 100 : 0
                return (
                  <div key={col.id} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                    <span className="text-[9px] font-black text-slate-500">{count > 0 ? count : ''}</span>
                    <div className="w-full rounded-t-md transition-all duration-700 min-h-[2px]"
                      style={{ height: `${Math.max(barPct, count > 0 ? 4 : 0)}%`, backgroundColor: col.color, opacity: count > 0 ? 1 : 0.15 }}
                      title={`${col.label}: ${count}`} />
                    <span className="text-[8px] text-slate-400 text-center leading-tight truncate w-full" title={col.label}>
                      {col.label.length > 5 ? col.label.slice(0, 5) + '.' : col.label}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Por Prioridade + Por Coluna */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div className="bg-white dark:bg-dark-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
          <h3 className="font-bold text-sm mb-4">Por Prioridade</h3>
          <div className="space-y-3">
            {PRIORITIES.map(p => {
              const count = displayTasks.filter(t => t.priority === p.value).length
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

        <div className="bg-white dark:bg-dark-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
          <h3 className="font-bold text-sm mb-4">Por Coluna</h3>
          <div className="space-y-3">
            {columns.map(col => {
              const count = displayTasks.filter(t => t.status === col.id).length
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

      {/* Desempenho por Usuário — admin e gerente */}
      {canSeeAll && (
        <div className="bg-white dark:bg-dark-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm mb-5">
          <h3 className="font-bold text-sm mb-4">Desempenho por Usuário</h3>
          {loadingStats ? (
            <div className="flex justify-center py-6">
              <div className="w-5 h-5 border-2 border-zitask-secondary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : userStats.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">Nenhum dado disponível</p>
          ) : (
            <div className="space-y-3.5">
              {userStats.map(u => (
                <div key={u.id} className="flex items-center gap-3">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[10px] text-white flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-zitask-secondary transition-all"
                    style={{ background: 'linear-gradient(135deg, #43B7BF, #122B3C)' }}
                    onClick={() => setFilterAssignee(v => v === String(u.id) ? '' : String(u.id))}
                    title={`Filtrar por ${u.name}`}
                  >
                    {initials(u.name)}
                  </div>
                  <span className="text-xs font-semibold w-28 truncate flex-shrink-0">{u.name}</span>
                  <div className="flex-1 bg-slate-100 dark:bg-dark-700 rounded-full h-2">
                    <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${u.pct}%`, backgroundColor: '#43B7BF' }} />
                  </div>
                  <span className="text-xs font-black text-zitask-secondary w-9 text-right flex-shrink-0">{u.pct}%</span>
                  <span className="text-[10px] text-slate-400 w-14 text-right flex-shrink-0">{u.done}/{u.total} ok</span>
                  {u.overdue > 0 && <span className="text-[10px] text-red-400 font-bold flex-shrink-0">{u.overdue} atr.</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tabela de atividades */}
      <div className="flex gap-2.5 mb-4 flex-wrap items-center">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="text-xs bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 focus:outline-none focus:border-zitask-secondary">
          <option value="">Todos os status</option>
          {columns.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          className="text-xs bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 focus:outline-none focus:border-zitask-secondary">
          <option value="created_at">Mais recentes</option>
          <option value="priority">Prioridade</option>
          <option value="title">Título A–Z</option>
          <option value="due_date">Prazo</option>
        </select>
        {filterStatus && (
          <button onClick={() => setFilterStatus('')} className="text-xs text-slate-400 hover:text-red-400 transition-colors flex items-center gap-1">
            <X className="w-3 h-3" /> Limpar status
          </button>
        )}
        <span className="text-xs text-slate-400 ml-auto">{sorted.length} resultado{sorted.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
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
                          {task.tags.slice(0, 2).map(t => <span key={t} className="text-[9px] text-slate-400">#{t}</span>)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-slate-100 dark:bg-dark-700 rounded-full text-[10px] font-bold">{colLabel(task.status, columns)}</span>
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
        </div>
        {sorted.length === 0 && (
          <p className="text-center text-slate-400 py-12 text-sm">Nenhuma atividade encontrada.</p>
        )}
      </div>

      {editTask && (
        <TaskModal task={editTask} toast={toast} onClose={() => setEditTask(null)} onSave={onEditTask} onDelete={onDeleteTask}
          categories={categories} onAddCategory={onAddCategory} onDeleteCategory={onDeleteCategory}
          systems={systems} onAddSystem={onAddSystem} onDeleteSystem={onDeleteSystem}
          columns={columns} currentUser={currentUser} />
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

const AI_PROVIDERS = [
  {
    id: 'gemini', label: 'Gemini', logo: '✦',
    logoColor: '#1a73e8', models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    placeholder: 'AIza...', keyLabel: 'Google AI API Key',
  },
  {
    id: 'claude', label: 'Claude', logo: '◆',
    logoColor: '#d97706', models: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-7'],
    placeholder: 'sk-ant-...', keyLabel: 'Anthropic API Key',
  },
  {
    id: 'openai', label: 'OpenAI', logo: '⬡',
    logoColor: '#10a37f', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'],
    placeholder: 'sk-...', keyLabel: 'OpenAI API Key',
  },
]

function AIProviderCard({ p, isActive, hasKey, isOpen, isSaving, onToggle, onSave, savedPrompt, savedPromptTitle }) {
  const [localKey,         setLocalKey]         = useState('')
  const [localModel,       setLocalModel]       = useState(p.models[0])
  const [localPrompt,      setLocalPrompt]      = useState('')
  const [localPromptTitle, setLocalPromptTitle] = useState('')

  useEffect(() => {
    if (isOpen && isActive) {
      if (savedPrompt)      setLocalPrompt(savedPrompt)
      if (savedPromptTitle) setLocalPromptTitle(savedPromptTitle)
    }
  }, [isOpen])

  return (
    <div className={`rounded-xl border transition-all ${isActive ? 'border-zitask-secondary/50 bg-zitask-secondary/5' : 'border-slate-200 dark:border-slate-700'}`}>
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-black flex-shrink-0" style={{ backgroundColor: p.logoColor + '22', color: p.logoColor }}>{p.logo}</span>
        <span className="font-bold text-sm flex-1">{p.label}</span>
        {isActive && <span className="text-[10px] font-bold text-zitask-secondary">ATIVO</span>}
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-100 dark:border-slate-700 pt-3">
          <div>
            <label className="field-label">{p.keyLabel}</label>
            <input
              type="password"
              value={localKey}
              onChange={e => setLocalKey(e.target.value)}
              placeholder={isActive && hasKey ? '••••••••••••••••' : p.placeholder}
              className="field-input font-mono text-xs"
            />
          </div>
          <div>
            <label className="field-label">Modelo</label>
            <div className="relative">
              <select value={localModel} onChange={e => setLocalModel(e.target.value)} className="field-input appearance-none pr-8 cursor-pointer">
                {p.models.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="field-label">Prompt — Descrição</label>
            <p className="text-[10px] text-slate-400 mb-1.5">Instruções para revisar a descrição da atividade.</p>
            <textarea
              value={localPrompt}
              onChange={e => setLocalPrompt(e.target.value)}
              rows={3}
              placeholder="Ex: Você é AzorpaIA. Revise e melhore o texto em português..."
              className="field-input resize-none text-xs"
            />
          </div>
          <div>
            <label className="field-label">Prompt — Título</label>
            <p className="text-[10px] text-slate-400 mb-1.5">Instruções para melhorar o título da atividade.</p>
            <textarea
              value={localPromptTitle}
              onChange={e => setLocalPromptTitle(e.target.value)}
              rows={3}
              placeholder="Ex: Melhore o título desta atividade de forma clara e direta..."
              className="field-input resize-none text-xs"
            />
          </div>
          <button
            type="button"
            onClick={() => onSave(localKey, localModel, localPrompt, localPromptTitle)}
            disabled={!localKey.trim() || isSaving}
            className="w-full py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-40"
            style={{ backgroundColor: p.logoColor + '22', color: p.logoColor }}
          >
            {isSaving ? 'Salvando…' : isActive ? 'Atualizar Configuração' : 'Conectar'}
          </button>
        </div>
      )}
    </div>
  )
}

function SettingsView({ isDarkMode, setIsDarkMode, toast, isAdmin }) {
  const [pwForm, setPwForm]   = useState({ current: '', next: '', confirm: '' })
  const [showPw,  setShowPw]  = useState({ current: false, next: false, confirm: false })
  const [pwError, setPwError] = useState('')
  const [pwSaving,setPwSaving]= useState(false)

  const [aiCfg,    setAiCfg]    = useState({ provider: null, model: null, has_key: false, prompt: '', prompt_title: '' })
  const [aiSaving, setAiSaving] = useState(false)
  const [aiExpand, setAiExpand] = useState(null)

  useEffect(() => {
    if (!isAdmin) return
    api.get('/settings/ai').then(r => {
      setAiCfg(r.data)
      if (r.data.provider) setAiExpand(r.data.provider)
    }).catch(() => {})
  }, [isAdmin])

  const handleSaveAI = async (provider, apiKey, model, prompt, promptTitle) => {
    if (!apiKey.trim()) return
    setAiSaving(provider)
    try {
      await api.post('/settings/ai', { provider, api_key: apiKey, model: model || undefined, prompt: prompt || undefined, prompt_title: promptTitle || undefined })
      toast('Configuração de IA salva!', 'success')
      setAiCfg(prev => ({ ...prev, provider, model, has_key: true, prompt, prompt_title: promptTitle }))
    } catch {
      toast('Erro ao salvar configuração.', 'error')
    } finally {
      setAiSaving(null)
    }
  }

  const setPw = (k, v) => { setPwForm(f => ({ ...f, [k]: v })); setPwError('') }

  const handleChangePw = async e => {
    e.preventDefault()
    if (pwForm.next !== pwForm.confirm) { setPwError('As senhas não coincidem'); return }
    if (pwForm.next.length < 6)         { setPwError('A nova senha deve ter ao menos 6 caracteres'); return }
    setPwSaving(true)
    try {
      await api.post('/auth/change-password', { current_password: pwForm.current, new_password: pwForm.next })
      toast('Senha alterada com sucesso', 'success')
      setPwForm({ current: '', next: '', confirm: '' })
      setPwError('')
    } catch (err) {
      setPwError(err?.response?.data?.detail || 'Erro ao alterar a senha')
    } finally {
      setPwSaving(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-7 bg-slate-50 dark:bg-dark-900/50">
      <h2 className="text-2xl font-bold text-slate-700 dark:text-slate-200 mb-7">Preferências do sistema</h2>

      <div className="max-w-lg space-y-4">
        {/* Theme toggle */}
        <div className="bg-white dark:bg-dark-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
          <h3 className="font-bold text-sm mb-4">Aparência</h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Modo Escuro</p>
              <p className="text-xs text-slate-400 mt-0.5">Alterna entre tema claro e escuro</p>
            </div>
            <button
              onClick={() => setIsDarkMode(v => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${isDarkMode ? 'bg-zitask-secondary' : 'bg-slate-200'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${isDarkMode ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
        </div>

        {/* Change password */}
        <div className="bg-white dark:bg-dark-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
          <h3 className="font-bold text-sm mb-4">Segurança</h3>
          <form onSubmit={handleChangePw} className="space-y-3">
            {[
              { key: 'current', label: 'Senha atual'      },
              { key: 'next',    label: 'Nova senha'       },
              { key: 'confirm', label: 'Confirmar senha'  },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="field-label">{label}</label>
                <div className="relative">
                  <input
                    type={showPw[key] ? 'text' : 'password'}
                    value={pwForm[key]}
                    onChange={e => setPw(key, e.target.value)}
                    placeholder="••••••••"
                    className="field-input pr-10"
                    required
                  />
                  <button type="button" onClick={() => setShowPw(s => ({ ...s, [key]: !s[key] }))}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 transition-colors">
                    {showPw[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ))}

            {pwError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                {pwError}
              </div>
            )}

            <button
              type="submit"
              disabled={pwSaving || !pwForm.current || !pwForm.next || !pwForm.confirm}
              className="w-full py-2.5 bg-zitask-secondary text-zitask-primary font-bold rounded-xl text-sm hover:bg-zitask-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {pwSaving ? 'Salvando…' : 'Alterar Senha'}
            </button>
          </form>
        </div>

        {/* AzorpaIA config — admin only */}
        {isAdmin && (
          <div className="bg-white dark:bg-dark-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base font-black tracking-tight"><span className="text-zitask-secondary">Azorpa</span><span className="text-slate-800 dark:text-white">IA</span></span>
              {aiCfg.provider && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">Conectado</span>
              )}
            </div>
            <p className="text-xs text-slate-400 mb-4">Escolha o modelo de IA para revisão de descrições</p>
            <div className="space-y-2">
              {AI_PROVIDERS.map(p => (
                <AIProviderCard
                  key={p.id}
                  p={p}
                  isActive={aiCfg.provider === p.id}
                  hasKey={aiCfg.has_key}
                  isOpen={aiExpand === p.id}
                  isSaving={aiSaving === p.id}
                  savedPrompt={aiCfg.prompt}
                  savedPromptTitle={aiCfg.prompt_title}
                  onToggle={() => setAiExpand(aiExpand === p.id ? null : p.id)}
                  onSave={(key, model, prompt, promptTitle) => handleSaveAI(p.id, key, model, prompt, promptTitle)}
                />
              ))}
            </div>
          </div>
        )}

        {/* About */}
        <div className="bg-white dark:bg-dark-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
          <h3 className="font-bold text-sm mb-3">Sobre</h3>
          <div className="space-y-1.5 text-sm text-slate-500">
            <p><span className="font-medium">Versão:</span> ZItask v0.3.0</p>
            <p><span className="font-medium">API:</span> {import.meta.env.VITE_API_URL || 'http://localhost:8000'}</p>
          </div>
        </div>
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
  const [activeView,  setActiveView]  = useState(() => { const v = localStorage.getItem('zitask_view'); return (v && v !== 'analytics') ? v : 'dashboard' })
  const [tasks,       setTasks]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [loadError,   setLoadError]   = useState(false)
  const [categories,  setCategories]  = useState(() => {
    try {
      const user = JSON.parse(localStorage.getItem('zitask_user'))
      return user ? loadCategories(user.id) : DEFAULT_CATEGORIES
    } catch { return DEFAULT_CATEGORIES }
  })
  const [columns,     setColumns]     = useState(() => {
    try {
      const user = JSON.parse(localStorage.getItem('zitask_user'))
      return user ? loadColumns(user.id) : DEFAULT_COLUMNS
    } catch { return DEFAULT_COLUMNS }
  })
  const [systems,     setSystems]     = useState(() => {
    try {
      const user = JSON.parse(localStorage.getItem('zitask_user'))
      return user ? loadSystems(user.id) : DEFAULT_SYSTEMS
    } catch { return DEFAULT_SYSTEMS }
  })
  const { toasts, toast, dismiss }    = useToast()

  const handleAddCategory = name => {
    const trimmed = name.trim()
    if (!trimmed || !currentUser) return
    setCategories(prev => {
      if (prev.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) return prev
      const color = CATEGORY_PALETTE[prev.length % CATEGORY_PALETTE.length]
      const updated = [...prev, { name: trimmed, color }]
      persistCategories(currentUser.id, updated)
      return updated
    })
  }

  const handleDeleteCategory = name => {
    if (!currentUser) return
    setCategories(prev => {
      const updated = prev.filter(c => c.name !== name)
      persistCategories(currentUser.id, updated)
      return updated
    })
  }

  const handleAddSystem = name => {
    const trimmed = name.trim().toUpperCase()
    if (!trimmed || !currentUser) return
    setSystems(prev => {
      if (prev.some(s => s.name.toUpperCase() === trimmed)) return prev
      const updated = [...prev, { name: trimmed, color: '#94a3b8' }]
      persistSystems(currentUser.id, updated)
      return updated
    })
  }

  const handleDeleteSystem = name => {
    if (!currentUser || DEFAULT_SYSTEMS.some(d => d.name === name)) return
    setSystems(prev => {
      const updated = prev.filter(s => s.name !== name)
      persistSystems(currentUser.id, updated)
      return updated
    })
  }

  const handleRenameColumn = (colId, newLabel) => {
    if (!newLabel.trim() || !currentUser || colId === 'Done') return
    setColumns(prev => {
      const updated = prev.map(c => c.id === colId ? { ...c, label: newLabel.trim() } : c)
      persistColumns(currentUser.id, updated)
      return updated
    })
  }

  const handleDeleteColumn = async (colId) => {
    if (!currentUser || colId === 'Done') return
    const remaining = columns.filter(c => c.id !== colId)
    const fallback  = remaining[0]?.id || null
    if (fallback) {
      const affected = tasks.filter(t => t.status === colId)
      if (affected.length) {
        setTasks(prev => prev.map(t => t.status === colId ? { ...t, status: fallback } : t))
        affected.forEach(t => api.patch(`/tasks/${t.id}`, { status: fallback }).catch(() => {}))
      }
    }
    setColumns(() => {
      persistColumns(currentUser.id, remaining)
      return remaining
    })
  }

  const handleAddColumn = (label, color) => {
    if (!label.trim() || !currentUser) return
    const id = `col_${Date.now()}`
    setColumns(prev => {
      const updated = [...prev, { id, label: label.trim(), color }]
      persistColumns(currentUser.id, updated)
      return updated
    })
  }

  const handleReorderColumns = (fromId, toId) => {
    if (!currentUser || fromId === toId || fromId === 'Done' || toId === 'Done') return
    setColumns(prev => {
      const fromIdx = prev.findIndex(c => c.id === fromId)
      const toIdx   = prev.findIndex(c => c.id === toId)
      if (fromIdx === -1 || toIdx === -1) return prev
      const updated = [...prev]
      const [moved] = updated.splice(fromIdx, 1)
      updated.splice(toIdx, 0, moved)
      persistColumns(currentUser.id, updated)
      return updated
    })
  }

  const isAdmin     = currentUser?.role === 'admin_master'
  const isGerente   = currentUser?.role === 'gerente'
  const isConvidado = currentUser?.role === 'convidado'

  const myDoneTasks = tasks.filter(t =>
    t.status === 'Done' && (
      String(t.created_by) === String(currentUser?.id) ||
      (t.assignees || []).some(a => String(a.id) === String(currentUser?.id))
    )
  ).length

  const myTier = getTier(myDoneTasks)

  const handleLogin = () => {
    localStorage.removeItem('zitask_view')
    window.location.reload()
  }

  const handleLogout = () => {
    localStorage.removeItem('zitask_token')
    localStorage.removeItem('zitask_user')
    window.location.reload()
  }

  // Valida token e atualiza user com dados do servidor — impede que role seja falsificado via localStorage
  useEffect(() => {
    const token = localStorage.getItem('zitask_token')
    if (!token) return
    api.get('/auth/me').then(r => {
      setCurrentUser(r.data)
      localStorage.setItem('zitask_user', JSON.stringify(r.data))
    }).catch(() => {
      localStorage.removeItem('zitask_token')
      localStorage.removeItem('zitask_user')
      window.location.reload()
    })
  }, [])

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
    const isOwner    = String(task.created_by) === String(currentUser?.id)
    const isAssignee = (task.assignees || []).some(a => String(a.id) === String(currentUser?.id))
    if (!isOwner && !isAssignee) {
      toast('Você não tem permissão para mover esta atividade.', 'error')
      return
    }
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
    { id: 'dashboard', label: 'Dashboard',    Icon: Layout    },
    { id: 'kanban',    label: 'Atividades',    Icon: Kanban    },
    ...(isAdmin ? [{ id: 'users', label: 'Usuários', Icon: Users }] : []),
    { id: 'settings',  label: 'Configurações', Icon: Settings  },
  ]

  const workspaceName = isConvidado
    ? (currentUser?.group_name || '')
    : (currentUser?.group_name || currentUser?.workspace_name || 'ZItask')
  const roleLabel = currentUser?.role === 'admin_master' ? 'Admin Master'
                  : currentUser?.role === 'gerente'      ? 'Gerente'
                  : currentUser?.role === 'convidado'    ? 'Convidado'
                  : 'Colaborador'

  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-dark-900 text-slate-800 dark:text-slate-100">

      {/* Sidebar desktop — idêntico ao backup, nunca toca mobile */}
      <aside className="hidden md:flex md:w-56 bg-zitask-primary text-white flex-col shadow-xl flex-shrink-0">
        <div className="p-5 border-b border-white/10">
          <h1 className="text-xl font-black tracking-tight"><span className="text-yellow-400">ZI</span><span className="text-white">task</span></h1>
          <p className="text-[9px] text-zitask-secondary font-bold uppercase tracking-widest opacity-80 mt-0.5">Gestão de Atividades</p>
        </div>
        {workspaceName && (
          <div className="px-4 pt-4 pb-1">
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-0.5">Workspace</p>
            <p className="text-xs font-semibold text-white/80 truncate">{workspaceName}</p>
          </div>
        )}
        <nav className="flex-1 px-3 py-3 space-y-0.5">
          {NAV.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => { setActiveView(id); localStorage.setItem('zitask_view', id) }}
              className={`w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-all ${activeView === id ? 'bg-white/10 text-zitask-secondary' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}>
              <Icon className="w-4 h-4 mr-3 flex-shrink-0" />{label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-2.5 px-1 mb-2">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shadow-md flex-shrink-0 ${isAdmin ? 'bg-gradient-to-br from-purple-500 to-purple-800' : isGerente ? 'bg-gradient-to-br from-blue-400 to-blue-700' : isConvidado ? 'bg-gradient-to-br from-green-400 to-green-600' : 'bg-gradient-to-br from-amber-600 to-amber-900'}`}
              style={myTier ? { boxShadow: myTier.glow } : {}}
            >
              {initials(currentUser?.name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold truncate">{currentUser?.name}</p>
              <p className="text-[10px] text-white/40 truncate">{myTier ? `${myTier.emoji} ${myTier.label}` : roleLabel}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-white/50 hover:text-white hover:bg-white/5 transition-all">
            <LogOut className="w-3.5 h-3.5" />Sair
          </button>
        </div>
      </aside>

      {/* Drawer mobile — só existe no DOM quando aberto, invisível no desktop via md:hidden */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50" onClick={() => setSidebarOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <aside className="absolute inset-y-0 left-0 w-72 bg-zitask-primary text-white flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div>
                <h1 className="text-xl font-black tracking-tight"><span className="text-yellow-400">ZI</span><span className="text-white">task</span></h1>
                <p className="text-[9px] text-zitask-secondary font-bold uppercase tracking-widest opacity-80 mt-0.5">Gestão de Atividades</p>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors">
                <X className="w-5 h-5 text-white/80" />
              </button>
            </div>
            {workspaceName && (
              <div className="px-4 pt-4 pb-1">
                <p className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-0.5">Workspace</p>
                <p className="text-xs font-semibold text-white/80 truncate">{workspaceName}</p>
              </div>
            )}
            <nav className="flex-1 px-3 py-3 space-y-0.5">
              {NAV.map(({ id, label, Icon }) => (
                <button key={id} onClick={() => { setActiveView(id); localStorage.setItem('zitask_view', id); setSidebarOpen(false) }}
                  className={`w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-all ${activeView === id ? 'bg-white/10 text-zitask-secondary' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}>
                  <Icon className="w-4 h-4 mr-3 flex-shrink-0" />{label}
                </button>
              ))}
            </nav>
            <div className="p-3 border-t border-white/10">
              <div className="flex items-center gap-2.5 px-1 mb-2">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shadow-md flex-shrink-0 ${isAdmin ? 'bg-gradient-to-br from-purple-500 to-purple-800' : isGerente ? 'bg-gradient-to-br from-blue-400 to-blue-700' : isConvidado ? 'bg-gradient-to-br from-green-400 to-green-600' : 'bg-gradient-to-br from-amber-600 to-amber-900'}`}
                  style={myTier ? { boxShadow: myTier.glow } : {}}
                >
                  {initials(currentUser?.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold truncate">{currentUser?.name}</p>
                  <p className="text-[10px] text-white/40 truncate">{myTier ? `${myTier.emoji} ${myTier.label}` : roleLabel}</p>
                </div>
              </div>
              <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-white/50 hover:text-white hover:bg-white/5 transition-all">
                <LogOut className="w-3.5 h-3.5" />Sair
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-14 bg-white dark:bg-dark-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6 flex-shrink-0">
          {/* Hamburger — mobile only, invisible on desktop */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-700 transition-colors"
            >
              <Menu className="w-5 h-5 text-slate-500" />
            </button>
            <h2 className="font-bold text-sm text-slate-600 dark:text-slate-300">
              {NAV.find(n => n.id === activeView)?.label}
            </h2>
          </div>
        </header>

        {activeView === 'dashboard' && (
          <DashboardView
            tasks={tasks}
            currentUser={currentUser}
            columns={columns}
            myDoneTasks={myDoneTasks}
            isGerente={isGerente}
            onEditTask={handleEditTask}
            onDeleteTask={handleDeleteTask}
            toast={toast}
            categories={categories}
            onAddCategory={handleAddCategory}
            onDeleteCategory={handleDeleteCategory}
            systems={systems}
            onAddSystem={handleAddSystem}
            onDeleteSystem={handleDeleteSystem}
          />
        )}
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
            categories={categories}
            onAddCategory={handleAddCategory}
            onDeleteCategory={handleDeleteCategory}
            systems={systems}
            onAddSystem={handleAddSystem}
            onDeleteSystem={handleDeleteSystem}
            columns={columns}
            onRenameColumn={handleRenameColumn}
            onDeleteColumn={handleDeleteColumn}
            onAddColumn={handleAddColumn}
            onReorderColumns={handleReorderColumns}
          />
        )}
{activeView === 'users'     && isAdmin && (
          <UsersView currentUser={currentUser} toast={toast} />
        )}
        {activeView === 'settings'  && <SettingsView isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} toast={toast} isAdmin={isAdmin} />}
      </main>

      <ToastList toasts={toasts} dismiss={dismiss} />
    </div>
  )
}
