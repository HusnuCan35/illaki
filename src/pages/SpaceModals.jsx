import { useEffect, useState } from 'react';
import { Hash, Copy, Check, Link2, AlertCircle, Wifi, Lock, Users, FileText, Globe, Shield } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { useSpaceStore, useIdentityStore, useUIStore, usePeerStore } from '../stores';
import { codeFromPeerId, peerIdFromCode } from '../lib/peerUtils';
import { createSpace, joinSpace, getSpaceKey, grantSpaceAccess, updateSpaceSettings, deleteSpace, leaveSpace, uploadSpaceWallpaper, subscribeToMembers, updateMemberRole, updateMemberRolesArray, subscribeToRoles } from '../lib/firestore';
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
    const inviteLink = `${window.location.origin}/join/${created.code}`;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    addToast({ type: 'success', message: 'Davet bağlantısı kopyalandı!' });
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
  const { addSpace, setActiveSpace } = useSpaceStore();
  const { identity } = useIdentityStore();
  const { addToast, inviteCodeToJoin, setInviteCodeToJoin } = useUIStore();

  const [code, setCode] = useState(inviteCodeToJoin || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (inviteCodeToJoin) {
      setCode(inviteCodeToJoin);
    }
  }, [inviteCodeToJoin]);

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

      // Sunucu listesini anında doğrula ve yenile
      try {
        const { getUserSpaces } = await import('../lib/firestore');
        const userSpaces = await getUserSpaces(identity.uid);
        if (userSpaces && userSpaces.length > 0) {
          useSpaceStore.getState().setSpaces(userSpaces);
        }
      } catch (e) {}

      addToast({ type: 'success', message: `${space.name} sunucusuna katıldın!` });
      setCode('');
      setInviteCodeToJoin(null);
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

  const handleClose = () => {
    setCode('');
    setError('');
    setInviteCodeToJoin(null);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Sunucuya Katıl">
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

  const [activeTab, setActiveTab] = useState('general'); // 'general' | 'roles' | 'bans'
  const [members, setMembers] = useState([]);
  const [bans, setBans] = useState([]);
  const [name, setName] = useState(space?.name || '');
  const [customRoles, setCustomRoles] = useState([]);

  useEffect(() => {
    if (!isOpen || !space?.id) return;
    const unsub = subscribeToMembers(space.id, (m) => setMembers(m));
    const unsubRoles = subscribeToRoles(space.id, (r) => setCustomRoles(r));
    return () => {
      unsub();
      unsubRoles();
    };
  }, [isOpen, space?.id]);

  const [description, setDescription] = useState(space?.description || '');
  const [icon, setIcon] = useState(space?.icon || '💬');
  const [themeColor, setThemeColor] = useState(space?.themeColor || '#FF7E20');
  const [backgroundImage, setBackgroundImage] = useState(space?.backgroundImage || '');
  const [loading, setLoading] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!space?.id || !isOpen) return;
    const unsubMembers = subscribeToMembers(space.id, (mList) => {
      setMembers(mList);
    });
    
    let unsubBans = () => {};
    import('../lib/firestore').then(({ subscribeToBans }) => {
      unsubBans = subscribeToBans(space.id, (bList) => {
        setBans(bList);
      });
    });

    return () => {
      unsubMembers();
      unsubBans();
    };
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

  const handleUnban = async (targetUid, targetName) => {
    try {
      const { unbanMember } = await import('../lib/firestore');
      await unbanMember(space.id, identity.uid, targetUid);
      addToast({ type: 'success', message: `${targetName} yasağı kaldırıldı.` });
    } catch (err) {
      addToast({ type: 'error', message: 'Yasak kaldırılamadı: ' + err.message });
    }
  };

  const handleKickUser = async (targetUid, targetName) => {
    if (!window.confirm(`${targetName} adlı kullanıcıyı sunucudan tekmelemek istediğinize emin misiniz?`)) return;
    try {
      const { kickMember } = await import('../lib/firestore');
      await kickMember(space.id, identity.uid, targetUid);
      addToast({ type: 'info', message: `${targetName} sunucudan atıldı.` });
    } catch (err) {
      addToast({ type: 'error', message: err.message });
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
            <button
              type="button"
              onClick={() => setActiveTab('bans')}
              style={{
                padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
                background: activeTab === 'bans' ? '#FF4D4D' : 'transparent',
                color: activeTab === 'bans' ? '#fff' : 'var(--text-secondary)'
              }}
            >
              Yasaklılar ({bans.length})
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
              {/* Rol Oluşturma Kartı */}
              <div style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(255, 126, 32, 0.3)', borderRadius: '12px', padding: '14px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#FF7E20', fontWeight: '700' }}>✨ Yeni Özel Rol Oluştur</h4>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <input
                    type="text"
                    id="new-role-name"
                    placeholder="Rol Adı (örn: Moderatör, VIP)..."
                    style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: '12px' }}
                  />
                  <input 
                    type="color" 
                    id="new-role-color"
                    defaultValue="#FF7E20"
                    style={{ width: '36px', height: '36px', padding: '2px', border: 'none', background: 'transparent', cursor: 'pointer' }}
                  />
                  <Button
                    type="button"
                    onClick={async () => {
                      const inputEl = document.getElementById('new-role-name');
                      const colorEl = document.getElementById('new-role-color');
                      const roleName = inputEl?.value?.trim();
                      const roleColor = colorEl?.value || '#FF7E20';
                      if (!roleName) return;
                      try {
                        const { createCustomRole } = await import('../lib/firestore');
                        await createCustomRole(space.id, identity.uid, { name: roleName, color: roleColor });
                        inputEl.value = '';
                        addToast({ type: 'success', message: `"${roleName}" rolü oluşturuldu.` });
                      } catch (err) {
                        addToast({ type: 'error', message: err.message });
                      }
                    }}
                    style={{ padding: '6px 12px', fontSize: '12px' }}
                  >
                    Oluştur
                  </Button>
                </div>
                <div style={{ fontSize: '11px', color: '#94A3B8' }}>Varsayılan izinler: Mesaj Okuma/Gönderme, Sese Katılma.</div>
              </div>

              {/* Mevcut Özel Roller */}
              {customRoles.length > 0 && (
                <div style={{ background: 'rgba(15, 23, 42, 0.5)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', padding: '14px' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#FFF', fontWeight: '700' }}>Mevcut Özel Roller</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {customRoles.map(r => (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: 12, height: 12, borderRadius: '50%', background: r.color }}></div>
                          <span style={{ fontSize: '12px', color: '#FFF' }}>{r.name}</span>
                        </div>
                        <Button 
                          type="button" 
                          variant="secondary" 
                          style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--dnd)' }}
                          onClick={async () => {
                             try {
                               const { deleteCustomRole } = await import('../lib/firestore');
                               await deleteCustomRole(space.id, identity.uid, r.id);
                               addToast({ type: 'success', message: 'Rol silindi.' });
                             } catch(err) {
                               addToast({ type: 'error', message: err.message });
                             }
                          }}
                        >
                          Sil
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Üyeler ve Rol Atamaları */}
              <h4 style={{ margin: '8px 0 4px 0', fontSize: '13px', color: '#FFF', fontWeight: '700' }}>Üye Yetkileri & Rol Atama</h4>
              {members.map(m => (
                <div key={m.uid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-modifier-hover)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div>
                    <span style={{ fontWeight: 600, display: 'block', fontSize: '13px', color: '#FFF' }}>{m.username} {m.uid === identity?.uid && '(Sen)'}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {m.role === 'host' ? '👑 Kurucu' : m.role === 'admin' ? '🛡️ Yönetici' : m.role === 'mod' ? '⭐ Moderatör' : '👤 Üye'} 
                      {m.points > 0 && ` • ⭐ ${m.points} Puan`}
                    </span>
                  </div>
                  {m.uid !== identity?.uid && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
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
                              padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
                              background: (m.role || 'member') === r.val ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
                              color: (m.role || 'member') === r.val ? '#fff' : 'var(--text-secondary)'
                            }}
                          >
                            {r.label}
                          </button>
                        ))}

                        <button
                          type="button"
                          onClick={() => handleKickUser(m.uid, m.username)}
                          style={{
                            padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.4)',
                            background: 'rgba(239,68,68,0.15)', color: '#FF4D4D', cursor: 'pointer', fontSize: '11px', fontWeight: 700
                          }}
                          title="Sunucudan At"
                        >
                          At
                        </button>
                      </div>
                      
                      {customRoles.length > 0 && (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: '4px' }}>
                          {customRoles.map(cr => {
                            const hasRole = m.roles?.includes(cr.id);
                            return (
                              <label key={cr.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: hasRole ? '#FFF' : '#94A3B8', cursor: 'pointer', background: hasRole ? cr.color : 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '6px', border: `1px solid ${hasRole ? 'transparent' : 'rgba(255,255,255,0.1)'}` }}>
                                <input 
                                  type="checkbox" 
                                  checked={hasRole || false} 
                                  onChange={async (e) => {
                                    try {
                                      const newRoles = e.target.checked 
                                        ? [...(m.roles || []), cr.id] 
                                        : (m.roles || []).filter(id => id !== cr.id);
                                      await updateMemberRolesArray(space.id, identity.uid, m.uid, newRoles);
                                      addToast({ type: 'success', message: 'Roller güncellendi' });
                                    } catch(err) {
                                      addToast({ type: 'error', message: err.message });
                                    }
                                  }}
                                  style={{ display: 'none' }}
                                />
                                {cr.name}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'bans' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
              {/* Yasakla / Uzaklaştır Hızlı Formu */}
              <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '12px', padding: '14px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#EF4444', fontWeight: '700' }}>⛔ Kullanıcı Yasakla / Sustur (Timeout)</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                      id="action-target-uid"
                      style={{ flex: 1, padding: '8px', borderRadius: '8px', background: '#0E1017', border: '1px solid rgba(255,255,255,0.15)', color: '#FFF', fontSize: '12px' }}
                    >
                      <option value="">Üye Seç...</option>
                      {members.filter(m => m.uid !== identity?.uid).map(m => (
                        <option key={m.uid} value={m.uid}>{m.username}</option>
                      ))}
                    </select>

                    <select
                      id="action-type"
                      style={{ padding: '8px', borderRadius: '8px', background: '#0E1017', border: '1px solid rgba(255,255,255,0.15)', color: '#FFF', fontSize: '12px' }}
                    >
                      <option value="timeout">Sustur (Timeout)</option>
                      <option value="ban">Yasakla (Ban)</option>
                    </select>

                    <select
                      id="action-duration"
                      style={{ padding: '8px', borderRadius: '8px', background: '#0E1017', border: '1px solid rgba(255,255,255,0.15)', color: '#FFF', fontSize: '12px' }}
                    >
                      <option value="5">5 Dk</option>
                      <option value="15">15 Dk</option>
                      <option value="60">1 Saat</option>
                      <option value="1440">24 Saat</option>
                      <option value="permanent">Süresiz</option>
                    </select>
                  </div>

                  <input
                    type="text"
                    id="action-reason"
                    placeholder="Sebep (örn: Kural İhlali)..."
                    style={{ padding: '8px 12px', borderRadius: '8px', background: '#0E1017', border: '1px solid rgba(255,255,255,0.15)', color: '#FFF', fontSize: '12px' }}
                  />

                  <Button
                    type="button"
                    onClick={async () => {
                      const targetUid = document.getElementById('action-target-uid')?.value;
                      const type = document.getElementById('action-type')?.value;
                      const duration = document.getElementById('action-duration')?.value;
                      const reason = document.getElementById('action-reason')?.value || 'Kural İhlali';

                      if (!targetUid) {
                        addToast({ type: 'error', message: 'Lütfen bir üye seçin.' });
                        return;
                      }

                      try {
                        if (type === 'timeout') {
                          const { timeoutMember } = await import('../lib/firestore');
                          const mins = duration === 'permanent' ? 1440 : parseInt(duration);
                          await timeoutMember(space.id, identity.uid, targetUid, { durationMinutes: mins, reason });
                          addToast({ type: 'success', message: 'Kullanıcı susturuldu (Timeout).' });
                        } else {
                          const { banMember } = await import('../lib/firestore');
                          const isPerm = duration === 'permanent';
                          const days = isPerm ? 365 : Math.ceil(parseInt(duration) / 1440);
                          await banMember(space.id, identity.uid, targetUid, { banType: isPerm ? 'permanent' : 'temporary', durationDays: days, reason });
                          addToast({ type: 'success', message: 'Kullanıcı yasaklandı.' });
                        }
                      } catch (err) {
                        addToast({ type: 'error', message: err.message });
                      }
                    }}
                    style={{ background: '#EF4444', color: '#FFF', padding: '8px', fontSize: '12px', fontWeight: '700' }}
                  >
                    Cezayı Uygula
                  </Button>
                </div>
              </div>

              {/* Yasaklı Üyeler Listesi */}
              <h4 style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#FFF', fontWeight: '700' }}>Yasaklı Üyeler ({bans.length})</h4>
              {bans.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px', color: '#94A3B8', fontSize: '12px' }}>
                  Henüz yasaklanmış kullanıcı yok.
                </div>
              ) : (
                bans.map(b => (
                  <div key={b.uid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'rgba(255, 77, 77, 0.08)', border: '1px solid rgba(255, 77, 77, 0.2)', borderRadius: '8px' }}>
                    <div>
                      <div style={{ fontWeight: '700', color: '#FFF', fontSize: '13px' }}>{b.username}</div>
                      <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
                        Türü: <strong>{b.banType === 'temporary' ? 'Süreli' : 'Kalıcı'}</strong> | Sebep: <em>"{b.reason}"</em>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUnban(b.uid, b.username)}
                      style={{
                        padding: '6px 12px', borderRadius: '6px', border: '1px solid #10B981',
                        background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', cursor: 'pointer', fontSize: '11px', fontWeight: '700'
                      }}
                    >
                      Yasağı Kaldır
                    </button>
                  </div>
                ))
              )}
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
