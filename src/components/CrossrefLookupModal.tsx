import React, { useState } from 'react';
import { apiService, CrossrefResult } from '../services/apiService';
import { Search, Hash, CheckCircle2, AlertCircle, Plus, ExternalLink, BookOpen, Layers } from 'lucide-react';
import { Article } from '../types';
import { isPlaceholderVenue, sanitizeAuthorsList, validateArticleMetadata } from '../utils/citationFormatter';

interface CrossrefLookupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddArticle: (article: Article) => void;
}

export const CrossrefLookupModal: React.FC<CrossrefLookupModalProps> = ({
  isOpen,
  onClose,
  onAddArticle,
}) => {
  const [activeTab, setActiveTab] = useState<'doi' | 'search'>('doi');
  const [doiInput, setDoiInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lookupResult, setLookupResult] = useState<CrossrefResult | null>(null);
  const [searchResults, setSearchResults] = useState<CrossrefResult[]>([]);
  const [targetDatabase, setTargetDatabase] = useState<'Scopus' | 'Web of Science' | 'IEEE Xplore' | 'ScienceDirect' | 'Crossref'>('Crossref');
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  if (!isOpen) return null;

  const handleDoiLookup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!doiInput.trim()) return;

    setLoading(true);
    setError('');
    setLookupResult(null);

    try {
      const data = await apiService.lookupDoi(doiInput.trim());
      setLookupResult(data);
    } catch (err: any) {
      setError(err.message || 'Could not find metadata for the provided DOI in Crossref.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeywordSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError('');
    setSearchResults([]);

    try {
      const items = await apiService.searchCrossref(searchQuery.trim(), 8);
      if (items.length === 0) {
        setError('No matching articles found in Crossref for this query.');
      } else {
        setSearchResults(items);
      }
    } catch (err: any) {
      setError(err.message || 'Crossref search failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddRecord = (record: CrossrefResult) => {
    const cleanAuthors = sanitizeAuthorsList(record.authors || []);
    const cleanJournal = isPlaceholderVenue(record.journal) ? '' : record.journal || '';
    const article: Article = {
      id: 'art-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      doi: record.doi,
      title: record.title,
      authors: cleanAuthors,
      year: record.year || undefined,
      journal: cleanJournal,
      volume: record.volume || undefined,
      issue: record.issue || undefined,
      pagesStr: record.pages || undefined,
      publisher: record.publisher || undefined,
      abstract: record.abstract || 'Abstract was not provided by Crossref metadata record.',
      sourceDatabase: targetDatabase,
      url: record.url || (record.doi ? `https://doi.org/${record.doi}` : ''),
      screeningStage: 'title_abstract',
      decision: 'unscreened',
      evidenceCitations: [],
      pages: [
        { pageNumber: 1, content: `Title: ${record.title}\n\nAbstract:\n${record.abstract || 'No abstract text available.'}` }
      ]
    };
    article.citationVerificationStatus = validateArticleMetadata(article).verificationStatus;

    onAddArticle(article);
    setAddedIds(new Set([...addedIds, record.doi || record.title]));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl">
              <Hash className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Crossref DOI & Metadata Lookup</h2>
              <p className="text-xs text-slate-400">Official open DOI lookup for verified peer-reviewed publications</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition text-lg"
          >
            ✕
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-slate-800 px-6 pt-3 bg-slate-900/60">
          <button
            onClick={() => setActiveTab('doi')}
            className={`pb-2.5 text-xs font-semibold border-b-2 mr-6 transition ${
              activeTab === 'doi'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Lookup by DOI (Direct)
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition ${
              activeTab === 'search'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Search by Title / Keywords
          </button>
        </div>

        {/* Body content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Target provenance selector */}
          <div className="flex items-center justify-between text-xs bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
            <span className="text-slate-400 font-medium flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-400" /> Source Database Provenance:
            </span>
            <select
              value={targetDatabase}
              onChange={(e) => setTargetDatabase(e.target.value as any)}
              className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none"
            >
              <option value="Crossref">Crossref</option>
              <option value="Scopus">Scopus</option>
              <option value="Web of Science">Web of Science</option>
              <option value="IEEE Xplore">IEEE Xplore</option>
              <option value="ScienceDirect">ScienceDirect</option>
            </select>
          </div>

          {activeTab === 'doi' ? (
            <div>
              <form onSubmit={handleDoiLookup} className="space-y-3">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="e.g., 10.1016/j.compag.2023.107892 or https://doi.org/10.3390/rs14184512"
                    value={doiInput}
                    onChange={(e) => setDoiInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder:text-slate-500"
                  />
                  <button
                    type="submit"
                    disabled={loading || !doiInput.trim()}
                    className="absolute right-2 top-2 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition"
                  >
                    {loading ? 'Fetching...' : 'Lookup DOI'}
                  </button>
                </div>
              </form>

              {/* DOI Result Preview */}
              {lookupResult && (
                <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Crossref Verified Metadata
                    </span>
                    <span className="text-xs text-slate-400 font-mono">{lookupResult.doi}</span>
                  </div>

                  <h3 className="font-bold text-white text-sm leading-snug">{lookupResult.title}</h3>

                  <div className="text-xs text-slate-300 space-y-0.5">
                    <p>
                      <span className="text-slate-400">Authors: </span>
                      {lookupResult.authors.join('; ')}
                    </p>
                    <p>
                      <span className="text-slate-400">Venue: </span>
                      <span className="italic">{lookupResult.journal}</span> ({lookupResult.year})
                    </p>
                    {lookupResult.publisher && (
                      <p>
                        <span className="text-slate-400">Publisher: </span>
                        {lookupResult.publisher}
                      </p>
                    )}
                  </div>

                  <div className="text-xs text-slate-400 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 max-h-36 overflow-y-auto">
                    <span className="font-semibold text-slate-300 block mb-1">Abstract:</span>
                    {lookupResult.abstract}
                  </div>

                  <div className="pt-2 flex items-center justify-between">
                    <a
                      href={`https://doi.org/${lookupResult.doi}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      View Publisher Page
                    </a>

                    <button
                      type="button"
                      onClick={() => handleAddRecord(lookupResult)}
                      disabled={addedIds.has(lookupResult.doi)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow-sm disabled:opacity-50 transition"
                    >
                      {addedIds.has(lookupResult.doi) ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                          <span>Added to SLR Library</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          <span>Import Article</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <form onSubmit={handleKeywordSearch} className="relative">
                <input
                  type="text"
                  placeholder="Search articles by title or keywords in Crossref..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-24 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder:text-slate-500"
                />
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <button
                  type="submit"
                  disabled={loading || !searchQuery.trim()}
                  className="absolute right-2 top-2 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition"
                >
                  {loading ? 'Searching...' : 'Search'}
                </button>
              </form>

              {/* Search results list */}
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {searchResults.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs hover:border-slate-700 transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-semibold text-white leading-snug line-clamp-2">{item.title}</h4>
                      <button
                        type="button"
                        onClick={() => handleAddRecord(item)}
                        disabled={addedIds.has(item.doi || item.title)}
                        className="shrink-0 px-2.5 py-1 text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-50 transition inline-flex items-center gap-1"
                      >
                        {addedIds.has(item.doi || item.title) ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" /> Added
                          </>
                        ) : (
                          <>
                            <Plus className="w-3 h-3" /> Import
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-slate-400 mt-1">
                      {item.authors.slice(0, 3).join(', ')} ({item.year}) ·{' '}
                      <span className="italic">{item.journal}</span>
                    </p>
                    {item.doi && <p className="text-[11px] font-mono text-slate-500 mt-0.5">{item.doi}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950 flex justify-between items-center text-xs text-slate-400">
          <span>Connected to Crossref REST API</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
