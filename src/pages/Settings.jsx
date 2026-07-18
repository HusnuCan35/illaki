import { useState } from 'react';
import { User, Mic, Info, Check, ChevronRight, Shield, Palette, Camera } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { useIdentityStore, useUIStore } from '../stores';
import { uploadAvatar } from '../lib/firestore';
import styles from './Settings.module.css';

const SECTIONS = [
  { id: 'profile', label: 'Profil', icon: <User size={16} /> },
  { id: 'audio', label: 'Ses & Video', icon: <Mic size={16} /> },
  { id: 'appearance', label: 'Görünüm', icon: <Palette size={16} /> },
  { id: 'about', label: 'Hakkında', icon: <Info size={16} /> },
];

const ACCENT_COLORS = [
  { name: 'Turuncu', value: '#ff7e20' },
  { name: 'Pembe', value: '#e91e8c' },
  { name: 'Mor', value: '#7c3aed' },
  { name: 'Mavi', value: '#3b82f6' },
  { name: 'Yeşil', value: '#22c55e' },
  { name: 'Kırmızı', value: '#ef4444' },
  { name: 'Sarı', value: '#eab308' },
  { name: 'Cyan', value: '#06b6d4' },
];

export function SettingsModal({ isOpen, onClose }) {
  const { identity, setIdentity } = useIdentityStore();
  const { addToast } = useUIStore();

  const [section, setSection] = useState('profile');
  const [username, setUsername] = useState(identity?.username || '');
  const [accentColor, setAccentColor] = useState(
    getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff7e20'
  );
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [inputDevice, setInputDevice] = useState('');
  const [devices, setDevices] = useState([]);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);

  const loadDevices = async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter(d => d.kind === 'audioinput' || d.kind === 'videoinput'));
    } catch {}
  };

  const handleSave = () => {
    if (username.trim().length < 2) {
      addToast({ type: 'error', message: 'Kullanıcı adı en az 2 karakter olmalı' });
      return;
    }
    setIdentity({ ...identity, username: username.trim() });
    document.documentElement.style.setProperty('--accent', accentColor);
    document.documentElement.style.setProperty('--accent-dark', accentColor + 'cc');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    addToast({ type: 'success', message: 'Ayarlar kaydedildi ✨' });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ayarlar" width={640}>
      <div className={styles.layout}>
        {/* Sol Navigasyon */}
        <nav className={styles.nav} aria-label="Ayarlar bölümleri">
          <div className={styles.navHeader}>AYARLAR</div>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              className={`${styles.navItem} ${section === s.id ? styles.navActive : ''}`}
              onClick={() => { setSection(s.id); if (s.id === 'audio') loadDevices(); }}
              aria-current={section === s.id ? 'page' : undefined}
            >
              <span className={styles.navIcon}>{s.icon}</span>
              <span className={styles.navLabel}>{s.label}</span>
              {section === s.id && <ChevronRight size={14} className={styles.navArrow} />}
            </button>
          ))}
        </nav>

        {/* İçerik */}
        <div className={styles.content}>

          {/* ── Profil ── */}
          {section === 'profile' && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <User size={18} />
                <h3 className={styles.sectionTitle}>Profil Ayarları</h3>
              </div>

              {/* Avatar Card */}
              <div className={styles.avatarCard}>
                <div
                  className={styles.avatarPreview}
                  style={{
                    background: identity?.avatarColor || accentColor,
                    backgroundImage: identity?.photoURL ? `url(${identity.photoURL})` : 'none',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                  aria-label="Avatar önizleme"
                >
                  {!identity?.photoURL && (username || identity?.username || '?').slice(0, 2).toUpperCase()}
                  <div className={styles.avatarOverlay}>
                    <Camera size={20} />
                  </div>
                </div>
                <div className={styles.avatarInfo}>
                  <div className={styles.avatarUsername}>{username || identity?.username || 'Kullanıcı'}</div>
                  <div className={styles.avatarHint}>Profil fotoğrafını değiştirmek için tıkla</div>
                  <input
                    type="file"
                    id="avatar-upload"
                    accept="image/*"
                    style={{ display: 'none' }}
                    disabled={uploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !identity?.uid) return;
                      if (file.size > 2 * 1024 * 1024) {
                        addToast({ type: 'error', message: 'Maksimum dosya boyutu 2MB' });
                        return;
                      }
                      setUploading(true);
                      try {
                        const url = await uploadAvatar(identity.uid, file);
                        setIdentity({ ...identity, photoURL: url });
                        addToast({ type: 'success', message: 'Avatar yüklendi!' });
                      } catch {
                        addToast({ type: 'error', message: 'Avatar yüklenemedi.' });
                      } finally {
                        setUploading(false);
                        e.target.value = '';
                      }
                    }}
                  />
                  <Button
                    variant="secondary"
                    onClick={() => document.getElementById('avatar-upload').click()}
                    loading={uploading}
                  >
                    Fotoğraf Yükle
                  </Button>
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="settings-username" className={styles.label}>Kullanıcı Adı</label>
                <input
                  id="settings-username"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  maxLength={32}
                  placeholder="Kullanıcı adın"
                  className={styles.input}
                />
                <span className={styles.hint}>{username.length}/32 karakter</span>
              </div>
            </div>
          )}

          {/* ── Ses & Video ── */}
          {section === 'audio' && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <Mic size={18} />
                <h3 className={styles.sectionTitle}>Ses & Video Ayarları</h3>
              </div>

              {devices.filter(d => d.kind === 'audioinput').length > 0 && (
                <div className={styles.field}>
                  <label htmlFor="input-device" className={styles.label}>Mikrofon</label>
                  <select
                    id="input-device"
                    value={inputDevice}
                    onChange={e => setInputDevice(e.target.value)}
                    className={styles.select}
                  >
                    <option value="">Varsayılan mikrofon</option>
                    {devices.filter(d => d.kind === 'audioinput').map(d => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label || 'Mikrofon'}</option>
                    ))}
                  </select>
                </div>
              )}

              {devices.filter(d => d.kind === 'videoinput').length > 0 && (
                <div className={styles.field}>
                  <label htmlFor="video-device" className={styles.label}>Kamera</label>
                  <select id="video-device" className={styles.select}>
                    <option value="">Varsayılan kamera</option>
                    {devices.filter(d => d.kind === 'videoinput').map(d => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label || 'Kamera'}</option>
                    ))}
                  </select>
                </div>
              )}

              {devices.length === 0 && (
                <div className={styles.devicePrompt}>
                  <Mic size={32} className={styles.devicePromptIcon} />
                  <p>Cihazları listelemek için izin gerekiyor</p>
                  <Button variant="secondary" onClick={loadDevices}>Cihazları Yükle</Button>
                </div>
              )}

              <div className={styles.toggleGroup}>
                <Toggle
                  id="noise-suppression"
                  label="Gürültü Bastırma"
                  desc="Arka plan seslerini azaltır"
                  value={noiseSuppression}
                  onChange={setNoiseSuppression}
                />
                <Toggle
                  id="echo-cancellation"
                  label="Eko İptali"
                  desc="Hoparlörden geri dönüş sesini engeller"
                  value={echoCancellation}
                  onChange={setEchoCancellation}
                />
              </div>

              <div className={styles.infoCard}>
                <Shield size={16} />
                <div>
                  <p className={styles.infoTitle}>Uçtan Uca Şifreli</p>
                  <p>HD ses için Opus 48kHz kullanılır. Tüm iletişim WebRTC P2P şifreli bağlantı üzerinden gerçekleşir.</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Görünüm ── */}
          {section === 'appearance' && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <Palette size={18} />
                <h3 className={styles.sectionTitle}>Görünüm</h3>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Tema Rengi</label>
                <div className={styles.colorGrid}>
                  {ACCENT_COLORS.map(c => (
                    <button
                      key={c.value}
                      className={`${styles.colorSwatch} ${accentColor === c.value ? styles.colorSwatchActive : ''}`}
                      style={{ background: c.value }}
                      onClick={() => setAccentColor(c.value)}
                      title={c.name}
                      aria-label={c.name}
                    >
                      {accentColor === c.value && <Check size={14} color="#fff" />}
                    </button>
                  ))}
                </div>
                <div className={styles.colorPreview} style={{ background: accentColor }}>
                  <span>Önizleme — {ACCENT_COLORS.find(c => c.value === accentColor)?.name || 'Özel'}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Hakkında ── */}
          {section === 'about' && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <Info size={18} />
                <h3 className={styles.sectionTitle}>Hakkında</h3>
              </div>
              <div className={styles.aboutCard}>
                <div className={styles.aboutLogo}>
                  <span>#</span>
                </div>
                <div>
                  <div className={styles.aboutName}>illaki</div>
                  <div className={styles.aboutVer}>v0.3.0 — E2E Şifreli + Kamera Desteği</div>
                </div>
              </div>
              <div className={styles.aboutList}>
                {[
                  ['Kimlik Doğrulama', 'Firebase Auth (Email / Google)'],
                  ['Anlık Mesajlar', 'P2P WebRTC (PeerJS)'],
                  ['Kalıcı Mesajlar', 'Firebase Firestore'],
                  ['Medya Depolama', 'Firebase Storage'],
                  ['Şifreleme', 'AES-256-GCM (Web Crypto API)'],
                  ['Anahtar Paylaşımı', 'ECDH P-256'],
                  ['Ses Codec', 'Opus 48kHz (WebRTC)'],
                  ['Video', 'WebRTC MediaStream'],
                  ['Sunucu Mesaj Erişimi', 'YOK — Sıfır erişim'],
                ].map(([k, v]) => (
                  <div key={k} className={styles.aboutRow}>
                    <span className={styles.aboutKey}>{k}</span>
                    <span className={styles.aboutVal}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Kaydet */}
          {(section === 'profile' || section === 'audio' || section === 'appearance') && (
            <div className={styles.footer}>
              <Button onClick={handleSave} icon={saved ? <Check size={15} /> : null}>
                {saved ? 'Kaydedildi!' : 'Kaydet'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Toggle({ id, label, desc, value, onChange }) {
  return (
    <label className={styles.toggle} htmlFor={id}>
      <div className={styles.toggleText}>
        <span className={styles.toggleLabel}>{label}</span>
        <span className={styles.toggleDesc}>{desc}</span>
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={value}
        className={`${styles.toggleBtn} ${value ? styles.toggleOn : ''}`}
        onClick={() => onChange(!value)}
        type="button"
      >
        <span className={styles.toggleThumb} />
      </button>
    </label>
  );
}
