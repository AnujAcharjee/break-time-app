"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PusherClient from "pusher-js";
import { v4 as uuidv4 } from "uuid";

export interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  timestamp: number;
}

export type PartnerStatus = "connected" | "speaking" | "disconnected" | null;
export type SessionPhase = "idle" | "searching" | "chatting" | "ended";

interface UsePusherSessionReturn {
  userId: string;
  phase: SessionPhase;
  sessionId: string | null;
  messages: ChatMessage[];
  partnerStatus: PartnerStatus;
  onlineCount: number;
  isConnected: boolean;
  joinLobby: () => void;
  leaveLobby: () => void;
  sendMessage: (text: string) => void;
  sendSpeakingIndicator: (isSpeaking: boolean) => void;
  endSession: () => void;
  resetSession: () => void;
  extendSession: () => void;
}

export function usePusherSession(): UsePusherSessionReturn {
  const [userId] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem("smoke-break-user-id");
      if (stored) return stored;
      const id = `user-${uuidv4().slice(0, 8)}`;
      sessionStorage.setItem("smoke-break-user-id", id);
      return id;
    }
    return `user-${uuidv4().slice(0, 8)}`;
  });

  const [phase, setPhase] = useState<SessionPhase>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [partnerStatus, setPartnerStatus] = useState<PartnerStatus>(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);

  const pusherRef = useRef<PusherClient | null>(null);
  const lobbyChannelRef = useRef<any>(null);
  const sessionChannelRef = useRef<any>(null);
  const matchPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const partnerIdRef = useRef<string | null>(null);

  // Initialize Pusher
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_APP_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!key || !cluster) return;

    const pusher = new PusherClient(key, {
      cluster,
      channelAuthorization: {
        endpoint: "/api/pusher/auth",
        transport: "ajax",
        headers: {
          "x-user-id": userId,
        },
      },
    });

    pusher.connection.bind("connected", () => setIsConnected(true));
    pusher.connection.bind("disconnected", () => setIsConnected(false));
    pusher.connection.bind("error", () => setIsConnected(false));

    pusherRef.current = pusher;

    return () => {
      pusher.disconnect();
      pusherRef.current = null;
    };
  }, [userId]);

  // Join the lobby presence channel and start polling for matches
  const joinLobby = useCallback(() => {
    const pusher = pusherRef.current;
    if (!pusher) return;

    setPhase("searching");
    setMessages([]);
    setPartnerStatus(null);

    // Subscribe to presence lobby
    const lobbyChannel = pusher.subscribe("presence-lobby");
    lobbyChannelRef.current = lobbyChannel;

    lobbyChannel.bind("pusher:subscription_succeeded", (members: any) => {
      setOnlineCount(members.count);
    });

    lobbyChannel.bind("pusher:member_added", (member: any) => {
      setOnlineCount((prev) => prev + 1);
    });

    lobbyChannel.bind("pusher:member_removed", (member: any) => {
      setOnlineCount((prev) => Math.max(0, prev - 1));
    });

    // Listen for match events
    lobbyChannel.bind(
      "matched",
      (data: { sessionId: string; users: string[] }) => {
        if (data.users.includes(userId)) {
          const partnerId = data.users.find((id) => id !== userId) || null;
          partnerIdRef.current = partnerId;
          joinSession(data.sessionId);
        }
      }
    );

    // Start polling the match endpoint
    const poll = () => {
      fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.status === "matched" && data.sessionId) {
            partnerIdRef.current = data.partnerId;
            joinSession(data.sessionId);
          }
        })
        .catch(console.error);
    };

    poll(); // Initial attempt
    matchPollRef.current = setInterval(poll, 3000);
  }, [userId]);

  // Join a private session channel
  const joinSession = useCallback(
    (sid: string) => {
      const pusher = pusherRef.current;
      if (!pusher) return;

      // Stop polling
      if (matchPollRef.current) {
        clearInterval(matchPollRef.current);
        matchPollRef.current = null;
      }

      // Leave lobby
      if (lobbyChannelRef.current) {
        pusher.unsubscribe("presence-lobby");
        lobbyChannelRef.current = null;
      }

      setSessionId(sid);
      setPhase("chatting");

      const channel = pusher.subscribe(`presence-session-${sid}`);
      sessionChannelRef.current = channel;

      // Listen for when partner disconnects or closes tab
      channel.bind("pusher:member_removed", (member: any) => {
        if (member.id !== userId) {
          setPartnerStatus("disconnected");
        }
      });

      // Listen for messages
      channel.bind(
        "new-message",
        (data: { text: string; senderId: string; id: string; timestamp: number }) => {
          if (data.senderId !== userId) {
            setMessages((prev) => [
              ...prev,
              {
                id: data.id,
                text: data.text,
                senderId: data.senderId,
                timestamp: data.timestamp,
              },
            ]);
          }
        }
      );

      // Listen for speaking indicators (client events)
      channel.bind(
        "client-speaking",
        (data: { userId: string; isSpeaking: boolean }) => {
          if (data.userId !== userId) {
            setPartnerStatus(data.isSpeaking ? "speaking" : "connected");
          }
        }
      );

      // Listen for partner leaving
      channel.bind("client-leave", (data: { userId: string }) => {
        if (data.userId !== userId) {
          setPartnerStatus("disconnected");
        }
      });

      // Listen for session extension
      channel.bind("client-extend", (data: { userId: string }) => {
        if (data.userId !== userId) {
          setPhase("chatting");
        }
      });

      setPartnerStatus("connected");
    },
    [userId]
  );

  // Leave the lobby
  const leaveLobby = useCallback(() => {
    const pusher = pusherRef.current;
    if (!pusher) return;

    // Cancel match polling
    if (matchPollRef.current) {
      clearInterval(matchPollRef.current);
      matchPollRef.current = null;
    }

    // Cancel on server
    fetch("/api/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action: "cancel" }),
    }).catch(console.error);

    if (lobbyChannelRef.current) {
      pusher.unsubscribe("presence-lobby");
      lobbyChannelRef.current = null;
    }

    setPhase("idle");
  }, [userId]);

  // Send a chat message
  const sendMessage = useCallback(
    (text: string) => {
      if (!sessionId || !text.trim()) return;

      const msg: ChatMessage = {
        id: uuidv4(),
        text: text.trim(),
        senderId: userId,
        timestamp: Date.now(),
      };

      // Add locally
      setMessages((prev) => [...prev, msg]);

      // Send via API
      fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: msg.text,
          sessionId,
          senderId: userId,
          id: msg.id,
          timestamp: msg.timestamp,
        }),
      }).catch(console.error);
    },
    [sessionId, userId]
  );

  // Send speaking indicator (client event)
  const sendSpeakingIndicator = useCallback(
    (isSpeaking: boolean) => {
      const channel = sessionChannelRef.current;
      if (!channel) return;
      try {
        channel.trigger("client-speaking", { userId, isSpeaking });
      } catch {
        // Client events may fail if not subscribed yet
      }
    },
    [userId]
  );

  // End the session
  const endSession = useCallback(() => {
    setPhase("ended");
  }, []);

  // Reset to idle state for a new session
  const resetSession = useCallback(() => {
    const pusher = pusherRef.current;
    const channel = sessionChannelRef.current;

    if (channel) {
      try {
        channel.trigger("client-leave", { userId });
      } catch {
        // Ignore
      }
    }

    if (pusher && sessionId) {
      pusher.unsubscribe(`presence-session-${sessionId}`);
      sessionChannelRef.current = null;
    }

    setPhase("idle");
    setSessionId(null);
    setMessages([]);
    setPartnerStatus(null);
    partnerIdRef.current = null;
  }, [sessionId, userId]);

  // Extend the session with another cigarette
  const extendSession = useCallback(() => {
    const channel = sessionChannelRef.current;
    if (channel) {
      try {
        channel.trigger("client-extend", { userId });
      } catch (err) {
        console.error("Failed to trigger extend client event:", err);
      }
    }
    setPhase("chatting");
  }, [userId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (matchPollRef.current) clearInterval(matchPollRef.current);
    };
  }, []);

  return {
    userId,
    phase,
    sessionId,
    messages,
    partnerStatus,
    onlineCount,
    isConnected,
    joinLobby,
    leaveLobby,
    sendMessage,
    sendSpeakingIndicator,
    endSession,
    resetSession,
    extendSession,
  };
}
