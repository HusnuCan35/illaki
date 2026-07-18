import { useState, useEffect } from 'react';
import { Hash, Volume2, Shield, Settings, Trash2, Check } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import styles from './ChannelModals.module.css';

export function CreateChannelModal({ isOpen, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('text');
  const [allowedRoles, setAllowedRoles] = useState(['all']);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setType('text');
      setAllowedRoles(['all']);
    }
  }, [isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate({ name, type, allowedRoles });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Kanal Oluştur">
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formGroup}>
          <label>Kanal Adı</label>
          <div className={styles.inputWrapper}>
            <Hash size={18} className={styles.inputIcon} />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
              placeholder="yeni-kanal"
              required
              autoFocus
            />
          </div>
        </div>

        <div className={styles.formGroup}>
          <label>Kanal Türü</label>
          <div className={styles.typeSelector}>
            <button
              type="button"
              className={`${styles.typeBtn} ${type === 'text' ? styles.active : ''}`}
              onClick={() => setType('text')}
            >
              <Hash size={20} />
              <span>Metin</span>
            </button>
            <button
              type="button"
              className={`${styles.typeBtn} ${type === 'voice' ? styles.active : ''}`}
              onClick={() => setType('voice')}
            >
              <Volume2 size={20} />
              <span>Ses</span>
            </button>
          </div>
        </div>

        <div className={styles.formGroup}>
          <label>Kanal Erişimi</label>
          <div className={styles.radioGroup}>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="access"
                checked={allowedRoles.includes('all')}
                onChange={() => setAllowedRoles(['all'])}
              />
              <span>Herkes Görebilir</span>
            </label>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="access"
                checked={!allowedRoles.includes('all')}
                onChange={() => setAllowedRoles(['admin', 'mod'])}
              />
              <span><Shield size={14}/> Sadece Yönetici/Moderatör</span>
            </label>
          </div>
        </div>

        <div className={styles.actions}>
          <Button type="button" variant="ghost" onClick={onClose}>İptal</Button>
          <Button type="submit">Oluştur</Button>
        </div>
      </form>
    </Modal>
  );
}

export function ChannelSettingsModal({ isOpen, onClose, channel, onUpdate, onDelete }) {
  const [tab, setTab] = useState('general');
  const [name, setName] = useState('');
  const [allowedRoles, setAllowedRoles] = useState(['all']);

  useEffect(() => {
    if (isOpen && channel) {
      setName(channel.name);
      setAllowedRoles(channel.allowedRoles || ['all']);
      setTab('general');
    }
  }, [isOpen, channel]);

  const handleSave = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onUpdate({ name, allowedRoles });
    onClose();
  };

  if (!channel) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Kanal Ayarları">
      <div className={styles.container}>
        <div className={styles.sidebar}>
          <button
            className={`${styles.tabBtn} ${tab === 'general' ? styles.activeTab : ''}`}
            onClick={() => setTab('general')}
          >
            <Settings size={18} /> Genel
          </button>
          <button
            className={`${styles.tabBtn} ${tab === 'permissions' ? styles.activeTab : ''}`}
            onClick={() => setTab('permissions')}
          >
            <Shield size={18} /> İzinler
          </button>
        </div>

        <div className={styles.content}>
          <form onSubmit={handleSave} className={styles.form}>
            {tab === 'general' && (
              <>
                <div className={styles.formGroup}>
                  <label>Kanal Adı</label>
                  <div className={styles.inputWrapper}>
                    <Hash size={18} className={styles.inputIcon} />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                      placeholder="kanal-adi"
                      required
                    />
                  </div>
                </div>

                <div className={styles.dangerZone}>
                  <p>Bu kanalı silmek istediğinize emin misiniz? (Geri alınamaz)</p>
                  <Button type="button" variant="danger" onClick={onDelete}>
                    <Trash2 size={16} /> Kanalı Sil
                  </Button>
                </div>
              </>
            )}

            {tab === 'permissions' && (
              <>
                <div className={styles.formGroup}>
                  <label>Kimler Görebilir?</label>
                  <div className={styles.radioGroup}>
                    <label className={styles.radioLabel}>
                      <input
                        type="radio"
                        name="access_edit"
                        checked={allowedRoles.includes('all')}
                        onChange={() => setAllowedRoles(['all'])}
                      />
                      <span>Herkes</span>
                    </label>
                    <label className={styles.radioLabel}>
                      <input
                        type="radio"
                        name="access_edit"
                        checked={!allowedRoles.includes('all')}
                        onChange={() => setAllowedRoles(['admin', 'mod'])}
                      />
                      <span><Shield size={14}/> Özel (Yönetici & Moderatör)</span>
                    </label>
                  </div>
                </div>
              </>
            )}

            <div className={styles.actions}>
              <Button type="button" variant="ghost" onClick={onClose}>İptal</Button>
              <Button type="submit">Değişiklikleri Kaydet</Button>
            </div>
          </form>
        </div>
      </div>
    </Modal>
  );
}
