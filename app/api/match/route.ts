import Pusher from "pusher";
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID || "",
  key: process.env.NEXT_PUBLIC_PUSHER_APP_KEY || "",
  secret: process.env.PUSHER_SECRET || "",
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "",
  useTLS: true,
});

// Simple in-memory queue for waiting users
// In production, use Redis or a database
const waitingQueue: Array<{
  userId: string;
  timestamp: number;
}> = [];

// Clean stale entries older than 30 seconds
function cleanQueue() {
  const now = Date.now();
  while (waitingQueue.length > 0 && now - waitingQueue[0].timestamp > 30000) {
    waitingQueue.shift();
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, action } = await req.json();

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    // User wants to cancel searching
    if (action === "cancel") {
      const idx = waitingQueue.findIndex((w) => w.userId === userId);
      if (idx !== -1) waitingQueue.splice(idx, 1);
      return NextResponse.json({ status: "cancelled" });
    }

    cleanQueue();

    // Don't add duplicates
    if (waitingQueue.some((w) => w.userId === userId)) {
      return NextResponse.json({ status: "waiting" });
    }

    // Check if there's someone waiting to be matched
    if (waitingQueue.length > 0) {
      const partner = waitingQueue.shift()!;
      const sessionId = uuidv4();

      // Notify both users about the match via Pusher
      await pusher.trigger("presence-lobby", "matched", {
        sessionId,
        users: [partner.userId, userId],
      });

      return NextResponse.json({
        status: "matched",
        sessionId,
        partnerId: partner.userId,
      });
    }

    // No one waiting — add this user to the queue
    waitingQueue.push({ userId, timestamp: Date.now() });

    return NextResponse.json({ status: "waiting" });
  } catch (error) {
    console.error("Match error:", error);
    return NextResponse.json(
      { error: "Matching failed" },
      { status: 500 }
    );
  }
}
