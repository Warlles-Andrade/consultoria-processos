import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { motion } from 'framer-motion';
import { getPublicErrorMessage } from '@/lib/errorMessages';
import {
  Mail,
  Lock,
  LogIn,
  AlertCircle,
  CheckCircle2,
  BarChart3,
  Users,
  Kanban,
  ArrowLeft,
  KeyRound,
  ShieldAlert,
  Eye,
  EyeOff,
} from 'lucide-react';

const RATE_LIMITS = {
  login: {
    storageKey: 'auth_login_rate_limit',
    maxAttempts: 5,
    windowMs: 10 * 60 * 1000,
    lockoutMs: 5 * 60 * 1000,
    message: 'Muitas tentativas de login. Aguarde para tentar novamente.',
  },
  reset: {
    storageKey: 'auth_reset_rate_limit',
    maxAttempts: 3,
    windowMs: 15 * 60 * 1000,
    lockoutMs: 10 * 60 * 1000,
    message: 'Muitas solicitacoes de redefinicao. Aguarde antes de pedir outro link.',
  },
};

const inputClassName =
  'w-full pl-11 pr-11 py-2.5 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-200 bg-white text-slate-800 placeholder:text-slate-400 text-sm';

const validatePassword = (password) => {
  if (password.length < 8) {
    return 'A senha deve ter no minimo 8 caracteres.';
  }

  if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'A senha deve conter ao menos uma letra maiuscula e um numero.';
  }

  return null;
};

const readRateLimit = (config) => {
  if (typeof window === 'undefined') {
    return { attempts: [], lockedUntil: 0 };
  }

  try {
    const raw = localStorage.getItem(config.storageKey);
    if (!raw) return { attempts: [], lockedUntil: 0 };

    const parsed = JSON.parse(raw);
    return {
      attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [],
      lockedUntil: Number(parsed.lockedUntil) || 0,
    };
  } catch {
    return { attempts: [], lockedUntil: 0 };
  }
};

const writeRateLimit = (config, payload) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(config.storageKey, JSON.stringify(payload));
};

const getRateLimitStatus = (config) => {
  const now = Date.now();
  const state = readRateLimit(config);
  const attempts = state.attempts.filter((timestamp) => now - timestamp <= config.windowMs);
  const lockedUntil = state.lockedUntil > now ? state.lockedUntil : 0;

  if (attempts.length !== state.attempts.length || lockedUntil !== state.lockedUntil) {
    writeRateLimit(config, { attempts, lockedUntil });
  }

  return {
    attempts,
    lockedUntil,
    remainingMs: lockedUntil > now ? lockedUntil - now : 0,
  };
};

const consumeRateLimitAttempt = (config) => {
  const now = Date.now();
  const status = getRateLimitStatus(config);

  if (status.lockedUntil > now) {
    return {
      blocked: true,
      remainingMs: status.lockedUntil - now,
    };
  }

  const attempts = [...status.attempts, now];
  const lockedUntil = attempts.length >= config.maxAttempts ? now + config.lockoutMs : 0;

  writeRateLimit(config, { attempts, lockedUntil });

  return {
    blocked: false,
    remainingMs: lockedUntil > now ? lockedUntil - now : 0,
  };
};

const resetRateLimit = (config) => {
  writeRateLimit(config, { attempts: [], lockedUntil: 0 });
};

const formatRemainingTime = (remainingMs) => {
  const totalSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
};

const clearRecoveryUrl = () => {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  url.hash = '';
  url.searchParams.delete('code');
  url.searchParams.delete('type');
  url.searchParams.delete('access_token');
  url.searchParams.delete('refresh_token');
  url.searchParams.delete('token_hash');

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, document.title, nextUrl);
};

export default function Login({
  onLogin,
  authMode = 'login',
  recoveryEmail = '',
  onRecoveryComplete,
  onCancelRecovery,
}) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [isResetRequestOpen, setIsResetRequestOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetFeedback, setResetFeedback] = useState({ type: '', message: '' });
  const [resetLoading, setResetLoading] = useState(false);
  const [recoveryData, setRecoveryData] = useState({ password: '', confirmPassword: '' });
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [loginLockedMs, setLoginLockedMs] = useState(0);
  const [resetLockedMs, setResetLockedMs] = useState(0);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRecoveryPassword, setShowRecoveryPassword] = useState(false);
  const [showRecoveryConfirmPassword, setShowRecoveryConfirmPassword] = useState(false);

  const isRecoveryMode = authMode === 'recovery';

  useEffect(() => {
    if (recoveryEmail) {
      setEmail(recoveryEmail);
      setResetEmail(recoveryEmail);
    }
  }, [recoveryEmail]);

  useEffect(() => {
    const syncLocks = () => {
      setLoginLockedMs(getRateLimitStatus(RATE_LIMITS.login).remainingMs);
      setResetLockedMs(getRateLimitStatus(RATE_LIMITS.reset).remainingMs);
    };

    syncLocks();
    const intervalId = window.setInterval(syncLocks, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setErro('');

    const loginLimit = getRateLimitStatus(RATE_LIMITS.login);
    if (loginLimit.remainingMs > 0) {
      setLoginLockedMs(loginLimit.remainingMs);
      setErro(`${RATE_LIMITS.login.message} Tente novamente em ${formatRemainingTime(loginLimit.remainingMs)}.`);
      return;
    }

    setCarregando(true);

    try {
      const { error, data } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: senha,
      });

      if (error) {
        const attemptResult = consumeRateLimitAttempt(RATE_LIMITS.login);
        setLoginLockedMs(attemptResult.remainingMs);
        if (attemptResult.remainingMs > 0) {
          setErro(`${RATE_LIMITS.login.message} Tente novamente em ${formatRemainingTime(attemptResult.remainingMs)}.`);
        } else {
          setErro(getPublicErrorMessage(error));
        }
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('ativo, nome')
        .eq('user_id', data.user.id)
        .single();

      if (profileError) {
        setErro('Erro ao verificar status do usuario.');
        return;
      }

      if (profileData?.ativo === false) {
        await supabase.auth.signOut();
        setErro('Conta desativada.\n\nSua conta foi desativada pelo administrador.\n\nEntre em contato com o administrador do sistema para reativar seu acesso.');
        return;
      }

      resetRateLimit(RATE_LIMITS.login);
      setLoginLockedMs(0);
      onLogin(data.user);
    } finally {
      setCarregando(false);
    }
  };

  const handleRequestReset = async (e) => {
    e.preventDefault();

    if (!resetEmail.trim()) {
      setResetFeedback({ type: 'error', message: 'Informe seu email para receber o link de redefinicao.' });
      return;
    }

    const resetLimit = getRateLimitStatus(RATE_LIMITS.reset);
    if (resetLimit.remainingMs > 0) {
      setResetLockedMs(resetLimit.remainingMs);
      setResetFeedback({
        type: 'error',
        message: `${RATE_LIMITS.reset.message} Tente novamente em ${formatRemainingTime(resetLimit.remainingMs)}.`,
      });
      return;
    }

    setResetLoading(true);
    setResetFeedback({ type: '', message: '' });

    try {
      const attemptResult = consumeRateLimitAttempt(RATE_LIMITS.reset);
      setResetLockedMs(attemptResult.remainingMs);

      const response = await fetch('/api/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail.trim() }),
      });
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('O servico de recuperacao exige o ambiente Vercel.');
      }

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Servico de recuperacao temporariamente indisponivel.');
      }

      const cooldownMessage = attemptResult.remainingMs > 0
        ? ` Novo envio liberado em ${formatRemainingTime(attemptResult.remainingMs)}.`
        : '';

      setResetFeedback({
        type: 'success',
        message: `${result.message || 'Se o email estiver cadastrado e ativo, voce recebera um link para redefinir a senha.'}${cooldownMessage}`,
      });
    } catch (error) {
      setResetFeedback({
        type: 'error',
        message: getPublicErrorMessage(error),
      });
    } finally {
      setResetLoading(false);
    }
  };

  const handleRecoverySubmit = async (e) => {
    e.preventDefault();
    setRecoveryError('');

    if (!recoveryData.password || !recoveryData.confirmPassword) {
      setRecoveryError('Preencha a nova senha e a confirmacao.');
      return;
    }

    if (recoveryData.password !== recoveryData.confirmPassword) {
      setRecoveryError('As senhas nao coincidem.');
      return;
    }

    const passwordError = validatePassword(recoveryData.password);
    if (passwordError) {
      setRecoveryError(passwordError);
      return;
    }

    setRecoveryLoading(true);

    try {
      const { data, error } = await supabase.auth.updateUser({ password: recoveryData.password });
      if (error) throw error;

      const nextUser = data?.user;
      if (!nextUser?.id) {
        throw new Error('Nao foi possivel validar a sessao de recuperacao.');
      }

      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('ativo')
        .eq('user_id', nextUser.id)
        .single();

      if (profileError) {
        throw profileError;
      }

      if (profileData?.ativo === false) {
        await supabase.auth.signOut();
        clearRecoveryUrl();
        setRecoveryError('Sua conta esta desativada. Entre em contato com o administrador do sistema.');
        return;
      }

      clearRecoveryUrl();
      onRecoveryComplete?.(nextUser);
    } catch (error) {
      setRecoveryError(getPublicErrorMessage(error));
    } finally {
      setRecoveryLoading(false);
    }
  };

  const features = [
    { icon: BarChart3, label: 'Dashboard em tempo real', desc: 'Visualize metricas e KPIs do seu time' },
    { icon: Kanban, label: 'Gestao Kanban', desc: 'Organize tarefas por status e prioridade' },
    { icon: Users, label: 'Multi-equipes', desc: 'Controle de acesso por cliente e projeto' },
  ];

  const feedbackClass =
    resetFeedback.type === 'success'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
      : 'bg-red-50 border-red-200 text-red-700';

  return (
    <div className="flex min-h-screen">
      <motion.div
        initial={{ opacity: 0, x: -40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="hidden lg:flex lg:w-1/2 xl:w-3/5 flex-col justify-between relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0f2a4a 0%, #1A6FBF 55%, #00BFA5 100%)' }}
      >
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {[
            { size: 320, top: '-80px', left: '-80px', opacity: 0.08 },
            { size: 240, top: '30%', left: '60%', opacity: 0.07 },
            { size: 180, top: '65%', left: '-40px', opacity: 0.06 },
            { size: 400, top: '55%', left: '40%', opacity: 0.05 },
            { size: 140, top: '15%', left: '20%', opacity: 0.06 },
          ].map((h, i) => (
            <motion.div
              key={i}
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 60 + i * 15, repeat: Infinity, ease: 'linear' }}
              style={{
                position: 'absolute',
                top: h.top,
                left: h.left,
                width: h.size,
                height: h.size,
                opacity: h.opacity,
              }}
            >
              <svg viewBox="0 0 100 100" fill="white">
                <polygon points="50,2 93,26 93,74 50,98 7,74 7,26" />
              </svg>
            </motion.div>
          ))}
        </div>

        <div className="relative z-10 flex flex-col h-full p-12 xl:p-16">
          <img src="/img/logo.png" alt="Workive" className="h-12 w-12 object-contain brightness-0 invert drop-shadow-lg" />

          <div className="flex-1 flex flex-col justify-center">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="text-4xl xl:text-5xl font-bold text-white leading-tight mb-3"
            >
              Gerencie processos
              <br />
              <span className="text-teal-300">com inteligencia.</span>
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45, duration: 0.6 }}
              className="text-blue-100 text-lg leading-relaxed max-w-md"
            >
              Centralize tarefas, acompanhe prazos e colabore com sua equipe em um unico lugar.
            </motion.p>

            <div className="mt-8 space-y-3">
              {features.map((f, i) => (
                <motion.div
                  key={f.label}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.55 + i * 0.12, duration: 0.5 }}
                  className="flex items-center gap-4"
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-sm">
                    <f.icon className="h-5 w-5 text-teal-300" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">{f.label}</p>
                    <p className="text-blue-200 text-xs">{f.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <p className="text-blue-300 text-xs">© {new Date().getFullYear()} Workive · Sistema de Gestao de Processos</p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="w-full lg:w-1/2 xl:w-2/5 flex items-center justify-center bg-gradient-to-br from-blue-50 via-teal-50 to-amber-50 p-5 sm:p-8"
      >
        <div className="w-full max-w-sm lg:max-w-[22rem]">
          <div className="lg:hidden text-center mb-6">
            <img src="/img/logo-com-nome.png" alt="Workive" className="h-14 object-contain mx-auto" />
          </div>

          <div className="hidden lg:block mb-5">
            <img src="/img/logo-com-nome.png" alt="Workive" className="h-20 object-contain" />
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-800">
              {isRecoveryMode ? 'Defina sua nova senha' : isResetRequestOpen ? 'Recuperar acesso' : 'Bem-vindo de volta'}
            </h2>
            <p className="text-slate-500 text-sm mt-1">
              {isRecoveryMode
                ? 'Use o link recebido por email para cadastrar uma nova senha.'
                : isResetRequestOpen
                  ? 'Enviaremos um link para redefinicao de senha.'
                  : 'Entre com suas credenciais para continuar'}
            </p>
          </div>

          {isRecoveryMode ? (
            <form onSubmit={handleRecoverySubmit} className="space-y-4">
              <div className="rounded-2xl border border-blue-100 bg-white/80 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Conta em recuperacao</p>
                <p className="mt-2 text-sm text-slate-600">{recoveryEmail || 'Sessao de recuperacao validada pelo Supabase.'}</p>
              </div>

              <div>
                <label htmlFor="recovery-password" className="block text-sm font-semibold text-slate-700 mb-2">Nova senha</label>
                <div className="relative group">
                  <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-600 transition-colors duration-200" />
                  <input
                    id="recovery-password"
                    type={showRecoveryPassword ? 'text' : 'password'}
                    placeholder="Minimo de 8 caracteres"
                    className={inputClassName}
                    value={recoveryData.password}
                    onChange={(e) => setRecoveryData((prev) => ({ ...prev, password: e.target.value }))}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowRecoveryPassword((visible) => !visible)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md"
                    aria-label={showRecoveryPassword ? 'Ocultar nova senha' : 'Mostrar nova senha'}
                    title={showRecoveryPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showRecoveryPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="recovery-confirm-password" className="block text-sm font-semibold text-slate-700 mb-2">Confirmar nova senha</label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-600 transition-colors duration-200" />
                  <input
                    id="recovery-confirm-password"
                    type={showRecoveryConfirmPassword ? 'text' : 'password'}
                    placeholder="Repita a nova senha"
                    className={inputClassName}
                    value={recoveryData.confirmPassword}
                    onChange={(e) => setRecoveryData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowRecoveryConfirmPassword((visible) => !visible)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md"
                    aria-label={showRecoveryConfirmPassword ? 'Ocultar confirmacao da senha' : 'Mostrar confirmacao da senha'}
                    title={showRecoveryConfirmPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showRecoveryConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-500">A senha precisa ter no minimo 8 caracteres, uma letra maiuscula e um numero.</p>
              </div>

              {recoveryError && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-red-50 border-2 border-red-200 rounded-xl text-red-700"
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <p className="text-sm font-medium whitespace-pre-wrap">{recoveryError}</p>
                  </div>
                </motion.div>
              )}

              <motion.button
                type="submit"
                disabled={recoveryLoading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 text-white py-3 rounded-xl font-bold focus:ring-4 focus:ring-blue-300 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
              >
                {recoveryLoading ? 'Salvando nova senha...' : 'Salvar nova senha'}
              </motion.button>

              <button
                type="button"
                onClick={onCancelRecovery}
                className="w-full inline-flex items-center justify-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar ao login
              </button>
            </form>
          ) : isResetRequestOpen ? (
            <form onSubmit={handleRequestReset} className="space-y-4">
              <div>
                <label htmlFor="reset-email" className="block text-sm font-semibold text-slate-700 mb-2">E-mail</label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-600 transition-colors duration-200" />
                  <input
                    id="reset-email"
                    type="email"
                    placeholder="seu@email.com"
                    className={inputClassName}
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              {resetLockedMs > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-3">
                  <ShieldAlert className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <p>Novo envio disponivel em {formatRemainingTime(resetLockedMs)}.</p>
                </div>
              )}

              {resetFeedback.message && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`p-4 border-2 rounded-xl ${feedbackClass}`}
                >
                  <div className="flex items-start gap-3">
                    {resetFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    )}
                    <p className="text-sm font-medium">{resetFeedback.message}</p>
                  </div>
                </motion.div>
              )}

              <motion.button
                type="submit"
                disabled={resetLoading || resetLockedMs > 0}
                whileHover={{ scale: resetLoading || resetLockedMs > 0 ? 1 : 1.02 }}
                whileTap={{ scale: resetLoading || resetLockedMs > 0 ? 1 : 0.98 }}
                className="w-full bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 text-white py-3 rounded-xl font-bold focus:ring-4 focus:ring-blue-300 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
              >
                {resetLoading ? 'Enviando link...' : 'Enviar link de redefinicao'}
              </motion.button>

              <button
                type="button"
                onClick={() => {
                  setIsResetRequestOpen(false);
                  setResetFeedback({ type: '', message: '' });
                }}
                className="w-full inline-flex items-center justify-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar ao login
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-sm font-semibold text-slate-700 mb-2">E-mail</label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-600 transition-colors duration-200" />
                  <input
                    id="login-email"
                    type="email"
                    placeholder="seu@email.com"
                    className={inputClassName}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (!resetEmail) setResetEmail(e.target.value);
                    }}
                    required
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label htmlFor="login-password" className="block text-sm font-semibold text-slate-700">Senha</label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsResetRequestOpen(true);
                      setResetEmail(email);
                      setResetFeedback({ type: '', message: '' });
                      setErro('');
                    }}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    Esqueci minha senha
                  </button>
                </div>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-600 transition-colors duration-200" />
                  <input
                    id="login-password"
                    type={showLoginPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    className={inputClassName}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword((visible) => !visible)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md"
                    aria-label={showLoginPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    title={showLoginPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {loginLockedMs > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-3">
                  <ShieldAlert className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <p>Login temporariamente bloqueado. Tente novamente em {formatRemainingTime(loginLockedMs)}.</p>
                </div>
              )}

              {erro && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-red-50 border-2 border-red-200 rounded-xl text-red-700"
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <pre className="text-sm font-medium whitespace-pre-wrap font-sans">{erro}</pre>
                  </div>
                </motion.div>
              )}

              <motion.button
                type="submit"
                disabled={carregando || loginLockedMs > 0}
                whileHover={{ scale: carregando || loginLockedMs > 0 ? 1 : 1.02 }}
                whileTap={{ scale: carregando || loginLockedMs > 0 ? 1 : 0.98 }}
                className="w-full bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 text-white py-3 rounded-xl font-bold focus:ring-4 focus:ring-blue-300 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
              >
                {carregando ? (
                  <>
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                      <LogIn className="w-4 h-4" />
                    </motion.div>
                    <span>Entrando...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Entrar</span>
                  </>
                )}
              </motion.button>
            </form>
          )}

          <p className="mt-6 text-center text-xs text-slate-400 lg:hidden">© {new Date().getFullYear()} Workive</p>
        </div>
      </motion.div>
    </div>
  );
}
