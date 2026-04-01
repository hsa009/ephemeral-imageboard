'use client';

import { useState, useEffect, useRef } from 'react';
import VoidTimer from '@/components/VoidTimer';
import Link from 'next/link';

interface Thread {
  id: number;
  subject: string;
  username?: string;
  comment: string;
  image_filename: string | null;
  created_at: string;
  last_bumped_at: string;
  bump_count: number;
  locked: boolean;
  reactions: Record<string, number>;
  niche?: string;
}

interface Reply {
  id: number;
  thread_id: number;
  comment: string;
  image_filename: string | null;
  created_at: string;
  reactions: Record<string, number>;
  isNew?: boolean;
  username?: string;
  reply_to_id?: number | null;
  children?: Reply[];
}

const EMOJI_LIST = ["👍", "👎", "😂", "😢", "😮", "🔥", "💀", "🎉"];
const REACTION_STORAGE_KEY = "0null_reactions";

function getReactedIds(): Record<string, string[]> {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(REACTION_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveReaction(type: string, id: number, emoji: string) {
  if (typeof window === 'undefined') return;
  try {
    const key = `${type}_${id}`;
    const reacted = getReactedIds();
    if (!reacted[key]) reacted[key] = [];
    if (!reacted[key].includes(emoji)) {
      reacted[key].push(emoji);
      localStorage.setItem(REACTION_STORAGE_KEY, JSON.stringify(reacted));
    }
  } catch (e) {
    console.error('Failed to save reaction:', e);
  }
}

function removeReaction(type: string, id: number, emoji: string) {
  if (typeof window === 'undefined') return;
  try {
    const key = `${type}_${id}`;
    const reacted = getReactedIds();
    if (reacted[key]) {
      reacted[key] = reacted[key].filter(e => e !== emoji);
      localStorage.setItem(REACTION_STORAGE_KEY, JSON.stringify(reacted));
    }
  } catch (e) {
    console.error('Failed to remove reaction:', e);
  }
}

function hasReacted(type: string, id: number, emoji: string): boolean {
  const key = `${type}_${id}`;
  const reacted = getReactedIds();
  return reacted[key]?.includes(emoji) || false;
}

const NICHE_OPTIONS = ['all', 'tech', 'anime', 'gaming', 'music', 'art', 'meta', 'news'];

export default function CinemaPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeNiche, setActiveNiche] = useState('all');
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [replyComment, setReplyComment] = useState('');
  const [username, setUsername] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ id: number; comment: string } | null>(null);
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchThreads();
  }, [activeNiche]);

  useEffect(() => {
    if (selectedThread) {
      fetchReplies(selectedThread.id);
    }
  }, [selectedThread?.id]);

  const fetchThreads = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeNiche && activeNiche !== 'all') params.set('niche', activeNiche);
      const res = await fetch(`/api/thread/list${params.toString() ? '?' + params.toString() : ''}`);
      const data = await res.json();
      if (data.threads) {
        const sorted = [...data.threads].sort((a, b) => 
          new Date(b.last_bumped_at).getTime() - new Date(a.last_bumped_at).getTime()
        );
        setThreads(sorted);
      }
    } catch (e) {
      console.error('Failed to fetch threads:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchReplies = async (threadId: number) => {
    setRepliesLoading(true);
    try {
      const res = await fetch(`/api/thread/${threadId}/reply`);
      const data = await res.json();
      if (data.replies) {
        setReplies(data.replies);
      }
    } catch (e) {
      console.error('Failed to fetch replies:', e);
    } finally {
      setRepliesLoading(false);
    }
  };

  const addReaction = async (type: string, id: number, emoji: string) => {
    const isAlreadyReacted = hasReacted(type, id, emoji);
    
    const updateReactions = (items: (Thread | Reply)[], targetId: number): (Thread | Reply)[] => {
      return items.map(item => {
        if (item.id === targetId) {
          const currentCount = (item.reactions?.[emoji] as number) || 0;
          const newCount = isAlreadyReacted ? Math.max(0, currentCount - 1) : currentCount + 1;
          return { ...item, reactions: { ...item.reactions, [emoji]: newCount } };
        }
        return item;
      });
    };

    setThreads(prev => updateReactions(prev, id) as Thread[]);
    if (selectedThread?.id === id) {
      setSelectedThread(prev => prev ? updateReactions([prev], id)[0] as Thread : null);
    }
    setReplies(prev => updateReactions(prev, id) as Reply[]);

    if (isAlreadyReacted) {
      removeReaction(type, id, emoji);
    } else {
      saveReaction(type, id, emoji);
    }

    try {
      await fetch('/api/react', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ type, id, emoji, action: isAlreadyReacted ? 'remove' : 'add' }) 
      });
    } catch (e) { 
      console.error('Failed to toggle reaction:', e);
    }
  };

  const formatQuote = (text: string) => {
    return text
      .replace(/^&gt;/gm, '<span class="quote">&gt;')
      .replace(/($)/gm, '</span>');
  };

  const redactTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'now';
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  const renderReplyTree = (nodes: Reply[], depth = 0) => {
    return nodes.map((reply) => {
      const myPost = hasReacted('reply', reply.id, 'local');
      const hasChildren = reply.children && reply.children.length > 0;
      const depthClass = depth > 0 ? `depth-${Math.min(depth, 3)}` : '';

      return (
        <div key={reply.id} className={`reply ${depthClass} ${myPost ? 'highlighted' : ''}`}>
          <div className="reply-header">
            {reply.reply_to_id && <span className="quote-box">&gt;&gt;#{reply.reply_to_id}</span>}
            {reply.username && reply.username !== 'Anonymous' && (
              <span className="username-display">{reply.username}</span>
            )}
            <span className="meta-pill post-id" dangerouslySetInnerHTML={{ __html: '#' + reply.id }} />
            <span className="meta-pill">{redactTime(reply.created_at)}</span>
          </div>
          <div className="reply-content" dangerouslySetInnerHTML={{ __html: formatQuote(reply.comment) }} />
          {reply.image_filename && <img src={reply.image_filename} alt="" className={`reply-image ${expandedImage === reply.image_filename ? "expanded" : ""}`} loading="lazy" onClick={() => setExpandedImage(expandedImage === reply.image_filename ? null : reply.image_filename)} />}
          <div className="reply-footer">
            <div className="reactions">
              {EMOJI_LIST.map(emoji => (
                <button
                  key={emoji}
                  className={`reaction-btn ${hasReacted('reply', reply.id, emoji) ? 'reacted' : ''}`}
                  onClick={() => addReaction('reply', reply.id, emoji)}
                >
                  <span className="reaction-emoji">{emoji}</span>
                  {reply.reactions?.[emoji] && <span className="reaction-count">{reply.reactions[emoji]}</span>}
                </button>
              ))}
            </div>
          </div>
          {hasChildren && (
            <div className="nested-replies">
              {renderReplyTree(reply.children!, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  const buildReplyTree = (flatReplies: Reply[]): Reply[] => {
    const map: Record<number, Reply> = {};
    const roots: Reply[] = [];
    
    flatReplies.forEach(r => {
      map[r.id] = { ...r, children: [] };
    });
    
    flatReplies.forEach(r => {
      if (r.reply_to_id && map[r.reply_to_id]) {
        map[r.reply_to_id].children!.push(map[r.id]);
      } else {
        roots.push(map[r.id]);
      }
    });
    
    return roots;
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyComment.trim() || !selectedThread) return;

    try {
      const res = await fetch(`/api/thread/${selectedThread.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comment: replyComment,
          username: username || 'Anonymous',
          reply_to_id: replyingTo?.id || null,
        }),
      });

      if (res.ok) {
        setReplyComment('');
        setReplyingTo(null);
        setShowReplyForm(false);
        fetchReplies(selectedThread.id);
      }
    } catch (e) {
      console.error('Failed to post reply:', e);
    }
  };

  if (loading) {
    return (
      <div className="container">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="container">
      {/* Header */}
      <header>
        <div className="header-left">
          <Link href="/" className="logo">0null</Link>
        </div>
      </header>
      <div className="header-divider" />

      {/* Niche Navigation */}
      <div className="niche-nav">
        {NICHE_OPTIONS.map(niche => (
          <button
            key={niche}
            className={`niche-link ${activeNiche === niche ? 'active' : ''}`}
            onClick={() => { setActiveNiche(niche); setSelectedThread(null); }}
          >
            {niche === 'all' ? '[ all ]' : `[ ${niche} ]`}
          </button>
        ))}
      </div>

      {/* Thread View */}
      {selectedThread ? (
        <div className="thread-view">
          <button className="back-btn" onClick={() => setSelectedThread(null)}>
            &lt; Back to catalog
          </button>
          
          <div className="thread-op">
            {selectedThread.image_filename ? (
              <img src={selectedThread.image_filename} alt="" className={`thread-op-image ${expandedImage === selectedThread.image_filename ? "expanded" : ""}`} loading="lazy" onClick={() => setExpandedImage(expandedImage === selectedThread.image_filename ? null : selectedThread.image_filename)} />
            ) : (
              <div className="fallback-container fallback-container--op">
                <img
                  src="/images/:0null-logo.jpg.jpeg"
                  alt=""
                  className="fallback-logo"
                  onError={(e) => { (e.target as HTMLImageElement).src = '/images/:0null-logo.jpg.jpeg'; }}
                />
                <span className="fallback-text">{selectedThread.subject}</span>
              </div>
            )}
            <div className="thread-op-content">
              <div className="thread-op-subject">{selectedThread.subject}</div>
              <div className="thread-op-comment" dangerouslySetInnerHTML={{ __html: formatQuote(selectedThread.comment) }} />
            </div>
          </div>
          <div className="thread-op-footer">
            <div className="thread-meta">
              {selectedThread.username && selectedThread.username !== 'Anonymous' && <span className="username-display">{selectedThread.username} • </span>}
              Posted {new Date(selectedThread.created_at).toLocaleString()}
            </div>
            <button className="reply-btn" onClick={() => setShowReplyForm(!showReplyForm)}>
              [ REPLY ]
            </button>
          </div>

          {/* Reply Form */}
          {showReplyForm && (
            <div className="reply-form">
              {replyingTo && <div className="reply-indicator">Replying to #{replyingTo.id} <button onClick={() => setReplyingTo(null)} className="cancel-reply">X</button></div>}
              <form onSubmit={handleReply}>
                <input type="text" placeholder="Name (optional)" value={username} onChange={(e) => setUsername(e.target.value)} className="username-input" />
                <textarea ref={replyTextareaRef} placeholder="Write your reply..." value={replyComment} onChange={(e) => setReplyComment(e.target.value)} required />
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary">Reply</button>
                </div>
              </form>
            </div>
          )}

          {/* Replies */}
          <div className="replies">
            {repliesLoading ? (
              <div className="loading">Loading</div>
            ) : (
              renderReplyTree(buildReplyTree(replies))
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Catalog Grid */}
          <div className="catalog">
            {threads.map(thread => (
              <div key={thread.id} className="thread-card" onClick={() => setSelectedThread(thread)}>
                <VoidTimer lastBumpAt={thread.last_bumped_at} />
                {thread.image_filename ? (
                  <img src={thread.image_filename} alt="" className="thread-image" loading="lazy" />
                ) : (
                  <div className="fallback-container">
                    <img
                      src="/images/:0null-logo.jpg.jpeg"
                      alt=""
                      className="fallback-logo"
                      onError={(e) => { (e.target as HTMLImageElement).src = '/images/:0null-logo.jpg.jpeg'; }}
                    />
                    <span className="fallback-text">{thread.subject}</span>
                  </div>
                )}
                <div className="thread-info">
                  {thread.niche && (
                    <div className="thread-niche">[ n: {thread.niche} ]</div>
                  )}
                  <div className="thread-subject">{thread.subject}</div>
                  <div className="thread-meta">{thread.bump_count} replies • {new Date(thread.last_bumped_at).toLocaleTimeString()}</div>
                </div>
              </div>
            ))}
          </div>
          {threads.length === 0 && (
            <div className="loading">No threads yet. Be the first to post!</div>
          )}
        </>
      )}
    </div>
  );
}
