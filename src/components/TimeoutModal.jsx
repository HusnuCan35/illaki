import { useState } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';

export function TimeoutModal({ isOpen, onClose, targetUser, onApplyTimeout }) {
  const [durationMinutes, setDurationMinutes] = useState(5);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen || !targetUser) return null;

  const DURATIONS = [
    { label: '1 Dakika', val: 1 },
    { label: '5 Dakika', val: 5 },
    { label: '10 Dakika', val: 10 },
    { label: '1 Saat', val: 60 },
    { label: '24 Saat', val: 1440 },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) return;
    setLoading(true);
    try {
      await onApplyTimeout(targetUser.id || targetUser.uid, durationMinutes, reason.trim());
      setReason('');
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Kullanıcıya Zaman Aşımı Ver (Timeout)">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-secondary)' }}>
          <Clock size={20} color="#F59E0B" />
          <span style={{ fontSize: '14px' }}>
            <strong style={{ color: '#FFF' }}>{targetUser.name || targetUser.username}</strong> adlı kullanıcıyı sustur.
          </span>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#94A3B8', marginBottom: '8px' }}>
            Süre Seçimi
          </label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {DURATIONS.map(d => (
              <button
                key={d.val}
                type="button"
                onClick={() => setDurationMinutes(d.val)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: durationMinutes === d.val ? '1px solid #F59E0B' : '1px solid rgba(255, 255, 255, 0.1)',
                  background: durationMinutes === d.val ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  color: durationMinutes === d.val ? '#F59E0B' : '#E2E8F0',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="timeout-reason" style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#94A3B8', marginBottom: '8px' }}>
            Açıklama / Sebep (Zorunlu) *
          </label>
          <textarea
            id="timeout-reason"
            rows={3}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="ör: Spamsız sohbet kurallarını ihlal, uygunsuz dil kullanımı..."
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
            style={{ background: '#F59E0B', color: '#000', fontWeight: '700' }}
          >
            Sustur (Timeout Ver)
          </Button>
        </div>
      </form>
    </Modal>
  );
}
