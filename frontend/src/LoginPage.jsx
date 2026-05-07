import { useState } from 'react'
import axios from 'axios'
import { AlertCircle, Eye, EyeOff } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function LoginPage({ onLogin }) {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const handleSubmit = async e => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) return
    setError('')
    setLoading(true)
    try {
      const { data } = await axios.post(`${API_URL}/auth/login`, { email, password })
      localStorage.setItem('zitask_token', data.token)
      localStorage.setItem('zitask_user',  JSON.stringify(data.user))
      onLogin(data.user)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Email ou senha incorretos.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-dark-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-zitask-primary rounded-2xl shadow-xl mb-4">
            <span className="text-2xl font-black text-zitask-secondary">Z</span>
          </div>
          <h1 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">ZItask</h1>
          <p className="text-xs text-slate-400 mt-1 font-semibold uppercase tracking-widest">Gestão de Atividades</p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-dark-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-7">
          <h2 className="text-lg font-bold mb-0.5">Bem-vindo de volta</h2>
          <p className="text-sm text-slate-400 mb-6">Entre com sua conta para continuar</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="field-label">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                autoFocus
                className="field-input"
              />
            </div>

            <div>
              <label className="field-label">Senha</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="field-input pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim() || !password.trim()}
              className="w-full py-2.5 bg-zitask-secondary text-zitask-primary font-bold rounded-xl text-sm hover:bg-zitask-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md mt-2"
            >
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-5">
          Primeiro acesso? Use <span className="font-mono font-semibold">admin@zitask.com</span> / <span className="font-mono font-semibold">admin123</span>
        </p>
      </div>
    </div>
  )
}
