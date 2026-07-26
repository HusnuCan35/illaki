/**
  * Peer ID & Oda kodu yardımcı fonksiyonları
  */

export const generateReadablePeerId = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return 'illaki-' + code;
};

export const codeFromPeerId = (peerId) =>
  peerId ? peerId.replace(/^illaki-/, '') : '';

export const peerIdFromCode = (code) =>
  code ? 'illaki-' + code.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';

export const generateRoomCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 8; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
};
