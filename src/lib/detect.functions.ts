import { createServerFn } from "@tanstack/react-start";

type DetectInput = {
  imageBase64: string; // data URL or raw base64
  mimeType: string;
  phrase: string;
};

type DetectResult = {
  box: { x: number; y: number; w: number; h: number } | null;
  label: string;
  error?: string;
};

export const detectBoundingBox = createServerFn({ method: "POST" })
  .inputValidator((data: DetectInput) => {
    if (!data || typeof data.imageBase64 !== "string" || typeof data.phrase !== "string") {
      throw new Error("imageBase64 and phrase are required");
    }
    return data;
  })
  .handler(async ({ data }): Promise<DetectResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { box: null, label: data.phrase, error: "AI is not configured." };
    }

    const base64 = data.imageBase64.includes(",")
      ? data.imageBase64.split(",")[1]
      : data.imageBase64;

    const system =
      "You locate objects in images. Given a photo and a short phrase describing something visible, return ONLY a compact JSON object: " +
      '{"label": string, "box": {"x": number, "y": number, "w": number, "h": number}} ' +
      "where x,y,w,h are normalized 0..1 coordinates of the smallest tight rectangle around the described object. " +
      'If the object is not visible, return {"label": <phrase>, "box": null}. No prose, no markdown.';

    const body = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: `Find: ${data.phrase}` },
            {
              type: "image_url",
              image_url: { url: `data:${data.mimeType};base64,${base64}` },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
    };

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        if (res.status === 429) return { box: null, label: data.phrase, error: "Rate limit hit. Try again in a moment." };
        if (res.status === 402) return { box: null, label: data.phrase, error: "AI credits exhausted. Add credits in workspace settings." };
        console.error("AI gateway error", res.status, text);
        return { box: null, label: data.phrase, error: `AI error (${res.status})` };
      }

      const json = await res.json();
      const content: string = json?.choices?.[0]?.message?.content ?? "";
      let parsed: { label?: string; box?: { x: number; y: number; w: number; h: number } | null } = {};
      try {
        parsed = JSON.parse(content);
      } catch {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
      }

      const box = parsed.box && typeof parsed.box.x === "number" ? parsed.box : null;
      return { box, label: parsed.label || data.phrase };
    } catch (err) {
      console.error("detect failed", err);
      return { box: null, label: data.phrase, error: "Could not reach AI service." };
    }
  });
