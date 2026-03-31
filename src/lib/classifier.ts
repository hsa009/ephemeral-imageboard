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

    console.log("[GHOST BRAIN] 🔌 Connecting to OpenRouter (stepfun/step-3.5-flash:free) with reasoning...");

    const apiResponse = await client.chat.completions.create({
      model: 'stepfun/step-3.5-flash:free',
      messages: [
        {
          role: 'user',
          content: `Classify the following text into EXACTLY ONE category. Output ONLY a single lowercase word, nothing else.

CATEGORIES AND KEYWORDS:
- politics: Trump, Hitler, Biden, Harris, elections, war, geopolitics, world leaders, government, democracy, voting, congress, senate, president, prime minister, dictatorship, fascism, communism, socialism, revolution, coup, election
- finance: crypto, bitcoin, BTC, solana, trading, gold, stocks, markets, investing, wall street, economy, inflation, interest rates, forex, bonds, dividends, portfolio, bull market, bear market
- gaming: roblox, deadline, loadouts, gaming, consoles, FPS, fortnite, minecraft, xbox, playstation, nintendo, steam, esports, RPG, MMO, COD, battlefield, halo, zelda, GTA
- tech: coding, python, javascript, hacking, hardware, dark web, software, AI, machine learning, cybersecurity, linux, windows, mac, programming, developer, API, database, cloud, blockchain, neural network
- random: anything that does not clearly match the above four categories

Text to classify:
Subject: ${subject}
Comment: ${comment}

Remember: output EXACTLY ONE lowercase word from [tech, gaming, finance, politics, random]. No explanation. No punctuation. No reasoning.`
        }
      ],
      max_tokens: 200,
      reasoning: { enabled: true },
    } as any);

    console.log("[GHOST BRAIN] ✅ API connection successful. Response received.");
    console.log("[GHOST BRAIN] 🔍 Full response object:", JSON.stringify(apiResponse, null, 2));

    const choice = apiResponse.choices?.[0];
    console.log("[GHOST BRAIN] 🔍 Choice[0]:", JSON.stringify(choice, null, 2));

    type ORChatMessage = (typeof apiResponse)['choices'][number]['message'] & {
      reasoning_details?: unknown;
    };
    const message = choice?.message as ORChatMessage;

    console.log("[GHOST BRAIN] 🔍 Reasoning details:", JSON.stringify(message?.reasoning_details));

    const rawContent = message?.content;
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
