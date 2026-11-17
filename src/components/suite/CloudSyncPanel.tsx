import React, { useEffect, useState } from 'react';
import { ReviewProject } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import {
  BookmarkPlus,
  CheckCircle2,
  Cloud,
  LogIn,
  LogOut,
  Plus,
  Save,
  Trash2,
  UserCheck,
  Archive,
} from 'lucide-react';

interface CloudSyncPanelProps {
  project: ReviewProject;
}

interface ResearchNoteDoc {
  id: string;
  userId: string;
  projectId: string;
  title: string;
  content: string;
  tags?: string[];
  status: 'active' | 'archived';
}

interface SnapshotDoc {
  id: string;
  userId: string;
  projectId: string;
  projectTitle: string;
  includedCount: number;
  totalCount: number;
  summary?: string;
}

export const CloudSyncPanel: React.FC<CloudSyncPanelProps> = ({ project }) => {
  const { user, idToken, loading, authError, signInWithGoogle, logout, refreshToken } = useAuth();
  const [notes, setNotes] = useState<ResearchNoteDoc[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotDoc[]>([]);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteTags, setNoteTags] = useState('methodology, prisma');
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const includedCount = (project.articles || []).filter((a) => a.decision === 'include').length;
  const totalCount = (project.articles || []).length;

  useEffect(() => {
    if (!user) {
      setNotes([]);
      setSnapshots([]);
      return;
    }

    const notesPath = `users/${user.uid}/research_notes`;
    const notesQuery = query(collection(db, notesPath), where('userId', '==', user.uid));
    const unsubNotes = onSnapshot(
      notesQuery,
      (snap) => {
        const list: ResearchNoteDoc[] = [];
        snap.forEach((d) => {
          list.push(d.data() as ResearchNoteDoc);
        });
        setNotes(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, notesPath);
        } catch (e: any) {
          setErrorMessage(e?.message || 'Could not load cloud notes.');
        }
      }
    );

    const snapsPath = `users/${user.uid}/cloud_snapshots`;
    const snapsQuery = query(collection(db, snapsPath), where('userId', '==', user.uid));
    const unsubSnaps = onSnapshot(
      snapsQuery,
      (snap) => {
        const list: SnapshotDoc[] = [];
        snap.forEach((d) => {
          list.push(d.data() as SnapshotDoc);
        });
        setSnapshots(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, snapsPath);
        } catch (e: any) {
          setErrorMessage(e?.message || 'Could not load cloud snapshots.');
        }
      }
    );

    return () => {
      unsubNotes();
      unsubSnaps();
    };
  }, [user]);

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !noteTitle.trim() || !noteContent.trim()) return;
    setSaving(true);
    setErrorMessage('');
    setStatusMessage('');

    const cleanId = `note_${Date.now()}`;
    const cleanProjectId = (project.id || 'review').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
    const parsedTags = noteTags
      .split(',')
      .map((t) => t.trim().slice(0, 40))
      .filter(Boolean)
      .slice(0, 10);
    const path = `users/${user.uid}/research_notes/${cleanId}`;

    try {
      await setDoc(doc(db, 'users', user.uid, 'research_notes', cleanId), {
        id: cleanId,
        userId: user.uid,
        projectId: cleanProjectId,
        title: noteTitle.trim().slice(0, 200),
        content: noteContent.trim().slice(0, 8000),
        tags: parsedTags,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const activeToken = idToken || (await refreshToken());
      if (activeToken) {
        fetch('/api/sql/notes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${activeToken}`,
          },
          body: JSON.stringify({
            projectId: cleanProjectId,
            title: noteTitle.trim(),
            content: noteContent.trim(),
            category: parsedTags[0] || 'Synthesis Memo',
          }),
        }).catch(() => {});
      }

      setNoteTitle('');
      setNoteContent('');
      setStatusMessage('Research memo saved to your personal cloud workspace.');
    } catch (err: any) {
      try {
        handleFirestoreError(err, OperationType.CREATE, path);
      } catch (formatted: any) {
        setErrorMessage(formatted?.message || 'Unable to save note.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveNote = async (note: ResearchNoteDoc) => {
    if (!user || note.status === 'archived') return;
    const path = `users/${user.uid}/research_notes/${note.id}`;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'research_notes', note.id), {
        status: 'archived',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.UPDATE, path);
      } catch (e: any) {
        setErrorMessage(e?.message || 'Unable to archive note.');
      }
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!user) return;
    const path = `users/${user.uid}/research_notes/${noteId}`;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'research_notes', noteId));
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.DELETE, path);
      } catch (e: any) {
        setErrorMessage(e?.message || 'Unable to delete note.');
      }
    }
  };

  const handleSaveSnapshot = async () => {
    if (!user) return;
    setSaving(true);
    setErrorMessage('');
    setStatusMessage('');

    const cleanId = `snap_${Date.now()}`;
    const cleanProjectId = (project.id || 'review').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
    const summaryText = `${project.frameworkType || 'PICOC'} / ${project.reviewType || 'SLR'} — ${includedCount} included out of ${totalCount} records.`;
    const path = `users/${user.uid}/cloud_snapshots/${cleanId}`;

    try {
      await setDoc(doc(db, 'users', user.uid, 'cloud_snapshots', cleanId), {
        id: cleanId,
        userId: user.uid,
        projectId: cleanProjectId,
        projectTitle: (project.title || 'Systematic Review').slice(0, 240),
        includedCount,
        totalCount,
        summary: summaryText.slice(0, 2000),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const activeToken = idToken || (await refreshToken());
      if (activeToken) {
        fetch('/api/sql/snapshots', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${activeToken}`,
          },
          body: JSON.stringify({
            projectId: cleanProjectId,
            projectTitle: project.title,
            includedCount,
            totalCount,
            summary: summaryText,
          }),
        }).catch(() => {});
      }

      setStatusMessage('Review milestone snapshot synced to your account.');
    } catch (err: any) {
      try {
        handleFirestoreError(err, OperationType.CREATE, path);
      } catch (formatted: any) {
        setErrorMessage(formatted?.message || 'Unable to sync snapshot.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Account Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            {user ? <UserCheck className="w-5 h-5" /> : <Cloud className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">
              {user ? user.displayName || 'Signed-In Researcher' : 'Researcher Cloud Account'}
            </h3>
            <p className="text-xs text-slate-400">
              {user
                ? `${user.email} · Personal research notes and review milestones synced across devices`
                : 'Sign in with Google to save synthesis memos and review snapshots to your private workspace'}
            </p>
          </div>
        </div>

        <div>
          {loading ? (
            <span className="text-xs text-slate-400">Checking session...</span>
          ) : user ? (
            <button
              type="button"
              onClick={logout}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={signInWithGoogle}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow inline-flex items-center gap-2 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign in with Google</span>
            </button>
          )}
        </div>
      </div>

      {(authError || errorMessage) && (
        <div className="p-3 bg-rose-950/50 border border-rose-500/40 rounded-xl text-xs text-rose-200">
          {authError || errorMessage}
        </div>
      )}

      {statusMessage && (
        <div className="p-3 bg-emerald-950/50 border border-emerald-500/40 rounded-xl text-xs text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {user ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Create Note Form */}
          <form
            onSubmit={handleSaveNote}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-white flex items-center gap-2">
                <BookmarkPlus className="w-4 h-4 text-teal-400" />
                <span>New Synthesis Memo</span>
              </h4>
              <button
                type="button"
                onClick={handleSaveSnapshot}
                disabled={saving}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-teal-300 text-[11px] font-semibold rounded-lg border border-slate-700 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Review Snapshot</span>
              </button>
            </div>

            <input
              type="text"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder="Memo title (e.g., Spatial block CV bias findings)"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              required
            />

            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              rows={4}
              placeholder="Write analytical observations, inclusion boundary notes, or key evidence takeaways..."
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              required
            />

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={noteTags}
                onChange={(e) => setNoteTags(e.target.value)}
                placeholder="Comma-separated tags"
                className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>Save Memo</span>
              </button>
            </div>
          </form>

          {/* Saved Notes & Snapshots */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h4 className="text-xs font-bold text-white">
              Saved Cloud Memos ({notes.length}) & Review Snapshots ({snapshots.length})
            </h4>

            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {notes.length === 0 && snapshots.length === 0 ? (
                <p className="text-xs text-slate-500 py-8 text-center border border-dashed border-slate-800 rounded-xl">
                  No cloud memos or snapshots saved yet. Add your first note or capture a review milestone snapshot.
                </p>
              ) : (
                <>
                  {notes.map((n) => (
                    <div
                      key={n.id}
                      className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white">{n.title}</span>
                        <div className="flex items-center gap-1">
                          {n.status !== 'archived' && (
                            <button
                              type="button"
                              onClick={() => handleArchiveNote(n)}
                              title="Archive memo"
                              className="p-1 text-slate-400 hover:text-amber-300 cursor-pointer"
                            >
                              <Archive className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteNote(n.id)}
                            title="Delete memo"
                            className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">{n.content}</p>
                      <div className="flex items-center justify-between text-[10px] text-slate-500">
                        <span>{(n.tags || []).join(', ')}</span>
                        <span className={n.status === 'archived' ? 'text-amber-400' : 'text-emerald-400'}>
                          {n.status}
                        </span>
                      </div>
                    </div>
                  ))}

                  {snapshots.map((s) => (
                    <div
                      key={s.id}
                      className="p-3 bg-indigo-950/30 border border-indigo-500/20 rounded-xl space-y-1"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-indigo-200">{s.projectTitle}</span>
                        <span className="font-mono text-[11px] text-teal-300">
                          {s.includedCount}/{s.totalCount} Included
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">{s.summary}</p>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900/60 border border-dashed border-slate-800 rounded-2xl p-8 text-center space-y-3">
          <Cloud className="w-8 h-8 text-indigo-400 mx-auto" />
          <p className="text-xs text-slate-300 max-w-md mx-auto">
            Sign in with your Google account to unlock persistent cross-device research memos and SLR milestone snapshots.
          </p>
        </div>
      )}
    </div>
  );
};
