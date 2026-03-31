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
  const apiKey = process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    console.error("[GHOST BRAIN] ❌ NO API KEY FOUND — checked GROQ_API_KEY and OPENROUTER_API_KEY. Defaulting to 'random'.");
    return defaultResult;
  }

  console.log("[GHOST BRAIN] ✅ API Key loaded:", apiKey.substring(0, 8) + "...");
  console.log("[GHOST BRAIN] 📥 Input — Subject:", JSON.stringify(subject), "Comment:", JSON.stringify(comment.substring(0, 100)));

  try {
    const client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey,
    });

    const model = 'meta-llama/llama-3.1-8b-instruct';
    console.log("[GHOST BRAIN] 🔌 Connecting to OpenRouter (" + model + ")...");

    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: [
            "You are a text classifier. Output exactly ONE word.",
            "Rules:",
            "- politics: Trump, Hitler, Biden, Harris, elections, war, geopolitics, government, democracy, voting, congress, senate, president, revolution",
            "- finance: crypto, bitcoin, solana, trading, gold, stocks, markets, investing, economy, inflation",
            "- gaming: roblox, fortnite, minecraft, xbox, playstation, nintendo, steam, esports, FPS, RPG, MMO, consoles",
            "- tech: coding, python, javascript, hacking, hardware, software, AI, cybersecurity, linux, programming, developer, API",
            "- random: does not match any above",
            "",
            "Output ONLY one lowercase word: tech, gaming, finance, politics, or random.",
            "No punctuation. No explanation. No reasoning."
          ].join("\n")
        },
        {
          role: 'user',
          content: "Subject: " + subject + "\nComment: " + comment
        }
      ],
      max_tokens: 5,
      temperature: 0,
    });

    console.log("[GHOST BRAIN] ✅ API connection successful. Response received.");
    console.log("[GHOST BRAIN] 🔍 Full response object:", JSON.stringify(response, null, 2));

    const choice = response.choices?.[0];
    console.log("[GHOST BRAIN] 🔍 Choice[0]:", JSON.stringify(choice, null, 2));

    const rawContent = choice?.message?.content;
    console.log("[GHOST BRAIN] 🔍 Raw content type:", typeof rawContent, "| Value:", JSON.stringify(rawContent));

    if (rawContent === null || rawContent === undefined) {
      console.error("[GHOST BRAIN] ❌ Content is null/undefined. Finish reason:", choice?.finish_reason, "| Defaulting to 'random'.");
      return { niche: 'random', rawResponse: String(rawContent), fullOutput: String(rawContent) };
    }

    if (typeof rawContent !== 'string') {
      console.error("[GHOST BRAIN] ❌ Content is not a string, it's:", typeof rawContent, "| Value:", JSON.stringify(rawContent));
      return { niche: 'random', rawResponse: String(rawContent), fullOutput: String(rawContent) };
    }

    const rawOutput = rawContent;
    const finalNiche = rawOutput.toLowerCase().trim().split(' ')[0].replace(/[^a-z]/g, "");
    const niche = VALID_NICHES.includes(finalNiche) ? finalNiche : 'random';

    console.log("[GHOST BRAIN] 🧠 Extraction steps:");
    console.log("[GHOST BRAIN]    rawOutput:", JSON.stringify(rawOutput));
    console.log("[GHOST BRAIN]    toLowerCase+trim+split[0]:", JSON.stringify(rawOutput.toLowerCase().trim().split(' ')[0]));
    console.log("[GHOST BRAIN]    after regex:", JSON.stringify(finalNiche));
    console.log("[GHOST BRAIN]    isValid:", VALID_NICHES.includes(finalNiche), "| Final niche:", niche);

    return {
      niche,
      rawResponse: rawOutput,
      fullOutput: rawOutput
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[GHOST BRAIN] ❌ API call FAILED:", errorMsg);
    if (error instanceof Error && 'status' in error) {
      console.error("[GHOST BRAIN] ❌ HTTP Status:", (error as any).status);
    }
    console.error("[GHOST BRAIN] ❌ Defaulting to 'random'.");
    return defaultResult;
  }
}
