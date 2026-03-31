// Build trigger - forced fresh deploy
// Two-turn conversation classifier for forced final classification
import OpenAI from 'openai';
/* eslint-disable @typescript-eslint/no-explicit-any */

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

    console.log("[GHOST BRAIN] Turn 1: Sending for reasoning analysis...");
    console.log("[GHOST BRAIN] Payload:", { subject, comment });

    // Turn 1: Initial reasoning call
    const firstResponse = await client.chat.completions.create({
      model: 'qwen/qwen3.6-plus-preview:free',
      messages: [
        { 
          role: 'user', 
          content: `Analyze this post and reason through which niche it belongs to: [tech, gaming, finance, politics, random]. If it mentions Trump, Hitler, or War, it is politics. Subject: ${subject} Comment: ${comment}` 
        }
      ],
      // @ts-expect-error - reasoning not in SDK types
      reasoning: { enabled: true },
      max_tokens: 500,
    });

    const message1 = firstResponse.choices[0].message;
    const rawReasoning = (message1 as any).reasoning_details;
    let reasoningText = '';
    
    if (rawReasoning) {
      if (typeof rawReasoning === 'string') {
        reasoningText = rawReasoning;
      } else if (Array.isArray(rawReasoning)) {
        reasoningText = rawReasoning.map((r: any) => r.text || r.reasoning || JSON.stringify(r)).join(' ');
      } else if (typeof rawReasoning === 'object') {
        reasoningText = rawReasoning.text || rawReasoning.reasoning || rawReasoning.content || JSON.stringify(rawReasoning);
      }
    }
    
    console.log("[GHOST BRAIN] Turn 1 Reasoning:", reasoningText);
    console.log("[GHOST BRAIN] Turn 1 Content:", message1.content);

    // Turn 2: Forced final answer
    console.log("[GHOST BRAIN] Turn 2: Requesting final classification...");
    
    const finalResponse = await client.chat.completions.create({
      model: 'qwen/qwen3.6-plus-preview:free',
      messages: [
        { 
          role: 'user', 
          content: `Analyze this post and reason through which niche it belongs to: [tech, gaming, finance, politics, random]. If it mentions Trump, Hitler, or War, it is politics. Subject: ${subject} Comment: ${comment}` 
        },
        { 
          role: 'assistant', 
          content: message1.content || '',
          // @ts-expect-error - reasoning_details not in types
          reasoning_details: message1.reasoning_details 
        },
        { 
          role: 'user', 
          content: "Are you sure? Think carefully. Now output ONLY the final lowercase word inside double brackets, like this: [[politics]]." 
        }
      ],
      max_tokens: 20,
    });

    const finalContent = finalResponse.choices[0]?.message?.content || '';
    
    // Extract from double brackets [[word]]
    const match = finalContent.match(/\[\[(tech|gaming|finance|politics|random)\]\]/i);
    const niche = match ? match[1].toLowerCase() : 'random';
    
    console.log("[GHOST BRAIN] Turn 2 Response:", finalContent);
    console.log("[GHOST BRAIN] Extracted Niche:", niche);
    
    return { 
      niche, 
      rawResponse: finalContent, 
      reasoning: reasoningText,
      fullOutput: reasoningText + ' ' + finalContent
    };

  } catch (error) {
    console.error("[GHOST BRAIN] Connection Error:", error instanceof Error ? error.message : String(error));
    return defaultResult;
  }
}