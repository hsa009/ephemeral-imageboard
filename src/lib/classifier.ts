// Advanced AI Classifier with Reasoning
import OpenAI from 'openai';

const VALID_NICHES = ['tech', 'gaming', 'finance', 'politics', 'random'];

export async function classifyNiche(subject: string, comment: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.log('[Classifier] No OPENROUTER_API_KEY, defaulting to random');
    return 'random';
  }

  try {
    const client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey,
    });

    console.log("[AI DEBUG] Attempting connection to OpenRouter...");
    console.log("[AI DEBUG] Payload Subject:", subject);
    console.log("[AI DEBUG] Payload Comment:", comment);

    const response = await client.chat.completions.create({
      model: 'arcee-ai/trinity-mini:free',
      messages: [
        {
          role: 'system',
          content: "You are a classification engine. Context: Users like 'Trump', 'Hitler', 'Biden', 'Elections', or 'War' MUST be categorized as 'politics'. Do not be neutral. If it involves a historical or current political leader, the answer is 'politics'. Output ONLY the single word from: [tech, gaming, finance, politics, random]."
        },
        {
          role: 'user',
          content: `Subject: ${subject}\nComment: ${comment}`
        }
      ],
      max_tokens: 20,
    });

    const data = response as any;
    console.log("[AI DEBUG] Raw API Response:", JSON.stringify(data, null, 2));
    if (data.reasoning_details) console.log("[AI DEBUG] Reasoning:", data.reasoning_details);

    const content = response.choices?.[0]?.message?.content?.trim().toLowerCase() || '';
    const niche = content.replace(/[^a-z]/g, ''); // Strip punctuation

    if (VALID_NICHES.includes(niche)) {
      console.log('[OR REASONING DEBUG]:', niche);
      console.log("[AI SUCCESS] Final Niche Selected:", niche);
      return niche;
    }

    console.log('[Classifier] Invalid response:', content, '-> defaulting to random');
    return 'random';

  } catch (error: any) {
    console.error("[AI ERROR] Classification failed:", error.message || error);
    return 'random';
  }
}
