import { useState, useEffect } from 'react'
import axios from 'axios'
import { AlertCircle, Eye, EyeOff, CheckCircle2, ArrowLeft } from 'lucide-react'
import { MeshGradient } from '@paper-design/shaders-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function LoginPage({ onLogin }) {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [dims,     setDims]     = useState({ width: 1920, height: 1080 })

  // Forgot password state
  const [view,          setView]          = useState('login') // 'login' | 'forgot'
  const [forgotEmail,   setForgotEmail]   = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotDone,    setForgotDone]    = useState(false)
  const [forgotError,   setForgotError]   = useState('')

  useEffect(() => {
    const update = () => setDims({ width: window.innerWidth, height: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

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

  const handleForgot = async e => {
    e.preventDefault()
    if (!forgotEmail.trim()) return
    setForgotError('')
    setForgotLoading(true)
    try {
      await axios.post(`${API_URL}/auth/forgot-password`, { email: forgotEmail })
      setForgotDone(true)
    } catch (err) {
      setForgotError(err?.response?.data?.detail || 'Erro ao enviar email. Tente novamente.')
    } finally {
      setForgotLoading(false)
    }
  }

  const background = (
    <div className="fixed inset-0 w-screen h-screen">
      <MeshGradient
        width={dims.width}
        height={dims.height}
        colors={['#0f2027', '#1a3a4a', '#0d3b4f', '#163044', '#0a2535', '#1c4060']}
        distortion={0.8}
        swirl={0.6}
        grainMixer={0}
        grainOverlay={0}
        speed={0.42}
        offsetX={0.08}
      />
      <div className="absolute inset-0 bg-black/45 pointer-events-none" />
    </div>
  )

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {background}

      <div className="relative z-10 w-full max-w-sm">

        {/* Brand */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black tracking-tight">
            <span className="text-yellow-400">ZI</span><span className="text-white">task</span>
          </h1>
          <p className="text-xs text-white/50 mt-1 font-semibold uppercase tracking-widest">Gestão de Atividades</p>
        </div>

        {/* ── Login ── */}
        {view === 'login' && (
          <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-xl border border-white/15 p-7">
            <h2 className="text-lg font-bold mb-0.5 text-white">Bem-vindo de volta</h2>
            <p className="text-sm text-white/50 mb-6">Entre com sua conta para continuar</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  autoFocus
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-zitask-secondary transition-colors"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-white/50">Senha</label>
                  <button
                    type="button"
                    onClick={() => { setView('forgot'); setForgotEmail(email); setForgotDone(false); setForgotError('') }}
                    className="text-[10px] text-white/40 hover:text-zitask-secondary transition-colors"
                  >
                    Esqueci minha senha
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 pr-10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-zitask-secondary transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-2.5 text-white/40 hover:text-white/70 transition-colors"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2.5 p-3 bg-red-500/20 border border-red-400/40 rounded-xl text-sm text-red-300">
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
        )}

        {/* ── Esqueci minha senha ── */}
        {view === 'forgot' && (
          <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-xl border border-white/15 p-7">
            <button
              onClick={() => { setView('login'); setForgotDone(false); setForgotError('') }}
              className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors mb-5"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar
            </button>

            {!forgotDone ? (
              <>
                <h2 className="text-lg font-bold mb-0.5 text-white">Redefinir senha</h2>
                <p className="text-sm text-white/50 mb-6">Informe seu email e enviaremos uma nova senha.</p>

                <form onSubmit={handleForgot} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1.5">Email</label>
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      placeholder="seu@email.com"
                      required
                      autoFocus
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-zitask-secondary transition-colors"
                    />
                  </div>

                  {forgotError && (
                    <div className="flex items-start gap-2.5 p-3 bg-red-500/20 border border-red-400/40 rounded-xl text-sm text-red-300">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      {forgotError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={forgotLoading || !forgotEmail.trim()}
                    className="w-full py-2.5 bg-zitask-secondary text-zitask-primary font-bold rounded-xl text-sm hover:bg-zitask-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md mt-2"
                  >
                    {forgotLoading ? 'Enviando…' : 'Enviar nova senha'}
                  </button>
                </form>
              </>
            ) : (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-2xl bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-7 h-7 text-green-400" />
                </div>
                <h2 className="text-lg font-bold text-white mb-2">Email enviado!</h2>
                <p className="text-sm text-white/50 mb-6">
                  Se o email estiver cadastrado, você receberá a nova senha em instantes. Verifique também a caixa de spam.
                </p>
                <button
                  onClick={() => setView('login')}
                  className="w-full py-2.5 bg-zitask-secondary text-zitask-primary font-bold rounded-xl text-sm hover:bg-zitask-secondary/90 transition-colors shadow-md"
                >
                  Voltar ao login
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
