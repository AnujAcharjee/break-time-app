"use client";

import { usePusherSession } from "./hooks/usePusherSession";
import LandingScreen from "./components/LandingScreen";
import SearchingOverlay from "./components/SearchingOverlay";
import ChatSession from "./components/ChatSession";
import SessionEndOverlay from "./components/SessionEndOverlay";
import CigaretteAnimation from "./components/CigaretteAnimation";
import { AnimatePresence } from "framer-motion";

export default function Home() {
  const {
    userId,
    phase,
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
  } = usePusherSession();

  return (
    <main className="relative w-full h-full min-h-screen overflow-hidden bg-[#0c0c13]">
      <AnimatePresence mode="wait">
        {phase === "idle" && (
          <div key="landing" className="relative w-full h-full min-h-screen">
            {/* Ambient unlit cigarette in the background */}
            <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
              <CigaretteAnimation
                controlled
                controlledLit={false}
                controlledProgress={0}
              />
            </div>
            <LandingScreen
              onStart={joinLobby}
              onlineCount={onlineCount}
              isConnected={isConnected}
            />
          </div>
        )}

        {phase === "searching" && (
          <div key="searching" className="relative w-full h-full min-h-screen">
            {/* Ambient unlit cigarette in the background */}
            <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
              <CigaretteAnimation
                controlled
                controlledLit={false}
                controlledProgress={0}
              />
            </div>
            <SearchingOverlay onCancel={leaveLobby} />
          </div>
        )}

        {(phase === "chatting" || phase === "ended") && (
          <div key="session" className="relative w-full h-full min-h-screen">
            <ChatSession
              userId={userId}
              messages={messages}
              partnerStatus={partnerStatus}
              phase={phase}
              onSendMessage={sendMessage}
              onSpeakingChange={sendSpeakingIndicator}
              onSessionEnd={endSession}
            />

            <AnimatePresence>
              {phase === "ended" && (
                <SessionEndOverlay
                  partnerStatus={partnerStatus}
                  onExtend={extendSession}
                  onLeave={resetSession}
                />
              )}
            </AnimatePresence>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}
