"use client";

import { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import type { ChatMessage } from "../hooks/usePusherSession";

interface ChatBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
}

function ChatBubbleItem({ message, isOwn }: ChatBubbleProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[240px] px-3.5 py-2 rounded-2xl text-sm leading-relaxed
          ${
            isOwn
              ? "bg-[rgba(255,100,0,0.15)] border border-[rgba(255,100,0,0.2)] text-[var(--accent)] rounded-br-sm"
              : "bg-[rgba(255,255,255,0.06)] border border-[var(--surface-border)] text-[var(--foreground)] rounded-bl-sm"
          }`}
      >
        {message.text}
      </div>
    </motion.div>
  );
}

interface TypingIndicatorProps {
  visible: boolean;
}

function TypingIndicator({ visible }: TypingIndicatorProps) {
  if (!visible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="flex justify-start"
    >
      <div className="bg-[rgba(255,255,255,0.06)] border border-[var(--surface-border)] rounded-2xl rounded-bl-sm px-4 py-2.5 flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-[var(--muted)]"
            animate={{ y: [0, -4, 0] }}
            transition={{
              duration: 0.6,
              repeat: Infinity,
              delay: i * 0.15,
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}

interface ChatAreaProps {
  messages: ChatMessage[];
  userId: string;
  partnerIsSpeaking: boolean;
}

export default function ChatArea({
  messages,
  userId,
  partnerIsSpeaking,
}: ChatAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, partnerIsSpeaking]);

  return (
    <div
      ref={scrollRef}
      className="flex flex-col gap-2 overflow-y-auto px-4 py-2 max-h-full"
      style={{
        maskImage:
          "linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%)",
      }}
    >
      {messages.map((msg) => (
        <ChatBubbleItem
          key={msg.id}
          message={msg}
          isOwn={msg.senderId === userId}
        />
      ))}
      <TypingIndicator visible={partnerIsSpeaking} />
    </div>
  );
}
