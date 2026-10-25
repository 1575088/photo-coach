/* 摄像头与取景叠加层绘制。不含 AI 逻辑，只管拿到画面、画辅助线、合成照片。 */

export class Camera {
  constructor(videoEl) {
    this.video = videoEl;
    this.stream = null;
    this.facing = 'user';
  }

  get active() { return !!this.stream && this.video.readyState >= 2; }
  get width() { return this.video.videoWidth || 1280; }
  get height() { return this.video.videoHeight || 720; }

  async start(facing = this.facing) {
    this.stop();
    this.facing = facing;
    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: facing },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.stream = stream;
    this.video.srcObject = stream;
    await this.video.play().catch(() => {});
    await new Promise((res) => {
      if (this.video.readyState >= 2) return res();
      this.video.onloadedmetadata = () => res();
      setTimeout(res, 1500);
    });
    return this;
  }

  async flip() {
    return this.start(this.facing === 'user' ? 'environment' : 'user');
  }

  stop() {
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
    }
    this.video.srcObject = null;
  }
}

/** 用一张静态图片替代摄像头（无权限 / 桌面测试 / 已有照片） */
export async function useImageAsSource(videoEl, file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  videoEl.srcObject = null;
  // 用 video 元素无法承载图片，这里把图片塞进一个离屏 canvas 并在 app 层做适配
  return { img, url };
}

/** 三分线 + 中心十字 + 水平仪参考线 */
export function drawGuides(ctx, w, h, { thirds = true } = {}) {
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  if (thirds) {
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo((w * i) / 3, 0); ctx.lineTo((w * i) / 3, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, (h * i) / 3); ctx.lineTo(w, (h * i) / 3); ctx.stroke();
    }
    // 角框
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 2;
    const L = Math.min(w, h) * 0.06;
    const m = Math.min(w, h) * 0.03;
    const corner = (x, y, dx, dy) => {
      ctx.beginPath();
      ctx.moveTo(x + dx * L, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * L);
      ctx.stroke();
    };
    corner(m, m, 1, 1);
    corner(w - m, m, -1, 1);
    corner(m, h - m, 1, -1);
    corner(w - m, h - m, -1, -1);
  }
  ctx.restore();
}

/** 视频铺满画布时，为了 object-fit: cover 计算实际可见区域（用于把归一化坐标映射到画布） */
export function coverRect(videoW, videoH, canvasW, canvasH, mirror) {
  const scale = Math.max(canvasW / videoW, canvasH / videoH);
  const dw = videoW * scale;
  const dh = videoH * scale;
  const ox = (canvasW - dw) / 2;
  const oy = (canvasH - dh) / 2;
  const toCanvas = (x, y) => {
    const nx = mirror ? 1 - x : x;
    return [ox + nx * dw, oy + y * dh];
  };
  return { scale, dw, dh, ox, oy, toCanvas };
}

/** 合成：视频帧 + 叠加层 → PNG Blob */
export async function compositeShot({ source, sourceW, sourceH, overlayCanvas, mirror, withOverlay = true }) {
  const c = document.createElement('canvas');
  c.width = sourceW;
  c.height = sourceH;
  const ctx = c.getContext('2d');
  if (mirror) {
    ctx.translate(sourceW, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, 0, 0, sourceW, sourceH);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (withOverlay && overlayCanvas) {
    // 叠加层与视频尺寸比例可能不同，按 contain 贴到中心
    const ar = overlayCanvas.width / overlayCanvas.height;
    const tar = sourceW / sourceH;
    let w2 = sourceW, h2 = sourceH, x2 = 0, y2 = 0;
    if (ar > tar) { h2 = sourceH; w2 = h2 * ar; x2 = (sourceW - w2) / 2; }
    else { w2 = sourceW; h2 = w2 / ar; y2 = (sourceH - h2) / 2; }
    ctx.globalAlpha = 0.85;
    ctx.drawImage(overlayCanvas, 0, 0, overlayCanvas.width, overlayCanvas.height, x2, y2, w2, h2);
    ctx.globalAlpha = 1;
  }
  return new Promise((res) => c.toBlob((b) => res(b), 'image/png', 0.95));
}

export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
