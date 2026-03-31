/* eslint-disable @typescript-eslint/no-explicit-any */
import OpenAI from 'openai';

interface ClassificationResult {
  niche: string;
  rawResponse?: string;
  reasoning?: string;
  fullOutput?: string;
  latency_ms?: number;
  status?: string;
  error_msg?: string;
  fallback?: string;
}

const VALID_NICHES = ['tech', 'gaming', 'finance', 'politics', 'random'];

export async function classifyNiche(subject: string, comment: string): Promise<ClassificationResult> {
  const apiKey = process.env.GITHUB_TOKEN;

  if (!apiKey) {
    console.error("[GHOST BRAIN] ❌ NO API KEY FOUND — GITHUB_TOKEN not set. Defaulting to 'random'.");
    return { niche: 'random', status: 'error', error_msg: 'GITHUB_TOKEN not set', fallback: 'random' };
  }

  console.log("[GHOST BRAIN] ✅ GITHUB_TOKEN loaded:", apiKey.substring(0, 8) + "...");
  console.log("[GHOST BRAIN] 📥 Input — Subject:", JSON.stringify(subject), "Comment:", JSON.stringify(comment.substring(0, 100)));

  const client = new OpenAI({
    baseURL: 'https://models.inference.ai.azure.com',
    apiKey,
  });

  const startTime = Date.now();
  console.log(`[GHOST BRAIN] 📡 Connecting to GitHub Models API for subject: "${subject}"...`);

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are the classification engine for an anonymous imageboard. Categorize the user's post into exactly ONE of these niches: [tech, gaming, finance, politics, random].

politics: government, geopolitics, nations (e.g., Iran, USA), wars, elections, political figures.

gaming: video games, PC setups, consoles, loadouts, gaming culture.

tech: programming, hacking, hardware, software, dark web.

finance: crypto, markets, trading, wealth, stocks.

random: anything that does not strongly fit the above.

OUTPUT STRICTLY ONE LOWERCASE WORD. NO punctuation. NO explanations.`
        },
        {
          role: 'user',
          content: "Subject: " + subject + "\nComment: " + comment
        }
      ],
      max_tokens: 5,
      temperature: 0,
    });

    const latency = Date.now() - startTime;

    const rawOutput = response.choices[0]?.message?.content || "random";
    const finalNiche = rawOutput.toLowerCase().trim().split(' ')[0].replace(/[^a-z]/g, "");
    const niche = VALID_NICHES.includes(finalNiche) ? finalNiche : 'random';

    console.log(`[GHOST BRAIN] 🟢 Success! Latency: ${latency}ms | AI Said: "${rawOutput}" | Extracted: "${finalNiche}"`);

    return {
      niche,
      rawResponse: rawOutput,
      fullOutput: rawOutput,
      latency_ms: latency,
      status: 'success',
    };

  } catch (error: any) {
    const latency = Date.now() - startTime;
    const errorMsg = error?.message || String(error);
    console.error(`[GHOST BRAIN] 🔴 API CONNECTION FAILED after ${latency}ms:`, errorMsg);

    return {
      niche: 'random',
      status: 'error',
      error_msg: errorMsg,
      latency_ms: latency,
      fallback: 'random',
    };
  }
}
