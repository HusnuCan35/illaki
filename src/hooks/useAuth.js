/**
 * useAuth — Firebase Authentication Hook
 * Email/Şifre + Google ile giriş/kayıt
 */

import { useState, useEffect, useCallback, useRef } from 'react';
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
import { upsertUserProfile, getUserSpaces, subscribeToUserSpaces, getUserProfile } from '../lib/firestore';
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
  const unsubSpacesRef = useRef(null);

  // Auth durumunu takip et
  useEffect(() => {
    if (!auth) {
      setAuthError("Firebase API Key eksik. Lütfen .env dosyanızı ayarlayın.");
      setLoading(false);
      return;
    }

    // Güvenlik zaman aşımı: Firebase Auth gecikirse en fazla 2.5 sn sonra ekranı aç
    const timer = setTimeout(() => {
      setLoading(false);
    }, 2500);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      clearTimeout(timer);
      if (unsubSpacesRef.current) {
        unsubSpacesRef.current();
        unsubSpacesRef.current = null;
      }

      if (user) {
        const defaultColor = hashColor(user.displayName || user.email || user.uid);
        const defaultName = user.displayName || user.email?.split('@')[0] || 'Kullanıcı';

        // İlk identity bilgilerini hızla ayarla ve yükleme ekranını derhal kapat
        setIdentity({
          id: user.uid,
          uid: user.uid,
          username: defaultName,
          customId: null,
          avatarColor: defaultColor,
          email: user.email,
          photoURL: user.photoURL,
          isFirebaseUser: true,
        });

        setLoading(false);

        // Detaylı profil ve oda verilerini arka planda eşzamanla
        (async () => {
          try {
            const savedProfile = await getUserProfile(user.uid);
            const username = savedProfile?.username || defaultName;
            const avatarColor = savedProfile?.avatarColor || defaultColor;

            const updatedIdentity = {
              id: user.uid,
              uid: user.uid,
              username,
              customId: savedProfile?.customId || null,
              avatarColor,
              email: user.email,
              photoURL: savedProfile?.photoURL || user.photoURL,
              isFirebaseUser: true,
            };
            setIdentity(updatedIdentity);

            await upsertUserProfile(user.uid, {
              username: updatedIdentity.username,
              avatarColor: updatedIdentity.avatarColor,
              photoURL: updatedIdentity.photoURL,
            });

            // Anlık oda takibi başlat
            unsubSpacesRef.current = subscribeToUserSpaces(user.uid, (spaces) => {
              setSpaces(spaces);
            });
          } catch (err) {
            console.warn('[useAuth] Arka plan verisi yükleme uyarısı:', err);
          }
        })();

      } else {
        clearIdentity();
        setSpaces([]);
        setLoading(false);
      }
    });

    return () => {
      clearTimeout(timer);
      unsubscribe();
      if (unsubSpacesRef.current) {
        unsubSpacesRef.current();
      }
    };
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
    try {
      const user = auth.currentUser;
      const { activeSpaceId } = useSpaceStore.getState();
      if (user && activeSpaceId) {
        const { updateMemberVoiceStatus, updateMemberOnlineStatus } = await import('../lib/firestore');
        await updateMemberVoiceStatus(activeSpaceId, user.uid, null);
        await updateMemberOnlineStatus(activeSpaceId, user.uid, false);
      }
    } catch (e) {
      console.warn('Çıkış yaparken durum temizlenemedi:', e);
    }
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
