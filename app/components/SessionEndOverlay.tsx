"use client";

import { motion } from "framer-motion";
import type { PartnerStatus } from "../hooks/usePusherSession";

interface SessionEndOverlayProps {
  partnerStatus: PartnerStatus;
  onExtend: () => void;
  onLeave: () => void;
}

export default function SessionEndOverlay({
  partnerStatus,
  onExtend,
  onLeave,
}: SessionEndOverlayProps) {
  const partnerLeft = partnerStatus === "disconnected";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-0 flex items-center justify-center z-40"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[rgba(12,12,19,0.9)] backdrop-blur-lg" />

      {/* Panel */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
        className="relative glass-panel px-8 py-8 flex flex-col items-center gap-6 max-w-[320px] mx-4"
      >
        {/* Smoke emoji */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-4xl"
        >
          {partnerLeft ? "👋" : "🚬"}
        </motion.div>

        {/* Message */}
        <div className="flex flex-col items-center gap-1.5">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">
            {partnerLeft
              ? "They walked away"
              : "Your smoke break is over"}
          </h2>
          <p className="text-sm text-[var(--muted)] text-center">
            {partnerLeft
              ? "The stranger has left the conversation."
              : "The cigarette has burned out. Time's up."}
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col items-center gap-3 w-full">
          {!partnerLeft && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={onExtend}
              className="w-full py-3 rounded-xl font-medium text-sm
                       bg-gradient-to-r from-[#ff6a00] to-[#ff4500]
                       text-white shadow-[0_4px_16px_rgba(255,100,0,0.25)]
                       hover:shadow-[0_6px_24px_rgba(255,100,0,0.35)]
                       transition-all duration-200"
            >
              🔥 Light another
            </motion.button>
          )}

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={onLeave}
            className="w-full py-3 rounded-xl font-medium text-sm
                     text-[var(--muted)] border border-[var(--surface-border)]
                     hover:text-[var(--foreground)] hover:border-[rgba(255,255,255,0.15)]
                     transition-all duration-200"
          >
            Walk away
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
