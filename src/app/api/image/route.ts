// Image generation endpoint using Pollinations.ai (free, no API key required).
//
// POST /api/image { prompt: "a sunset over mountains" }
// Returns { url: "https://image.pollinations.ai/prompt/..." }
//
// Pollinations.ai generates images on-the-fly. We fetch the full image
// server-side first to ensure it's generated and cached before sending
// the URL to the client.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ImageRequestBody {
  prompt?: string;
}

export async function POST(req: Request) {
  let body: ImageRequestBody;
  try {
    body = (await req.json()) as ImageRequestBody;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const prompt = body.prompt?.trim();
  if (!prompt) {
    return Response.json({ error: "No prompt provided." }, { status: 400 });
  }

  // Sanitize the prompt
  const sanitized = prompt
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);

  const encoded = encodeURIComponent(sanitized);
  const seed = Math.floor(Math.random() * 1000000);
  const imageUrl = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&seed=${seed}&nologo=true`;

  // Pre-fetch the image server-side so Pollinations generates and caches it.
  // This way, when the client's <img> tag loads the same URL, it's already ready.
  try {
    const res = await fetch(imageUrl, {
      signal: AbortSignal.timeout(60000), // 60s timeout for generation
    });
    if (!res.ok) {
      return Response.json(
        { error: "Image generation failed. Please try again." },
        { status: 500 },
      );
    }
    // Consume the body so the connection closes properly
    await res.arrayBuffer();
  } catch {
    return Response.json(
      { error: "Image generation timed out. Please try again." },
      { status: 500 },
    );
  }

  return Response.json({
    url: imageUrl,
    prompt: sanitized,
  });
}
