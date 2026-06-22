"use client";

import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";

interface VoiceButtonProps {
  onSend: (text: string) => void;
  onSpeakingChange?: (isSpeaking: boolean) => void;
  disabled?: boolean;
}

export default function VoiceButton({
  onSend,
  onSpeakingChange,
  disabled = false,
}: VoiceButtonProps) {
  const {
    isSupported,
    isListening,
    interimTranscript,
    transcript,
    startListening,
    stopListening,
    resetTranscript,
    error,
  } = useSpeechRecognition();

  const [fallbackText, setFallbackText] = useState("");
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoldingRef = useRef(false);

  const handlePressStart = useCallback(() => {
    if (disabled) return;
    isHoldingRef.current = true;

    // Small delay to distinguish tap from hold
    holdTimerRef.current = setTimeout(() => {
      if (isHoldingRef.current) {
        startListening();
        onSpeakingChange?.(true);
        // Haptic feedback on mobile
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(30);
        }
      }
    }, 120);
  }, [disabled, startListening, onSpeakingChange]);

  const handlePressEnd = useCallback(() => {
    isHoldingRef.current = false;

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    if (isListening) {
      const finalText = stopListening();
      onSpeakingChange?.(false);

      if (finalText && finalText.trim().length > 0) {
        onSend(finalText.trim());
      }
      resetTranscript();
    }
  }, [isListening, stopListening, onSend, onSpeakingChange, resetTranscript]);

  const handleFallbackSend = useCallback(() => {
    if (fallbackText.trim()) {
      onSend(fallbackText.trim());
      setFallbackText("");
    }
  }, [fallbackText, onSend]);

  const currentPreview =
    (transcript + " " + interimTranscript).trim() || "";

  // Fallback for unsupported browsers
  if (!isSupported) {
    return (
      <div className="flex flex-col items-center gap-3 w-full px-4">
        <p className="text-xs text-[var(--muted)]">
          Voice not supported — type instead
        </p>
        <div className="flex w-full max-w-sm gap-2">
          <input
            type="text"
            value={fallbackText}
            onChange={(e) => setFallbackText(e.target.value.slice(0, 200))}
            onKeyDown={(e) => e.key === "Enter" && handleFallbackSend()}
            placeholder="Type a message..."
            maxLength={200}
            className="flex-1 bg-[rgba(255,255,255,0.06)] border border-[var(--surface-border)] 
                       rounded-full px-4 py-3 text-sm text-[var(--foreground)] 
                       placeholder:text-[var(--muted)] outline-none focus:border-[var(--ember)]
                       transition-colors"
            disabled={disabled}
          />
          <button
            onClick={handleFallbackSend}
            disabled={disabled || !fallbackText.trim()}
            className="bg-[var(--ember-dim)] border border-[rgba(255,100,0,0.35)] 
                       text-[var(--accent)] rounded-full px-5 py-3 text-sm font-medium
                       transition-all hover:bg-[rgba(255,100,0,0.26)] 
                       disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Transcript preview */}
      <AnimatePresence>
        {isListening && currentPreview && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="glass-panel px-4 py-2 max-w-[280px] text-center"
          >
            <p className="text-sm text-[var(--foreground)] leading-relaxed">
              {currentPreview}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Listening status */}
      <AnimatePresence>
        {isListening && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-xs text-[var(--ember)] font-medium"
          >
            Listening...
          </motion.p>
        )}
      </AnimatePresence>

      {/* Error message */}
      <AnimatePresence>
        {!isListening && error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-xs text-[var(--danger)] font-medium max-w-[250px] text-center"
          >
            {error === "not-allowed"
              ? "Microphone access blocked. Please enable it in browser settings."
              : error === "network"
              ? "Speech service blocked. In Brave settings, enable 'Use Google Services for speech recognition'."
              : `Microphone error: ${error}`}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Main button */}
      <div className="relative">
        {/* Pulsing ring when recording */}
        {isListening && (
          <>
            <div
              className="absolute inset-0 rounded-full border-2 border-[var(--ember)] animate-pulse-ring"
              style={{ margin: "-8px" }}
            />
            <div
              className="absolute inset-0 rounded-full border border-[var(--ember)] animate-pulse-ring"
              style={{ margin: "-4px", animationDelay: "0.5s" }}
            />
          </>
        )}

        <motion.button
          onPointerDown={handlePressStart}
          onPointerUp={handlePressEnd}
          onPointerLeave={handlePressEnd}
          onContextMenu={(e) => e.preventDefault()}
          disabled={disabled}
          whileTap={{ scale: 0.92 }}
          className={`relative w-[72px] h-[72px] rounded-full flex items-center justify-center
                     transition-all duration-200 select-none touch-none
                     ${
                       isListening
                         ? "bg-[var(--ember)] shadow-[0_0_30px_rgba(255,100,0,0.4)]"
                         : "bg-[rgba(255,255,255,0.06)] border border-[var(--surface-border)] hover:border-[var(--ember)] hover:bg-[var(--ember-dim)]"
                     }
                     disabled:opacity-30 disabled:cursor-not-allowed`}
          aria-label={isListening ? "Release to send" : "Hold to speak"}
        >
          {/* Mic icon */}
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke={isListening ? "#0c0c13" : "var(--foreground)"}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </motion.button>
      </div>

      {/* Hint text */}
      {!isListening && !disabled && (
        <p className="text-[10px] text-[var(--muted)] select-none">
          Hold to speak
        </p>
      )}
    </div>
  );
}
