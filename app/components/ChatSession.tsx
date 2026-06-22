"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import CigaretteAnimation from "./CigaretteAnimation";
import ChatArea from "./ChatBubble";
import VoiceButton from "./VoiceButton";
import type { ChatMessage, PartnerStatus, SessionPhase } from "../hooks/usePusherSession";

const SESSION_DURATION_MS = 300_000; // 5 minutes

interface ChatSessionProps {
  userId: string;
  messages: ChatMessage[];
  partnerStatus: PartnerStatus;
  phase: SessionPhase;
  onSendMessage: (text: string) => void;
  onSpeakingChange: (isSpeaking: boolean) => void;
  onSessionEnd: () => void;
}

export default function ChatSession({
  userId,
  messages,
  partnerStatus,
  phase,
  onSendMessage,
  onSpeakingChange,
  onSessionEnd,
}: ChatSessionProps) {
  const [progress, setProgress] = useState(0);
  const [isLit, setIsLit] = useState(false);
  const [puffPower, setPuffPower] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef(0);

  // Start the cigarette burn when session begins
  useEffect(() => {
    if (phase === "ended") {
      setIsLit(false);
      return;
    }

    setIsLit(true);
    startTimeRef.current = performance.now();
    setProgress(0);

    const tick = (now: number) => {
      if (!startTimeRef.current) return;
      const elapsed = now - startTimeRef.current;
      const p = Math.min(elapsed / SESSION_DURATION_MS, 1);
      setProgress(p);

      if (p >= 1) {
        onSessionEnd();
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, onSessionEnd]);

  // Trigger puff effect when user sends a message
  const handleSend = useCallback(
    (text: string) => {
      onSendMessage(text);
      setPuffPower(0.8);
      // Decay puff
      setTimeout(() => setPuffPower(0), 600);
    },
    [onSendMessage]
  );

  // Handle speaking state changes
  const handleSpeakingChange = useCallback(
    (isSpeaking: boolean) => {
      onSpeakingChange(isSpeaking);
      if (isSpeaking) {
        setPuffPower(0.4);
      } else {
        setPuffPower(0);
      }
    },
    [onSpeakingChange]
  );

  const timeLeft = Math.max(
    0,
    Math.ceil((SESSION_DURATION_MS * (1 - progress)) / 1000)
  );
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const partnerIsSpeaking = partnerStatus === "speaking";
  const partnerDisconnected = partnerStatus === "disconnected";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-0 flex flex-col z-10"
    >
      {/* Top bar with timer and partner status */}
      <div className="flex-none flex items-center justify-between px-4 pt-3 pb-1 z-20">
        {/* Timer */}
        <div className="glass-panel px-3 py-1.5 flex items-center gap-2">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              progress < 0.8
                ? "bg-[var(--ember)]"
                : "bg-[var(--danger)] animate-pulse"
            }`}
          />
          <span className="text-xs font-mono text-[var(--foreground)] tabular-nums">
            {minutes}:{seconds.toString().padStart(2, "0")}
          </span>
        </div>

        {/* Partner status */}
        <div className="glass-panel px-3 py-1.5">
          <span className="text-xs text-[var(--muted)]">
            {partnerDisconnected ? (
              <span className="text-[var(--danger)]">Stranger left</span>
            ) : partnerIsSpeaking ? (
              <span className="text-[var(--ember)]">Stranger is speaking...</span>
            ) : (
              "Stranger connected"
            )}
          </span>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 relative flex flex-col overflow-hidden">
        {/* Cigarette animation (behind messages) */}
        <div className="absolute inset-0 z-0">
          <CigaretteAnimation
            controlled
            controlledLit={isLit}
            controlledProgress={progress}
            externalPuffPower={puffPower}
          />
        </div>

        {/* Chat messages overlay */}
        <div className="relative z-10 flex-1 flex flex-col">
          {/* Messages area (top portion) */}
          <div className="flex-1 min-h-0">
            <ChatArea
              messages={messages}
              userId={userId}
              partnerIsSpeaking={partnerIsSpeaking}
            />
          </div>
        </div>
      </div>

      {/* Voice button area (bottom) */}
      <div className="flex-none pb-6 pt-3 z-20 flex justify-center">
        <VoiceButton
          onSend={handleSend}
          onSpeakingChange={handleSpeakingChange}
          disabled={partnerDisconnected}
        />
      </div>

      {/* Partner disconnected notification */}
      <AnimatePresence>
        {partnerDisconnected && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-28 left-1/2 -translate-x-1/2 z-30
                       glass-panel px-4 py-2 text-xs text-[var(--danger)]"
          >
            The stranger has disconnected
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
