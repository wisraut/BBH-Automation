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
  const [needsOtp, setNeedsOtp] = useState(false)
  const [otpCode, setOtpCode] = useState('')

  useEffect(() => {
    if (isReady && user) setMode('signed-in')
  }, [isReady, user])

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setNotice('')

    try {
      const signedInUser = await login(email, password, needsOtp ? otpCode : undefined)
      setPassword('')
      setOtpCode('')
      setNeedsOtp(false)
      setMode('signed-in')
      setNotice(
        signedInUser.role === 'doctor'
          ? 'เข้าสู่ระบบสำเร็จ เปิดพื้นที่ทำงานของแพทย์'
          : 'เข้าสู่ระบบสำเร็จ เปิดพื้นที่ทำงานของ CRO',
      )
    } catch (error) {
      // 401 with code OTP_REQUIRED → switch into 2FA challenge mode
      const isOtpRequired =
        error instanceof ApiError
        && (error.code === 'OTP_REQUIRED' || /2FA|OTP/i.test(error.message ?? ''))
      if (isOtpRequired) {
        setNeedsOtp(true)
        setNotice('กรุณาใส่รหัส 6 หลักจากแอป Authenticator')
      } else {
        setNotice(
          error instanceof ApiError
            ? error.message
            : 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
        )
      }
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
              needsOtp={needsOtp}
              otpCode={otpCode}
              onEmailChange={setEmail}
              onPasswordChange={setPassword}
              onRememberMeChange={setRememberMe}
              onOtpChange={setOtpCode}
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
