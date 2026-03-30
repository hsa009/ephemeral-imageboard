// Groq AI Classifier for auto-niche

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama3-8b-8192";

const SYSTEM_PROMPT = "You are a specialized 0null data classifier. Categorize the user's post into exactly one of these niches: [tech, gaming, finance, politics, random]. Response must be ONLY the single word, lowercase, no punctuation.";

const VALID_NICHES = ['tech', 'gaming', 'finance', 'politics', 'random'];

export async function classifyNiche(subject: string, comment: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return 'random';
  }

  try {
    const content = `Subject: ${subject}\n\nComment: ${comment.slice(0, 1000)}`;

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content }
        ],
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      return 'random';
    }

    const data = await response.json();
    const niche = data.choices?.[0]?.message?.content?.trim()?.toLowerCase() || '';

    if (VALID_NICHES.includes(niche)) {
      console.log("[GROQ DEBUG]:", niche);
      return niche;
    }

    return 'random';

  } catch {
    return 'random';
  }
}