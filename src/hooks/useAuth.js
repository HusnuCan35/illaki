/**
 * useAuth — Firebase Authentication Hook
 * Email/Şifre + Google ile giriş/kayıt
 */

import { useState, useEffect, useCallback } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { upsertUserProfile, getUserSpaces, subscribeToUserSpaces } from '../lib/firestore';
import { loadUserKeyPair, generateKeyPair, saveUserKeyPair } from '../lib/crypto';
import { useIdentityStore, useSpaceStore } from '../stores';

function hashColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 70%, 55%)`;
}

export function useAuth() {
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const { setIdentity, clearIdentity } = useIdentityStore();
  const setSpaces = useSpaceStore(s => s.setSpaces);

  // Auth durumunu takip et
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const avatarColor = hashColor(user.displayName || user.email || user.uid);
        const identity = {
          id: user.uid,
          uid: user.uid,
          username: user.displayName || user.email?.split('@')[0] || 'Kullanıcı',
          avatarColor,
          email: user.email,
          photoURL: user.photoURL,
          isFirebaseUser: true,
        };
        setIdentity(identity);

        // Profili ve Odaları gerçek zamanlı senkronize et
        let unsubSpaces = () => {};
        try {
          await upsertUserProfile(user.uid, {
            username: identity.username,
            avatarColor,
            photoURL: user.photoURL,
          });
          
          // İlk yükleme
          const initialSpaces = await getUserSpaces(user.uid);
          setSpaces(initialSpaces);

          // Real-time spaces listener
          unsubSpaces = subscribeToUserSpaces(user.uid, (spaces) => {
            setSpaces(spaces);
          });
        } catch (err) {
          console.error('Profil veya odaları güncelleme hatası:', err);
        }

        return () => {
          unsubSpaces();
        };
      } else {
        clearIdentity();
        setSpaces([]);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [setIdentity, clearIdentity, setSpaces]);

  // Email + Şifre ile kayıt
  const signUp = useCallback(async (email, password, username) => {
    setAuthError(null);
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(user, { displayName: username });
      return user;
    } catch (err) {
      const msg = getAuthErrorMessage(err.code);
      setAuthError(msg);
      throw new Error(msg);
    }
  }, []);

  // Email + Şifre ile giriş
  const signIn = useCallback(async (email, password) => {
    setAuthError(null);
    try {
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      return user;
    } catch (err) {
      const msg = getAuthErrorMessage(err.code);
      setAuthError(msg);
      throw new Error(msg);
    }
  }, []);

  // Google ile giriş
  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      const provider = new GoogleAuthProvider();
      const { user } = await signInWithPopup(auth, provider);
      return user;
    } catch (err) {
      const msg = getAuthErrorMessage(err.code);
      setAuthError(msg);
      throw new Error(msg);
    }
  }, []);

  // Çıkış
  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  // Şifre sıfırlama
  const resetPassword = useCallback(async (email) => {
    setAuthError(null);
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err) {
      const msg = getAuthErrorMessage(err.code);
      setAuthError(msg);
      throw new Error(msg);
    }
  }, []);

  return { loading, authError, signUp, signIn, signInWithGoogle, signOut, resetPassword };
}

// Firebase hata kodlarını Türkçe mesajlara çevir
function getAuthErrorMessage(code) {
  const messages = {
    'auth/email-already-in-use': 'Bu email zaten kullanımda.',
    'auth/invalid-email': 'Geçersiz email adresi.',
    'auth/operation-not-allowed': 'Bu giriş yöntemi etkin değil.',
    'auth/weak-password': 'Şifre en az 6 karakter olmalı.',
    'auth/user-disabled': 'Bu hesap devre dışı bırakılmış.',
    'auth/user-not-found': 'Bu email ile kayıtlı kullanıcı yok.',
    'auth/wrong-password': 'Yanlış şifre.',
    'auth/too-many-requests': 'Çok fazla başarısız deneme. Lütfen bekleyin.',
    'auth/network-request-failed': 'Ağ hatası. İnternet bağlantını kontrol et.',
    'auth/popup-closed-by-user': 'Giriş penceresi kapatıldı.',
    'auth/cancelled-popup-request': 'Giriş iptal edildi.',
    'auth/invalid-credential': 'Geçersiz kullanıcı adı veya şifre.',
  };
  return messages[code] || 'Bir hata oluştu. Lütfen tekrar dene.';
}
