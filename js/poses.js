/* 姿势库：手写骨架关键点 + 画法。
   坐标一律归一化到 [0,1]×[0,1]（y 向下），由渲染层缩放到画布。
   关键点命名与 MediaPipe Pose 的 13 个常用点对应，便于和实时检测结果比对。 */

export const POSE_EDGES = [
  ['nose', 'lshoulder'], ['nose', 'rshoulder'],
  ['lshoulder', 'rshoulder'],
  ['lshoulder', 'lelbow'], ['lelbow', 'lwrist'],
  ['rshoulder', 'relbow'], ['relbow', 'rwrist'],
  ['lshoulder', 'lhip'], ['rshoulder', 'rhip'], ['lhip', 'rhip'],
  ['lhip', 'lknee'], ['lknee', 'lankle'],
  ['rhip', 'rknee'], ['rknee', 'rankle'],
];

/* 用于姿态吻合评分的肢体段（躯干与四肢主干） */
export const COMPARE_SEGMENTS = [
  ['lshoulder', 'lelbow'], ['lelbow', 'lwrist'],
  ['rshoulder', 'relbow'], ['relbow', 'rwrist'],
  ['lhip', 'lknee'], ['lknee', 'lankle'],
  ['rhip', 'rknee'], ['rknee', 'rankle'],
  ['lshoulder', 'rshoulder'], ['lhip', 'rhip'],
];

export const SCENES = {
  single: '单人', couple: '双人', group: '多人',
};
export const PLACES = {
  city: '城市街拍', nature: '山野海景', indoor: '室内',
};
export const STYLES = {
  cool: '酷感', soft: '温柔', playful: '活泼',
};

const P = (o) => o;

export const POSES = [
  P({
    id: 'stand-pocket', name: '插兜站立', scene: 'single', place: ['city'], style: 'cool',
    tips: { arm: '右手插兜，手肘向后带', leg: '重心压左腿，右膝微屈、脚尖外撇', gaze: '直视镜头', expr: '嘴角微收，不笑或浅笑' },
    framing: 'full', focal: 50, height: '胸口', distance: '2.5–3 m',
    joints: {
      nose: [0.500, 0.130], lshoulder: [0.412, 0.225], rshoulder: [0.588, 0.222],
      lelbow: [0.330, 0.372], relbow: [0.668, 0.368],
      lwrist: [0.345, 0.515], rwrist: [0.612, 0.500],
      lhip: [0.442, 0.522], rhip: [0.560, 0.518],
      lknee: [0.432, 0.733], rknee: [0.578, 0.728],
      lankle: [0.418, 0.948], rankle: [0.606, 0.944],
    },
  }),
  P({
    id: 'wall-lean', name: '侧靠墙屈腿', scene: 'single', place: ['city'], style: 'cool',
    tips: { arm: '肩背贴墙，一只手臂自然垂', leg: '单脚踩墙根，膝盖朝镜头', gaze: '看向画外', expr: '放松' },
    framing: 'full', focal: 35, height: '腰部', distance: '2–2.5 m',
    joints: {
      nose: [0.478, 0.132], lshoulder: [0.398, 0.226], rshoulder: [0.566, 0.230],
      lelbow: [0.330, 0.380], relbow: [0.640, 0.368],
      lwrist: [0.352, 0.528], rwrist: [0.652, 0.500],
      lhip: [0.436, 0.524], rhip: [0.548, 0.526],
      lknee: [0.428, 0.736], rknee: [0.612, 0.700],
      lankle: [0.420, 0.950], rankle: [0.668, 0.812],
    },
  }),
  P({
    id: 'look-back', name: '侧身回头', scene: 'single', place: ['city', 'nature'], style: 'soft',
    tips: { arm: '双臂自然下垂，别抱胸', leg: '一前一后站成 T 字', gaze: '下巴贴近肩头回看', expr: '轻微笑' },
    framing: 'half', focal: 85, height: '眼睛', distance: '1.5–2 m',
    joints: {
      nose: [0.540, 0.148], lshoulder: [0.432, 0.238], rshoulder: [0.612, 0.228],
      lelbow: [0.404, 0.392], relbow: [0.652, 0.380],
      lwrist: [0.418, 0.540], rwrist: [0.660, 0.520],
      lhip: [0.452, 0.524], rhip: [0.570, 0.520],
      lknee: [0.446, 0.734], rknee: [0.584, 0.730],
      lankle: [0.436, 0.948], rankle: [0.600, 0.944],
    },
  }),
  P({
    id: 'peace-sign', name: '举手比耶', scene: 'single', place: ['city', 'nature'], style: 'playful',
    tips: { arm: '举到耳侧高度，手肘别挡住脸', leg: '双脚并拢或一前一后', gaze: '看镜头', expr: '露齿笑' },
    framing: 'half', focal: 50, height: '胸口', distance: '2–2.5 m',
    joints: {
      nose: [0.500, 0.150], lshoulder: [0.418, 0.238], rshoulder: [0.582, 0.236],
      lelbow: [0.352, 0.392], relbow: [0.684, 0.270],
      lwrist: [0.372, 0.540], rwrist: [0.742, 0.132],
      lhip: [0.444, 0.526], rhip: [0.556, 0.524],
      lknee: [0.438, 0.734], rknee: [0.562, 0.732],
      lankle: [0.430, 0.948], rankle: [0.572, 0.946],
    },
  }),
  P({
    id: 'walk-stride', name: '大步走抓拍', scene: 'single', place: ['city'], style: 'playful',
    tips: { arm: '与腿反向摆臂', leg: '步子迈到最大，前脚跟先落地', gaze: '看前方或看镜头', expr: '自然' },
    framing: 'full', focal: 35, height: '腰部', distance: '3–4 m',
    joints: {
      nose: [0.512, 0.136], lshoulder: [0.424, 0.232], rshoulder: [0.598, 0.226],
      lelbow: [0.348, 0.382], relbow: [0.664, 0.352],
      lwrist: [0.402, 0.512], rwrist: [0.576, 0.470],
      lhip: [0.454, 0.526], rhip: [0.566, 0.518],
      lknee: [0.372, 0.722], rknee: [0.632, 0.716],
      lankle: [0.306, 0.930], rankle: [0.678, 0.944],
    },
  }),
  P({
    id: 'arms-open', name: '双臂张开迎风', scene: 'single', place: ['nature'], style: 'soft',
    tips: { arm: '双臂抬高到肩线以上，掌心朝前', leg: '站开一肩宽', gaze: '闭眼或仰头', expr: '放松微笑' },
    framing: 'full', focal: 28, height: '胸口', distance: '3–4 m',
    joints: {
      nose: [0.500, 0.128], lshoulder: [0.414, 0.224], rshoulder: [0.586, 0.220],
      lelbow: [0.300, 0.176], relbow: [0.700, 0.172],
      lwrist: [0.196, 0.140], rwrist: [0.804, 0.136],
      lhip: [0.444, 0.522], rhip: [0.556, 0.520],
      lknee: [0.428, 0.732], rknee: [0.572, 0.730],
      lankle: [0.408, 0.948], rankle: [0.592, 0.946],
    },
  }),
  P({
    id: 'squat-knee', name: '蹲姿抱膝', scene: 'single', place: ['nature', 'city'], style: 'soft',
    tips: { arm: '双手环住膝盖', leg: '两脚并拢，脚掌全着地', gaze: '抬起看镜头', expr: '微笑' },
    framing: 'full', focal: 50, height: '跪姿', distance: '1.5–2 m',
    joints: {
      nose: [0.500, 0.318], lshoulder: [0.422, 0.396], rshoulder: [0.578, 0.394],
      lelbow: [0.372, 0.532], relbow: [0.632, 0.530],
      lwrist: [0.446, 0.632], rwrist: [0.556, 0.630],
      lhip: [0.446, 0.672], rhip: [0.556, 0.670],
      lknee: [0.386, 0.812], rknee: [0.614, 0.810],
      lankle: [0.452, 0.932], rankle: [0.556, 0.930],
    },
  }),
  P({
    id: 'sea-sit', name: '坐地看海背影', scene: 'single', place: ['nature'], style: 'soft',
    tips: { arm: '手撑在身后地面', leg: '屈膝，脚踩实', gaze: '看远处，不回头', expr: '不需要露脸' },
    framing: 'full', focal: 35, height: '蹲姿', distance: '2.5–3 m',
    joints: {
      nose: [0.500, 0.300], lshoulder: [0.430, 0.372], rshoulder: [0.570, 0.370],
      lelbow: [0.372, 0.470], relbow: [0.640, 0.466],
      lwrist: [0.330, 0.556], rwrist: [0.672, 0.552],
      lhip: [0.452, 0.620], rhip: [0.556, 0.618],
      lknee: [0.392, 0.760], rknee: [0.404, 0.760],
      lankle: [0.418, 0.918], rankle: [0.436, 0.918],
    },
  }),
  P({
    id: 'coffee-sip', name: '咖啡遮半脸', scene: 'single', place: ['indoor', 'city'], style: 'soft',
    tips: { arm: '杯子抬到下巴高度，挡住嘴角', leg: '靠柜台或侧身站', gaze: '眼睛看镜头', expr: '眼神笑' },
    framing: 'close', focal: 50, height: '眼睛', distance: '0.8–1.2 m',
    joints: {
      nose: [0.500, 0.260], lshoulder: [0.422, 0.382], rshoulder: [0.578, 0.380],
      lelbow: [0.368, 0.516], relbow: [0.638, 0.510],
      lwrist: [0.436, 0.634], rwrist: [0.548, 0.330],
      lhip: [0.448, 0.660], rhip: [0.556, 0.658],
      lknee: [0.442, 0.832], rknee: [0.562, 0.830],
      lankle: [0.436, 0.960], rankle: [0.568, 0.958],
    },
  }),
  P({
    id: 'hair-touch', name: '撩头发侧脸', scene: 'single', place: ['indoor', 'nature'], style: 'soft',
    tips: { arm: '手指插进耳后发根，手肘抬起', leg: '侧身 45°', gaze: '看画外', expr: '微张嘴放松' },
    framing: 'half', focal: 85, height: '眼睛', distance: '1.2–1.6 m',
    joints: {
      nose: [0.468, 0.170], lshoulder: [0.396, 0.262], rshoulder: [0.566, 0.256],
      lelbow: [0.318, 0.316], relbow: [0.616, 0.404],
      lwrist: [0.386, 0.146], rwrist: [0.628, 0.540],
      lhip: [0.430, 0.556], rhip: [0.544, 0.552],
      lknee: [0.424, 0.760], rknee: [0.552, 0.758],
      lankle: [0.416, 0.958], rankle: [0.562, 0.956],
    },
  }),
  P({
    id: 'couple-pair', name: '并肩牵手', scene: 'couple', place: ['city', 'nature'], style: 'soft',
    tips: { arm: '内侧手十指相扣，外侧手自然摆', leg: '两人步幅一致', gaze: '一人看镜头一人看对方', expr: '自然笑' },
    framing: 'full', focal: 50, height: '胸口', distance: '3–4 m',
    joints: {
      nose: [0.360, 0.150], lshoulder: [0.286, 0.244], rshoulder: [0.436, 0.242],
      lelbow: [0.232, 0.386], relbow: [0.478, 0.384],
      lwrist: [0.246, 0.530], rwrist: [0.520, 0.500],
      lhip: [0.312, 0.530], rhip: [0.410, 0.528],
      lknee: [0.306, 0.736], rknee: [0.414, 0.734],
      lankle: [0.300, 0.946], rankle: [0.420, 0.944],
    },
    extra: [{
      joints: {
        nose: [0.634, 0.152], lshoulder: [0.564, 0.246], rshoulder: [0.714, 0.244],
        lelbow: [0.520, 0.384], relbow: [0.766, 0.386],
        lwrist: [0.520, 0.500], rwrist: [0.752, 0.530],
        lhip: [0.590, 0.530], rhip: [0.688, 0.532],
        lknee: [0.586, 0.734], rknee: [0.694, 0.736],
        lankle: [0.580, 0.944], rankle: [0.700, 0.946],
      },
    }],
  }),
  P({
    id: 'group-jump', name: '并排起跳', scene: 'group', place: ['city', 'nature'], style: 'playful',
    tips: { arm: '全部举高，手肘微屈', leg: '膝盖收起，脚尖往下压', gaze: '朝同一方向看', expr: '张嘴笑' },
    framing: 'full', focal: 28, height: '胸口', distance: '4–6 m',
    joints: {
      nose: [0.250, 0.150], lshoulder: [0.196, 0.230], rshoulder: [0.304, 0.228],
      lelbow: [0.160, 0.150], relbow: [0.340, 0.148],
      lwrist: [0.128, 0.070], rwrist: [0.372, 0.068],
      lhip: [0.214, 0.520], rhip: [0.286, 0.518],
      lknee: [0.190, 0.700], rknee: [0.310, 0.700],
      lankle: [0.176, 0.780], rankle: [0.324, 0.778],
    },
    extra: [
      {
        joints: {
          nose: [0.500, 0.130], lshoulder: [0.446, 0.210], rshoulder: [0.554, 0.208],
          lelbow: [0.410, 0.130], relbow: [0.590, 0.128],
          lwrist: [0.378, 0.050], rwrist: [0.622, 0.048],
          lhip: [0.464, 0.500], rhip: [0.536, 0.498],
          lknee: [0.440, 0.680], rknee: [0.560, 0.680],
          lankle: [0.426, 0.760], rankle: [0.574, 0.758],
        },
      },
      {
        joints: {
          nose: [0.750, 0.150], lshoulder: [0.696, 0.230], rshoulder: [0.804, 0.228],
          lelbow: [0.660, 0.150], relbow: [0.840, 0.148],
          lwrist: [0.628, 0.070], rwrist: [0.872, 0.068],
          lhip: [0.714, 0.520], rhip: [0.786, 0.518],
          lknee: [0.690, 0.700], rknee: [0.810, 0.700],
          lankle: [0.676, 0.780], rankle: [0.824, 0.778],
        },
      },
    ],
  }),
];

export function posesFiltered({ scene = 'all', place = 'all', style = 'all' } = {}) {
  return POSES.filter((p) =>
    (scene === 'all' || p.scene === scene) &&
    (place === 'all' || p.place.includes(place)) &&
    (style === 'all' || p.style === style));
}

export function getPose(id) {
  return POSES.find((p) => p.id === id) || null;
}

/* ---------------- 渲染 ---------------- */
export function toPx(joints, w, h) {
  const out = {};
  for (const k in joints) out[k] = [joints[k][0] * w, joints[k][1] * h];
  return out;
}

/**
 * 画骨架。
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} pts  {joint:[x,y]} 像素坐标
 * @param {Object} [opt] {color, jointColor, lineWidth, alpha, scores:{segKey:0..1}, jointRadius}
 */
export function drawSkeleton(ctx, pts, opt = {}) {
  const color = opt.color || '#3ddc97';
  const jointColor = opt.jointColor || color;
  const lw = opt.lineWidth || 3;
  const radius = opt.jointRadius ?? Math.max(2.2, lw * 1.15);
  const scores = opt.scores || null;
  ctx.save();
  ctx.globalAlpha = opt.alpha ?? 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [a, b] of POSE_EDGES) {
    const pa = pts[a], pb = pts[b];
    if (!pa || !pb) continue;
    let c = color;
    if (scores) {
      const key = `${a}-${b}`;
      const s = scores[key];
      if (typeof s === 'number') {
        c = s >= 0.78 ? '#3ddc97' : s >= 0.55 ? '#ffb43d' : '#ff5d5d';
      } else {
        c = opt.weakColor || 'rgba(120,140,165,.55)';
      }
    }
    ctx.strokeStyle = c;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(pa[0], pa[1]);
    ctx.lineTo(pb[0], pb[1]);
    ctx.stroke();
  }
  for (const k in pts) {
    ctx.fillStyle = jointColor;
    ctx.beginPath();
    ctx.arc(pts[k][0], pts[k][1], radius, 0, Math.PI * 2);
    ctx.fill();
  }
  // 头部：以 nose 为锚画一个圆，帮助判断头顶留白
  if (pts.nose) {
    const headR = radius * 3.4;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, lw * 0.7);
    ctx.beginPath();
    ctx.arc(pts.nose[0], pts.nose[1], headR, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** 把一组姿势画进一张缩略 canvas */
export function paintThumb(canvas, pose) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 150;
  const h = Math.round(w * 4 / 3);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  // 背景网格（三分线）
  ctx.strokeStyle = 'rgba(90,110,135,.28)';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 2; i++) {
    ctx.beginPath(); ctx.moveTo((w * i) / 3, 0); ctx.lineTo((w * i) / 3, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, (h * i) / 3); ctx.lineTo(w, (h * i) / 3); ctx.stroke();
  }
  const pad = 10;
  const cw = w - pad * 2, ch = h - pad * 2;
  const draw = (joints, col) => {
    const px = {};
    for (const k in joints) px[k] = [pad + joints[k][0] * cw, pad + joints[k][1] * ch];
    drawSkeleton(ctx, px, { color: col, lineWidth: 2.4, jointRadius: 2.6 });
  };
  draw(pose.joints, '#3ddc97');
  (pose.extra || []).forEach((e) => draw(e.joints, '#59a6ff'));
}
