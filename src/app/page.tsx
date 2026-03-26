"use client";

import { useState, useEffect } from "react";

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
}

const EMOJI_LIST = ["👍", "👎", "😂", "😢", "😮", "🔥", "💀", "🎉"];

const REACTION_STORAGE_KEY = "0null_reactions";

function getReactedIds(): Record<string, string[]> {
  if (typeof window === "undefined") return {};
  try {
    const stored = localStorage.getItem(REACTION_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function hasReacted(type: string, id: number, emoji: string): boolean {
  const key = `${type}_${id}`;
  const reacted = getReactedIds();
  return reacted[key]?.includes(emoji) || false;
}

function saveReaction(type: string, id: number, emoji: string) {
  if (typeof window === "undefined") return;
  try {
    const key = `${type}_${id}`;
    const reacted = getReactedIds();
    if (!reacted[key]) reacted[key] = [];
    if (!reacted[key].includes(emoji)) {
      reacted[key].push(emoji);
      localStorage.setItem(REACTION_STORAGE_KEY, JSON.stringify(reacted));
    }
  } catch (e) {
    console.error("Failed to save reaction:", e);
  }
}

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
  </svg>
);

async function generatePoW(): Promise<{ nonce: string; timestamp: number }> {
  return new Promise((resolve) => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const data = `${timestamp}-${random}`;
    
    let hash = "";
    let count = 0;
    const check = async () => {
      const encoder = new TextEncoder();
      const hashData = encoder.encode(data + count);
      const digest = await crypto.subtle.digest("SHA-256", hashData);
      const arr = new Uint8Array(digest);
      hash = Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
      if (hash.startsWith("0000")) {
        resolve({ nonce: `${count}-${hash}`, timestamp });
      } else {
        count++;
        if (count < 100000) {
          check();
        } else {
          resolve({ nonce: `${count}-${hash}`, timestamp });
        }
      }
    };
    check();
  });
}

async function verifyPoW(nonce: string, timestamp: number): Promise<{ valid: boolean; error?: string }> {
  try {
    const res = await fetch("/api/verify-pow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nonce, timestamp }),
    });
    const data = await res.json();
    return { valid: res.ok && data.valid, error: data.error || data.message };
  } catch (e) {
    return { valid: false, error: 'Network error' };
  }
}

export default function Home() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showFab, setShowFab] = useState(false);
  const [subject, setSubject] = useState("");
  const [comment, setComment] = useState("");
  const [replyComment, setReplyComment] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [replyImage, setReplyImage] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [powLoading, setPowLoading] = useState(false);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [previewPost, setPreviewPost] = useState<{ x: number; y: number; content: string } | null>(null);
  const [pendingReplies, setPendingReplies] = useState<{ id: string; comment: string; image_filename: string | null }[]>([]);
  const [currentPoW, setCurrentPoW] = useState<{ nonce: string; timestamp: number } | null>(null);
  const [imagesMode, setImagesMode] = useState(true);

  useEffect(() => {
    fetchThreads();
    
    const handleScroll = () => {
      setShowFab(window.scrollY > 300);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (selectedThread) {
      fetchReplies(selectedThread.id);
      setupRealtime(selectedThread.id);
    }
  }, [selectedThread]);

  const setupRealtime = (threadId: number) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) return;
    
    import("@supabase/supabase-js").then(({ createClient }) => {
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const channel = supabase.channel(`thread-${threadId}`);
      
      channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "replies", filter: `thread_id=eq.${threadId}` }, (payload: unknown) => {
        const newReply = payload as { new: Reply };
        setReplies((prev) => [...prev, { ...newReply.new, isNew: true }]);
        setTimeout(() => {
          setReplies((prev) => prev.map((r) => r.id === newReply.new.id ? { ...r, isNew: false } : r));
        }, 3000);
      });
      
      channel.subscribe();
    });
  };

  const addReaction = async (type: string, id: number, emoji: string) => {
    if (hasReacted(type, id, emoji)) return;

    const key = type === "thread" ? "replies" : "reactions";
    const itemId = type === "thread" ? id : (() => { const r = replies.find(r => r.id === id); return r ? r.id : 0; })();

    if (type === "thread") {
      setThreads(prev => prev.map(t => {
        if (t.id === id) {
          const reactions = { ...t.reactions };
          reactions[emoji] = (reactions[emoji] || 0) + 1;
          return { ...t, reactions };
        }
        return t;
      }));
      if (selectedThread?.id === id) {
        setSelectedThread(prev => prev ? { ...prev, reactions: { ...prev.reactions, [emoji]: (prev.reactions?.[emoji] || 0) + 1 } } : null);
      }
    } else {
      setReplies(prev => prev.map(r => {
        if (r.id === id) {
          const reactions = { ...r.reactions };
          reactions[emoji] = (reactions[emoji] || 0) + 1;
          return { ...r, reactions };
        }
        return r;
      }));
    }

    saveReaction(type, id, emoji);

    try {
      await fetch("/api/react", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id, emoji }),
      });
    } catch (e) {
      console.error("Failed to add reaction:", e);
    }
  };

  useEffect(() => {
    generatePoW().then(setCurrentPoW);
  }, []);

  const fetchThreads = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/thread/list");
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads || []);
      }
    } catch (e) {
      console.error("Failed to fetch threads:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchReplies = async (threadId: number) => {
    try {
      const res = await fetch(`/api/thread/${threadId}`);
      if (res.ok) {
        const data = await res.json();
        setReplies(data.replies || []);
      }
    } catch (e) {
      console.error("Failed to fetch replies:", e);
    }
  };

  const handleCreateThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPoW) return;
    
    setLoading(true);
    setPowLoading(true);

    const { valid, error } = await verifyPoW(currentPoW.nonce, currentPoW.timestamp);
    if (!valid) {
      alert(`Verification failed: ${error}. Generating new challenge...`);
      setLoading(false);
      setPowLoading(false);
      const newPoW = await generatePoW();
      setCurrentPoW(newPoW);
      return;
    }

    const pendingId = `pending-${Date.now()}`;
    setPendingReplies([...pendingReplies, { id: pendingId, comment, image_filename: null }]);

    try {
      const formData = new FormData();
      formData.append("subject", subject);
      formData.append("comment", comment);
      formData.append("pow_nonce", currentPoW.nonce);
      formData.append("pow_timestamp", currentPoW.timestamp.toString());
      if (imageFile) formData.append("image", imageFile);

      const res = await fetch("/api/thread/create", { method: "POST", body: formData });

      if (res.ok) {
        setSubject("");
        setComment("");
        setImageFile(null);
        setShowCreateForm(false);
        fetchThreads();
        const newPoW = await generatePoW();
        setCurrentPoW(newPoW);
      }
    } catch (e) {
      console.error("Failed to create thread:", e);
    } finally {
      setLoading(false);
      setPowLoading(false);
      setPendingReplies((prev) => prev.filter((r) => r.id !== pendingId));
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedThread || !currentPoW) return;
    setLoading(true);
    setPowLoading(true);

    const { valid, error } = await verifyPoW(currentPoW.nonce, currentPoW.timestamp);
    if (!valid) {
      alert(`Verification failed: ${error}. Generating new challenge...`);
      setLoading(false);
      setPowLoading(false);
      const newPoW = await generatePoW();
      setCurrentPoW(newPoW);
      return;
    }

    setPendingReplies([...pendingReplies, { id: `pending-${Date.now()}`, comment: replyComment, image_filename: null }]);

    try {
      const formData = new FormData();
      formData.append("comment", replyComment);
      formData.append("pow_nonce", currentPoW.nonce);
      formData.append("pow_timestamp", currentPoW.timestamp.toString());
      if (replyImage) formData.append("image", replyImage);

      const res = await fetch(`/api/thread/${selectedThread.id}/reply`, { method: "POST", body: formData });

      if (res.ok) {
        setReplyComment("");
        setReplyImage(null);
        fetchReplies(selectedThread.id);
        fetchThreads();
        const newPoW = await generatePoW();
        setCurrentPoW(newPoW);
      }
    } catch (e) {
      console.error("Failed to reply:", e);
    } finally {
      setLoading(false);
      setPowLoading(false);
      setPendingReplies((prev) => prev.filter((r) => r.id !== `pending-${Date.now()}`));
    }
  };

  const formatQuote = (text: string) => {
    return text.replace(/>(\d+)/g, '<span class="quote-ref">>>$1</span>');
  };

  if (selectedThread) {
    return (
      <div className="container">
        <header>
          <h1><span>0null</span></h1>
          <nav className="nav-links">
            <button onClick={() => setImagesMode(!imagesMode)} className="btn-secondary" style={{ padding: "8px 16px" }}>
              {imagesMode ? "Images" : "Thread"}
            </button>
            <a href="#" onClick={() => setSelectedThread(null)}>← Catalog</a>
          </nav>
        </header>

        <div className={`thread-view ${imagesMode ? 'images-mode' : ''}`}>
          <div className="thread-op">
            <div className="thread-op-header">
              {selectedThread.image_filename && (
                <img
                  src={selectedThread.image_filename}
                  alt=""
                  className={`thread-op-image ${expandedImage === selectedThread.image_filename ? "expanded" : ""}`}
                  loading="lazy"
                  onClick={() => setExpandedImage(expandedImage === selectedThread.image_filename ? null : selectedThread.image_filename)}
                />
              )}
              <div className="thread-op-content">
                <div className="thread-op-subject">{selectedThread.subject}</div>
                <div className="thread-op-comment" dangerouslySetInnerHTML={{ __html: formatQuote(selectedThread.comment) }} />
              </div>
            </div>
            <div className="thread-op-footer">
              <div className="thread-meta">Posted {new Date(selectedThread.created_at).toLocaleString()}</div>
              <div className="reactions">
                {EMOJI_LIST.map((emoji) => (
                  <button
                    key={emoji}
                    className={`reaction-btn ${hasReacted('thread', selectedThread.id, emoji) ? 'reacted' : ''}`}
                    onClick={() => addReaction("thread", selectedThread.id, emoji)}
                    disabled={hasReacted('thread', selectedThread.id, emoji)}
                  >
                    <span className="reaction-emoji">{emoji}</span>
                    <span className="reaction-count">{selectedThread.reactions?.[emoji] || ""}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {replies.map((reply) => (
            <div key={reply.id} className="reply">
              <div className="reply-header">
                <span>#{reply.id}</span>
                <span>{new Date(reply.created_at).toLocaleString()}</span>
              </div>
              <div className="reply-content" dangerouslySetInnerHTML={{ __html: formatQuote(reply.comment) }} />
              {reply.image_filename && (
                <img
                  src={reply.image_filename}
                  alt=""
                  className={`reply-image ${expandedImage === reply.image_filename ? "expanded" : ""}`}
                  loading="lazy"
                  onClick={() => setExpandedImage(expandedImage === reply.image_filename ? null : reply.image_filename)}
                />
              )}
              <div className="reactions">
                {EMOJI_LIST.map((emoji) => (
                  <button
                    key={emoji}
                    className={`reaction-btn ${hasReacted('reply', reply.id, emoji) ? 'reacted' : ''}`}
                    onClick={() => addReaction("reply", reply.id, emoji)}
                    disabled={hasReacted('reply', reply.id, emoji)}
                  >
                    <span className="reaction-emoji">{emoji}</span>
                    <span className="reaction-count">{reply.reactions?.[emoji] || ""}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {pendingReplies.map((reply) => (
            <div key={reply.id} className="reply pending">
              <div className="reply-header"><span>Posting...</span></div>
              <div className="reply-content">{reply.comment}</div>
            </div>
          ))}

          <div className="reply-form">
            <h3>Reply to thread</h3>
            <form onSubmit={handleReply}>
              <textarea
                placeholder="Write your reply..."
                value={replyComment}
                onChange={(e) => setReplyComment(e.target.value)}
                required
              />
              <div className="form-actions">
                <div className="file-input">
                  <label>
                    <input type="file" accept="image/*" onChange={(e) => setReplyImage(e.target.files?.[0] || null)} />
                  </label>
                </div>
                <button type="submit" className="btn btn-primary" disabled={loading || powLoading}>
                  {powLoading ? "Verifying..." : loading ? "Posting..." : "Reply"}
                </button>
              </div>
            </form>
          </div>
        </div>

        {previewPost && (
          <div className="thread-preview visible" style={{ left: previewPost.x, top: previewPost.y }}>
            {previewPost.content}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="container">
      <header>
        <h1><span>0null</span></h1>
        <nav className="nav-links">
          <a href="/chat">Chat</a>
          <a href="#" onClick={() => setShowCreateForm(!showCreateForm)}>New Thread</a>
        </nav>
      </header>

      {showCreateForm && (
        <div className="create-form">
          <h2>Create new thread</h2>
          <form onSubmit={handleCreateThread}>
            <div className="form-row">
              <input type="text" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
            </div>
            <textarea placeholder="Comment" value={comment} onChange={(e) => setComment(e.target.value)} required />
            <div className="form-actions">
              <div className="file-input">
                <label><input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} /></label>
              </div>
              <button type="submit" className="btn btn-primary" disabled={loading || powLoading}>
                {powLoading ? "Computing PoW..." : loading ? "Posting..." : "Create Thread"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="catalog">
        {threads.map((thread) => (
          <div key={thread.id} className="thread-card" onClick={() => setSelectedThread(thread)}>
            {thread.image_filename && <img src={thread.image_filename} alt="" className="thread-image" loading="lazy" />}
            <div className="thread-info">
              <div className="thread-subject">{thread.subject}</div>
              <div className="thread-meta">{thread.bump_count} replies • {new Date(thread.last_bumped_at).toLocaleTimeString()}</div>
            </div>
          </div>
        ))}
      </div>

      {loading && (
        <div className="loading">Loading...</div>
      )}

      {!loading && threads.length === 0 && (
        <div className="loading">No threads yet. Be the first to post!</div>
      )}

      <button className="fab" onClick={() => { setShowCreateForm(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
        <PlusIcon />
      </button>

      {showCreateForm && (
        <div className="modal visible" onClick={() => setShowCreateForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create Thread</h2>
              <button className="modal-close" onClick={() => setShowCreateForm(false)}><CloseIcon /></button>
            </div>
            <form onSubmit={handleCreateThread}>
              <div className="form-row">
                <input type="text" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
              </div>
              <textarea placeholder="Comment" value={comment} onChange={(e) => setComment(e.target.value)} required />
              <div className="form-actions">
                <div className="file-input">
                  <label><input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} /></label>
                </div>
                <button type="submit" className="btn btn-primary" disabled={loading || powLoading}>
                  {powLoading ? "Computing PoW..." : loading ? "Posting..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
