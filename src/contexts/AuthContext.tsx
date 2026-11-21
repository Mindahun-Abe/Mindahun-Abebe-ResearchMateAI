import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, googleAuthProvider, handleFirestoreError, OperationType } from '../lib/firebase';
import { PlanPricingSchedule, PricingTenureStage, UserTenureSummary } from '../utils/pricingSchedule';

export interface AccountPlan {
  code: string;
  name: string;
  tagline: string;
  monthlyPriceUsd: number;
  annualPriceUsd: number;
  monthlyPriceEtb: number;
  annualPriceEtb: number;
  maxProjects: number;
  maxArticlesPerProject: number;
  monthlyAiCredits: number;
  storageQuotaMb: number;
  bulkPdfEnabled: boolean;
  prismaAutomationEnabled: boolean;
  teamSeats: number;
  priorityProcessing: boolean;
  pricingSchedule?: PlanPricingSchedule;
  effectivePricingStage?: PricingTenureStage;
  effectiveMonthlyPriceUsd?: number;
  effectiveAnnualPriceUsd?: number;
  effectiveMonthlyPriceEtb?: number;
  effectiveAnnualPriceEtb?: number;
}

export interface AccountOverview {
  user: {
    id: number;
    uid: string;
    email: string;
    displayName: string;
    role: 'admin' | 'researcher' | 'institutional';
    status: 'active' | 'suspended';
    planCode: string;
    aiCreditsBalance: number;
    aiCreditsUsed: number;
    storageUsedBytes: number;
    organization: string;
    country: string;
    emailVerified: boolean;
    mfaEnabled: boolean;
    lastLoginAt?: string;
    createdAt?: string;
  };
  entitlement: {
    plan: AccountPlan;
    subscription: {
      planCode: string;
      billingCycle: string;
      status: string;
      provider: string;
      currentPeriodEnd?: string | null;
      cancelAtPeriodEnd: boolean;
    };
    inGracePeriod: boolean;
  };
  pricingTenure?: UserTenureSummary;
  loginHistory: {
    id: number;
    email: string;
    provider: string;
    deviceLabel: string;
    ipAddress?: string;
    status: string;
    createdAt: string;
  }[];
  storageDocumentsCount: number;
}

interface AuthContextValue {
  user: User | null;
  idToken: string | null;
  loading: boolean;
  authError: string;
  accountOverview: AccountOverview | null;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<boolean>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<boolean>;
  sendResetPassword: (email: string) => Promise<boolean>;
  resendVerificationEmail: () => Promise<boolean>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<string | null>;
  refreshAccountOverview: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  idToken: null,
  loading: true,
  authError: '',
  accountOverview: null,
  signInWithGoogle: async () => {},
  signInWithEmail: async () => false,
  signUpWithEmail: async () => false,
  sendResetPassword: async () => false,
  resendVerificationEmail: async () => false,
  logout: async () => {},
  refreshToken: async () => null,
  refreshAccountOverview: async () => {},
  clearAuthError: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [accountOverview, setAccountOverview] = useState<AccountOverview | null>(null);

  const fetchAccountOverviewWithToken = useCallback(async (token: string) => {
    try {
      const res = await fetch('/api/account/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAccountOverview(data);
      }
    } catch {
      // Keep interactive if network offline
    }
  }, []);

  const syncUserProfiles = useCallback(
    async (firebaseUser: User, token: string, recordSession = false) => {
      const uid = firebaseUser.uid;
      const publicRef = doc(db, 'users', uid, 'public', 'profile');
      const privateRef = doc(db, 'users', uid, 'private', 'info');

      if (firebaseUser.emailVerified) {
        try {
          const pubSnap = await getDoc(publicRef);
          const displayName = (
            firebaseUser.displayName ||
            firebaseUser.email?.split('@')[0] ||
            'Researcher'
          ).slice(0, 120);
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
      }

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
        if (recordSession) {
          await fetch('/api/account/session-ping', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              deviceLabel: /Android|Mobile/i.test(navigator.userAgent)
                ? 'Mobile Web / Android'
                : 'Desktop Web Browser',
            }),
          });
        }
        await fetchAccountOverviewWithToken(token);
      } catch {
        // Keep app interactive offline
      }
    },
    [fetchAccountOverviewWithToken]
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const token = await firebaseUser.getIdToken();
          setIdToken(token);
          await syncUserProfiles(firebaseUser, token, true);
        } catch (err: any) {
          console.warn('Auth token sync warning:', err?.message);
        }
      } else {
        setIdToken(null);
        setAccountOverview(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [syncUserProfiles]);

  const mapFirebaseAuthError = (err: any, fallback: string) => {
    const code = err?.code || '';
    if (code === 'auth/operation-not-allowed') {
      return 'Email/Password sign-in is not yet enabled in Firebase Console (Authentication → Sign-in method → Email/Password). You can sign in immediately with Google Sign-In.';
    }
    if (code === 'auth/email-already-in-use') {
      return 'An account with this email already exists.';
    }
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
      return 'Invalid email or password.';
    }
    if (code === 'auth/weak-password') {
      return 'Password must be at least 6 characters.';
    }
    return err?.message || fallback;
  };

  const signInWithGoogle = async () => {
    setAuthError('');
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const token = await cred.user.getIdToken();
      setIdToken(token);
      await fetchAccountOverviewWithToken(token);
    } catch (err: any) {
      setAuthError(mapFirebaseAuthError(err, 'Google Sign-In failed.'));
    }
  };

  const signInWithEmail = async (email: string, password: string): Promise<boolean> => {
    setAuthError('');
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const token = await cred.user.getIdToken();
      setIdToken(token);
      await fetchAccountOverviewWithToken(token);
      return true;
    } catch (err: any) {
      setAuthError(mapFirebaseAuthError(err, 'Email Sign-In failed.'));
      return false;
    }
  };

  const signUpWithEmail = async (
    email: string,
    password: string,
    displayName: string
  ): Promise<boolean> => {
    setAuthError('');
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (displayName.trim()) {
        await updateProfile(cred.user, { displayName: displayName.trim().slice(0, 120) });
      }
      try {
        await sendEmailVerification(cred.user);
      } catch {}
      const token = await cred.user.getIdToken();
      setIdToken(token);
      await fetchAccountOverviewWithToken(token);
      return true;
    } catch (err: any) {
      setAuthError(mapFirebaseAuthError(err, 'Registration failed.'));
      return false;
    }
  };

  const sendResetPassword = async (email: string): Promise<boolean> => {
    setAuthError('');
    try {
      await sendPasswordResetEmail(auth, email.trim());
      return true;
    } catch (err: any) {
      setAuthError(mapFirebaseAuthError(err, 'Password reset failed.'));
      return false;
    }
  };

  const resendVerificationEmail = async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    setAuthError('');
    try {
      await sendEmailVerification(auth.currentUser);
      return true;
    } catch (err: any) {
      setAuthError(mapFirebaseAuthError(err, 'Could not resend verification email.'));
      return false;
    }
  };

  const logout = async () => {
    setAuthError('');
    await signOut(auth);
    setIdToken(null);
    setAccountOverview(null);
  };

  const refreshToken = async (): Promise<string | null> => {
    if (!auth.currentUser) return null;
    const token = await auth.currentUser.getIdToken(true);
    setIdToken(token);
    return token;
  };

  const refreshAccountOverview = async () => {
    const token = idToken || (auth.currentUser ? await auth.currentUser.getIdToken() : null);
    if (token) {
      await fetchAccountOverviewWithToken(token);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        idToken,
        loading,
        authError,
        accountOverview,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        sendResetPassword,
        resendVerificationEmail,
        logout,
        refreshToken,
        refreshAccountOverview,
        clearAuthError: () => setAuthError(''),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
