import { useQueryClient } from "@tanstack/react-query";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { useEffect, useRef } from "react";
import { BOARD_KEY } from "@/shared/hooks/use-board-query";
import { SUBTASKS_BASE_KEY } from "@/shared/hooks/use-subtasks-query";

const MUTATING_TOOLS = new Set([
  "createTask",
  "editTask",
  "deleteTask",
  "createSubtask",
  "editSubtask",
  "deleteSubtask",
]);

/**
 * Invalidates the board and subtask caches once per completed mutating tool
 * call emitted by the chat agent, so the board reflects agent-made changes.
 */
export function useChatBoardSync(messages: UIMessage[]): void {
  const queryClient = useQueryClient();
  const seenToolIds = useRef<Set<string>>(new Set());

  useEffect((): void => {
    for (const message of messages) {
      for (const part of message.parts) {
        if (!isToolUIPart(part) || part.state !== "output-available") {
          continue;
        }
        if (seenToolIds.current.has(part.toolCallId)) {
          continue;
        }
        if (MUTATING_TOOLS.has(getToolName(part))) {
          seenToolIds.current.add(part.toolCallId);
          void queryClient.invalidateQueries({ queryKey: BOARD_KEY });
          void queryClient.invalidateQueries({ queryKey: SUBTASKS_BASE_KEY });
        }
      }
    }
  }, [messages, queryClient]);
}
