import React, { useEffect, useState } from 'react';
import {
  Search, RefreshCw, X, ExternalLink, Plus, Check, AlertCircle,
  Video, Image, Eye, Heart, MessageCircle, Link2Off,
} from 'lucide-react';
import {
  getInstagramStatus, getInstagramAuthUrl, disconnectInstagram,
  searchInstagramHashtags, lookupInstagramProfile, createInfluencer,
} from '../lib/api';
import { useAppStore } from '../store';
import { formatNumber } from '../lib/utils';

interface Props {
  minFollowers: number;
  maxFollowers: number;
  minAvgViews: number;
  onAdded: () => void;
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ── Profile card (shared between lookup and per-post results) ──────────────
function ProfileCard({
  profile, minFollowers, maxFollowers, minAvgViews, onAdd, adding,
}: {
  profile: any; minFollowers: number; maxFollowers: number; minAvgViews: number;
  onAdd: (p: any) => void; adding: boolean;
}) {
  const followersOk = profile.followers_count >= minFollowers && profile.followers_count <= maxFollowers;
  const viewsOk = minAvgViews === 0 || profile.avg_reel_views >= minAvgViews;
  const fits = followersOk && viewsOk;

  return (
    <div>
      <div className="flex items-start gap-2.5 mb-2">
        {profile.profile_picture_url && (
          <img src={profile.profile_picture_url} alt=""
            className="w-10 h-10 rounded-full object-cover shrink-0 border border-slate-200" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-900 text-sm">@{profile.username}</span>
            {profile.name && profile.name !== profile.username && (
              <span className="text-xs text-slate-400">{profile.name}</span>
            )}
            <span className={`badge text-xs font-medium ml-auto ${fits ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {fits ? <><Check size={10} className="inline mr-0.5" />Meets criteria</> : <><X size={10} className="inline mr-0.5" />Out of range</>}
            </span>
          </div>
          <div className="flex gap-3 text-xs mt-0.5">
            <span className={followersOk ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}>
              {formatNumber(profile.followers_count)} followers
            </span>
            <span className={viewsOk ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}>
              {formatNumber(profile.avg_reel_views)} avg views
              {profile.reels_sampled > 0 && <span className="text-slate-400 font-normal"> ({profile.reels_sampled} reels)</span>}
            </span>
            <span className="text-slate-400">{formatNumber(profile.media_count)} posts</span>
          </div>
        </div>
      </div>
      {profile.biography && (
        <p className="text-xs text-slate-500 line-clamp-2 mb-2 ml-[52px]">{profile.biography}</p>
      )}
      <div className="flex gap-2 ml-[52px]">
        <button onClick={() => onAdd(profile)} disabled={adding}
          className="btn-primary py-1 px-3 text-xs flex items-center gap-1">
          {adding ? <RefreshCw size={11} className="animate-spin" /> : <Plus size={11} />}
          Add to Dashboard
        </button>
        <a href={`https://instagram.com/${profile.username}`} target="_blank" rel="noopener noreferrer"
          className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1">
          <ExternalLink size={11} /> Profile
        </a>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function InstagramDiscover({ minFollowers, maxFollowers, minAvgViews, onAdded }: Props) {
  const { showToast } = useAppStore();

  const [status, setStatus] = useState<{ configured: boolean; connected: boolean; username: string | null } | null>(null);

  // Hashtag search state
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashInput, setHashInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Per-post creator lookup state
  const [postUsernames, setPostUsernames] = useState<Record<string, string>>({});
  const [postLookupLoading, setPostLookupLoading] = useState<Record<string, boolean>>({});
  const [postProfiles, setPostProfiles] = useState<Record<string, any>>({});

  // Standalone profile lookup state
  const [lookupUsername, setLookupUsername] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<any | null>(null);
  const [lookupError, setLookupError] = useState('');

  // Add state
  const [addingId, setAddingId] = useState<string | null>(null);

  const loadStatus = async () => {
    try { const r = await getInstagramStatus(); setStatus(r.data); } catch {}
  };

  useEffect(() => {
    loadStatus();
    const params = new URLSearchParams(window.location.search);
    if (params.get('ig_connected')) {
      showToast('Instagram connected!', 'success');
      window.history.replaceState({}, '', window.location.pathname);
      loadStatus();
    }
    if (params.get('ig_error')) {
      showToast(`Instagram error: ${decodeURIComponent(params.get('ig_error')!)}`, 'error');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // ── Hashtag chip input ─────────────────────────────────────────────────
  const addTag = (raw: string) => {
    const tag = raw.replace(/^#/, '').trim().toLowerCase();
    if (tag && !hashtags.includes(tag)) setHashtags(h => [...h, tag]);
    setHashInput('');
  };

  const onHashKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(hashInput); }
    if (e.key === 'Backspace' && !hashInput && hashtags.length) setHashtags(h => h.slice(0, -1));
  };

  // ── Search ─────────────────────────────────────────────────────────────
  const handleSearch = async () => {
    if (!hashtags.length) return showToast('Add at least one hashtag', 'info');
    setSearching(true);
    setSearchResults([]);
    setPostProfiles({});
    setPostUsernames({});
    try {
      const res = await searchInstagramHashtags(hashtags);
      setSearchResults(res.data as any[]);
      if (!(res.data as any[]).length) showToast('No posts found for these hashtags', 'info');
    } catch (e: any) {
      showToast(e.response?.data?.error || 'Search failed', 'error');
    } finally {
      setSearching(false);
    }
  };

  // ── Per-post creator lookup ────────────────────────────────────────────
  const handlePostLookup = async (postId: string) => {
    const uname = (postUsernames[postId] || '').replace('@', '').trim();
    if (!uname) return;
    setPostLookupLoading(l => ({ ...l, [postId]: true }));
    try {
      const res = await lookupInstagramProfile(uname);
      setPostProfiles(p => ({ ...p, [postId]: res.data }));
    } catch (e: any) {
      showToast(e.response?.data?.error || 'Profile not found', 'error');
    } finally {
      setPostLookupLoading(l => ({ ...l, [postId]: false }));
    }
  };

  // ── Standalone profile lookup ──────────────────────────────────────────
  const handleLookup = async (override?: string) => {
    const uname = (override || lookupUsername).replace('@', '').trim();
    if (!uname) return;
    setLookupLoading(true);
    setLookupError('');
    setLookupResult(null);
    try {
      const res = await lookupInstagramProfile(uname);
      setLookupResult(res.data);
    } catch (e: any) {
      setLookupError(e.response?.data?.error || 'Lookup failed');
    } finally {
      setLookupLoading(false);
    }
  };

  // ── Add to dashboard ──────────────────────────────────────────────────
  const handleAdd = async (profile: any, key: string) => {
    setAddingId(key);
    try {
      await createInfluencer({
        name: profile.name || profile.username,
        platform: 'Instagram',
        username: profile.username,
        followers: profile.followers_count,
        avg_reel_views: profile.avg_reel_views,
        category: '',
        country: '',
      });
      showToast(`@${profile.username} added to dashboard!`, 'success');
      onAdded();
    } catch {
      showToast('Failed to add influencer', 'error');
    } finally {
      setAddingId(null);
    }
  };

  // ── Render: not configured ────────────────────────────────────────────
  if (status && !status.configured) {
    return (
      <div className="card p-5 border-2 border-dashed border-slate-200">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-2xl">📸</div>
          <div className="min-w-0">
            <div className="font-semibold text-slate-800 mb-1">Instagram API not configured</div>
            <p className="text-sm text-slate-500 mb-3">
              Add these to your <code className="bg-slate-100 px-1 rounded text-xs">.env</code> file, then restart the server:
            </p>
            <pre className="bg-slate-900 text-green-400 text-xs rounded-xl p-3 font-mono mb-3 select-all whitespace-pre">{`INSTAGRAM_APP_ID=your_app_id
INSTAGRAM_APP_SECRET=your_app_secret`}</pre>
            <p className="text-xs text-slate-400">
              Create a Facebook Developer App at <strong>developers.facebook.com</strong> → add <strong>Instagram Graph API</strong> → set redirect URI to{' '}
              <code className="bg-slate-100 px-1 rounded">http://localhost:3001/api/instagram/callback</code>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: not connected ─────────────────────────────────────────────
  if (status && !status.connected) {
    return (
      <div className="card p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xl">📸</div>
        <div className="flex-1">
          <div className="font-semibold text-slate-800 text-sm">Connect Instagram Business Account</div>
          <div className="text-xs text-slate-400">Search hashtags and auto-fetch creator stats directly from Instagram</div>
        </div>
        <button onClick={async () => {
          try { const r = await getInstagramAuthUrl(); window.location.href = r.data.url; }
          catch (e: any) { showToast(e.response?.data?.error || 'Failed to get auth URL', 'error'); }
        }} className="btn-primary flex items-center gap-1.5 shrink-0 text-sm">
          📸 Connect Instagram
        </button>
      </div>
    );
  }

  // ── Render: connected ─────────────────────────────────────────────────
  if (!status) return null;

  return (
    <div className="space-y-4">
      {/* Connection status bar */}
      <div className="card px-4 py-3 flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-base shrink-0">📸</div>
        <div className="flex-1 text-sm text-slate-700">
          Connected as <span className="font-semibold text-slate-900">@{status.username}</span>
        </div>
        <button onClick={async () => {
          if (!confirm('Disconnect Instagram?')) return;
          await disconnectInstagram();
          setStatus(s => s ? { ...s, connected: false, username: null } : s);
          setSearchResults([]);
          setLookupResult(null);
          showToast('Instagram disconnected', 'info');
        }} className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors">
          <Link2Off size={12} /> Disconnect
        </button>
      </div>

      {/* Hashtag search */}
      <div className="card p-4">
        <div className="text-sm font-semibold text-slate-700 mb-3">Search by Hashtag</div>
        <div className="flex gap-2 items-start">
          {/* Chip input */}
          <div
            className="flex-1 flex flex-wrap gap-1.5 border border-slate-200 rounded-xl px-3 py-2 min-h-[42px] bg-white focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-100 transition-all cursor-text"
            onClick={e => (e.currentTarget.querySelector('input') as HTMLInputElement)?.focus()}
          >
            {hashtags.map(tag => (
              <span key={tag} className="inline-flex items-center gap-1 bg-pink-100 text-pink-700 text-xs font-medium px-2 py-0.5 rounded-full">
                #{tag}
                <button onClick={() => setHashtags(h => h.filter(t => t !== tag))} className="hover:text-pink-900 ml-0.5">
                  <X size={9} />
                </button>
              </span>
            ))}
            <input
              className="flex-1 min-w-[120px] outline-none text-sm text-slate-700 bg-transparent"
              placeholder={hashtags.length ? 'Add more…' : '#nycfood, #chinatownnyc…'}
              value={hashInput}
              onChange={e => setHashInput(e.target.value)}
              onKeyDown={onHashKey}
              onBlur={() => hashInput && addTag(hashInput)}
            />
          </div>
          <button onClick={handleSearch} disabled={searching || !hashtags.length}
            className="btn-primary flex items-center gap-1.5 shrink-0">
            {searching ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
            Search
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Press <kbd className="bg-slate-100 px-1 rounded text-[10px]">Enter</kbd> or <kbd className="bg-slate-100 px-1 rounded text-[10px]">,</kbd> to add · Up to 5 hashtags (Instagram API limit per 7 days)
        </p>
      </div>

      {/* Search results */}
      {searchResults.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">{searchResults.length} posts</span>
            <span className="text-xs text-slate-400">
              Click "Open Post" → note the creator's username → type it in the Lookup field
            </span>
          </div>
          <div className="divide-y divide-slate-50">
            {searchResults.map(post => {
              const profile = postProfiles[post.id];
              const isReel = post.media_type === 'VIDEO';
              return (
                <div key={post.id} className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Type icon */}
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isReel ? 'bg-purple-100' : 'bg-slate-100'}`}>
                      {isReel ? <Video size={15} className="text-purple-600" /> : <Image size={15} className="text-slate-500" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Stats row */}
                      <div className="flex items-center gap-3 text-xs text-slate-600 mb-1.5 flex-wrap">
                        <span className="badge bg-pink-100 text-pink-700 font-medium">#{post.hashtag}</span>
                        {post.video_views != null && (
                          <span className="flex items-center gap-0.5">
                            <Eye size={11} className="text-blue-500" /> {formatNumber(post.video_views)}
                          </span>
                        )}
                        <span className="flex items-center gap-0.5">
                          <Heart size={11} className="text-pink-400" /> {formatNumber(post.like_count || 0)}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <MessageCircle size={11} className="text-slate-400" /> {formatNumber(post.comments_count || 0)}
                        </span>
                        <span className="text-slate-400 ml-auto">{timeAgo(post.timestamp)}</span>
                      </div>

                      {post.caption && (
                        <p className="text-xs text-slate-400 line-clamp-1 mb-2">{post.caption}</p>
                      )}

                      {/* Per-post creator lookup */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          className="input text-xs py-1 w-40"
                          placeholder="@creator_username"
                          value={postUsernames[post.id] || ''}
                          onChange={e => setPostUsernames(u => ({ ...u, [post.id]: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && handlePostLookup(post.id)}
                        />
                        <button
                          onClick={() => handlePostLookup(post.id)}
                          disabled={postLookupLoading[post.id] || !postUsernames[post.id]}
                          className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1">
                          {postLookupLoading[post.id] ? <RefreshCw size={11} className="animate-spin" /> : <Search size={11} />}
                          Lookup
                        </button>
                        <a href={post.permalink} target="_blank" rel="noopener noreferrer"
                          className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1">
                          <ExternalLink size={11} /> Open Post
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Profile result for this post */}
                  {profile && (
                    <div className={`mt-3 ml-12 rounded-xl p-3 border ${
                      profile.followers_count >= minFollowers && profile.followers_count <= maxFollowers && (minAvgViews === 0 || profile.avg_reel_views >= minAvgViews)
                        ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <ProfileCard
                        profile={profile}
                        minFollowers={minFollowers} maxFollowers={maxFollowers} minAvgViews={minAvgViews}
                        onAdd={p => handleAdd(p, `post-${post.id}`)}
                        adding={addingId === `post-${post.id}`}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Standalone profile lookup */}
      <div className="card p-4">
        <div className="text-sm font-semibold text-slate-700 mb-3">Look Up a Creator by Username</div>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="@username or username"
            value={lookupUsername}
            onChange={e => setLookupUsername(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLookup()}
          />
          <button onClick={() => handleLookup()} disabled={lookupLoading || !lookupUsername.trim()}
            className="btn-primary flex items-center gap-1.5 shrink-0">
            {lookupLoading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
            Lookup
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Fetches follower count and calculates avg reel views from their last 12 posts. Must be a Business or Creator account.
        </p>
        {lookupError && (
          <div className="mt-3 flex items-center gap-2 text-red-600 text-sm">
            <AlertCircle size={14} /> {lookupError}
          </div>
        )}
        {lookupResult && (
          <div className={`mt-3 rounded-xl p-4 border ${
            lookupResult.followers_count >= minFollowers && lookupResult.followers_count <= maxFollowers && (minAvgViews === 0 || lookupResult.avg_reel_views >= minAvgViews)
              ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'
          }`}>
            <ProfileCard
              profile={lookupResult}
              minFollowers={minFollowers} maxFollowers={maxFollowers} minAvgViews={minAvgViews}
              onAdd={p => handleAdd(p, 'lookup')}
              adding={addingId === 'lookup'}
            />
          </div>
        )}
      </div>
    </div>
  );
}
