import { useState } from 'react';
import { Hash, Mail, Lock, User, ArrowRight, Eye, EyeOff, AlertCircle, Loader } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import styles from './Landing.module.css';

function hashColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 70%, 55%)`;
}

export function Landing() {
  const [tab, setTab] = useState('signin'); // 'signin' | 'signup' | 'reset'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [localError, setLocalError] = useState('');
  const [resetSent, setResetSent] = useState(false);

  const { loading: authLoading, authError, signIn, signUp, signInWithGoogle, resetPassword } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const error = localError || authError;

  const handleSignIn = async (e) => {
    e.preventDefault();
    setLocalError('');
    if (!email.trim() || !password) return;
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setLocalError('');
    if (!email.trim() || !password || !username.trim()) {
      setLocalError('Tüm alanları doldurun.');
      return;
    }
    if (username.trim().length < 2) {
      setLocalError('Kullanıcı adı en az 2 karakter olmalı.');
      return;
    }
    if (password.length < 6) {
      setLocalError('Şifre en az 6 karakter olmalı.');
      return;
    }
    setSubmitting(true);
    try {
      await signUp(email.trim(), password, username.trim());
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setLocalError('');
    setSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setLocalError('');
    if (!email.trim()) { setLocalError('Email girin.'); return; }
    setSubmitting(true);
    try {
      await resetPassword(email.trim());
      setResetSent(true);
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const switchTab = (t) => {
    setTab(t);
    setLocalError('');
    setResetSent(false);
  };

  if (authLoading) {
    return (
      <div className={styles.root}>
        <div className={styles.orb1} aria-hidden="true" />
        <div className={styles.orb2} aria-hidden="true" />
        <div className={styles.loadingScreen}>
          <div className={styles.logoIcon}><Hash size={28} strokeWidth={2.5} /></div>
          <Loader size={20} className={styles.spinner} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.orb1} aria-hidden="true" />
      <div className={styles.orb2} aria-hidden="true" />
      <div className={styles.grid} aria-hidden="true" />

      <main className={styles.main}>
        {/* Logo */}
        <div className={styles.logoArea}>
          <div className={styles.logoIcon}><Hash size={28} strokeWidth={2.5} /></div>
          <div className={styles.logoText}>
            <span className={styles.logoName}>illaki</span>
            <span className={styles.logoBadge}>E2E</span>
          </div>
        </div>

        {/* Headline */}
        <div className={styles.hero}>
          <h1 className={styles.headline}>
            Güvenli Mesajlaş.<br />
            <span className={styles.headlineAccent}>Şifreli Paylaş.</span>
          </h1>
          <p className={styles.subheadline}>
            Uçtan uca şifreli. Hesabınla her cihazdan eriş.<br />
            Sunucumuz mesajlarını asla görmez.
          </p>
        </div>

        {/* Auth Card */}
        <div className={styles.authCard}>
          {/* Tabs */}
          {tab !== 'reset' && (
            <div className={styles.tabs} role="tablist">
              <button
                className={`${styles.tab} ${tab === 'signin' ? styles.tabActive : ''}`}
                onClick={() => switchTab('signin')}
                role="tab"
                aria-selected={tab === 'signin'}
              >
                Giriş Yap
              </button>
              <button
                className={`${styles.tab} ${tab === 'signup' ? styles.tabActive : ''}`}
                onClick={() => switchTab('signup')}
                role="tab"
                aria-selected={tab === 'signup'}
              >
                Kayıt Ol
              </button>
              <div className={`${styles.tabIndicator} ${tab === 'signup' ? styles.tabIndicatorRight : ''}`} aria-hidden="true" />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className={styles.errorBanner} role="alert">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          {/* ── Giriş Formu ── */}
          {tab === 'signin' && (
            <form onSubmit={handleSignIn} className={styles.form}>
              <div className={styles.field}>
                <label htmlFor="signin-email" className={styles.label}>Email</label>
                <div className={styles.inputIcon}>
                  <Mail size={15} className={styles.icon} />
                  <input
                    id="signin-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="ornek@email.com"
                    autoComplete="email"
                    className={styles.input}
                    required
                  />
                </div>
              </div>
              <div className={styles.field}>
                <label htmlFor="signin-password" className={styles.label}>Şifre</label>
                <div className={styles.inputIcon}>
                  <Lock size={15} className={styles.icon} />
                  <input
                    id="signin-password"
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className={styles.input}
                    required
                  />
                  <button type="button" className={styles.eyeBtn} onClick={() => setShowPass(p => !p)} tabIndex={-1}>
                    {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <button type="button" className={styles.forgotLink} onClick={() => switchTab('reset')}>
                Şifremi unuttum
              </button>
              <button
                type="submit"
                className={styles.submitBtn}
                disabled={submitting || !email || !password}
                id="signin-btn"
              >
                {submitting ? <Loader size={16} className={styles.spinnerInline} /> : <ArrowRight size={16} />}
                {submitting ? 'Giriş yapılıyor...' : 'Giriş Yap'}
              </button>
              <div className={styles.divider}><span>veya</span></div>
              <button type="button" className={styles.googleBtn} onClick={handleGoogle} disabled={submitting} id="google-signin-btn">
                <GoogleIcon />
                Google ile Devam Et
              </button>
            </form>
          )}

          {/* ── Kayıt Formu ── */}
          {tab === 'signup' && (
            <form onSubmit={handleSignUp} className={styles.form}>
              <div className={styles.field}>
                <label htmlFor="signup-username" className={styles.label}>Kullanıcı Adı</label>
                <div className={styles.inputIcon}>
                  <User size={15} className={styles.icon} />
                  <input
                    id="signup-username"
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="Görünür adın"
                    maxLength={32}
                    autoComplete="username"
                    className={styles.input}
                    required
                  />
                </div>
                {username.trim().length > 0 && (
                  <div className={styles.avatarPreviewRow}>
                    <div className={styles.avatarPreview} style={{ background: hashColor(username) }}>
                      {username.slice(0, 2).toUpperCase()}
                    </div>
                    <span className={styles.avatarHint}>Avatar önizlemesi</span>
                  </div>
                )}
              </div>
              <div className={styles.field}>
                <label htmlFor="signup-email" className={styles.label}>Email</label>
                <div className={styles.inputIcon}>
                  <Mail size={15} className={styles.icon} />
                  <input
                    id="signup-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="ornek@email.com"
                    autoComplete="email"
                    className={styles.input}
                    required
                  />
                </div>
              </div>
              <div className={styles.field}>
                <label htmlFor="signup-password" className={styles.label}>Şifre</label>
                <div className={styles.inputIcon}>
                  <Lock size={15} className={styles.icon} />
                  <input
                    id="signup-password"
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="En az 6 karakter"
                    autoComplete="new-password"
                    className={styles.input}
                    required
                    minLength={6}
                  />
                  <button type="button" className={styles.eyeBtn} onClick={() => setShowPass(p => !p)} tabIndex={-1}>
                    {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                className={styles.submitBtn}
                disabled={submitting || !email || !password || !username}
                id="signup-btn"
              >
                {submitting ? <Loader size={16} className={styles.spinnerInline} /> : <ArrowRight size={16} />}
                {submitting ? 'Hesap oluşturuluyor...' : 'Hesap Oluştur'}
              </button>
              <div className={styles.divider}><span>veya</span></div>
              <button type="button" className={styles.googleBtn} onClick={handleGoogle} disabled={submitting}>
                <GoogleIcon />
                Google ile Devam Et
              </button>
            </form>
          )}

          {/* ── Şifre Sıfırlama ── */}
          {tab === 'reset' && (
            <div className={styles.form}>
              <button className={styles.backBtn} onClick={() => switchTab('signin')}>← Geri</button>
              <h3 className={styles.resetTitle}>Şifre Sıfırla</h3>
              {resetSent ? (
                <div className={styles.resetSuccess}>
                  <div className={styles.resetSuccessIcon}>✓</div>
                  <p>Şifre sıfırlama linki <strong>{email}</strong> adresine gönderildi.</p>
                  <button className={styles.forgotLink} onClick={() => switchTab('signin')}>Giriş sayfasına dön</button>
                </div>
              ) : (
                <form onSubmit={handleReset}>
                  <div className={styles.field}>
                    <label htmlFor="reset-email" className={styles.label}>Email Adresin</label>
                    <div className={styles.inputIcon}>
                      <Mail size={15} className={styles.icon} />
                      <input
                        id="reset-email"
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="ornek@email.com"
                        className={styles.input}
                        required
                      />
                    </div>
                  </div>
                  <button type="submit" className={styles.submitBtn} disabled={submitting || !email}>
                    {submitting ? <Loader size={16} className={styles.spinnerInline} /> : null}
                    {submitting ? 'Gönderiliyor...' : 'Link Gönder'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Features */}
        <div className={styles.features} role="list">
          {[
            { emoji: '🔒', title: 'Uçtan Uca Şifreleme', desc: 'AES-256-GCM — sunucu mesajları asla görmez' },
            { emoji: '📱', title: 'Her Cihazdan Erişim', desc: 'Hesabınla girince tüm mesajların senkronize' },
            { emoji: '⚡', title: 'Anlık İletişim', desc: 'P2P WebRTC + Firebase hibrit mimari' },
          ].map(f => (
            <div className={styles.feature} key={f.title} role="listitem">
              <div className={styles.featureEmoji}>{f.emoji}</div>
              <div>
                <div className={styles.featureTitle}>{f.title}</div>
                <div className={styles.featureDesc}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}
