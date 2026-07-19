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
  const { view, setView } = useUIStore();
  const { identity } = useIdentityStore();
  const { loading } = useAuth(); // Firebase auth state'i izle

  useEffect(() => {
    syncTimeOffset();
  }, []);

  useEffect(() => {
    if (identity && view === 'landing') {
      setView('home');
    } else if (!identity && view !== 'landing') {
      setView('landing');
    }
  }, [identity, view, setView]);

  if (loading) return <LoadingScreen />;

  return (
    <>
      {view === 'landing' && <Landing />}
      {(view === 'home' || view === 'chat') && <Home />}
      <ToastContainer />
    </>
  );
}
