"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import GhostCounter from "@/components/GhostCounter";
import VoidTimer from "@/components/VoidTimer";
import { useSound, playSuccess, playError, playGhost } from "@/hooks/useSound";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { isThreadExpired } from "@/components/VoidTimer";
import ConnectWallet from "@/components/ConnectWallet";
import { useAuth } from "@/components/AuthProvider";

interface Thread {
  id: number;
  subject: string;
  username?: string;
  is_verified_handle?: boolean;
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
  is_verified_handle?: boolean;
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

function removeReaction(type: string, id: number, emoji: string) {
  if (typeof window === "undefined") return;
  try {
    const key = `${type}_${id}`;
    const reacted = getReactedIds();
    if (reacted[key]) {
      reacted[key] = reacted[key].filter(e => e !== emoji);
      localStorage.setItem(REACTION_STORAGE_KEY, JSON.stringify(reacted));
    }
  } catch (e) {
    console.error("Failed to remove reaction:", e);
  }
}

const POSTS_STORAGE_KEY = "0null_posts";

function getMyPosts(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(POSTS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveMyPost(postId: number) {
  if (typeof window === "undefined") return;
  try {
    const posts = getMyPosts();
    if (!posts.includes(postId)) {
      posts.push(postId);
      localStorage.setItem(POSTS_STORAGE_KEY, JSON.stringify(posts));
    }
  } catch (e) {
    console.error("Failed to save post ID:", e);
  }
}

function isMyPost(postId: number): boolean {
  return getMyPosts().includes(postId);
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
      const encoded = encoder.encode(data + count);
      const hashBuf = new Uint8Array(encoded.length);
      hashBuf.set(encoded);
      const digest = await crypto.subtle.digest("SHA-256", hashBuf);
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
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [powLoading, setPowLoading] = useState(false);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [previewPost, setPreviewPost] = useState<{ x: number; y: number; content: string } | null>(null);
  const [pendingReplies, setPendingReplies] = useState<{ id: string; comment: string; image_filename: string | null }[]>([]);
  const [currentPoW, setCurrentPoW] = useState<{ nonce: string; timestamp: number } | null>(null);
  const { username: walletUsername, isAuthenticated } = useAuth();
  const [useHandle, setUseHandle] = useState(false);
  const [viewMode, setViewMode] = useState<'threads' | 'images'>('threads');
  const [username, setUsername] = useState("");
  const [replyingTo, setReplyingTo] = useState<{ id: number; comment: string } | null>(null);
  const [collapsedReplies, setCollapsedReplies] = useState<Record<number, boolean>>({});
  const [muted, setMuted] = useState(false);
  const [soundInitialized, setSoundInitialized] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeNiche, setActiveNiche] = useState("all");
  const [pulseData, setPulseData] = useState<{ id: number; subject: string; niche: string; heat_normalized: number; recent_replies: number; last_bumped_at?: string; image_filename?: string }[]>([]);
  const [openReactions, setOpenReactions] = useState<{ type: string; id: number } | null>(null);
  const previousGhostCount = useRef<number>(0);
  
  // Refs for focusing inputs
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const createTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (imageFile) {
      const url = URL.createObjectURL(imageFile);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [imageFile]);

  // Auto-scroll to reply form when user clicks Reply
  const handleSetReplyingTo = (data: { id: number; comment: string }) => {
    setReplyingTo(data);
    setTimeout(() => {
      const composer = document.querySelector('.reply-composer');
      if (composer) {
        composer.scrollIntoView({ behavior: 'smooth', block: 'center' });
        replyTextareaRef.current?.focus();
      }
    }, 100);
  };

  useEffect(() => {
    setThreads([]);
    setLoading(true);
    fetchThreads();
    const handleScroll = () => setShowFab(window.scrollY > 300);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [activeNiche, searchQuery]);

  // Load mute state
  useEffect(() => {
    try {
      const stored = localStorage.getItem("0null_sound_muted");
      setMuted(stored === "true");
    } catch {}
  }, []);

  // Fetch pulse data every 60s
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/pulse');
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data.success && data.pulse) setPulseData(data.pulse);
        }
      } catch {}
    };
    load();
    const id = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onReply: () => { setShowCreateForm(true); createTextareaRef.current?.focus(); },
    onViewImages: () => setViewMode('images'),
    onViewThreads: () => setViewMode('threads'),
    onCloseModal: () => {
      setShowCreateForm(false);
      setReplyingTo(null);
      setSearchQuery("");
      setActiveNiche("all");
    },
    onSubmit: () => {
      if (selectedThread) {
        // Trigger reply submit
        const btn = document.querySelector('.btn-reply-submit') as HTMLButtonElement;
        if (btn) btn.click();
      } else if (showCreateForm) {
        // Trigger create form submit
        const btn = document.querySelector('.btn-create') as HTMLButtonElement;
        if (btn) btn.click();
      }
    }
  });

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
        setTimeout(() => setReplies((prev) => prev.map((r) => r.id === newReply.new.id ? { ...r, isNew: false } : r)), 3000);
      });
      channel.subscribe();
    });
  };

  // Reaction toggle with optimistic updates
  const addReaction = async (type: string, id: number, emoji: string) => {
    const isAlreadyReacted = hasReacted(type, id, emoji);
    
    // Prevent multiple rapid clicks
    const key = `${type}_${id}_${emoji}`;
    const inProgress = (window as unknown as { __reactionInProgress?: Record<string, boolean> }).__reactionInProgress;
    if (inProgress?.[key]) return;
    (window as unknown as { __reactionInProgress: Record<string, boolean> }).__reactionInProgress = { 
      ...(inProgress || {}), 
      [key]: true 
    };
    
    // Optimistic UI: update immediately
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

    if (type === "thread") {
      setThreads(prev => updateReactions(prev, id) as Thread[]);
      if (selectedThread?.id === id) {
        setSelectedThread(prev => prev ? updateReactions([prev], id)[0] as Thread : null);
      }
    } else {
      setReplies(prev => updateReactions(prev, id) as Reply[]);
    }

    // Toggle localStorage
    if (isAlreadyReacted) {
      removeReaction(type, id, emoji);
    } else {
      saveReaction(type, id, emoji);
    }

    // Send API request
    try {
      await fetch("/api/react", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ type, id, emoji, action: isAlreadyReacted ? 'remove' : 'add' }) 
      });
    } catch (e) { 
      console.error("Failed to toggle reaction:", e);
      // Rollback on error
      const rollbackUpdate = (items: (Thread | Reply)[], targetId: number): (Thread | Reply)[] => {
        return items.map(item => {
          if (item.id === targetId) {
            const currentCount = (item.reactions?.[emoji] as number) || 0;
            const newCount = isAlreadyReacted ? currentCount + 1 : currentCount - 1;
            return { ...item, reactions: { ...item.reactions, [emoji]: Math.max(0, newCount) } };
          }
          return item;
        });
      };
      if (type === "thread") {
        setThreads(prev => rollbackUpdate(prev, id) as Thread[]);
      } else {
        setReplies(prev => rollbackUpdate(prev, id) as Reply[]);
      }
    } finally {
      const win = window as unknown as { __reactionInProgress: Record<string, boolean> };
      if (win.__reactionInProgress) {
        delete win.__reactionInProgress[key];
      }
    }
  };

  const toggleReactionPicker = (type: string, id: number) => {
    setOpenReactions(prev => {
      if (prev?.type === type && prev?.id === id) return null;
      return { type, id };
    });
  };

  const handleReactionClick = (type: string, id: number, emoji: string) => {
    addReaction(type, id, emoji);
    setOpenReactions(null);
  };

  const timeAgo = (dateStr: string) => {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  useEffect(() => { generatePoW().then(setCurrentPoW); }, []);

  const fetchThreads = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeNiche && activeNiche !== 'all') params.set('niche', activeNiche);
      if (searchQuery && searchQuery.trim()) params.set('search', searchQuery.trim());
      
      const url = `/api/thread/list${params.toString() ? '?' + params.toString() : ''}`;
      const res = await fetch(url);
      if (res.ok) { 
        const data = await res.json(); 
        // Filter out expired threads
        const activeThreads = (data.threads || []).filter((t: { last_bumped_at: string }) => !isThreadExpired(t.last_bumped_at));
        setThreads(activeThreads); 
      }
    } catch (e) { console.error("Failed to fetch threads:", e); }
    finally { setLoading(false); }
  };

  const fetchReplies = async (threadId: number) => {
    setRepliesLoading(true);
    try {
      const res = await fetch(`/api/thread/${threadId}`);
      if (res.ok) { const data = await res.json(); setReplies(data.replies || []); }
    } catch (e) { console.error("Failed to fetch replies:", e); }
    finally { setRepliesLoading(false); }
  };

  const handleCreateThread = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    setCreateError(null);
    if (!subject.trim() || !comment.trim()) {
      setCreateError("Subject and comment are required.");
      return;
    }
    if (!currentPoW) return;
    setLoading(true);
    setPowLoading(true);
    const { valid, error } = await verifyPoW(currentPoW.nonce, currentPoW.timestamp);
    if (!valid) { 
      alert(`Verification failed: ${error}. Generating new challenge...`); 
      playError();
      setLoading(false); 
      setPowLoading(false); 
      setCurrentPoW(await generatePoW()); 
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
      const effectiveThreadUser = useHandle ? (walletUsername || 'Anonymous') : (username.trim() || 'Anonymous');
      formData.append("username", effectiveThreadUser);
      formData.append("is_verified_handle", String(useHandle));
      if (imageFile) formData.append("image", imageFile);
      const res = await fetch("/api/thread/create", { method: "POST", body: formData });
      if (res.ok) {
        // Play success sound
        playSuccess();
        
        // Reset all form state
        setSubject(""); 
        setComment(""); 
        setImageFile(null); 
        setUsername("");
        setShowCreateForm(false);
        
        const data = await res.json();
        if (data.debug) {
          console.log("[GHOST BRAIN DEBUG]:", JSON.stringify(data.debug, null, 2));
        }
        if (data.thread?.id) saveMyPost(data.thread.id);
        
        // Refresh data
        fetchThreads();
        setCurrentPoW(await generatePoW());
      } else {
        const data = await res.json().catch(() => ({ error: 'Request failed' }));
        setCreateError(data.error || 'Failed to create thread');
        playError();
      }
    } catch (e) { 
      console.error("Failed to create thread:", e);
      setCreateError('Network error — check your connection');
      playError();
    }
    finally { 
      setLoading(false); 
      setPowLoading(false); 
      setPendingReplies(prev => prev.filter(r => r.id !== pendingId)); 
    }
  };

  const handleReply = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!replyComment.trim()) return;
    if (!selectedThread || !currentPoW) return;
    setLoading(true);
    setPowLoading(true);
    const { valid, error } = await verifyPoW(currentPoW.nonce, currentPoW.timestamp);
    if (!valid) { 
      alert(`Verification failed: ${error}. Generating new challenge...`); 
      playError();
      setLoading(false); 
      setPowLoading(false); 
      setCurrentPoW(await generatePoW()); 
      return; 
    }
    const pendingId = `pending-${Date.now()}`;
    setPendingReplies([...pendingReplies, { id: pendingId, comment: replyComment, image_filename: null }]);
    try {
      const formData = new FormData();
      formData.append("comment", replyComment);
      formData.append("pow_nonce", currentPoW.nonce);
      formData.append("pow_timestamp", currentPoW.timestamp.toString());
      const effectiveReplyUser = useHandle ? (walletUsername || 'Anonymous') : (username.trim() || 'Anonymous');
      formData.append("username", effectiveReplyUser);
      formData.append("is_verified_handle", String(useHandle));
      if (replyingTo) formData.append("reply_to_id", replyingTo.id.toString());
      if (replyImage) formData.append("image", replyImage);
      const res = await fetch(`/api/thread/${selectedThread.id}/reply`, { method: "POST", body: formData });
      if (res.ok) {
        playSuccess();
        
        // Reset all form state
        setReplyComment(""); 
        setReplyImage(null); 
        setReplyingTo(null);
        
        const data = await res.json();
        if (data.reply?.id) saveMyPost(data.reply.id);
        
        // Refresh data
        fetchReplies(selectedThread.id); 
        fetchThreads();
        setCurrentPoW(await generatePoW());
      }
    } catch (e) { 
      console.error("Failed to reply:", e);
      playError();
    }
    finally { 
      setLoading(false); 
      setPowLoading(false); 
      setPendingReplies(prev => prev.filter(r => r.id !== pendingId)); 
    }
  };

  const formatQuote = (text: string) => text.replace(/>(\d+)/g, '<span class="quote-ref">>>$1</span>');
  const toggleCollapse = (replyId: number) => setCollapsedReplies(prev => ({ ...prev, [replyId]: !prev[replyId] }));

  const redactId = (id: number) => {
    const s = String(id);
    if (s.length <= 2) return s;
    return s.slice(0, -2) + '<span class="redacted">' + s.slice(-2) + '</span>';
  };

  const redactTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  };

  // Build nested reply tree from flat array
  const replyTree = useMemo(() => {
    if (!replies || replies.length === 0) return [];
    
    // Create a map of all replies by ID
    const replyMap = new Map<number, Reply & { children: Reply[] }>();
    
    // First pass: create all nodes with empty children arrays
    replies.forEach(r => {
      replyMap.set(r.id, { ...r, children: [] as (Reply & { children: Reply[] })[] });
    });
    
    // Second pass: build the tree structure
    const roots: (Reply & { children: Reply[] })[] = [];
    
    replies.forEach(r => {
      const node = replyMap.get(r.id)!;
      
      if (r.reply_to_id && replyMap.has(r.reply_to_id)) {
        // This is a child reply - add to parent's children
        const parent = replyMap.get(r.reply_to_id)!;
        parent.children.push(node);
      } else {
        // This is a root-level reply
        roots.push(node);
      }
    });
    
    return roots;
  }, [replies]);

  const replyMap = useMemo(() => {
    const map = new Map<number, Reply>();
    replies.forEach(r => map.set(r.id, r));
    return map;
  }, [replies]);

  const userNumberMap = useMemo(() => {
    const map = new Map<number, string>();
    const sorted = [...replies].sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    let counter = 0;
    sorted.forEach(r => {
      if (!r.username || r.username === 'Anonymous') {
        counter++;
        map.set(r.id, `User #${counter}`);
      } else {
        map.set(r.id, r.username);
      }
    });
    return map;
  }, [replies]);

  const getUserLabel = useCallback((reply: Reply): string => {
    if (reply.username && reply.username !== 'Anonymous') return reply.username;
    return userNumberMap.get(reply.id) || 'User #?';
  }, [userNumberMap]);

  const scrollToComment = useCallback((id: number) => {
    const el = document.getElementById(`comment-${id}`);
    if (el) {
      el.classList.add('highlighted');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => el.classList.remove('highlighted'), 2000);
    }
  }, []);

  const renderReplyTree = (nodes: (Reply & { children: Reply[] })[], depth = 0) => {
    return nodes.map((reply) => {
      const isCollapsed = collapsedReplies[reply.id];
      const childCount = reply.children?.length || 0;
      const showCollapse = depth === 0 && childCount >= 5;
      const myPost = isMyPost(reply.id);
      const hasChildren = reply.children && reply.children.length > 0;
      const parentReply = reply.reply_to_id ? replyMap.get(reply.reply_to_id) : null;
      const reactionKeys = Object.keys(reply.reactions || {});

      return (
        <div key={reply.id} className={`comment ${reply.isNew ? 'is-new' : ''}`} id={`comment-${reply.id}`}>
          <div className="comment-body">
            <div className="comment-content">
              <div className="comment-header">
                <span className={`username ${myPost ? 'you' : ''}${reply.is_verified_handle ? ' verified' : ''}`}>{getUserLabel(reply)}</span>
                {myPost && <span className="badge badge-you">You</span>}
                <span className="comment-time" title={new Date(reply.created_at).toLocaleString()}>{redactTime(reply.created_at)}</span>
                <span className="comment-time" style={{ color: 'var(--warning)' }} dangerouslySetInnerHTML={{ __html: '#' + redactId(reply.id) }} />
              </div>
              {parentReply && (
                <div className="replying-to">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M9 14L4 9l5-5"/>
                    <path d="M4 9h10.5a5.5 5.5 0 015.5 5.5v0a5.5 5.5 0 01-5.5 5.5H11"/>
                  </svg>
                  Replying to <span className="reply-target" data-target={reply.reply_to_id} onClick={() => reply.reply_to_id && scrollToComment(reply.reply_to_id)}>@{getUserLabel(parentReply)}</span>
                </div>
              )}
              <div className="comment-text" dangerouslySetInnerHTML={{ __html: formatQuote(reply.comment) }} />
              {reply.image_filename && (
                <div className="comment-image" onClick={() => setExpandedImage(expandedImage === reply.image_filename ? null : reply.image_filename)}>
                  <img src={reply.image_filename} alt="" loading="lazy" />
                </div>
              )}
              <div className="reactions-bar">
                {reactionKeys.map(emoji => {
                  const count = reply.reactions[emoji] as number;
                  const active = hasReacted('reply', reply.id, emoji);
                  return (
                    <button key={emoji} className={`reaction ${active ? 'active' : ''}`} onClick={() => handleReactionClick('reply', reply.id, emoji)}>
                      <span>{emoji}</span>
                      <span className="reaction-count">{count}</span>
                    </button>
                  );
                })}
                <button className="add-reaction" onClick={() => toggleReactionPicker('reply', reply.id)}>+</button>
                <div className={`emoji-picker ${openReactions?.type === 'reply' && openReactions?.id === reply.id ? 'visible' : ''}`}>
                  {EMOJI_LIST.map(emoji => (
                    <span key={emoji} className="emoji-option" onClick={() => handleReactionClick('reply', reply.id, emoji)}>{emoji}</span>
                  ))}
                </div>
              </div>
              <div className="comment-actions">
                <button className="action-btn reply-btn" onClick={() => handleSetReplyingTo({ id: reply.id, comment: reply.comment.slice(0, 50) })}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                  Reply
                </button>
                <button className="action-btn" onClick={() => navigator.clipboard.writeText(`>>#${reply.id}`)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
                  Link
                </button>
              </div>
            </div>
          </div>
          {showCollapse && !isCollapsed && (
            <button className="collapse-toggle" onClick={() => toggleCollapse(reply.id)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
              Hide {childCount - 3} replies
            </button>
          )}
          {showCollapse && isCollapsed && (
            <button className="collapse-toggle collapsed" onClick={() => toggleCollapse(reply.id)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
              Show {childCount} replies
            </button>
          )}
          {!showCollapse && hasChildren && !isCollapsed && (
            <div className="replies">
              {renderReplyTree(reply.children as (Reply & { children: Reply[] })[], depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  if (selectedThread) {
    return (
      <div className="container">
        <header>
          <div className="header-left">
            <h1><span>0null</span></h1>
            <GhostCounter onCountChange={(newCount, prevCount) => {
              if (newCount > prevCount && prevCount > 0) {
                playGhost();
              }
              previousGhostCount.current = newCount;
            }} />
          </div>
          <div className="header-right">
            <button 
              className={`mute-btn ${muted ? 'muted' : ''}`}
              onClick={() => {
                const newMuted = !muted;
                setMuted(newMuted);
                try { localStorage.setItem("0null_sound_muted", newMuted ? "true" : "false"); } catch {}
              }}
              title={muted ? "Unmute sounds" : "Mute sounds"}
            >
              {muted ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                  <line x1="23" y1="9" x2="17" y2="15"/>
                  <line x1="17" y1="9" x2="23" y2="15"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
                </svg>
              )}
            </button>
            <nav className="nav-links">
              <div className="view-toggle">
                <button 
                  onClick={() => setViewMode('threads')} 
                  className={`view-toggle-btn ${viewMode === 'threads' ? 'active' : ''}`}
                >Thread</button>
                <button 
                  onClick={() => setViewMode('images')} 
                  className={`view-toggle-btn ${viewMode === 'images' ? 'active' : ''}`}
                >Images</button>
              </div>
              <a href="#" onClick={() => setSelectedThread(null)}>← Catalog</a>
            </nav>
          </div>
        </header>
        <div className="header-divider" />
        {/* Thread View */}
        {viewMode === 'threads' && (
          <div className="thread-view">
            <div className="thread-op">
              <div className="thread-op-header">
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
                  {selectedThread.username && selectedThread.username !== 'Anonymous' && <span className={`username-display${selectedThread.is_verified_handle ? ' verified' : ''}`}>{selectedThread.username} • </span>}
                  Posted {new Date(selectedThread.created_at).toLocaleString()}
                </div>
                <div className="reactions" style={{ position: 'relative' }}>
                  <button 
                    className="reaction-picker-trigger"
                    onClick={() => toggleReactionPicker('thread', selectedThread.id)}
                  >
                    😀 React
                  </button>
                  {openReactions?.type === 'thread' && openReactions?.id === selectedThread.id && (
                    <div className="reaction-picker">
                      {EMOJI_LIST.map(emoji => (
                        <button 
                          key={emoji} 
                          className={`reaction-btn ${hasReacted('thread', selectedThread.id, emoji) ? 'reacted' : ''}`}
                          onClick={() => handleReactionClick('thread', selectedThread.id, emoji)}
                        >
                          <span className="reaction-emoji">{emoji}</span>
                          {selectedThread.reactions?.[emoji] && <span className="reaction-count">{selectedThread.reactions[emoji]}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            {repliesLoading ? (
              <div className="loading">Loading</div>
            ) : (
              <div className="comments-container">
                {renderReplyTree(replyTree)}
              </div>
            )}
            {pendingReplies.map(reply => (
              <div key={reply.id} className="comment pending">
                <div className="comment-body">
                  <div className="comment-content">
                    <div className="comment-header">
                      <span className="username">Posting...</span>
                    </div>
                    <div className="comment-text">{reply.comment}</div>
                  </div>
                </div>
              </div>
            ))}
            <div className={`reply-composer ${replyingTo ? 'replying' : ''}`} id="reply-composer">
              <div className="composer-header">
                <span className="composer-label">{replyingTo ? `Replying to #${replyingTo.id}` : 'Replying to thread'}</span>
                <button className={`composer-cancel ${!replyingTo ? 'hidden' : ''}`} onClick={() => setReplyingTo(null)}>Cancel</button>
              </div>
              <div className="composer-body">
                <div className="name-row">
                  <input type="text" className={`name-input${useHandle ? ' use-handle' : ''}`} placeholder="Name (optional)" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={50} aria-label="Your name (optional)" disabled={useHandle} />
                  <label className={`handle-toggle${useHandle ? ' active' : ''}${!isAuthenticated ? ' disabled' : ''}`}>
                    <input type="checkbox" checked={useHandle} onChange={() => { setUseHandle(v => !v); setUsername(''); }} disabled={!isAuthenticated} hidden />
                    [ use_handle ]
                  </label>
                </div>
                <textarea ref={replyTextareaRef} className="reply-textarea" placeholder="Write your reply..." value={replyComment} onChange={(e) => setReplyComment(e.target.value)} rows={3} aria-label="Write your reply" />
                <div className="composer-footer">
                  <div className="composer-actions">
                    <button className="btn-attach" title="Attach image" aria-label="Attach image" onClick={() => document.getElementById('reply-image-input')?.click()}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                      <span>Image</span>
                    </button>
                    <input type="file" id="reply-image-input" accept="image/*" onChange={(e) => setReplyImage(e.target.files?.[0] || null)} style={{ display: 'none' }} />
                  </div>
                  <button className="btn-reply-submit" onClick={handleReply} disabled={loading || powLoading}>{powLoading ? "Verifying..." : loading ? "Posting..." : "Reply"}</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Images Gallery View */}
        {viewMode === 'images' && (
          <div className="image-gallery">
            {/* Thread OP image */}
            {selectedThread.image_filename && (
              <div className="gallery-item" onClick={() => setViewMode('threads')}>
                <img src={selectedThread.image_filename} alt="" className="gallery-image" loading="lazy" />
                <div className="gallery-overlay">
                  <span className="gallery-post-id">#{selectedThread.id}</span>
                  <span className="gallery-post-type">OP</span>
                </div>
              </div>
            )}
            {/* Reply images */}
            {replies.filter(r => r.image_filename).map(reply => (
              <div key={reply.id} className="gallery-item" onClick={() => setViewMode('threads')}>
                <img src={reply.image_filename!} alt="" className="gallery-image" loading="lazy" />
                <div className="gallery-overlay">
                  <span className="gallery-post-id">#{reply.id}</span>
                  {reply.comment && <span className="gallery-preview">{reply.comment.slice(0, 40)}...</span>}
                </div>
              </div>
            ))}
            {selectedThread.image_filename === null && replies.filter(r => r.image_filename).length === 0 && (
              <div className="gallery-empty">No images in this thread</div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="container">
      <header>
        <div className="header-left">
          <h1><span>0null</span></h1>
          <GhostCounter onCountChange={(newCount, prevCount) => {
            if (newCount > prevCount && prevCount > 0) {
              playGhost();
            }
            previousGhostCount.current = newCount;
          }} />
        </div>
        <div className="header-right">
          <button 
            className={`mute-btn ${muted ? 'muted' : ''}`}
            onClick={() => {
              const newMuted = !muted;
              setMuted(newMuted);
              try { localStorage.setItem("0null_sound_muted", newMuted ? "true" : "false"); } catch {}
            }}
            title={muted ? "Unmute sounds" : "Mute sounds"}
          >
            {muted ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <line x1="23" y1="9" x2="17" y2="15"/>
                <line x1="17" y1="9" x2="23" y2="15"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
              </svg>
            )}
          </button>
          <nav className="nav-links">
            <a href="#" onClick={() => { setShowCreateForm(true); createTextareaRef.current?.focus(); }}>New Thread</a>
          </nav>
          <div className="search-container">
            <label className="search-label">search_void:</label>
            <input
              type="text"
              className="search-input"
              placeholder="..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </header>
      <div className="header-divider" />
      
      {/* Niche Navigation */}
      <div className="niche-nav">
        <button
          className={`niche-link ${activeNiche === 'all' ? 'active' : ''}`}
          onClick={() => setActiveNiche('all')}
        >
          ALL
        </button>
        <button
          className={`niche-link ${activeNiche === 'tech' ? 'active' : ''}`}
          onClick={() => setActiveNiche('tech')}
        >
          TECH
        </button>
        <button
          className={`niche-link ${activeNiche === 'gaming' ? 'active' : ''}`}
          onClick={() => setActiveNiche('gaming')}
        >
          GAMING
        </button>
        <button
          className={`niche-link ${activeNiche === 'finance' ? 'active' : ''}`}
          onClick={() => setActiveNiche('finance')}
        >
          FINANCE
        </button>
        <button
          className={`niche-link ${activeNiche === 'politics' ? 'active' : ''}`}
          onClick={() => setActiveNiche('politics')}
        >
          POLITICS
        </button>
        <button
          className={`niche-link ${activeNiche === 'random' ? 'active' : ''}`}
          onClick={() => setActiveNiche('random')}
        >
          RANDOM
        </button>
        <div className="niche-spacer" />
        <ConnectWallet />
      </div>
      {/* Inline Thread Creation Form */}
      <div className="inline-create">
        {!showCreateForm ? (
          <button className="start-thread-btn" onClick={() => { setShowCreateForm(true); createTextareaRef.current?.focus(); }}>
            + Start a New Thread
          </button>
        ) : (
          <div className="thread-form-container" role="dialog" aria-modal="true" aria-labelledby="form-title">
            <div className="form-header">
              <h2 className="form-title" id="form-title">New Thread</h2>
              <button className="btn-close" onClick={() => { setShowCreateForm(false); setCreateError(null); }} aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="form-body">
              <div className="form-row">
                <div className="field-group">
                  <label className="field-label" htmlFor="thread-name">Name <span className="optional">(optional)</span></label>
                  <div className="name-row">
                    <input type="text" id="thread-name" className={`text-input${useHandle ? ' use-handle' : ''}`} placeholder="Anonymous" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={50} autoComplete="off" disabled={useHandle} />
                    <label className={`handle-toggle${useHandle ? ' active' : ''}${!isAuthenticated ? ' disabled' : ''}`}>
                      <input type="checkbox" checked={useHandle} onChange={() => { setUseHandle(v => !v); setUsername(''); }} disabled={!isAuthenticated} hidden />
                      [ use_handle ]
                    </label>
                  </div>
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="thread-subject">Subject</label>
                  <input type="text" id="thread-subject" className="text-input" placeholder="Thread title" value={subject} onChange={(e) => { setSubject(e.target.value); setCreateError(null); }} maxLength={120} required autoComplete="off" />
                </div>
              </div>
              <div className="field-group">
                <div className="field-footer">
                  <label className="field-label" htmlFor="thread-comment">Comment</label>
                  <span className={`char-count${comment.length > 1800 ? ' warning' : ''}`}>{comment.length} / 2000</span>
                </div>
                <textarea id="thread-comment" ref={createTextareaRef} className="textarea-input" placeholder="What's on your mind?" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} rows={5} required />
              </div>
              <div className="field-group">
                <label className="field-label">Image</label>
                <div className="file-upload">
                  <input type="file" id="thread-image" className="file-upload-input" accept="image/*" onChange={(e) => { setImageFile(e.target.files?.[0] || null); e.target.value = ''; }} />
                  <button type="button" className="file-upload-button" tabIndex={-1} onClick={() => document.getElementById('thread-image')?.click()}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    Choose File
                  </button>
                  <span className="file-name">{imageFile ? imageFile.name : 'No file chosen'}</span>
                </div>
                {imageFile && (
                  <div className="image-preview visible">
                    <img src={previewUrl!} alt="Preview" />
                    <button type="button" className="btn-remove-image" onClick={() => { setImageFile(null); }}>×</button>
                  </div>
                )}
              </div>
            </div>
            {createError && <div className="form-error">{createError}</div>}
            <div className="form-footer">
              <div></div>
              <button type="button" className="btn-create" onClick={handleCreateThread} disabled={loading || powLoading}>
                {powLoading ? "Computing PoW..." : loading ? "Posting..." : "Create"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Active Pulse Section */}
      {!loading && pulseData.length > 0 && (
        <div className="active-pulse">
          <div className="active-pulse-header">[ peak ]</div>
          <div className="active-pulse-row">
            {pulseData.slice(0, 3).map(thread => (
              <div
                key={thread.id}
                className="active-pulse-card"
                onClick={() => {
                  const t = threads.find(t => t.id === thread.id);
                  if (t) setSelectedThread(t);
                }}
              >
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
                  <div className="thread-meta">{thread.recent_replies} replies • {thread.heat_normalized}% heat</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Thread Catalog */}
      {loading ? (
        <div className="loading">Loading</div>
      ) : (
        <>
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
          {threads.length === 0 && (searchQuery || activeNiche !== 'all') && (
            <div className="empty-state">[!] NO DATA FOUND IN THE VOID</div>
          )}
          {threads.length === 0 && !searchQuery && activeNiche === 'all' && (
            <div className="loading">No threads yet. Be the first to post!</div>
          )}
        </>
      )}
      <button className="fab" onClick={() => { setShowCreateForm(true); createTextareaRef.current?.focus(); window.scrollTo({ top: 0, behavior: "smooth" }); }}><PlusIcon /></button>
    </div>
  );
}
