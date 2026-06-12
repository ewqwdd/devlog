import {
  convertToModelMessages,
  type StreamTextResult,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { getChatModel } from "@/shared/infra/llm";
import { SYSTEM_PROMPT } from "@/use-cases/chat-agent/system-prompt";
import { chatTools } from "@/use-cases/chat-agent/tools";

// 10 steps is the runaway guard for the multi-step tool loop.
export async function streamChat(
  uiMessages: UIMessage[],
): Promise<StreamTextResult<typeof chatTools, never>> {
  const model = await getChatModel();
  return streamText({
    model,
    system: SYSTEM_PROMPT,
    tools: chatTools,
    messages: convertToModelMessages(uiMessages),
    stopWhen: stepCountIs(10),
  });
}
