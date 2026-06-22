"use client";

import { motion } from "framer-motion";

interface LandingScreenProps {
  onStart: () => void;
  onlineCount: number;
  isConnected: boolean;
}

export default function LandingScreen({
  onStart,
  onlineCount,
  isConnected,
}: LandingScreenProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
      className="fixed inset-0 flex flex-col items-center justify-center z-20"
    >
      {/* Atmospheric background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(255,80,0,0.06) 0%, transparent 70%)",
          }}
        />
      </div>

      {/* Content */}
      <div className="relative flex flex-col items-center gap-8 px-6">
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.7 }}
          className="flex flex-col items-center gap-3"
        >
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-center">
            <span className="text-[var(--foreground)]">Smoke</span>{" "}
            <span
              className="text-transparent bg-clip-text"
              style={{
                backgroundImage:
                  "linear-gradient(135deg, #ff8c42, #ff6a00, #ff4500)",
              }}
            >
              Break
            </span>
          </h1>
          <p className="text-sm text-[var(--muted)] text-center max-w-[260px] leading-relaxed">
            Chat with a stranger while the cigarette lasts.
            Voice only. Anonymous.
          </p>
        </motion.div>

        {/* CTA Button */}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={onStart}
          disabled={!isConnected}
          className="relative group px-8 py-4 rounded-full font-medium text-base
                     bg-gradient-to-r from-[#ff6a00] to-[#ff4500]
                     text-white shadow-[0_4px_20px_rgba(255,100,0,0.3)]
                     hover:shadow-[0_6px_30px_rgba(255,100,0,0.45)]
                     transition-all duration-300
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {/* Button glow */}
          <div
            className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{
              background:
                "radial-gradient(circle at center, rgba(255,100,0,0.15) 0%, transparent 70%)",
              margin: "-10px",
            }}
          />
          <span className="relative z-10 flex items-center gap-2">
            <span className="text-lg">🚬</span>
            Light up
          </span>
        </motion.button>

        {/* Online count */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="flex items-center gap-2 text-xs text-[var(--muted)]"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isConnected ? "bg-green-400" : "bg-red-400"
            }`}
          />
          {isConnected ? (
            <span>
              {onlineCount > 0
                ? `${onlineCount} online`
                : "Connected"}
            </span>
          ) : (
            <span>Connecting...</span>
          )}
        </motion.div>
      </div>

      {/* Bottom credits */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.0, duration: 0.5 }}
        className="absolute bottom-6 text-[10px] text-[rgba(255,255,255,0.15)] select-none"
      >
        Anonymous · No sign-up · Voice only
      </motion.p>
    </motion.div>
  );
}
