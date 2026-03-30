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

    const response = await client.chat.completions.create({
      model: 'arcee-ai/trinity-mini:free',
      messages: [
        {
          role: 'system',
          content: "Analyze the thread content. First, reason internally about the subject matter. Then, output EXACTLY one word from this list: [tech, gaming, finance, politics, random]. If the content involves historical figures, world events, or ideology, use 'politics'."
        },
        {
          role: 'user',
          content: `Subject: ${subject}\nComment: ${comment}`
        }
      ],
      max_tokens: 20,
    });

    const content = response.choices?.[0]?.message?.content?.trim().toLowerCase() || '';
    const niche = content.replace(/[^a-z]/g, ''); // Strip punctuation

    if (VALID_NICHES.includes(niche)) {
      console.log('[OR REASONING DEBUG]:', niche);
      return niche;
    }

    console.log('[Classifier] Invalid response:', content, '-> defaulting to random');
    return 'random';

  } catch (error) {
    console.error('[Classifier] Error:', error);
    return 'random';
  }
}