export function checkEnv() {
  if (!import.meta.env.VITE_FIREBASE_API_KEY) {
    document.body.innerHTML = `
      <div style="padding: 20px; font-family: sans-serif; color: white; background: #222; height: 100vh;">
        <h2>⚠️ Vercel Ayarları Eksik</h2>
        <p>Uygulamanın çalışması için Vercel üzerinde <strong>Environment Variables (Çevre Değişkenleri)</strong> eksik.</p>
        <p>Lütfen Vercel panelinizden <strong>Settings -> Environment Variables</strong> kısmına gidip projenizdeki <code>.env</code> dosyasının içindeki <code>VITE_FIREBASE_...</code> ile başlayan tüm şifreleri ekleyin.</p>
        <p>Ekledikten sonra Vercel'de <strong>Deployments</strong> sekmesine gelip yeniden deploy edin (Redeploy).</p>
      </div>
    `;
    throw new Error('Missing Env');
  }
}
