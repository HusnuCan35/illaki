import { useEffect, useState } from 'react';
import { Hash, Copy, Check, Link2, AlertCircle, Wifi, Lock, Users, FileText, Globe, Shield } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { useSpaceStore, useIdentityStore, useUIStore, usePeerStore } from '../stores';
import { codeFromPeerId, peerIdFromCode } from '../hooks/usePeer';
import { createSpace, joinSpace, getSpaceKey, grantSpaceAccess, updateSpaceSettings, deleteSpace, leaveSpace, uploadSpaceWallpaper, subscribeToMembers, updateMemberRole } from '../lib/firestore';
import { cacheSpaceKey } from '../lib/crypto';
import styles from './SpaceModals.module.css';

// ─── Space Oluştur Modal ───────────────────────────────────────────────────────
export function CreateSpaceModal({ isOpen, onClose }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [maxMembers, setMaxMembers] = useState(50);
  const [icon, setIcon] = useState('💬');
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const { addSpace, setActiveSpace } = useSpaceStore();
  const { identity } = useIdentityStore();
  const { peerId } = usePeerStore();
  const { addToast } = useUIStore();

  const ICONS = ['💬', '🎮', '🎵', '📚', '💼', '🎨', '🏆', '🚀', '🌍', '🔥'];

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim() || !identity) return;

    setLoading(true);
    try {
      // Firebase'de space oluştur (E2E key dahil)
      const { spaceId, code } = await createSpace({
        uid: identity.uid,
        username: identity.username,
        name: name.trim(),
        description: description.trim(),
        isPrivate,
        maxMembers,
        icon,
      });

      const space = {
        id: spaceId,
        name: name.trim(),
        code,
        description: description.trim(),
        icon,
        isPrivate,
        maxMembers,
        hostUid: identity.uid,
        isHost: true,
        createdAt: Date.now(),
        unread: 0,
        // PeerJS uyumu için de sakla
        hostPeerId: peerId,
      };

      addSpace(space);
      setActiveSpace(spaceId);
      setCreated(space);
    } catch (err) {
      addToast({ type: 'error', message: err.message || 'Oda oluşturulamadı.' });
    } finally {
      setLoading(false);
    }
  };

  const copyCode = async () => {
    if (!created?.code) return;
    await navigator.clipboard.writeText(created.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    addToast({ type: 'success', message: 'Oda kodu kopyalandı!' });
  };

  const handleDone = () => {
    setName(''); setDescription(''); setCreated(null);
    setCopied(false); setIsPrivate(false); setMaxMembers(50); setIcon('💬');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleDone} title="Yeni Space Oluştur">
      {!created ? (
        <form onSubmit={handleCreate} className={styles.form}>
          {/* İkon seçimi */}
          <div className={styles.field}>
            <label className={styles.label}>Space İkonu</label>
            <div className={styles.iconGrid}>
              {ICONS.map(ic => (
                <button
                  key={ic} type="button"
                  className={`${styles.iconBtn} ${icon === ic ? styles.iconBtnActive : ''}`}
                  onClick={() => setIcon(ic)}
                >{ic}</button>
              ))}
            </div>
          </div>

          {/* Ad */}
          <div className={styles.field}>
            <label htmlFor="space-name" className={styles.label}>Space Adı *</label>
            <div className={styles.inputIcon}>
              <Hash size={16} className={styles.icon} />
              <input
                id="space-name" type="text" value={name}
                onChange={e => setName(e.target.value)}
                placeholder="ör: arkadaşlar, oyun grubu..."
                maxLength={32} autoFocus className={styles.input}
                required
              />
            </div>
          </div>

          {/* Açıklama */}
          <div className={styles.field}>
            <label htmlFor="space-desc" className={styles.label}>Açıklama (isteğe bağlı)</label>
            <div className={styles.inputIcon}>
              <FileText size={16} className={styles.icon} />
              <input
                id="space-desc" type="text" value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Bu space hakkında kısa bir açıklama..."
                maxLength={100} className={styles.input}
              />
            </div>
          </div>

          {/* Ayarlar */}
          <div className={styles.settingsRow}>
            {/* Gizlilik */}
            <label className={styles.toggleLabel}>
              <div className={styles.toggleInfo}>
                {isPrivate ? <Lock size={14} /> : <Globe size={14} />}
                <div>
                  <span className={styles.toggleName}>{isPrivate ? 'Özel' : 'Herkese Açık'}</span>
                  <span className={styles.toggleDesc}>{isPrivate ? 'Sadece davetliler katılabilir' : 'Kod ile herkes katılabilir'}</span>
                </div>
              </div>
              <button
                type="button"
                className={`${styles.toggle} ${isPrivate ? styles.toggleOn : ''}`}
                onClick={() => setIsPrivate(p => !p)}
                aria-pressed={isPrivate}
              >
                <span className={styles.toggleThumb} />
              </button>
            </label>

            {/* Max üye */}
            <div className={styles.sliderField}>
              <div className={styles.sliderHeader}>
                <Users size={14} />
                <span>Maksimum Üye: <strong>{maxMembers}</strong></span>
              </div>
              <input
                type="range" min={2} max={100} step={2} value={maxMembers}
                onChange={e => setMaxMembers(Number(e.target.value))}
                className={styles.slider}
              />
              <div className={styles.sliderLabels}><span>2</span><span>100</span></div>
            </div>
          </div>

          <p className={styles.hint}>
            <Lock size={12} style={{ display: 'inline', marginRight: 4 }} />
            Tüm mesajlar AES-256-GCM ile şifrelenir. Oda kodu senin bağlantı kimliğinden oluşturulur.
          </p>

          <div className={styles.actions}>
            <Button variant="secondary" onClick={handleDone} type="button">İptal</Button>
            <Button type="submit" loading={loading} disabled={!name.trim() || loading}>
              Oluştur
            </Button>
          </div>
        </form>
      ) : (
        <div className={styles.successView}>
          <div className={styles.successIconLarge}>{created.icon}</div>
          <h3 className={styles.successTitle}>
            <span className={styles.accent}>#{created.name}</span> hazır!
          </h3>
          <p className={styles.successDesc}>
            Bu kodu arkadaşlarınla paylaş. Uçtan uca şifreli bağlantı.
          </p>
          <button className={styles.codeDisplay} onClick={copyCode}>
            <div className={styles.codeLetters}>
              {created.code.split('').map((char, i) => (
                <span key={i} className={styles.codeLetter}>{char}</span>
              ))}
            </div>
            <div className={styles.codeCopy}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              <span>{copied ? 'Kopyalandı!' : 'Kopyala'}</span>
            </div>
          </button>
          <div className={styles.infoBox}>
            <Shield size={14} />
            <span>E2E şifreleme aktif — sunucu mesajları asla görmez.</span>
          </div>
          <Button fullWidth onClick={handleDone}>Sohbete Başla</Button>
        </div>
      )}
    </Modal>
  );
}

// ─── Space'e Katıl Modal ────────────────────────────────────────────────────────
export function JoinSpaceModal({ isOpen, onClose, connectToPeer }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { addSpace, setActiveSpace } = useSpaceStore();
  const { identity } = useIdentityStore();
  const { addToast } = useUIStore();

  const handleJoin = async (e) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (trimmed.length < 4 || !identity) return;

    setLoading(true);
    setError('');

    try {
      const spaceId = `space_${trimmed}`;

      // Firebase'e katıl
      const { spaceData } = await joinSpace(trimmed, {
        uid: identity.uid,
        username: identity.username,
      });

      // Space key'i al (host'tan PeerJS ile gelecek ya da Firebase'den)
      const spaceKey = await getSpaceKey(spaceId, identity.uid);
      if (spaceKey) {
        await cacheSpaceKey(spaceId, spaceKey);
      }

      // PeerJS bağlantısı kur (anlık mesajlar için) - Arka planda
      try {
        const hostPeerId = peerIdFromCode(trimmed);
        connectToPeer(trimmed).catch(() => {});
      } catch {
        // PeerJS bağlantısı opsiyonel — Firebase yeterli
      }

      const space = {
        id: spaceId,
        name: spaceData?.name || trimmed,
        code: trimmed,
        description: spaceData?.description || '',
        icon: spaceData?.icon || '💬',
        hostUid: spaceData?.hostUid,
        isHost: false,
        unread: 0,
        joined: true,
      };

      addSpace(space);
      setActiveSpace(spaceId);
      addToast({ type: 'success', message: `${space.name} space'ine katıldın!` });
      setCode('');
      onClose();
    } catch (err) {
      setError(err.message || 'Bağlanılamadı. Kod doğru mu?');
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (e) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    setCode(val);
    if (error) setError('');
  };

  return (
    <Modal isOpen={isOpen} onClose={() => { setCode(''); setError(''); onClose(); }} title="Space'e Katıl">
      <form onSubmit={handleJoin} className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="room-code" className={styles.label}>Oda Kodu</label>
          <input
            id="room-code" type="text" value={code}
            onChange={handleCodeChange}
            placeholder="AB3K9PQM"
            maxLength={8} autoFocus autoComplete="off" spellCheck={false}
            className={`${styles.codeInput} ${error ? styles.inputError : ''}`}
            aria-describedby={error ? 'join-error' : 'join-hint'}
            aria-invalid={!!error}
          />
          {error ? (
            <p id="join-error" className={styles.errorText} role="alert">
              <AlertCircle size={13} style={{ display: 'inline', marginRight: 4 }} />
              {error}
            </p>
          ) : (
            <p id="join-hint" className={styles.hint}>
              Arkadaşından aldığın 8 karakterlik oda kodunu gir.
            </p>
          )}
        </div>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => { setCode(''); setError(''); onClose(); }} type="button">
            İptal
          </Button>
          <Button type="submit" loading={loading} disabled={code.trim().length < 4} icon={!loading ? <Link2 size={16} /> : null}>
            Bağlan
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Space Ayarları Modal ───────────────────────────────────────────────────────
export function SpaceSettingsModal({ isOpen, onClose }) {
  const { activeSpaceId, getActiveSpace, removeSpace, setActiveSpace, updateSpace } = useSpaceStore();
  const { identity } = useIdentityStore();
  const { addToast } = useUIStore();
  const space = getActiveSpace();

  const [activeTab, setActiveTab] = useState('general'); // 'general' | 'roles'
  const [members, setMembers] = useState([]);
  const [name, setName] = useState(space?.name || '');
  const [description, setDescription] = useState(space?.description || '');
  const [icon, setIcon] = useState(space?.icon || '💬');
  const [themeColor, setThemeColor] = useState(space?.themeColor || '#FF7E20');
  const [backgroundImage, setBackgroundImage] = useState(space?.backgroundImage || '');
  const [loading, setLoading] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!space?.id || !isOpen) return;
    const unsub = subscribeToMembers(space.id, (mList) => {
      setMembers(mList);
    });
    return () => unsub();
  }, [space?.id, isOpen]);

  const ICONS = ['💬', '🎮', '🎵', '📚', '💼', '🎨', '🏆', '🚀', '🌍', '🔥'];
  const COLORS = ['#FF7E20', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#EF4444'];

  if (!space && isOpen) {
    onClose();
    return null;
  }

  const handleBgUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !space) return;
    if (file.size > 5 * 1024 * 1024) {
      addToast({ type: 'error', message: 'Maksimum duvar kağıdı boyutu 5MB' });
      return;
    }
    setUploadingBg(true);
    try {
      const url = await uploadSpaceWallpaper(space.id, file);
      setBackgroundImage(url);
      addToast({ type: 'success', message: 'Duvar kağıdı yüklendi.' });
    } catch (err) {
      addToast({ type: 'error', message: 'Yüklenemedi.' });
    } finally {
      setUploadingBg(false);
      e.target.value = '';
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!name.trim() || !identity || !space.isHost) return;

    setLoading(true);
    try {
      await updateSpaceSettings(space.id, identity.uid, {
        name: name.trim(),
        description: description.trim(),
        icon,
        themeColor,
        backgroundImage,
      });
      updateSpace(space.id, { name: name.trim(), description: description.trim(), icon, themeColor, backgroundImage });
      addToast({ type: 'success', message: 'Oda ayarları güncellendi.' });
      onClose();
    } catch (err) {
      addToast({ type: 'error', message: err.message || 'Güncellenemedi' });
    } finally {
      setLoading(false);
    }
  };

  const handleLeave = async () => {
    if (!identity) return;
    setLoading(true);
    try {
      await leaveSpace(space.id, identity.uid);
      removeSpace(space.id);
      setActiveSpace(null);
      addToast({ type: 'info', message: 'Odadan ayrıldınız.' });
      onClose();
    } catch (err) {
      addToast({ type: 'error', message: 'Odadan ayrılamadınız.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!identity || !space.isHost) return;
    setLoading(true);
    try {
      await deleteSpace(space.id, identity.uid);
      removeSpace(space.id);
      setActiveSpace(null);
      addToast({ type: 'info', message: 'Oda silindi.' });
      onClose();
    } catch (err) {
      addToast({ type: 'error', message: 'Oda silinemedi.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={() => { setConfirmDelete(false); onClose(); }} 
      title={space?.isHost ? 'Oda Ayarları' : 'Odadan Ayrıl'}
    >
      {space?.isHost ? (
        <div>
          {/* Tab başlıkları */}
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '16px' }}>
            <button
              type="button"
              onClick={() => setActiveTab('general')}
              style={{
                padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
                background: activeTab === 'general' ? 'var(--accent)' : 'transparent',
                color: activeTab === 'general' ? '#fff' : 'var(--text-secondary)'
              }}
            >
              Genel Ayarlar
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('roles')}
              style={{
                padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
                background: activeTab === 'roles' ? 'var(--accent)' : 'transparent',
                color: activeTab === 'roles' ? '#fff' : 'var(--text-secondary)'
              }}
            >
              Roller & Üyeler ({members.length})
            </button>
          </div>

          {activeTab === 'general' && (
            <form onSubmit={handleUpdate} className={styles.form}>
              <div className={styles.field}>
                <label className={styles.label}>Space İkonu</label>
                <div className={styles.iconGrid}>
                  {ICONS.map(ic => (
                    <button
                      key={ic} type="button"
                      className={`${styles.iconBtn} ${icon === ic ? styles.iconBtnActive : ''}`}
                      onClick={() => setIcon(ic)}
                    >{ic}</button>
                  ))}
                </div>
              </div>
              <div className={styles.field}>
                <label htmlFor="edit-space-name" className={styles.label}>Space Adı</label>
                <div className={styles.inputIcon}>
                  <Hash size={16} className={styles.icon} />
                  <input
                    id="edit-space-name" type="text" value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder={space.name}
                    maxLength={32} className={styles.input} required
                  />
                </div>
              </div>
              <div className={styles.field}>
                <label htmlFor="edit-space-desc" className={styles.label}>Açıklama</label>
                <div className={styles.inputIcon}>
                  <FileText size={16} className={styles.icon} />
                  <input
                    id="edit-space-desc" type="text" value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder={space.description || 'Kısa açıklama'}
                    maxLength={100} className={styles.input}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Tema Rengi</label>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {COLORS.map(c => (
                    <button
                      key={c} type="button"
                      onClick={() => setThemeColor(c)}
                      style={{
                        width: '32px', height: '32px', borderRadius: '50%',
                        background: c, border: 'none', cursor: 'pointer',
                        boxShadow: themeColor === c ? `0 0 0 3px var(--bg-surface), 0 0 0 5px ${c}` : 'none',
                        transition: 'box-shadow 0.2s',
                      }}
                      aria-label={`${c} rengini seç`}
                    />
                  ))}
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Arka Plan Görseli</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  {backgroundImage && (
                    <div style={{ width: 64, height: 64, borderRadius: 8, backgroundImage: `url(${backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center', flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <input type="file" id="bg-upload" accept="image/*" style={{ display: 'none' }} disabled={uploadingBg} onChange={handleBgUpload} />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Button variant="secondary" type="button" loading={uploadingBg} onClick={() => document.getElementById('bg-upload').click()}>Görsel Yükle</Button>
                      {backgroundImage && (
                        <Button variant="secondary" type="button" onClick={() => setBackgroundImage('')} style={{ color: 'var(--dnd)' }}>Kaldır</Button>
                      )}
                    </div>
                    <p className={styles.hint} style={{ marginTop: '8px' }}>Sohbetin arka planı. (Maks 5MB)</p>
                  </div>
                </div>
              </div>

              <div className={styles.actions} style={{ marginTop: '24px', justifyContent: 'space-between' }}>
                {confirmDelete ? (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: 'var(--dnd)' }}>Emin misin?</span>
                    <Button type="button" onClick={handleDelete} loading={loading} style={{ background: 'var(--dnd)' }}>Evet, Sil</Button>
                    <Button type="button" variant="secondary" onClick={() => setConfirmDelete(false)}>İptal</Button>
                  </div>
                ) : (
                  <Button type="button" variant="secondary" onClick={() => setConfirmDelete(true)} style={{ color: 'var(--dnd)' }}>Odayı Sil</Button>
                )}
                <Button type="submit" loading={loading} disabled={!name.trim()}>Kaydet</Button>
              </div>
            </form>
          )}

          {activeTab === 'roles' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '350px', overflowY: 'auto', paddingRight: '4px' }}>
              {members.map(m => (
                <div key={m.uid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-modifier-hover)', borderRadius: '8px' }}>
                  <div>
                    <span style={{ fontWeight: 600, display: 'block' }}>{m.username} {m.uid === identity?.uid && '(Sen)'}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{m.role === 'host' ? 'Kurucu' : m.role === 'mod' ? 'Moderatör' : m.role === 'admin' ? 'Yönetici' : 'Üye'}</span>
                  </div>
                  {m.uid !== identity?.uid && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {[
                        { val: 'member', label: 'Üye' },
                        { val: 'mod', label: 'Mod' },
                        { val: 'admin', label: 'Admin' },
                      ].map(r => (
                        <button
                          key={r.val}
                          type="button"
                          onClick={async () => {
                            try {
                              await updateMemberRole(space.id, identity.uid, m.uid, r.val);
                              addToast({ type: 'success', message: `${m.username} yetkisi güncellendi.` });
                            } catch (err) {
                              addToast({ type: 'error', message: err.message });
                            }
                          }}
                          style={{
                            padding: '4px 10px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 500,
                            background: (m.role || 'member') === r.val ? 'var(--accent)' : 'var(--bg-surface)',
                            color: (m.role || 'member') === r.val ? '#fff' : 'var(--text-secondary)'
                          }}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: '8px 0' }}>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '24px' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{space?.name}</strong> odasından ayrılmak istediğinize emin misiniz?
          </p>
          <div className={styles.actions}>
            <Button variant="secondary" onClick={onClose} type="button">İptal</Button>
            <Button type="button" loading={loading} onClick={handleLeave} style={{ background: 'var(--dnd)' }}>
              Odadan Ayrıl
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
