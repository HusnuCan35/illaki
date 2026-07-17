import { useRef, useCallback } from 'react';

/**
 * useGun — Gun.js P2P distributed database
 * Used for: space discovery, member lists, presence
 * Messages are sent directly via WebRTC (usePeer), not Gun
 */
export function useGun() {
  const gunRef = useRef(null);

  const initGun = useCallback(async () => {
    const Gun = (await import('gun')).default;
    await import('gun/sea');

    // Use public Gun relay peers for discovery only
    const gun = new Gun({
      peers: [
        'https://gun-manhattan.herokuapp.com/gun',
        'wss://gun-us.herokuapp.com/gun',
      ],
      localStorage: false,
      radisk: false,
    });

    gunRef.current = gun;
    return gun;
  }, []);

  /**
   * Publish space info so others can find it by code
   */
  const publishSpace = useCallback((spaceCode, spaceData) => {
    if (!gunRef.current) return;
    gunRef.current
      .get('illaki-spaces')
      .get(spaceCode)
      .put({
        ...spaceData,
        updatedAt: Date.now(),
      });
  }, []);

  /**
   * Fetch space info by code (for joining)
   */
  const fetchSpace = useCallback((spaceCode) => {
    return new Promise((resolve, reject) => {
      if (!gunRef.current) {
        reject(new Error('Gun not initialized'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Space bulunamadı — kod yanlış veya oda boş'));
      }, 8000);

      gunRef.current
        .get('illaki-spaces')
        .get(spaceCode)
        .once((data) => {
          clearTimeout(timeout);
          if (data && data.hostPeerId) {
            resolve(data);
          } else {
            reject(new Error('Space bulunamadı'));
          }
        });
    });
  }, []);

  /**
   * Update member presence in a space
   */
  const updatePresence = useCallback((spaceCode, peerId, username, status) => {
    if (!gunRef.current) return;
    gunRef.current
      .get('illaki-spaces')
      .get(spaceCode)
      .get('members')
      .get(peerId)
      .put({ username, status, lastSeen: Date.now() });
  }, []);

  return { gunRef, initGun, publishSpace, fetchSpace, updatePresence };
}
