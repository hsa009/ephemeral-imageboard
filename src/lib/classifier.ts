// Build trigger - forced fresh deploy
// Advanced AI Classifier with Reasoning
import OpenAI from 'openai';

const VALID_NICHES = ['tech', 'gaming', 'finance', 'politics', 'random'];

export async function classifyNiche(subject: string, comment: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.log("[GHOST BRAIN] No API key, defaulting to random");
    return 'random';
  }

  try {
    const client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey,
    });

    console.log("[GHOST BRAIN] Attempting connection to OpenRouter...");
    console.log("[GHOST BRAIN] Payload Sent:", { subject, comment });

    // @ts-expect-error - reasoning may not be in types
    const response = await client.chat.completions.create({
      model: 'arcee-ai/trinity-mini:free',
      messages: [
        {
          role: 'system',
          content: "You are a 0null classifier. Keywords: [Trump, Hitler, Biden, Election, War, Politics] MUST result in the niche 'politics'. Reason through the context first, then output ONLY the lowercase word: tech, gaming, finance, politics, or random."
        },
        {
          role: 'user',
          content: `Subject: ${subject}\nComment: ${comment}`
        }
      ],
      max_tokens: 20,
      // @ts-expect-error - reasoning may not be in types
      reasoning: { enabled: true },
    });

    const content = response.choices?.[0]?.message?.content?.trim().toLowerCase() || '';
    
    console.log("[GHOST BRAIN] Raw AI Answer:", content);
    console.log("[GHOST BRAIN] Full Response:", JSON.stringify(response, null, 2));
    
    // @ts-expect-error - reasoning_details may not be in types
    const reasoning = response.choices?.[0]?.message?.reasoning_details;
    if (reasoning) {
      console.log("[GHOST BRAIN] Reasoning:", reasoning);
    }

    const niche = content.replace(/[^a-z]/g, '');

    if (VALID_NICHES.includes(niche)) {
      console.log("[GHOST BRAIN] Final Niche Selected:", niche);
      return niche;
    }

    console.log("[GHOST BRAIN] Invalid response:", content, "-> defaulting to random");
    return 'random';

  } catch (error) {
    console.error("[GHOST BRAIN] Connection Error:", error instanceof Error ? error.message : String(error));
    return 'random';
  }
}
