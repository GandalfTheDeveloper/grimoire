// Shrinks a photo on the device before it is stored: longest side at most 1600 px, JPEG, about 300 KB.
// Browser-only (needs canvas); tests inject a stand-in. Diagnostics, Run photo test checks it on a real iPhone and tablet (Round 4).
export const PHOTO_TARGET_BYTES = 300 * 1024;

export async function shrinkPhoto(blob, { targetBytes = PHOTO_TARGET_BYTES, maxEdge = 1600 } = {}) {
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  let scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  let last = null, lastW = 0, lastH = 0;
  for (let attempt = 0; attempt < 8; attempt++) {
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; // JPEG has no transparency
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    for (const q of [0.82, 0.72, 0.62, 0.5]) {
      const out = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", q));
      if (!out) continue;
      last = out; lastW = w; lastH = h;
      if (out.size <= targetBytes) { if (bmp.close) bmp.close(); return { bytes: new Uint8Array(await out.arrayBuffer()), mime: "image/jpeg", width: w, height: h }; }
    }
    scale *= 0.8; // still too big at the lowest quality: make it smaller and try again
  }
  if (bmp.close) bmp.close();
  if (!last) throw new Error("This photo could not be read");
  return { bytes: new Uint8Array(await last.arrayBuffer()), mime: "image/jpeg", width: lastW, height: lastH };
}
