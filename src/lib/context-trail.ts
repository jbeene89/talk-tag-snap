export type TrailBox = { x: number; y: number; w: number; h: number };
export type TrailLevel = {
  id: string;
  title: string;
  note: string;
  image: string;
  width: number;
  height: number;
  /** Normalized coordinates on this image, linking to the following level. */
  hotspot?: TrailBox;
  videoTime?: number;
};
export type ContextTrail = { version: 1; title: string; levels: TrailLevel[] };
export const MAX_TRAIL_LEVELS = 12;
export const MAX_TRAIL_BYTES = 12 * 1024 * 1024;
// HTML escapes metadata and includes its own offline viewer; data stays capped at 12 MiB.
export const MAX_TRAIL_FILE_BYTES = MAX_TRAIL_BYTES + 256 * 1024;
export const TRAIL_LABELS = ["Where", "What", "What part", "Exact problem"];

export function levelLabel(index: number): string {
  return TRAIL_LABELS[index] ?? `Detail ${index - 2}`;
}

export function normalizedBox(
  start: { x: number; y: number },
  end: { x: number; y: number },
): TrailBox {
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const x = Math.min(clamp(start.x), clamp(end.x));
  const y = Math.min(clamp(start.y), clamp(end.y));
  return {
    x,
    y,
    w: Math.max(clamp(start.x), clamp(end.x)) - x,
    h: Math.max(clamp(start.y), clamp(end.y)) - y,
  };
}

export function validateTrail(value: unknown): ContextTrail {
  const fail = (): never => {
    throw new Error("This is not a valid Context Trail. Choose a trail saved by Talk&Tag.");
  };
  if (!value || typeof value !== "object") return fail();
  const trail = value as ContextTrail;
  if (
    trail.version !== 1 ||
    typeof trail.title !== "string" ||
    trail.title.length > 160 ||
    !Array.isArray(trail.levels) ||
    trail.levels.length > MAX_TRAIL_LEVELS
  )
    return fail();
  const ids = new Set<string>();
  const levels = trail.levels.map((level) => {
    if (
      !level ||
      typeof level !== "object" ||
      typeof level.id !== "string" ||
      !level.id ||
      level.id.length > 100 ||
      ids.has(level.id) ||
      typeof level.title !== "string" ||
      level.title.length > 160 ||
      typeof level.note !== "string" ||
      level.note.length > 2000 ||
      typeof level.image !== "string" ||
      !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(level.image) ||
      !Number.isInteger(level.width) ||
      !Number.isInteger(level.height) ||
      level.width < 1 ||
      level.height < 1 ||
      level.width > 2560 ||
      level.height > 2560
    )
      return fail();
    ids.add(level.id);
    if (level.hotspot) {
      const { x, y, w, h } = level.hotspot;
      if (
        ![x, y, w, h].every(Number.isFinite) ||
        x < 0 ||
        y < 0 ||
        w < 0.01 ||
        h < 0.01 ||
        x + w > 1.000001 ||
        y + h > 1.000001
      )
        return fail();
    }
    if (level.videoTime !== undefined && (!Number.isFinite(level.videoTime) || level.videoTime < 0))
      return fail();
    // Only retain known fields; imported metadata can never become executable markup.
    return {
      id: level.id,
      title: level.title,
      note: level.note,
      image: level.image,
      width: level.width,
      height: level.height,
      ...(level.hotspot
        ? {
            hotspot: {
              x: level.hotspot.x,
              y: level.hotspot.y,
              w: level.hotspot.w,
              h: level.hotspot.h,
            },
          }
        : {}),
      ...(level.videoTime !== undefined ? { videoTime: level.videoTime } : {}),
    };
  });
  const clean: ContextTrail = { version: 1, title: trail.title, levels };
  if (new TextEncoder().encode(JSON.stringify(clean)).byteLength > MAX_TRAIL_BYTES) {
    throw new Error("This trail is too large. Use fewer or smaller photos.");
  }
  return clean;
}

export function parseTrail(text: string): ContextTrail {
  if (new TextEncoder().encode(text).byteLength > MAX_TRAIL_FILE_BYTES)
    throw new Error("Choose a trail smaller than 12 MB.");
  // A shared HTML trail embeds the same portable JSON as a non-executable data block.
  const block = text.match(
    /<script type="application\/json" id="context-trail-data">([\s\S]*?)<\/script>/,
  );
  return validateTrail(JSON.parse(block ? block[1] : text));
}

export function canPreviewTrail(trail: ContextTrail): boolean {
  return (
    trail.levels.length >= 2 && trail.levels.slice(0, -1).every((level) => Boolean(level.hotspot))
  );
}

export function trailHtml(value: ContextTrail): string {
  const trail = validateTrail(value);
  if (!canPreviewTrail(trail))
    throw new Error("Add at least two photos and box each link before sharing.");
  const data = JSON.stringify(trail)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>Talk&amp;Tag Context Trail</title><style>
*{box-sizing:border-box}body{margin:0;background:#0a0a0a;color:#fafafa;font:16px system-ui,sans-serif}main{max-width:1000px;margin:auto;padding:20px 16px calc(24px + env(safe-area-inset-bottom))}header{display:flex;align-items:center;justify-content:space-between;gap:16px}h1{font-size:24px;margin:8px 0}p{line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;color:#d4d4d4}nav{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0}button{font:inherit;cursor:pointer;color:#fafafa;background:#262626;border:1px solid #525252;border-radius:10px;padding:12px;min-height:44px}button:focus-visible{outline:3px solid #facc15;outline-offset:3px}button[aria-current=step]{color:#0a0a0a;background:#facc15;border-color:#facc15}button:disabled{opacity:.4;cursor:default}#stage{max-width:100%;margin:auto;position:relative;width:fit-content;line-height:0}img{display:block;max-width:100%;max-height:65vh;width:auto;height:auto}#hotspot{position:absolute;border:3px solid #facc15;background:#facc151a;box-shadow:0 0 0 1px #0008;border-radius:8px;padding:0;min-height:0}#hotspot span{position:absolute;bottom:100%;left:0;background:#facc15;color:#0a0a0a;padding:6px 10px;line-height:1.2;font-size:14px;white-space:nowrap;border-radius:6px 6px 0 0}#note{min-height:24px}footer{display:flex;gap:12px;align-items:center;margin:18px 0}#next{margin-left:auto}small{color:#a3a3a3}a{color:#facc15}h2{font-size:20px}#hint{font-size:14px}
</style></head><body><main><header><div><small>Talk&amp;Tag / Context Trail</small><h1 id="title"></h1></div><button id="wide">Wider view</button></header><nav aria-label="Context trail" id="crumbs"></nav><h2 id="level"></h2><div id="stage"><img id="photo" alt=""><button id="hotspot"><span>Open closer view</span></button></div><p id="note"></p><p id="hint"></p><footer><button id="back">Back</button><small id="position" aria-live="polite"></small><button id="next">Closer view</button></footer><small>Shared photos stay in this file. Open it in a browser; no account or internet needed.</small></main><script type="application/json" id="context-trail-data">${data}</script><script>
const trail=JSON.parse(document.getElementById('context-trail-data').textContent);let at=0;const el=id=>document.getElementById(id);el('title').textContent=trail.title||'Context Trail';function show(index){at=Math.max(0,Math.min(trail.levels.length-1,index));const l=trail.levels[at];el('photo').src=l.image;el('photo').alt=l.title;el('level').textContent=l.title;el('note').textContent=l.note;el('position').textContent=(at+1)+' of '+trail.levels.length;el('back').disabled=at===0;el('wide').disabled=at===0;el('next').disabled=at===trail.levels.length-1;el('hint').textContent=at<trail.levels.length-1?'Tap the yellow highlight to follow the detail.':'You are at the closest detail. Use the trail above to find it in context.';el('crumbs').replaceChildren();trail.levels.forEach((s,i)=>{const b=document.createElement('button');b.textContent=(i+1)+'. '+s.title;b.setAttribute('aria-current',i===at?'step':'false');b.onclick=()=>show(i);el('crumbs').appendChild(b)});const b=l.hotspot;el('hotspot').hidden=!b||at===trail.levels.length-1;if(b){Object.assign(el('hotspot').style,{left:b.x*100+'%',top:b.y*100+'%',width:b.w*100+'%',height:b.h*100+'%'});el('hotspot').setAttribute('aria-label','Open closer view: '+trail.levels[Math.min(at+1,trail.levels.length-1)].title)}}el('hotspot').onclick=()=>show(at+1);el('back').onclick=()=>show(at-1);el('next').onclick=()=>show(at+1);el('wide').onclick=()=>show(0);document.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')show(at-1);if(e.key==='ArrowRight')show(at+1)});show(0);
</script></body></html>`;
}
