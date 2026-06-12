import type { UIMessage } from "ai";
import { z } from "zod";
import { logger } from "@/shared/lib/logger";
import { streamChat } from "@/use-cases/chat-agent";

const bodySchema = z.object({ messages: z.array(z.unknown()) });

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { ok: false, error: "Invalid request body" },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "Invalid request body" },
      { status: 400 },
    );
  }

  try {
    const result = await streamChat(parsed.data.messages as UIMessage[]);
    return result.toUIMessageStreamResponse({
      onError: (error): string => {
        logger.error({ error }, "Chat stream error");
        return "The assistant failed to respond. Try again.";
      },
    });
  } catch (error) {
    // convertToModelMessages throws here on structurally-invalid UI messages.
    logger.error({ error }, "Chat request failed");
    return Response.json(
      { ok: false, error: "The assistant failed to respond. Try again." },
      { status: 400 },
    );
  }
}
