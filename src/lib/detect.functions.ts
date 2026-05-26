import { createServerFn } from "@tanstack/react-start";

type DetectInput = {
  imageBase64: string;
  mimeType: string;
  phrase: string;
};

type ScanInput = {
  imageBase64: string;
  mimeType: string;
};

type Box = { x: number; y: number; w: number; h: number };

type DetectResult = {
  box: Box | null;
  label: string;
  error?: string;
};

type ScanResult = {
  items: { label: string; box: Box }[];
  error?: string;
};

async function callGateway(apiKey: string, body: unknown) {
  return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify(body),
  });
}

function parseJson(content: string): any {
  try {
    return JSON.parse(content);
  } catch {
    const m = content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function gatewayErrorMessage(status: number) {
  if (status === 429) return "Rate limit hit. Try again in a moment.";
  if (status === 402) return "AI credits exhausted. Add credits in workspace settings.";
  return `AI error (${status})`;
}

export const detectBoundingBox = createServerFn({ method: "POST" })
  .inputValidator((data: DetectInput) => {
    if (!data || typeof data.imageBase64 !== "string" || typeof data.phrase !== "string") {
      throw new Error("imageBase64 and phrase are required");
    }
    return data;
  })
  .handler(async ({ data }): Promise<DetectResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { box: null, label: data.phrase, error: "AI is not configured." };

    const base64 = data.imageBase64.includes(",") ? data.imageBase64.split(",")[1] : data.imageBase64;

    const system =
      "You locate objects in images. Given a photo and a short phrase describing something visible, return ONLY a compact JSON object: " +
      '{"label": string, "box": {"x": number, "y": number, "w": number, "h": number}} ' +
      "where x,y,w,h are normalized 0..1 coordinates of the smallest tight rectangle around the described object. " +
      'If the object is not visible, return {"label": <phrase>, "box": null}. No prose, no markdown.';

    try {
      const res = await callGateway(apiKey, {
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              { type: "text", text: `Find: ${data.phrase}` },
              { type: "image_url", image_url: { url: `data:${data.mimeType};base64,${base64}` } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      });

      if (!res.ok) {
        console.error("AI gateway error", res.status, await res.text());
        return { box: null, label: data.phrase, error: gatewayErrorMessage(res.status) };
      }

      const json = await res.json();
      const parsed = parseJson(json?.choices?.[0]?.message?.content ?? "") ?? {};
      const box = parsed.box && typeof parsed.box.x === "number" ? parsed.box : null;
      return { box, label: parsed.label || data.phrase };
    } catch (err) {
      console.error("detect failed", err);
      return { box: null, label: data.phrase, error: "Could not reach AI service." };
    }
  });

export const scanObjects = createServerFn({ method: "POST" })
  .inputValidator((data: ScanInput) => {
    if (!data || typeof data.imageBase64 !== "string") throw new Error("imageBase64 is required");
    return data;
  })
  .handler(async ({ data }): Promise<ScanResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { items: [], error: "AI is not configured." };

    const base64 = data.imageBase64.includes(",") ? data.imageBase64.split(",")[1] : data.imageBase64;

    const system =
      "You identify the notable distinct objects, equipment, devices, fixtures, or items in a photo. " +
      'Return ONLY a compact JSON object: {"items":[{"label": string, "box": {"x": number, "y": number, "w": number, "h": number}}]} ' +
      "where x,y,w,h are normalized 0..1 coordinates of a tight bounding box around the object. " +
      "Use short, specific labels (2-4 words). Return at most 8 items, prioritizing the most prominent. " +
      "Skip background, walls, floor, sky. No prose, no markdown.";

    try {
      const res = await callGateway(apiKey, {
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              { type: "text", text: "Identify the notable objects in this photo." },
              { type: "image_url", image_url: { url: `data:${data.mimeType};base64,${base64}` } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      });

      if (!res.ok) {
        console.error("AI gateway error", res.status, await res.text());
        return { items: [], error: gatewayErrorMessage(res.status) };
      }

      const json = await res.json();
      const parsed = parseJson(json?.choices?.[0]?.message?.content ?? "") ?? {};
      const rawItems: any[] = Array.isArray(parsed) ? parsed : parsed.items ?? [];
      const items = rawItems
        .filter((it) => it && it.box && typeof it.box.x === "number" && typeof it.label === "string")
        .map((it) => ({ label: String(it.label).slice(0, 40), box: it.box as Box }));
      return { items };
    } catch (err) {
      console.error("scan failed", err);
      return { items: [], error: "Could not reach AI service." };
    }
  });

type IdentifyAtInput = {
  imageBase64: string;
  mimeType: string;
  point: { x: number; y: number }; // normalized 0..1
};

export const identifyAtPoint = createServerFn({ method: "POST" })
  .inputValidator((data: IdentifyAtInput) => {
    if (
      !data ||
      typeof data.imageBase64 !== "string" ||
      !data.point ||
      typeof data.point.x !== "number" ||
      typeof data.point.y !== "number"
    ) {
      throw new Error("imageBase64 and point are required");
    }
    return data;
  })
  .handler(async ({ data }): Promise<DetectResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { box: null, label: "", error: "AI is not configured." };

    const base64 = data.imageBase64.includes(",") ? data.imageBase64.split(",")[1] : data.imageBase64;
    const px = Math.round(data.point.x * 100);
    const py = Math.round(data.point.y * 100);

    const system =
      "You identify the single object the user is pointing at in a photo. The user gives a point as normalized percentages " +
      "from the top-left of the image. Identify the distinct object, equipment, fixture, or part located at or immediately " +
      "around that point (a board, pole, lift component, device, panel, etc.). " +
      'Return ONLY: {"label": string, "box": {"x": number, "y": number, "w": number, "h": number}} ' +
      "where the box is a tight bounding box around that object in normalized 0..1 coordinates. " +
      'If nothing identifiable is at that point, return {"label": "", "box": null}. Use a short specific label (2-4 words). ' +
      "No prose, no markdown.";

    try {
      const res = await callGateway(apiKey, {
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `The user tapped at x=${px}%, y=${py}% (from top-left). Identify the object at that point and return its bounding box.`,
              },
              { type: "image_url", image_url: { url: `data:${data.mimeType};base64,${base64}` } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      });

      if (!res.ok) {
        console.error("AI gateway error", res.status, await res.text());
        return { box: null, label: "", error: gatewayErrorMessage(res.status) };
      }

      const json = await res.json();
      const parsed = parseJson(json?.choices?.[0]?.message?.content ?? "") ?? {};
      const box = parsed.box && typeof parsed.box.x === "number" ? parsed.box : null;
      return { box, label: parsed.label || "" };
    } catch (err) {
      console.error("identifyAtPoint failed", err);
      return { box: null, label: "", error: "Could not reach AI service." };
    }
  });

