"use client";

import { useState, useEffect, useRef } from "react";

interface Message {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
}

const OPSEC_WARNING = `⚠️ OPSEC ALERT: This is a direct Peer-to-Peer (P2P) connection. Your public IP address WILL be visible to the other user via WebRTC. To prevent a leak, enable a system-wide VPN (e.g., Mullvad) before connecting. Tor Browser does not support this feature.`;

export default function Chat() {
  const [accepted, setAccepted] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [status, setStatus] = useState("Waiting for opponent...");
  const [userIdVal] = useState(() => `user_${Math.random().toString(36).substring(2, 8)}`);
  
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const dataChannel = useRef<RTCDataChannel | null>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof import("@supabase/supabase-js").createClient>['channel']> | null>(null);
  const peerIdRef = useRef("");
  const supabaseRef = useRef<ReturnType<typeof import("@supabase/supabase-js").createClient> | null>(null);

  const getSupabase = async () => {
    if (supabaseRef.current) return supabaseRef.current;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      setStatus("Configuration error - missing env vars");
      return null;
    }
    const { createClient } = await import("@supabase/supabase-js");
    supabaseRef.current = createClient(supabaseUrl, supabaseAnonKey);
    return supabaseRef.current;
  };

  const cleanup = async () => {
    if (dataChannel.current) {
      dataChannel.current.close();
    }
    if (peerConnection.current) {
      peerConnection.current.close();
    }
    const supabase = await getSupabase();
    if (supabase && channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }
    setConnected(false);
    setMessages([]);
  };

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const connect = async () => {
    const supabase = await getSupabase();
    if (!supabase) return;

    setConnecting(true);
    setStatus("Connecting to signaling server...");

    try {
      const channel = supabase.channel(`chat_${userIdVal}`, {
        config: { presence: { key: userIdVal } },
      });

      channelRef.current = channel;

      channel.on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const others = Object.keys(state).filter((k: string) => k !== userIdVal);
        
        if (others.length > 0 && !connected) {
          peerIdRef.current = others[0];
          setStatus("Opponent found! Establishing P2P connection...");
          initiateConnection(others[0], channel);
        }
      });

      channel.on("presence", { event: "join" }, ({ key }: { key: string }) => {
        if (key !== userIdVal && !connected) {
          peerIdRef.current = key;
          setStatus("Opponent found! Establishing P2P connection...");
          initiateConnection(key, channel);
        }
      });

      channel.on("presence", { event: "leave" }, ({ key }: { key: string }) => {
        if (key !== userIdVal && connected) {
          setStatus("Opponent disconnected");
          cleanup();
        }
      });

      await channel.subscribe(async (status: string) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ id: userIdVal });
        }
      });

      setStatus("Waiting for opponent...");
    } catch (error) {
      console.error("Signaling error:", error);
      setStatus("Connection failed");
      setConnecting(false);
    }
  };

  const initiateConnection = async (peerId: string, channel: ReturnType<ReturnType<typeof import("@supabase/supabase-js").createClient>['channel']>) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    peerConnection.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        channel.send({
          type: "broadcast",
          event: "chat_ice",
          payload: { to: peerId, candidate: event.candidate },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setConnected(true);
        setConnecting(false);
        setStatus("Connected! Chat is E2E encrypted.");
      }
    };

    const dc = pc.createDataChannel("chat");
    dataChannel.current = dc;

    dc.onmessage = (event) => {
      const msg: Message = JSON.parse(event.data);
      setMessages((prev) => [...prev, msg]);
    };

    dc.onopen = () => {
      setConnected(true);
      setConnecting(false);
      setStatus("Connected! Chat is E2E encrypted.");
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    channel.send({
      type: "broadcast",
      event: "chat_offer",
      payload: { to: peerId, sdp: offer },
    });

    channel.on("broadcast", { event: "chat_offer" }, async (payload: { payload: { to: string; sdp: RTCSessionDescriptionInit } }) => {
      if (payload.payload.to === userIdVal) {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.payload.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        channel.send({
          type: "broadcast",
          event: "chat_answer",
          payload: { to: peerId, sdp: answer },
        });
      }
    });

    channel.on("broadcast", { event: "chat_answer" }, async (payload: { payload: { to: string; sdp: RTCSessionDescriptionInit } }) => {
      if (payload.payload.to === userIdVal) {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.payload.sdp));
      }
    });

    channel.on("broadcast", { event: "chat_ice" }, async (payload: { payload: { to: string; candidate: RTCIceCandidateInit } }) => {
      if (payload.payload.to === userIdVal) {
        await pc.addIceCandidate(new RTCIceCandidate(payload.payload.candidate));
      }
    });
  };

  const sendMessage = () => {
    if (!inputText.trim() || !dataChannel.current) return;

    const msg: Message = {
      id: `${Date.now()}`,
      sender: userIdVal,
      text: inputText,
      timestamp: Date.now(),
    };

    dataChannel.current.send(JSON.stringify(msg));
    setMessages((prev) => [...prev, msg]);
    setInputText("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!accepted) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#0d0d0d",
        color: "#ff4444",
        fontFamily: "system-ui, sans-serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}>
        <div style={{
          background: "#1a0000",
          border: "2px solid #ff4444",
          padding: "30px",
          maxWidth: "500px",
          textAlign: "center",
        }}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "20px" }}>OPSEC WARNING</h1>
          <p style={{ fontSize: "1.1rem", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>
            {OPSEC_WARNING}
          </p>
          <button
            onClick={() => setAccepted(true)}
            style={{
              marginTop: "25px",
              padding: "15px 30px",
              fontSize: "1rem",
              background: "#ff4444",
              color: "#000",
              border: "none",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            I ACCEPT THE RISK - ENTER CHAT
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0d0d0d",
      color: "#e5e5e5",
      fontFamily: "system-ui, sans-serif",
      display: "flex",
      flexDirection: "column",
    }}>
      <header style={{
        padding: "15px 20px",
        borderBottom: "1px solid #333",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <h1 style={{ fontSize: "1.2rem", margin: 0 }}>
          <span style={{ color: "#ff4444" }}>🔗</span> Ghost Chat
        </h1>
        <span style={{ color: "#888", fontSize: "0.85rem" }}>{status}</span>
      </header>

      {!connected && (
        <div style={{ padding: "20px", textAlign: "center" }}>
          <button
            onClick={connect}
            disabled={connecting}
            style={{
              padding: "15px 30px",
              fontSize: "1rem",
              background: connecting ? "#333" : "#ff4444",
              color: "#fff",
              border: "none",
              cursor: connecting ? "not-allowed" : "pointer",
            }}
          >
            {connecting ? "Connecting..." : "Find Chat Partner"}
          </button>
        </div>
      )}

      {connected && (
        <>
          <div style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  alignSelf: msg.sender === userIdVal ? "flex-end" : "flex-start",
                  background: msg.sender === userIdVal ? "#ff4444" : "#333",
                  color: msg.sender === userIdVal ? "#000" : "#e5e5e5",
                  padding: "10px 15px",
                  borderRadius: "10px",
                  maxWidth: "70%",
                }}
              >
                {msg.text}
              </div>
            ))}
          </div>

          <div style={{
            padding: "15px",
            borderTop: "1px solid #333",
            display: "flex",
            gap: "10px",
          }}>
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type a message..."
              style={{
                flex: 1,
                padding: "12px",
                background: "#1a1a1a",
                border: "1px solid #333",
                color: "#e5e5e5",
                fontSize: "1rem",
              }}
            />
            <button
              onClick={sendMessage}
              style={{
                padding: "12px 20px",
                background: "#ff4444",
                color: "#000",
                border: "none",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              Send
            </button>
          </div>
        </>
      )}

      <div style={{
        padding: "10px",
        textAlign: "center",
        fontSize: "0.75rem",
        color: "#666",
        borderTop: "1px solid #222",
      }}>
        Messages are E2E encrypted via WebRTC. No logs, no storage.
      </div>
    </div>
  );
}
