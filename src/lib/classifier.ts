/* eslint-disable @typescript-eslint/no-explicit-any */
import OpenAI from 'openai';

interface ClassificationResult {
  niche: string;
  rawResponse?: string;
  reasoning?: string;
  fullOutput?: string;
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

    console.log("[GHOST BRAIN] Sending fast classification request...");

    const response = await client.chat.completions.create({
      model: 'google/gemini-2.0-flash-001',
      messages: [
        {
          role: 'system',
          content: "You are a 0null board-bot. RULE 1: If the text mentions Trump, Hitler, Biden, or War, the answer is 'politics'. RULE 2: Output ONLY the word: [tech, gaming, finance, politics, random]. No punctuation. No reasoning. Just the word."
        },
        {
          role: 'user',
          content: `Subject: ${subject}\nComment: ${comment}`
        }
      ],
      max_tokens: 10,
    });

    const raw = response.choices[0]?.message?.content || "random";
    const finalNiche = raw.toLowerCase().trim().replace(/[^a-z]/g, "");
    
    const niche = VALID_NICHES.includes(finalNiche) ? finalNiche : 'random';
    
    console.log("[GHOST BRAIN] Raw:", raw, "-> Final:", niche);
    
    return { 
      niche, 
      rawResponse: raw,
      fullOutput: raw
    };

  } catch (error) {
    console.error("[GHOST BRAIN] Error:", error instanceof Error ? error.message : String(error));
    return defaultResult;
  }
}