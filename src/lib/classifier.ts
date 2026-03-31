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
      model: 'meta-llama/llama-3.1-8b-instruct:free',
      messages: [
        {
          role: 'system',
          content: "You are a terminal-speed classifier for 0null. RULE: If Trump, Hitler, or War is mentioned, the answer is 'politics'. TASK: Output ONLY the lowercase word: [tech, gaming, finance, politics, random]. No punctuation, no explanations. Just the word."
        },
        {
          role: 'user',
          content: `Subject: ${subject}\nComment: ${comment}`
        }
      ],
      max_tokens: 10,
    });

    const content = response.choices?.[0]?.message?.content?.trim().toLowerCase() || '';
    
    console.log("[GHOST BRAIN] Raw Response:", content);

    // Extract the word and validate
    const wordMatch = content.match(/^(tech|gaming|finance|politics|random)$/);
    const niche = wordMatch ? wordMatch[1] : 'random';
    
    console.log("[GHOST BRAIN] Final Niche:", niche);
    
    return { 
      niche, 
      rawResponse: content,
      fullOutput: content
    };

  } catch (error) {
    console.error("[GHOST BRAIN] Error:", error instanceof Error ? error.message : String(error));
    return defaultResult;
  }
}