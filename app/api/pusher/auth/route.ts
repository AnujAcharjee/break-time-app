import Pusher from "pusher";
import { NextRequest, NextResponse } from "next/server";

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID || "",
  key: process.env.NEXT_PUBLIC_PUSHER_APP_KEY || "",
  secret: process.env.PUSHER_SECRET || "",
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "",
  useTLS: true,
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const params = new URLSearchParams(body);
    const socketId = params.get("socket_id");
    const channelName = params.get("channel_name");

    if (!socketId || !channelName) {
      return NextResponse.json(
        { error: "Missing socket_id or channel_name" },
        { status: 400 }
      );
    }

    // Get anonymous user ID from custom header
    const userId = req.headers.get("x-user-id") || `anon-${Date.now()}`;

    // Presence channels need user data
    if (channelName.startsWith("presence-")) {
      const presenceData = {
        user_id: userId,
        user_info: {
          joinedAt: Date.now(),
        },
      };

      const authResponse = pusher.authorizeChannel(
        socketId,
        channelName,
        presenceData
      );
      return NextResponse.json(authResponse);
    }

    // Private channels just need auth
    if (channelName.startsWith("private-")) {
      const authResponse = pusher.authorizeChannel(socketId, channelName);
      return NextResponse.json(authResponse);
    }

    return NextResponse.json(
      { error: "Invalid channel type" },
      { status: 403 }
    );
  } catch (error) {
    console.error("Pusher auth error:", error);
    return NextResponse.json(
      { error: "Authorization failed" },
      { status: 500 }
    );
  }
}
