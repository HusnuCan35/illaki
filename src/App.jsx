import { useEffect } from 'react';
import { useUIStore, useIdentityStore } from './stores';
import { Landing } from './pages/Landing';
import { Home } from './pages/Home';
import { ToastContainer } from './components/ui/Toast';
import { useAuth } from './hooks/useAuth';

export default function App() {
  const { view, setView } = useUIStore();
  const { identity } = useIdentityStore();
  const { loading } = useAuth(); // Firebase auth state'i izle

  useEffect(() => {
    if (identity && view === 'landing') {
      setView('home');
    } else if (!identity && view !== 'landing') {
      setView('landing');
    }
  }, [identity, view, setView]);

  if (loading) return null; // useAuth kendi loading ekranını gösteriyor

  return (
    <>
      {view === 'landing' && <Landing />}
      {(view === 'home' || view === 'chat') && <Home />}
      <ToastContainer />
    </>
  );
}
