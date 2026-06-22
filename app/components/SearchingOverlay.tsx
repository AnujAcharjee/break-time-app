"use client";

import { motion } from "framer-motion";

interface SearchingOverlayProps {
  onCancel: () => void;
}

export default function SearchingOverlay({ onCancel }: SearchingOverlayProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="fixed inset-0 flex flex-col items-center justify-center z-30"
    >
      {/* Backdrop blur */}
      <div className="absolute inset-0 bg-[rgba(12,12,19,0.85)] backdrop-blur-md" />

      {/* Content */}
      <div className="relative flex flex-col items-center gap-8">
        {/* Animated search indicator */}
        <div className="relative w-20 h-20 flex items-center justify-center">
          {/* Outer ring */}
          <motion.div
            className="absolute inset-0 rounded-full border border-[var(--ember)]"
            animate={{ scale: [1, 1.6, 1.6], opacity: [0.5, 0, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
          />
          {/* Middle ring */}
          <motion.div
            className="absolute inset-0 rounded-full border border-[var(--ember)]"
            animate={{ scale: [1, 1.4, 1.4], opacity: [0.4, 0, 0] }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeOut",
              delay: 0.5,
            }}
          />
          {/* Core dot */}
          <motion.div
            className="w-3 h-3 rounded-full bg-[var(--ember)]"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        {/* Text */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col items-center gap-2"
        >
          <p className="text-lg font-medium text-[var(--foreground)]">
            Looking for someone
          </p>
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-[var(--muted)]"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  delay: i * 0.2,
                }}
              />
            ))}
          </div>
        </motion.div>

        {/* Cancel button */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          onClick={onCancel}
          whileTap={{ scale: 0.95 }}
          className="px-6 py-2.5 rounded-full text-sm text-[var(--muted)]
                     border border-[var(--surface-border)]
                     hover:border-[rgba(255,255,255,0.15)] hover:text-[var(--foreground)]
                     transition-all duration-200"
        >
          Cancel
        </motion.button>
      </div>
    </motion.div>
  );
}
