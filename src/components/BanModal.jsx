import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';

export function BanModal({ isOpen, onClose, targetUser, onApplyBan }) {
  const [banType, setBanType] = useState('permanent'); // 'permanent' | 'temporary'
  const [durationDays, setDurationDays] = useState(1);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen || !targetUser) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) return;
    setLoading(true);
    try {
      await onApplyBan(targetUser.id || targetUser.uid, {
        banType,
        durationDays: Number(durationDays),
        reason: reason.trim(),
      });
      setReason('');
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Kullanıcıyı Banla (Yasakla)">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-secondary)' }}>
          <ShieldAlert size={22} color="#FF4D4D" />
          <span style={{ fontSize: '14px' }}>
            <strong style={{ color: '#FFF' }}>{targetUser.name || targetUser.username}</strong> adlı kullanıcıyı bu sunucudan yasakla.
          </span>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#94A3B8', marginBottom: '8px' }}>
            Yasaklama Tipi
          </label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={() => setBanType('permanent')}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                border: banType === 'permanent' ? '1px solid #FF4D4D' : '1px solid rgba(255, 255, 255, 0.1)',
                background: banType === 'permanent' ? 'rgba(255, 77, 77, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                color: banType === 'permanent' ? '#FF4D4D' : '#E2E8F0',
                fontWeight: '600',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Süresiz (Kalıcı)
            </button>
            <button
              type="button"
              onClick={() => setBanType('temporary')}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                border: banType === 'temporary' ? '1px solid #F59E0B' : '1px solid rgba(255, 255, 255, 0.1)',
                background: banType === 'temporary' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                color: banType === 'temporary' ? '#F59E0B' : '#E2E8F0',
                fontWeight: '600',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Süreli Yasaklama
            </button>
          </div>
        </div>

        {banType === 'temporary' && (
          <div>
            <label htmlFor="ban-duration-days" style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#94A3B8', marginBottom: '8px' }}>
              Süre (Gün Sayısı)
            </label>
            <select
              id="ban-duration-days"
              value={durationDays}
              onChange={e => setDurationDays(e.target.value)}
              style={{
                width: '100%',
                background: '#0B0C10',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '10px 12px',
                color: '#FFF',
                fontSize: '13px',
                outline: 'none',
              }}
            >
              <option value={1}>1 Gün</option>
              <option value={3}>3 Gün</option>
              <option value={7}>7 Gün (1 Hafta)</option>
              <option value={30}>30 Gün (1 Ay)</option>
            </select>
          </div>
        )}

        <div>
          <label htmlFor="ban-reason" style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#94A3B8', marginBottom: '8px' }}>
            Açıklama / Sebep (Zorunlu) *
          </label>
          <textarea
            id="ban-reason"
            rows={3}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="ör: Ağır topluluk kuralı ihlali, yetkisiz erişim teşebbüsü..."
            required
            style={{
              width: '100%',
              background: '#0B0C10',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              padding: '10px 12px',
              color: '#FFF',
              fontSize: '13px',
              outline: 'none',
              resize: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
          <Button variant="secondary" onClick={onClose} type="button">İptal</Button>
          <Button 
            type="submit" 
            loading={loading} 
            disabled={!reason.trim()} 
            style={{ background: '#FF4D4D', color: '#FFF' }}
          >
            Banla (Sunucudan Yasakla)
          </Button>
        </div>
      </form>
    </Modal>
  );
}
