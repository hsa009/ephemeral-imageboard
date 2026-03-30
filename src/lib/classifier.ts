// OpenRouter AI Classifier for auto-niche

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "meta-llama/llama-3-8b-instruct:free";

const NICHE_PROMPT = `You are the 0null Classifier. Categorize the following post into EXACTLY one of these niches: [tech, gaming, finance, politics, random]. Return ONLY the lowercase word.`;

const VALID_NICHES = ['tech', 'gaming', 'finance', 'politics', 'random'];

export async function classifyNiche(subject: string, comment: string): Promise<string> {
  // Skip if no API key
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.log('[Classifier] No API key, defaulting to random');
    return 'random';
  }

  try {
    const content = `Subject: ${subject}\n\nComment: ${comment.slice(0, 1000)}`;

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://0null.xyz',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: NICHE_PROMPT },
          { role: 'user', content }
        ],
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      console.error('[Classifier] OpenRouter error:', response.status);
      return 'random';
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content?.trim()?.toLowerCase() || '';

    // Validate result
    if (VALID_NICHES.includes(result)) {
      console.log('[Classifier] Classified as:', result);
      return result;
    }

    console.log('[Classifier] Invalid response, defaulting to random');
    return 'random';

  } catch (error) {
    console.error('[Classifier] Error:', error);
    return 'random';
  }
}
