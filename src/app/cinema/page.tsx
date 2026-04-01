'use client';

import { useState, useEffect, useRef } from 'react';

interface Video {
  id: number;
  subject: string;
  username?: string;
  comment: string;
  image_filename: string | null;
  created_at: string;
  last_bumped_at: string;
  bump_count: number;
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
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeNiche, setActiveNiche] = useState('all');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [replyComment, setReplyComment] = useState('');
  const [username, setUsername] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ id: number; comment: string } | null>(null);
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [showComments, setShowComments] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);

  const currentVideo = videos[currentIndex];

  const enableAudio = () => {
    setMuted(false);
    setShowOverlay(false);
    try {
      localStorage.setItem('0null_sound_muted', 'false');
    } catch {}
  };

  useEffect(() => {
    fetchVideos();
    try {
      const stored = localStorage.getItem('0null_sound_muted');
      const isMuted = stored === 'true';
      setMuted(isMuted);
      setShowOverlay(isMuted);
    } catch {}
  }, [activeNiche]);

  useEffect(() => {
    if (currentVideo) {
      fetchReplies(currentVideo.id);
    }
  }, [currentIndex, currentVideo?.id]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const itemHeight = container.clientHeight;
      const newIndex = Math.round(scrollTop / itemHeight);
      if (newIndex !== currentIndex && newIndex >= 0 && newIndex < videos.length) {
        setCurrentIndex(newIndex);
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [currentIndex, videos.length]);

  const fetchVideos = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeNiche && activeNiche !== 'all') params.set('niche', activeNiche);
      
      const res = await fetch(`/api/thread/list${params.toString() ? '?' + params.toString() : ''}`);
      const data = await res.json();
      
      if (data.threads) {
        const videoThreads = data.threads
          .filter((t: Video) => t.image_filename && t.image_filename.match(/\.(mp4|webm|mov|avi|m4v)$/i))
          .sort((a: Video, b: Video) => 
            new Date(b.last_bumped_at).getTime() - new Date(a.last_bumped_at).getTime()
          );
        setVideos(videoThreads);
      }
    } catch (e) {
      console.error('Failed to fetch videos:', e);
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
    
    const updateReactions = (items: (Video | Reply)[], targetId: number): (Video | Reply)[] => {
      return items.map(item => {
        if (item.id === targetId) {
          const currentCount = (item.reactions?.[emoji] as number) || 0;
          const newCount = isAlreadyReacted ? Math.max(0, currentCount - 1) : currentCount + 1;
          return { ...item, reactions: { ...item.reactions, [emoji]: newCount } };
        }
        return item;
      });
    };

    setVideos(prev => updateReactions(prev, id) as Video[]);

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

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyComment.trim() || !currentVideo) return;

    try {
      const res = await fetch(`/api/thread/${currentVideo.id}/reply`, {
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
        fetchReplies(currentVideo.id);
      }
    } catch (e) {
      console.error('Failed to post reply:', e);
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
      const hasChildren = reply.children && reply.children.length > 0;
      const depthClass = depth > 0 ? `depth-${Math.min(depth, 3)}` : '';

      return (
        <div key={reply.id} className={`cinema-comment ${depthClass}`}>
          <div className="cinema-comment-header">
            {reply.reply_to_id && <span className="quote-ref">&gt;&gt;{reply.reply_to_id}</span>}
            <span className="cinema-user-id">[{reply.username || 'Anonymous'}]</span>
            <span className="cinema-comment-id">#{reply.id}</span>
            <span className="cinema-comment-time">[{redactTime(reply.created_at)}]</span>
          </div>
          <div className="cinema-comment-content" dangerouslySetInnerHTML={{ __html: formatQuote(reply.comment) }} />
          <div className="cinema-comment-actions">
            <button 
              className="cinema-reply-btn"
              onClick={() => { setReplyingTo({ id: reply.id, comment: reply.comment.slice(0, 50) }); setShowReplyForm(true); }}
            >
              reply
            </button>
            <div className="cinema-comment-reactions">
              {EMOJI_LIST.slice(0, 4).map(emoji => (
                <button
                  key={emoji}
                  className={`cinema-reaction-mini ${hasReacted('reply', reply.id, emoji) ? 'reacted' : ''}`}
                  onClick={() => addReaction('reply', reply.id, emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
          {hasChildren && (
            <div className="cinema-nested-comments">
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

  if (loading) {
    return (
      <div className="cinema-container">
        <div className="cinema-loading">Loading signals...</div>
      </div>
    );
  }

  return (
    <div className="cinema-layout">
      {/* Niche Bar */}
      <div className="cinema-niche-bar">
        {NICHE_OPTIONS.map(niche => (
          <button
            key={niche}
            className={`cinema-niche-btn ${activeNiche === niche ? 'active' : ''}`}
            onClick={() => setActiveNiche(niche)}
          >
            {niche === 'all' ? '[ all ]' : `[ ${niche} ]`}
          </button>
        ))}
      </div>

      {/* Video Feed - Left Pane */}
      <div className="cinema-video-feed" ref={scrollContainerRef}>
        {videos.length === 0 ? (
          <div className="cinema-empty">No video signals in this sector</div>
        ) : (
          videos.map((video, index) => (
            <div key={video.id} className="cinema-video-item snap-start">
              <video
                src={video.image_filename || undefined}
                autoPlay
                loop
                muted={muted}
                playsInline
                className="cinema-video-player"
              />
              {showOverlay && index === currentIndex && (
                <div className="cinema-signal-overlay" onClick={enableAudio}>
                  <button className="cinema-join-btn">[ JOIN SIGNAL ]</button>
                </div>
              )}
              <div className="cinema-video-info">
                <span className="cinema-meta-id">[#{video.id}]</span>
                <span className="cinema-meta-void">[VOID_IN: {redactTime(video.created_at)}]</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Comments Toggle Button (Mobile) */}
      <button 
        className="cinema-comments-toggle"
        onClick={() => setShowComments(!showComments)}
      >
        {showComments ? '✕ Close' : '[ COMMENTS ]'}
      </button>

      {/* Comments Pane - Right Side */}
      <div className={`cinema-comments ${showComments ? 'visible' : ''}`}>
        {currentVideo ? (
          <>
            <div className="cinema-comments-header">
              <div className="cinema-section-label">[ SIGNAL_COMMENTS ]</div>
              <div className="cinema-video-subject">{currentVideo.subject}</div>
              <div className="cinema-video-meta">
                <span className="cinema-meta-user">[{currentVideo.username || 'Anonymous'}]</span>
                <span className="cinema-meta-id">[#{currentVideo.id}]</span>
                <span className="cinema-meta-void">[VOID_IN: {redactTime(currentVideo.created_at)}]</span>
              </div>
              <button 
                className="cinema-reply-toggle"
                onClick={() => setShowReplyForm(!showReplyForm)}
              >
                [ REPLY ]
              </button>
            </div>

            {/* Comments Stream */}
            <div className="cinema-comments-stream">
              {repliesLoading ? (
                <div className="cinema-loading-small">Loading comments...</div>
              ) : (
                renderReplyTree(buildReplyTree(replies))
              )}
            </div>

            {/* Reply Form */}
            {showReplyForm && (
              <div className="cinema-reply-form">
                {replyingTo && (
                  <div className="cinema-reply-indicator">
                    &gt;&gt;{replyingTo.id}
                    <button onClick={() => setReplyingTo(null)} className="cinema-cancel-reply">X</button>
                  </div>
                )}
                <form onSubmit={handleReply}>
                  <input 
                    type="text" 
                    placeholder="Name (optional)" 
                    value={username} 
                    onChange={(e) => setUsername(e.target.value)} 
                    className="cinema-username-input"
                  />
                  <textarea 
                    ref={replyTextareaRef}
                    placeholder="Write a comment..." 
                    value={replyComment} 
                    onChange={(e) => setReplyComment(e.target.value)} 
                    required 
                    className="cinema-textarea"
                  />
                  <button type="submit" className="cinema-submit-btn">Post</button>
                </form>
              </div>
            )}
          </>
        ) : (
          <div className="cinema-empty-comments">Select a signal to view comments</div>
        )}
      </div>
    </div>
  );
}
