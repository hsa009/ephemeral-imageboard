// Build trigger - forced fresh deploy
// Advanced AI Classifier with Reasoning
import OpenAI from 'openai';

interface ReasoningMessage extends OpenAI.ChatCompletionMessage {
  reasoning_details?: string;
}

interface ClassificationResult {
  niche: string;
  rawResponse?: string;
  reasoning?: string;
}

const VALID_NICHES = ['tech', 'gaming', 'finance', 'politics', 'random'];

export async function classifyNiche(subject: string, comment: string): Promise<ClassificationResult> {
  const defaultResult: ClassificationResult = { niche: 'random' };
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.log("[GHOST BRAIN] No API key, defaulting to random");
    return defaultResult;
  }

  try {
    const client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey,
    });

    console.log("[GHOST BRAIN] Attempting connection to OpenRouter...");
    console.log("[GHOST BRAIN] Payload Sent:", { subject, comment });

    const response = await client.chat.completions.create({
      model: 'arcee-ai/trinity-mini:free',
      messages: [
        {
          role: 'system',
          content: "You are a one-word classifier. If the text mentions political figures (e.g., Trump, Hitler, Biden), world leaders, or elections, you MUST output 'politics'. Otherwise, choose from [tech, gaming, finance, random]. Output ONLY the word."
        },
        {
          role: 'user',
          content: `Subject: ${subject}\nComment: ${comment}`
        }
      ],
      max_tokens: 20,
      // @ts-expect-error - reasoning is not in SDK types
      reasoning: { enabled: true },
    });

    const content = response.choices?.[0]?.message?.content?.trim().toLowerCase() || '';
    
    console.log("[GHOST BRAIN] Raw AI Answer:", content);
    console.log("[GHOST BRAIN] Full Response:", JSON.stringify(response, null, 2));
    
    const message = response.choices?.[0]?.message as ReasoningMessage;
    const reasoning = message?.reasoning_details;
    if (reasoning) {
      console.log("[GHOST BRAIN] Reasoning:", reasoning);
    }

    const niche = content.replace(/[^a-z]/g, '');

    if (VALID_NICHES.includes(niche)) {
      console.log("[GHOST BRAIN] Final Niche Selected:", niche);
      return { niche, rawResponse: content, reasoning };
    }

    console.log("[GHOST BRAIN] Invalid response:", content, "-> defaulting to random");
    return { niche: 'random', rawResponse: content, reasoning };

  } catch (error) {
    console.error("[GHOST BRAIN] Connection Error:", error instanceof Error ? error.message : String(error));
    return defaultResult;
  }
}