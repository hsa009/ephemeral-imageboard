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

    console.log("[GHOST BRAIN] Attempting connection to OpenRouter...");
    console.log("[GHOST BRAIN] Payload Sent:", { subject, comment });

    const response = await client.chat.completions.create({
      model: 'arcee-ai/trinity-mini:free',
      messages: [
        {
          role: 'system',
          content: "If it involves Trump, Hitler, Biden, or world leaders/politics/war, say 'politics'. Otherwise choose one word: tech, gaming, finance, or random."
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

    const content = response.choices?.[0]?.message?.content || '';
    
    // @ts-expect-error - reasoning_details not in types
    const reasoning = response.choices?.[0]?.message?.reasoning_details || '';
    
    console.log("[GHOST BRAIN] Content:", content);
    console.log("[GHOST BRAIN] Reasoning:", reasoning);
    
    // Merge content and reasoning, then search for keywords
    const fullOutput = (content + ' ' + JSON.stringify(reasoning)).toLowerCase();
    console.log("[GHOST BRAIN] Full Output:", fullOutput);
    
    // Simple keyword extraction - prioritize politics
    let niche = 'random';
    if (fullOutput.includes('politics')) niche = 'politics';
    else if (fullOutput.includes('tech')) niche = 'tech';
    else if (fullOutput.includes('gaming')) niche = 'gaming';
    else if (fullOutput.includes('finance')) niche = 'finance';
    
    console.log("[GHOST BRAIN] Final Niche:", niche);

    return { niche, rawResponse: content, reasoning, fullOutput };

  } catch (error) {
    console.error("[GHOST BRAIN] Connection Error:", error instanceof Error ? error.message : String(error));
    return defaultResult;
  }
}