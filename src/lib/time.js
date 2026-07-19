export let serverTimeOffset = 0;

export async function syncTimeOffset() {
  try {
    const res = await fetch(window.location.href, { method: 'HEAD' });
    const dateStr = res.headers.get('Date');
    if (dateStr) {
      serverTimeOffset = new Date(dateStr).getTime() - Date.now();
      console.log('[TimeSync] Offset calculated:', serverTimeOffset);
    }
  } catch (e) {
    console.warn('[TimeSync] Failed to sync time', e);
  }
}

export function getSyncedTime() {
  return Date.now() + serverTimeOffset;
}
