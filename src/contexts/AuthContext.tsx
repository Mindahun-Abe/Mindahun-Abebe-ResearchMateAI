import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, googleAuthProvider, handleFirestoreError, OperationType } from '../lib/firebase';

interface AuthContextValue {
  user: User | null;
  idToken: string | null;
  loading: boolean;
  authError: string;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  idToken: null,
  loading: true,
  authError: '',
  signInWithGoogle: async () => {},
  logout: async () => {},
  refreshToken: async () => null,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  const syncUserProfiles = useCallback(async (firebaseUser: User, token: string) => {
    const uid = firebaseUser.uid;
    const publicRef = doc(db, 'users', uid, 'public', 'profile');
    const privateRef = doc(db, 'users', uid, 'private', 'info');

    try {
      const pubSnap = await getDoc(publicRef);
      const displayName = (firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Researcher').slice(0, 120);
      const photoURL = (firebaseUser.photoURL || '').slice(0, 512);

      if (!pubSnap.exists()) {
        await setDoc(publicRef, {
          uid,
          displayName,
          ...(photoURL ? { photoURL } : {}),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(publicRef, {
          displayName,
          ...(photoURL ? { photoURL } : {}),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.WRITE, `users/${uid}/public/profile`);
      } catch (e: any) {
        console.warn('Public profile sync skipped:', e?.message);
      }
    }

    try {
      const privSnap = await getDoc(privateRef);
      const email = firebaseUser.email || '';
      if (email) {
        if (!privSnap.exists()) {
          await setDoc(privateRef, {
            uid,
            email,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(privateRef, {
            email,
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.WRITE, `users/${uid}/private/info`);
      } catch (e: any) {
        console.warn('Private info sync skipped:', e?.message);
      }
    }

    // Background SQL profile synchronization (invisible to UI)
    try {
      await fetch('/api/sql/sync-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          displayName: firebaseUser.displayName || 'Researcher',
        }),
      });
    } catch {
      // Keep app interactive even if SQL proxy isn't active in local preview
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const token = await firebaseUser.getIdToken();
          setIdToken(token);
          await syncUserProfiles(firebaseUser, token);
        } catch (err: any) {
          console.warn('Auth token sync warning:', err?.message);
        }
      } else {
        setIdToken(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [syncUserProfiles]);

  const signInWithGoogle = async () => {
    setAuthError('');
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const token = await cred.user.getIdToken();
      setIdToken(token);
    } catch (err: any) {
      setAuthError(err?.message || 'Google Sign-In failed.');
    }
  };

  const logout = async () => {
    setAuthError('');
    await signOut(auth);
    setIdToken(null);
  };

  const refreshToken = async (): Promise<string | null> => {
    if (!auth.currentUser) return null;
    const token = await auth.currentUser.getIdToken(true);
    setIdToken(token);
    return token;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        idToken,
        loading,
        authError,
        signInWithGoogle,
        logout,
        refreshToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
