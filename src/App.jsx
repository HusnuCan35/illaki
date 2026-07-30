import { useEffect } from 'react';
import { useUIStore, useIdentityStore } from './stores';
import { Landing } from './pages/Landing';
import { Home } from './pages/Home';
import { ToastContainer } from './components/ui/Toast';
import { useAuth } from './hooks/useAuth';
import { LoadingScreen } from './components/ui/LoadingScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { syncTimeOffset } from './lib/time';

export default function App() {
  const { view, setView, setInviteCodeToJoin, inviteCodeToJoin, setJoinModalOpen } = useUIStore();
  const { identity } = useIdentityStore();
  const { loading } = useAuth(); // Firebase auth state'i izle

  useEffect(() => {
    syncTimeOffset();
    
    // Davet linki kontrolü
    const path = window.location.pathname;
    if (path.startsWith('/join/')) {
      const code = path.split('/join/')[1];
      if (code) {
        setInviteCodeToJoin(code);
        // Temiz URL'ye dön
        window.history.replaceState({}, document.title, '/');
      }
    }
  }, [setInviteCodeToJoin]);

  useEffect(() => {
    if (identity && view === 'landing') {
      setView('home');
    } else if (!identity && view !== 'landing') {
      setView('landing');
    }
  }, [identity, view, setView]);

  useEffect(() => {
    if (identity && view === 'home' && inviteCodeToJoin) {
      setJoinModalOpen(true);
    }
  }, [identity, view, inviteCodeToJoin, setJoinModalOpen]);

  if (loading) return <LoadingScreen />;

  return (
    <>
      {view === 'landing' && <Landing />}
      {(view === 'home' || view === 'chat') && <Home />}
      <ToastContainer />
    </>
  );
}
