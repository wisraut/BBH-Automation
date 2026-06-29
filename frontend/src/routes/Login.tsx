import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { AuthBrandPanel } from '../components/auth/AuthBrandPanel'
import { AuthCard } from '../components/auth/AuthCard'
import { ForgotPasswordForm } from '../components/auth/ForgotPasswordForm'
import { LoginForm } from '../components/auth/LoginForm'
import { ResetPasswordForm } from '../components/auth/ResetPasswordForm'
import { SignedInPreview } from '../components/auth/SignedInPreview'
import { ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'

type AuthMode = 'login' | 'forgot' | 'reset' | 'signed-in'

export function Login() {
  const { user, isReady, login, logout } = useAuth()
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [notice, setNotice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (isReady && user) setMode('signed-in')
  }, [isReady, user])

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setNotice('')

    try {
      const signedInUser = await login(email, password)
      setPassword('')
      setMode('signed-in')
      setNotice(
        signedInUser.role === 'doctor'
          ? 'เข้าสู่ระบบสำเร็จ เปิดพื้นที่ทำงานของแพทย์'
          : 'เข้าสู่ระบบสำเร็จ เปิดพื้นที่ทำงานของ CRO',
      )
    } catch (error) {
      setNotice(
        error instanceof ApiError
          ? error.message
          : 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleForgot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice('ตอนนี้ให้ผู้ดูแลระบบเป็นคนรีเซ็ตรหัสผ่านให้พนักงาน')
    setMode('reset')
  }

  function handleReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice('กรุณาติดต่อผู้ดูแลระบบเพื่อรีเซ็ตรหัสผ่าน')
    setMode('login')
  }

  async function handleLogout() {
    await logout()
    setPassword('')
    setMode('login')
    setNotice('')
  }

  return (
    <main className="min-h-screen bg-white text-bbh-ink">
      <section className="grid min-h-screen lg:grid-cols-[1.03fr_0.97fr]">
        <AuthBrandPanel />
        <AuthCard>
          {mode === 'signed-in' && user ? (
            <SignedInPreview user={user} notice={notice} onLogout={handleLogout} />
          ) : null}

          {mode === 'login' ? (
            <LoginForm
              email={email}
              password={password}
              rememberMe={rememberMe}
              notice={notice}
              isSubmitting={isSubmitting || !isReady}
              onEmailChange={setEmail}
              onPasswordChange={setPassword}
              onRememberMeChange={setRememberMe}
              onSubmit={handleLogin}
              onForgotPassword={() => setMode('forgot')}
            />
          ) : null}

          {mode === 'forgot' ? (
            <ForgotPasswordForm
              email={email}
              onEmailChange={setEmail}
              onSubmit={handleForgot}
              onBackToLogin={() => setMode('login')}
            />
          ) : null}

          {mode === 'reset' ? <ResetPasswordForm onSubmit={handleReset} /> : null}
        </AuthCard>
      </section>
    </main>
  )
}
