import Pusher from "pusher";
import { NextResponse } from "next/server";

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID || "",
  key: process.env.NEXT_PUBLIC_PUSHER_APP_KEY || "",
  secret: process.env.PUSHER_SECRET || "",
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "",
  useTLS: true,
});

export async function POST(request: Request) {
  try {
    const { text } = await request.json();

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const trimmedText = text.trim().slice(0, 50);

    // Broadcast the message using Pusher on 'chat-channel' with the event 'new-bubble'
    await pusher.trigger("chat-channel", "new-bubble", {
      text: trimmedText,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error triggering Pusher event:", error);
    return NextResponse.json(
      { error: "Failed to broadcast message" },
      { status: 500 }
    );
  }
}
