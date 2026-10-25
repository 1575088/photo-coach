/* 实时教练引擎：MediaPipe 姿态检测 → 骨架对齐 → 吻合度打分 → 距离/构图提示。
   全部在本机浏览器内计算，画面不出设备。 */

import { FilesetResolver, PoseLandmarker } from '../vendor/mediapipe/vision_bundle.mjs';
import { COMPARE_SEGMENTS } from './poses.js';

/* MediaPipe Pose 关键点索引（label 一律指「被拍者自己的身体左右」） */
const IDX = {
  nose: 0,
  lshoulder: 11, rshoulder: 12,
  lelbow: 13, relbow: 14,
  lwrist: 15, rwrist: 16,
  lhip: 23, rhip: 24,
  lknee: 25, rknee: 26,
  lankle: 27, rankle: 28,
};

const CN = {
  nose: '头部', lshoulder: '左肩', rshoulder: '右肩',
  lelbow: '左肘', relbow: '右肘', lwrist: '左手', rwrist: '右手',
  lhip: '左髋', rhip: '右髋', lknee: '左膝', rknee: '右膝',
  lankle: '左脚', rankle: '右脚',
};

/* 人体比例常数（成人均值附近，用于距离估算；非精确测量） */
const TORSO_RATIO = 0.29;     // 肩峰到髋的垂直距离 ≈ 0.29 × 身高
const NOSE_TO_SHOULDER = 0.118; // 鼻尖到肩峰 ≈ 0.118 × 身高
const NOSE_TO_TOP = 0.10;     // 鼻尖到头顶 ≈ 0.10 × 身高
const STEP_M = 0.65;          // 一步约 0.65 m

const FILL_TARGET = { full: 0.86, half: 0.55, close: 0.34 };

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** 把原始归一化关键点转成 {name:{x,y,v}}（保持原图归一化空间，镜像交给 mapDet） */
function extract(landmarks) {
  const out = {};
  for (const k in IDX) {
    const lm = landmarks[IDX[k]];
    if (!lm) continue;
    out[k] = { x: lm.x, y: lm.y, v: lm.visibility ?? 1 };
  }
  return out;
}

export class Coach {
  constructor() {
    this.landmarker = null;
    this.loading = false;
    this.lastVideoTime = -1;
    this.lastResult = null;
    this.version = 0;
  }

  async load({ model = 'full', onStatus = () => {} } = {}) {
    if (this.loading) return this.landmarker;
    this.loading = true;
    try {
      onStatus('加载 wasm…');
      const fileset = await FilesetResolver.forVisionTasks('./vendor/mediapipe/wasm');
      const path = `./vendor/models/pose_landmarker_${model}.task`;
      const opts = (delegate) => ({
        baseOptions: { modelAssetPath: path, delegate },
        runningMode: 'VIDEO',
        numPoses: 4,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      onStatus('加载模型…');
      try {
        this.landmarker = await PoseLandmarker.createFromOptions(fileset, opts('GPU'));
      } catch (e) {
        console.warn('[coach] GPU delegate 失败，回退 CPU', e);
        this.landmarker = await PoseLandmarker.createFromOptions(fileset, opts('CPU'));
      }
      onStatus('就绪');
      return this.landmarker;
    } finally {
      this.loading = false;
    }
  }

  /** 对 video/img 元素做一次检测（VIDEO 模式内部会按时间戳去重） */
  detect(source, timestampMs) {
    if (!this.landmarker) return null;
    let res = null;
    try {
      res = this.landmarker.detectForVideo(source, timestampMs);
    } catch (e) {
      return this.lastResult;
    }
    const persons = (res?.landmarks || []).map((lms) => {
      let best = 0;
      const world = res.worldLandmarks || [];
      const score = lms.reduce((s, p) => s + (p.visibility ?? 1), 0) / lms.length;
      best = score;
      return { lms, score };
    }).sort((a, b) => b.score - a.score);
    this.lastResult = { persons, raw: res };
    return this.lastResult;
  }
}

/** 从归一化关键点算躯干、身高、距离等基本量（像素空间） */
export function measure(pts, videoW, videoH, subjectH, hfovDeg) {
  const need = ['lshoulder', 'rshoulder', 'lhip', 'rhip'];
  for (const k of need) if (!pts[k] || pts[k].v < 0.4) return null;

  const px = (p) => [p.x * videoW, p.y * videoH];
  const ls = px(pts.lshoulder), rs = px(pts.rshoulder);
  const lh = px(pts.lhip), rh = px(pts.rhip);
  const shoulderMid = mid(ls, rs);
  const hipMid = mid(lh, rh);
  const torsoPx = dist2(shoulderMid, hipMid);
  if (torsoPx < 8) return null;

  const focalPx = (videoW / 2) / Math.tan((hfovDeg / 2) * Math.PI / 180);
  const torsoM = TORSO_RATIO * subjectH;
  const distance = (focalPx * torsoM) / torsoPx;

  // 头顶与脚底（可能不在画面内）
  const nose = pts.nose ? px(pts.nose) : null;
  let headTopY = null;
  if (nose) headTopY = nose[1] - (NOSE_TO_TOP / NOSE_TO_SHOULDER) * (shoulderMid[1] - nose[1]);
  let feetY = null;
  for (const k of ['lankle', 'rankle']) {
    if (pts[k] && pts[k].v > 0.4) feetY = Math.max(feetY ?? -Infinity, pts[k].y * videoH);
  }
  const bodyPx = (headTopY !== null && feetY !== null) ? Math.max(0, feetY - headTopY) : null;

  return {
    focalPx, torsoPx, distance, shoulderMid, hipMid, headTopY, feetY, bodyPx,
    fill: bodyPx ? bodyPx / videoH : null,
    noseY: nose ? nose[1] / videoH : null,
    noseX: nose ? nose[0] / videoW : null,
    chestX: shoulderMid[0] / videoW,
    feetRatio: feetY ? feetY / videoH : null,
    headroom: headTopY !== null ? headTopY / videoH : null,
  };
}

/** 相似变换：把参考骨架缩放到检测到的身体上（按躯干长度缩放 + 髋中点对齐） */
/**
 * 相似变换：把参考骨架（归一化、等比）缩放到检测到的身体上。
 * 参考骨架先按画布高度做等比映射（x*h, y*h），避免在宽画布上被横向拉伸；
 * 再按躯干长度缩放、髋中点对齐，全部在「画布像素」空间里比较。
 */
export function alignReference(refPts, detCanvas, h) {
  const keys = ['lshoulder', 'rshoulder', 'lhip', 'rhip'];
  for (const k of keys) if (!detCanvas[k]) return null;
  const iso = {};
  for (const k in refPts) iso[k] = [refPts[k][0] * h, refPts[k][1] * h];
  const dSh = mid(detCanvas.lshoulder, detCanvas.rshoulder);
  const dHip = mid(detCanvas.lhip, detCanvas.rhip);
  const rSh = mid(iso.lshoulder, iso.rshoulder);
  const rHip = mid(iso.lhip, iso.rhip);
  const dTorso = dist2(dSh, dHip);
  const rTorso = dist2(rSh, rHip);
  if (rTorso < 1) return null;
  const s = dTorso / rTorso;
  const out = {};
  for (const k in refPts) {
    out[k] = [dHip[0] + (iso[k][0] - rHip[0]) * s, dHip[1] + (iso[k][1] - rHip[1]) * s];
  }
  return { pts: out, scale: s };
}

const angleOf = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
const angDiff = (a, b) => {
  let d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** 逐段比对（两者都在画布像素空间），返回 {score, segScores, worst} */
export function scorePose(refPx, detCanvas) {
  const segScores = {};
  let total = 0, n = 0;
  const worst = [];
  for (const [a, b] of COMPARE_SEGMENTS) {
    const rA = refPx[a], rB = refPx[b];
    const pA = detCanvas[a], pB = detCanvas[b];
    if (!rA || !rB || !pA || !pB) continue;
    const rLen = dist2(rA, rB);
    const dLen = dist2(pA, pB);
    if (rLen < 2 || dLen < 2) continue;
    const aErr = angDiff(angleOf(rA, rB), angleOf(pA, pB));
    const lErr = Math.abs(dLen / rLen - 1);
    const seg = clamp01(1 - aErr / 70) * clamp01(1 - lErr / 0.6);
    segScores[`${a}-${b}`] = seg;
    total += seg; n++;
    worst.push({ a, b, seg, aErr });
  }
  worst.sort((x, y) => x.seg - y.seg);
  return { score: n ? total / n : null, segScores, worst: worst.slice(0, 2), n };
}

/** 参考点相对检测点的位移方向，给出「抬高 / 左移」这类可执行提示（画布像素空间） */
function directionHint(refPx, detCanvas, joint, h) {
  const r = refPx[joint];
  const d = detCanvas[joint];
  if (!r || !d) return null;
  const dx = r[0] - d[0];
  const dy = r[1] - d[1];
  const limit = Math.max(10, 0.035 * h);
  const parts = [];
  if (Math.abs(dy) > limit) parts.push(dy < 0 ? '抬高' : '放低');
  if (Math.abs(dx) > limit) parts.push(dx < 0 ? '向画面左' : '向画面右');
  return parts.length ? parts.join('、') : null;
}

/**
 * 一帧的完整分析。
 * @param {Object} p
 * @param {Object} p.persons Coach.detect() 的 persons
 * @param {Object} p.refPose 参考姿势
 * @param {number} p.w 画布宽   @param {number} p.h 画布高
 * @param {number} p.videoW     @param {number} p.videoH
 * @param {boolean} p.flip      前置摄像头镜像
 * @param {number} p.subjectH   被拍者身高 m
 * @param {number} p.hfov       镜头水平视角 deg
 * @param {'full'|'half'|'close'} p.framing
 * @param {number|null} p.brightness 0..1
 * @param {number|null} p.tilt   地平线倾角 deg（来自重力传感器）
 */
export function analyze(p) {
  const out = { people: p.persons.length, hints: [], metrics: {}, score: null, segScores: null, alignedRef: null, detPts: null };
  const framing = p.framing || 'full';

  if (!p.persons.length) {
    out.hints.push({ level: 'warn', text: '画面里没检测到人。往后退一点，让人全身进入取景框。' });
    return out;
  }

  const primary = p.persons[0];
  const detPts = extract(primary.lms);
  out.detPts = detPts;

  // 归一化 → 画布像素（由 app 传入的 mapDet 负责 cover 裁剪与前置镜像）
  const mapDet = p.mapDet || ((x, y) => [x * p.w, y * p.h]);
  const detCanvas = {};
  for (const k in detPts) {
    if (detPts[k].v < 0.35) continue;
    detCanvas[k] = mapDet(detPts[k].x, detPts[k].y);
  }
  out.detCanvas = detCanvas;

  const m = measure(detPts, p.videoW, p.videoH, p.subjectH, p.hfov);
  if (!m) {
    out.hints.push({ level: 'warn', text: '只看到半个身子。退后 1–2 步，让肩和髋都进画面才估得出距离。' });
    return out;
  }
  // 三分法要看「屏幕上的位置」，所以用显示空间重算
  if (detCanvas.lshoulder && detCanvas.rshoulder) {
    m.chestX = mid(detCanvas.lshoulder, detCanvas.rshoulder)[0] / p.w;
  }

  /* ---- 距离与推拉建议 ---- */
  const dTarget = (m.focalPx * p.subjectH) / (FILL_TARGET[framing] * p.videoH);
  const delta = m.distance - dTarget;
  const steps = Math.round(Math.abs(delta) / STEP_M);
  out.metrics.distance = m.distance;
  out.metrics.distanceTarget = dTarget;
  out.metrics.fill = m.fill;
  out.metrics.focalPx = m.focalPx;

  if (steps >= 1) {
    const toward = delta > 0 ? '往前' : '往后';
    const why = delta > 0 ? '主体太小' : '主体太满';
    out.hints.push({
      level: Math.abs(delta) > dTarget * 0.28 ? 'bad' : 'warn',
      text: `${why}：${toward}走 ${steps} 步（约 ${Math.abs(delta).toFixed(1)} m），目标 ${dTarget.toFixed(1)} m。`,
    });
  } else {
    out.hints.push({ level: 'ok', text: `距离合适（约 ${m.distance.toFixed(1)} m）。` });
  }

  /* ---- 头顶留白 / 脚部 ---- */
  if (m.headroom !== null) {
    const range = framing === 'close' ? [0.30, 0.46] : framing === 'half' ? [0.18, 0.30] : [0.06, 0.18];
    if (m.headroom < range[0]) {
      out.hints.push({ level: 'warn', text: `头顶快贴边了（留白 ${(m.headroom * 100).toFixed(0)}%）。镜头稍微抬高，或后退半步。` });
    } else if (m.headroom > range[1]) {
      out.hints.push({ level: 'warn', text: `头顶留白偏多（${(m.headroom * 100).toFixed(0)}%）。镜头压低一点，让人往上顶。` });
    }
  }
  if (framing === 'full' && m.feetRatio !== null && m.feetRatio > 0.985) {
    out.hints.push({ level: 'bad', text: '脚被裁掉了。后退或把机位抬高后仰一点。' });
  }

  /* ---- 水平位置（三分法） ---- */
  const cx = m.chestX;
  if (cx < 0.30) out.hints.push({ level: 'warn', text: '主体太贴左边缘，往右挪到左三分线上。' });
  else if (cx > 0.70) out.hints.push({ level: 'warn', text: '主体太贴右边缘，往左挪到右三分线上。' });

  /* ---- 水平仪 ---- */
  if (typeof p.tilt === 'number' && isFinite(p.tilt) && Math.abs(p.tilt) > 2.5) {
    out.hints.push({ level: 'warn', text: `画面歪了 ${p.tilt.toFixed(1)}°，把手机端平。` });
  }

  /* ---- 曝光 ---- */
  if (typeof p.brightness === 'number' && isFinite(p.brightness)) {
    out.metrics.brightness = p.brightness;
    if (p.brightness < 0.20) out.hints.push({ level: 'warn', text: '画面偏暗：让主体转向光源，或点屏幕亮处测光。' });
    else if (p.brightness > 0.86) out.hints.push({ level: 'warn', text: '画面偏亮，高光容易糊：降低曝光补偿 0.7 档左右。' });
  }

  /* ---- 人数校验 ---- */
  const want = p.refPose?.scene === 'couple' ? 2 : p.refPose?.scene === 'group' ? 3 : 1;
  if (out.people < want) {
    out.hints.push({ level: 'warn', text: `参考姿势需要 ${want} 人，画面里只识别到 ${out.people} 人。` });
  }

  /* ---- 姿态吻合 ---- */
  if (p.refPose) {
    const aligned = alignReference(p.refPose.joints, detCanvas, p.h);
    if (aligned) {
      out.alignedRef = aligned.pts;
      const sc = scorePose(aligned.pts, detCanvas);
      out.score = sc.score;
      out.segScores = sc.segScores;
      if (sc.score !== null) {
        out.metrics.poseScore = sc.score;
        if (sc.score >= 0.85) {
          out.hints.push({ level: 'ok', text: `姿势到位（${Math.round(sc.score * 100)} 分），按快门。` });
        } else {
          for (const w of sc.worst) {
            const joint = w.aErr > 25 ? w.b : w.a;
            const dir = directionHint(aligned.pts, detCanvas, joint, p.h);
            if (dir) {
              out.hints.push({
                level: sc.score > 0.6 ? 'warn' : 'bad',
                text: `${CN[joint] || joint}${dir}（${Math.round(w.seg * 100)} 分）。`,
              });
            }
          }
        }
      }
    }
  }

  out.metrics.feetRatio = m.feetRatio;
  out.metrics.headroom = m.headroom;
  return out;
}

/** 从源画面采一个 48×48 的亮度均值，用于曝光提示 */
export function sampleBrightness(source, w, h, scratch) {
  const c = scratch || document.createElement('canvas');
  c.width = 48; c.height = 48;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  try {
    ctx.drawImage(source, 0, 0, 48, 48);
    const d = ctx.getImageData(0, 0, 48, 48).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) {
      sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    }
    return sum / (d.length / 4);
  } catch (e) {
    return null;
  }
}
