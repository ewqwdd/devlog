import type React from "react";
import { Board } from "@/app/_components/board";
import { ChatPanel } from "@/app/_components/chat/chat-panel";

export default function Page(): React.JSX.Element {
  return (
    <div className="flex h-svh">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <Board />
      </div>
      <ChatPanel />
    </div>
  );
}
