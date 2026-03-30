// Build trigger - forced fresh deploy
// Two-turn conversation classifier for forced final classification
import OpenAI from 'openai';

interface ReasoningMessage extends OpenAI.ChatCompletionMessage {
  reasoning_details?: string;
}

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
      model: 'arcee-ai/trinity-mini:free',
      messages: [
        { 
          role: 'user', 
          content: `Analyze and reason through this post. What category does it belong to? Subject: ${subject} Comment: ${comment}` 
        }
      ],
      // @ts-expect-error - reasoning not in SDK types
      reasoning: { enabled: true },
      max_tokens: 500,
    });

    const message1 = firstResponse.choices[0].message;
    const reasoning = (message1 as ReasoningMessage)?.reasoning_details || '';
    
    console.log("[GHOST BRAIN] Turn 1 Reasoning:", reasoning);
    console.log("[GHOST BRAIN] Turn 1 Content:", message1.content);

    // Turn 2: Forced final answer
    console.log("[GHOST BRAIN] Turn 2: Requesting final classification...");
    
    const finalResponse = await client.chat.completions.create({
      model: 'arcee-ai/trinity-mini:free',
      messages: [
        { 
          role: 'user', 
          content: `Analyze and reason through this post. What category does it belong to? Subject: ${subject} Comment: ${comment}` 
        },
        { 
          role: 'assistant', 
          content: message1.content || '',
          // @ts-expect-error - reasoning_details not in types
          reasoning_details: message1.reasoning_details 
        },
        { 
          role: 'user', 
          content: "Based on your reasoning, output EXACTLY one word from this list: [tech, gaming, finance, politics, random]. If it's about Trump, Hitler, or War, it must be 'politics'. Output ONLY the word, no explanation." 
        }
      ],
      max_tokens: 20,
    });

    const finalContent = finalResponse.choices[0]?.message?.content?.trim().toLowerCase() || '';
    
    console.log("[GHOST BRAIN] Turn 2 Final Answer:", finalContent);
    console.log("[GHOST BRAIN] Full Final Response:", JSON.stringify(finalResponse.choices[0], null, 2));

    // Extract valid niche
    const niche = VALID_NICHES.includes(finalContent) ? finalContent : 'random';
    
    console.log("[GHOST BRAIN] Final Niche Selected:", niche);
    
    return { 
      niche, 
      rawResponse: finalContent, 
      reasoning,
      fullOutput: reasoning + ' ' + finalContent
    };

  } catch (error) {
    console.error("[GHOST BRAIN] Connection Error:", error instanceof Error ? error.message : String(error));
    return defaultResult;
  }
}