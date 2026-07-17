import { useState } from 'react';
import { User, Mic, Volume2, Palette, Info, ChevronRight, Check } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { useIdentityStore, useUIStore } from '../stores';
import { uploadAvatar } from '../lib/firestore';
import styles from './Settings.module.css';

const SECTIONS = [
  { id: 'profile', label: 'Profil', icon: <User size={15} /> },
  { id: 'audio', label: 'Ses', icon: <Mic size={15} /> },
  { id: 'about', label: 'Hakkında', icon: <Info size={15} /> },
];

const ACCENT_COLORS = [
  { name: 'Turuncu', value: '#ff7e20' },
  { name: 'Pembe', value: '#e91e8c' },
  { name: 'Mor', value: '#7c3aed' },
  { name: 'Mavi', value: '#3b82f6' },
  { name: 'Yeşil', value: '#22c55e' },
  { name: 'Kırmızı', value: '#ef4444' },
];

export function SettingsModal({ isOpen, onClose }) {
  const { identity, setIdentity } = useIdentityStore();
  const { addToast } = useUIStore();

  const [section, setSection] = useState('profile');
  const [username, setUsername] = useState(identity?.username || '');
  const [accentColor, setAccentColor] = useState('#ff7e20');
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [inputDevice, setInputDevice] = useState('');
  const [devices, setDevices] = useState([]);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Ses cihazlarını yükle
  const loadDevices = async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter(d => d.kind === 'audioinput'));
    } catch {}
  };

  const handleSave = () => {
    if (username.trim().length < 2) {
      addToast({ type: 'error', message: 'Kullanıcı adı en az 2 karakter olmalı' });
      return;
    }
    setIdentity({ ...identity, username: username.trim() });
    // Accent rengi CSS değişkenine uygula
    document.documentElement.style.setProperty('--accent', accentColor);
    document.documentElement.style.setProperty('--accent-dark', accentColor + 'cc');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    addToast({ type: 'success', message: 'Ayarlar kaydedildi' });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ayarlar" width={600}>
      <div className={styles.layout}>
        {/* Sol menü */}
        <nav className={styles.nav} aria-label="Ayarlar bölümleri">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              className={`${styles.navItem} ${section === s.id ? styles.navActive : ''}`}
              onClick={() => { setSection(s.id); if (s.id === 'audio') loadDevices(); }}
              aria-current={section === s.id ? 'page' : undefined}
            >
              <span className={styles.navIcon}>{s.icon}</span>
              <span>{s.label}</span>
              <ChevronRight size={13} className={styles.navArrow} />
            </button>
          ))}
        </nav>

        {/* İçerik */}
        <div className={styles.content}>

          {/* ── Profil ── */}
          {section === 'profile' && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Profil Ayarları</h3>

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
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Avatarın</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div
                    className={styles.avatarPreview}
                    style={{ 
                      background: identity?.avatarColor || 'var(--accent)',
                      backgroundImage: identity?.photoURL ? `url(${identity.photoURL})` : 'none',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                    aria-label="Avatar önizleme"
                  >
                    {!identity?.photoURL && (username || identity?.username || '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
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
                        } catch (err) {
                          addToast({ type: 'error', message: 'Avatar yüklenemedi.' });
                        } finally {
                          setUploading(false);
                          e.target.value = '';
                        }
                      }}
                    />
                    <Button variant="secondary" onClick={() => document.getElementById('avatar-upload').click()} loading={uploading}>
                      Fotoğraf Yükle
                    </Button>
                    <p className={styles.hint} style={{ marginTop: '8px' }}>Maksimum boyut: 2MB (JPG, PNG)</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Ses ── */}
          {section === 'audio' && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Ses Ayarları</h3>

              {devices.length > 0 && (
                <div className={styles.field}>
                  <label htmlFor="input-device" className={styles.label}>Mikrofon</label>
                  <select
                    id="input-device"
                    value={inputDevice}
                    onChange={e => setInputDevice(e.target.value)}
                    className={styles.select}
                    aria-label="Mikrofon cihazı seç"
                  >
                    <option value="">Varsayılan mikrofon</option>
                    {devices.map(d => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label || 'Mikrofon'}</option>
                    ))}
                  </select>
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
                <Info size={14} />
                <p>HD ses kalitesi için Opus codec 48kHz kullanılır. WebRTC üzerinden P2P — şifreli.</p>
              </div>
            </div>
          )}

          {/* ── Hakkında ── */}
          {section === 'about' && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Hakkında</h3>
              <div className={styles.aboutCard}>
                <div className={styles.aboutLogo}>
                  <span>#</span>
                </div>
                <div>
                  <div className={styles.aboutName}>Illaki</div>
                  <div className={styles.aboutVer}>v0.2.0 — E2E Şifreli Mesajlaşma</div>
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
          {(section === 'profile' || section === 'audio') && (
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
