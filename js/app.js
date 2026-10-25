/* 应用装配：页签、地图、机位、姿势库、相机实时教练。 */

import * as GEO from './geo.js';
import { posesFiltered, getPose, paintThumb, drawSkeleton, SCENES, PLACES, STYLES } from './poses.js';
import {
  loadSpots, saveSpots, makeSpot, createMap, setMe, renderSpotMarkers, flyToSpot,
  searchPoi, withDistance, navigateUrl, fmtDist,
} from './spots.js';
import { Coach, analyze, sampleBrightness } from './coach.js';
import { Camera, drawGuides, coverRect, compositeShot, downloadBlob } from './camera.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const SETTINGS_KEY = 'photo-coach.settings.v1';
const UI_KEY = 'photo-coach.ui.v1';

function loadJSON(key, fallback) {
  try { return { ...fallback, ...(JSON.parse(localStorage.getItem(key) || '{}')) }; } catch { return fallback; }
}

const state = {
  tab: 'spots',
  spots: loadSpots(),
  me: null,
  targetSpot: null,
  pose: null,
  filters: { scene: 'all', place: 'all', style: 'all' },
  settings: loadJSON(SETTINGS_KEY, { amapKey: '', model: 'full' }),
  ui: loadJSON(UI_KEY, { framing: 'full', subjectH: 1.7, hfov: 66, opacity: 0.55 }),
  camOn: false,
  coach: null,
  coachLoad: null,
  modelStatus: '未加载',
  tilt: null,
  lastAnalysis: null,
  imageMode: null,
};

/* ================= 通用 UI ================= */
let toastTimer = null;
function toast(msg, ms = 2400) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

function switchTab(name) {
  state.tab = name;
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  if (name === 'spots') {
    setTimeout(() => state.mapCtl?.map.invalidateSize(), 60);
  }
  if (name === 'camera') {
    if (state.mapCtl) setTimeout(() => state.mapCtl.map.invalidateSize(), 60);
    renderCamPanel();
  }
}

$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('.tab');
  if (b) switchTab(b.dataset.tab);
});

/* ================= 设置 ================= */
function openSettings() {
  $('#set-amap-key').value = state.settings.amapKey || '';
  $('#set-model').value = state.settings.model || 'full';
  $('#dlg-settings').showModal();
}
$('#btn-settings').addEventListener('click', openSettings);
$('#btn-save-settings').addEventListener('click', () => {
  state.settings.amapKey = $('#set-amap-key').value.trim();
  state.settings.model = $('#set-model').value;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  toast('设置已保存到本机');
});

/* ================= 打卡点 / 地图 ================= */
function initSpots() {
  const ctl = createMap($('#map'), {
    center: state.me ? GEO.wgs84ToGcj02(state.me.lat, state.me.lng) : [30.2590, 120.1500],
    zoom: 14,
  });
  state.mapCtl = ctl;
  renderSpotMarkers(ctl.map, state.spots, (s) => selectSpot(s));
  renderSpotList();
  $('#spot-detail').classList.add('empty');
  $('#spot-detail').textContent = '选一个机位看详情';
}

$('#btn-locate').addEventListener('click', () => locate(true));
$('#btn-basemap').addEventListener('click', (e) => {
  const m = state.mapCtl.toggleBasemap();
  e.currentTarget.classList.toggle('on', m === 'sat');
  e.currentTarget.textContent = m === 'sat' ? '🗺 路网' : '🛰 卫星';
});

function locate(fly) {
  if (!navigator.geolocation) { $('#geo-status').textContent = '此浏览器不支持定位'; return; }
  $('#geo-status').textContent = '定位中…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.me = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy };
      applyMe(fly);
      toast(`已定位，精度约 ${Math.round(pos.coords.accuracy)} m`);
      locateWatch();
    },
    (err) => {
      $('#geo-status').textContent = `定位失败：${err.message}`;
      toast('定位失败。请允许位置权限；http 页面只有 localhost 能定位。', 4200);
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
  );
}

function locateWatch() {
  if (state.watchId) return;
  state.watchId = navigator.geolocation.watchPosition((pos) => {
    state.me = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy };
    applyMe(false);
    renderSpotList();
    renderTargetSpot();
  }, () => {}, { enableHighAccuracy: true, maximumAge: 15000 });
}

function applyMe(fly) {
  if (!state.me) return;
  const ctl = state.mapCtl;
  setMe(ctl.map, state.me.lat, state.me.lng);
  if (fly) ctl.map.setView(GEO.wgs84ToGcj02(state.me.lat, state.me.lng), 15, { duration: 0.5 });
  const acc = state.me.acc ? ` ±${Math.round(state.me.acc)}m` : '';
  $('#geo-status').textContent = `${state.me.lat.toFixed(5)}, ${state.me.lng.toFixed(5)}${acc}`;
  renderSpotList();
  renderTargetSpot();
}

function renderSpotList() {
  const ul = $('#spot-list');
  const list = withDistance(state.spots, state.me?.lat, state.me?.lng);
  if (!list.length) {
    ul.innerHTML = `<li class="spot-item" style="cursor:default">还没有机位。走到你想常来的位置，点「＋ 存当前机位」，记下站位、焦段和时段。</li>`;
    return;
  }
  ul.innerHTML = list.map((s) => `
    <li class="spot-item ${state.targetSpot?.id === s.id ? 'active' : ''}" data-id="${s.id}">
      <div class="t"><span class="n">${esc(s.name)}</span>
        <span class="d">${s.dist != null ? fmtDist(s.dist) : '—'}</span></div>
      <div class="m"><span class="tag">${esc(s.type)}</span>${s.focal}mm · ${esc(s.height)} · ${esc(s.bestTime)}</div>
    </li>`).join('');
  ul.onclick = (e) => {
    const li = e.target.closest('.spot-item');
    const s = state.spots.find((x) => x.id === li?.dataset.id);
    if (s) selectSpot(s);
  };
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function selectSpot(s) {
  state.targetSpot = s;
  renderSpotList();
  renderSpotDetail(s);
  renderTargetSpot();
  flyToSpot(state.mapCtl.map, s);
}

function renderSpotDetail(s) {
  const d = $('#spot-detail');
  d.classList.remove('empty');
  const sun = GEO.goldenHourText(s.lat, s.lng);
  const me = state.me;
  const dist = me ? GEO.haversine(me.lat, me.lng, s.lat, s.lng) : null;
  const dir = me ? GEO.compass(GEO.bearing(me.lat, me.lng, s.lat, s.lng)) : null;
  d.innerHTML = `
    <h4>${esc(s.name)}</h4>
    <dl>
      <dt>距离</dt><dd>${dist != null ? `${fmtDist(dist)} · ${dir} · 步行 ${GEO.fmtWalk(dist)}` : '未定位'}</dd>
      <dt>类型</dt><dd>${esc(s.type)}</dd>
      <dt>推荐焦段</dt><dd>${s.focal}mm 等效</dd>
      <dt>机位高度</dt><dd>${esc(s.height)}</dd>
      <dt>最佳时段</dt><dd>${esc(s.bestTime)}</dd>
      ${sun ? `<dt>今日日照</dt><dd>日出 ${sun.sunrise} / 日落 ${sun.sunset}<br>黄金时刻 ${sun.golden}</dd>` : ''}
      ${s.note ? `<dt>备注</dt><dd>${esc(s.note)}</dd>` : ''}
    </dl>
    <div class="acts">
      <button class="btn sm primary" data-act="shoot">照这个拍</button>
      <button class="btn sm" data-act="nav">导航</button>
      <button class="btn sm" data-act="del">删除</button>
    </div>`;
  d.onclick = (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'shoot') { bindSpotToCamera(s); switchTab('camera'); }
    if (act === 'nav') window.open(navigateUrl(s), '_blank');
    if (act === 'del') {
      if (!confirm(`删除机位「${s.name}」？`)) return;
      state.spots = state.spots.filter((x) => x.id !== s.id);
      saveSpots(state.spots);
      if (state.targetSpot?.id === s.id) state.targetSpot = null;
      renderSpotMarkers(state.mapCtl.map, state.spots, (x) => selectSpot(x));
      renderSpotList();
      renderTargetSpot();
      d.classList.add('empty');
      d.textContent = '已删除';
    }
  };
}

function bindSpotToCamera(s) {
  state.targetSpot = s;
  // 按机位类型挑一个合适的参考姿势
  const place = s.type === '山海' ? 'nature' : s.type === '室内' ? 'indoor' : 'city';
  if (!state.pose || !state.pose.place.includes(place)) {
    const cand = posesFiltered({ place })[0];
    if (cand) selectPose(cand, { silent: true });
  }
  renderTargetSpot();
  toast(`已绑定机位「${s.name}」`);
}

/* ---- 新建机位 ---- */
$('#btn-add-spot').addEventListener('click', () => {
  if (!state.me) {
    toast('先点「定位」拿到当前位置，再存机位。', 3200);
    return;
  }
  $('#sp-coord').textContent = `坐标：${state.me.lat.toFixed(5)}, ${state.me.lng.toFixed(5)}（WGS-84，精度 ±${Math.round(state.me.acc || 0)}m）`;
  $('#dlg-spot').showModal();
});
$('#btn-save-spot').addEventListener('click', (e) => {
  if (!state.me) { e.preventDefault(); return; }
  const name = $('#sp-name').value.trim();
  if (!name) { e.preventDefault(); $('#sp-name').focus(); return; }
  const spot = makeSpot({
    name,
    type: $('#sp-type').value,
    focal: $('#sp-focal').value,
    height: $('#sp-height').value,
    bestTime: $('#sp-time').value,
    note: $('#sp-note').value.trim(),
    lat: state.me.lat, lng: state.me.lng,
  });
  state.spots.unshift(spot);
  saveSpots(state.spots);
  renderSpotMarkers(state.mapCtl.map, state.spots, (x) => selectSpot(x));
  renderSpotList();
  selectSpot(spot);
  $('#form-spot').reset();
  toast('机位已保存到本机');
});

/* ---- 高德 POI 搜索 ---- */
$('#btn-poi').addEventListener('click', async () => {
  if (!state.settings.amapKey) { openSettings(); toast('先填高德 Web 服务 Key，再点这里。', 3600); return; }
  if (!state.me) { toast('先定位。', 2200); return; }
  const btn = $('#btn-poi');
  btn.disabled = true; btn.textContent = '搜索中…';
  try {
    const found = await searchPoi({ key: state.settings.amapKey, lat: state.me.lat, lng: state.me.lng, radius: 3000 });
    if (!found.length) { toast('附近 3 km 没有搜到 POI', 3000); return; }
    let added = 0;
    for (const f of found) {
      if (state.spots.some((s) => Math.abs(s.lat - f.lat) < 1e-5 && Math.abs(s.lng - f.lng) < 1e-5)) continue;
      state.spots.push(makeSpot(f));
      added++;
    }
    saveSpots(state.spots);
    renderSpotMarkers(state.mapCtl.map, state.spots, (x) => selectSpot(x));
    renderSpotList();
    toast(`找到 ${found.length} 个，新增 ${added} 个候选机位`);
  } catch (err) {
    toast(`搜索失败：${err.message}`, 5200);
  } finally {
    btn.disabled = false; btn.textContent = '搜附近';
  }
});

/* ================= 姿势库 ================= */
function initPoses() {
  $('#f-scene').value = state.filters.scene;
  $('#f-place').value = state.filters.place;
  $('#f-style').value = state.filters.style;
  ['#f-scene', '#f-place', '#f-style'].forEach((sel) => {
    $(sel).addEventListener('change', () => {
      state.filters.scene = $('#f-scene').value;
      state.filters.place = $('#f-place').value;
      state.filters.style = $('#f-style').value;
      renderPoseGrid();
    });
  });
  renderPoseGrid();
}

function renderPoseGrid() {
  const grid = $('#pose-grid');
  const list = posesFiltered(state.filters);
  $('#pose-count').textContent = `${list.length} / ${posesFiltered({}).length} 个姿势`;
  grid.innerHTML = list.map((p) => `
    <div class="pose-card ${state.pose?.id === p.id ? 'sel' : ''}" data-id="${p.id}">
      <canvas></canvas>
      <div class="pc-n">${esc(p.name)}</div>
      <div class="pc-t">${SCENES[p.scene]} · ${p.place.map((x) => PLACES[x]).join('/')} · ${p.focal}mm</div>
      <span class="pc-badge">${STYLES[p.style]}</span>
    </div>`).join('');
  $$('.pose-card canvas').forEach((cv, i) => paintThumb(cv, list[i]));
  grid.onclick = (e) => {
    const card = e.target.closest('.pose-card');
    const p = getPose(card?.dataset.id);
    if (p) selectPose(p);
  };
}

function selectPose(p, opt = {}) {
  state.pose = p;
  $$('.pose-card').forEach((c) => c.classList.toggle('sel', c.dataset.id === p.id));
  renderCamPanel();
  if (!opt.silent) toast(`参考姿势：${p.name}`);
}

/* ================= 相机 ================= */
const cam = new Camera($('#video'));
const stage = $('#stage');
const overlay = $('#overlay');
const octx = overlay.getContext('2d');

const MODEL_TIMEOUT_MS = 30000;

/** 给可能永久挂起的 Promise 加超时，超时后允许下次重试 */
function withTimeout(promise, ms, onTimeout) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(onTimeout()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function ensureCoach() {
  if (state.coach?.landmarker) return state.coach;
  if (!state.coachLoad) {
    state.coach = state.coach || new Coach();
    state.coachLoad = state.coach.load({
      model: state.settings.model,
      onStatus: (s) => { state.modelStatus = s; $('#model-info').textContent = s; },
    }).then(() => {
      $('#model-info').textContent = '就绪';
      return state.coach;
    }).catch((err) => {
      // 失败后清空，用户再点一次就会重新加载
      state.coach = null;
      state.coachLoad = null;
      state.modelStatus = '未加载';
      $('#model-info').textContent = '未加载';
      throw err;
    });
  }
  try {
    return await withTimeout(state.coachLoad, MODEL_TIMEOUT_MS, () => {
      const e = new Error('模型加载超时');
      e.name = 'ModelTimeoutError';
      return e;
    });
  } catch (err) {
    state.coach = null;
    state.coachLoad = null;
    throw err;
  }
}

function modelFailReason(err) {
  if (err?.name === 'ModelTimeoutError') {
    return '模型加载超过 30 秒还没好，可能是网络慢。再点一次「用照片测试」会重新加载。';
  }
  return `模型加载失败：${err?.message || '原因不明'}。再点一次会重新加载。`;
}

$('#btn-cam-start').addEventListener('click', async () => {
  const hint = $('#stage-hint');
  hint.hidden = true;
  try {
    await ensureCoach();
    await cam.start('user');
    state.camOn = true;
    state.imageMode = null;
    state.staticResult = null;
    $('#stage-placeholder').hidden = true;
    $('#still').hidden = true;
    $('#video').style.display = '';
    $('#video').classList.toggle('mirror', cam.facing === 'user');
    startLoop();
  } catch (err) {
    if (err?.name === 'ModelTimeoutError' || /模型|landmarker|wasm|task/i.test(err?.message || '')) {
      const r = modelFailReason(err);
      hint.textContent = r;
      hint.hidden = false;
      toast(r, 6000);
      return;
    }
    const reason = camFailReason(err);
    hint.textContent = `摄像头没起来：${reason}`;
    hint.hidden = false;
    toast(`相机启动失败：${reason}`, 6000);
  }
});

/** 把 getUserMedia 的各种失败翻译成能照着做的一句话 */
function camFailReason(err) {
  const n = err?.name || '';
  if (n === 'NotFoundError' || n === 'DevicesNotFoundError') {
    return '这台设备没有可用的摄像头。可以先点「用照片测试」验证整套流程。';
  }
  if (n === 'NotAllowedError' || n === 'SecurityError') {
    return '浏览器拒绝了摄像头权限。点地址栏左侧的锁图标，把「摄像头」改成允许，然后刷新页面。';
  }
  if (n === 'NotReadableError' || n === 'TrackStartError') {
    return '摄像头被别的程序占用了（视频会议、相机 App 等），关掉它们再试。';
  }
  if (n === 'OverconstrainedError') {
    return '这个摄像头不支持请求的分辨率，换一个摄像头或降低要求再试。';
  }
  if (location.protocol === 'file:') {
    return '当前是 file:// 打开的，浏览器只允许 https 或 localhost 使用摄像头。用 node server.mjs 起本地服务再打开。';
  }
  return err?.message ? `${err.message}（可用「用照片测试」验证流程）` : '原因不明，可用「用照片测试」验证流程。';
}

$('#btn-flip').addEventListener('click', async () => {
  if (!state.camOn) return;
  try {
    await cam.flip();
    $('#video').classList.toggle('mirror', cam.facing === 'user');
  } catch (e) { toast(`切换失败：${e.message}`); }
});

$('#file-test').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const hint = $('#stage-hint');
  hint.hidden = true;
  try {
    await ensureCoach();
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.src = url;
    await img.decode();
    state.imageMode = img;
    state.camOn = false;
    state.staticResult = null;
    $('#stage-placeholder').hidden = true;
    $('#video').style.display = 'none';
    const still = $('#still');
    still.src = url;
    still.hidden = false;
    startLoop();
    // 静态图：检测一次即可
    const res = state.coach.detect(img, performance.now() + 1);
    state.staticResult = res;
    toast(res?.persons?.length ? `已载入照片，检测到 ${res.persons.length} 人` : '已载入照片，但没检测到人', 3600);
  } catch (err) {
    const isModel = err?.name === 'ModelTimeoutError' || /模型|landmarker|wasm|task/i.test(err?.message || '');
    const msg = isModel ? modelFailReason(err) : `载入失败：${err?.message || '原因不明'}`;
    if (isModel) {
      hint.textContent = msg;
      hint.hidden = false;
    }
    toast(msg, 5000);
  }
});

function stageSize() {
  const r = stage.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  return { w: r.width, h: r.height, dpr };
}

let rafId = null;
let lastDetect = 0;
let lastPanel = 0;
let brightness = null;
const scratch = document.createElement('canvas');

function startLoop() {
  if (rafId) return;
  const tick = (ts) => {
    rafId = requestAnimationFrame(tick);
    const src = state.imageMode || (state.camOn ? $('#video') : null);
    if (!src) return;
    const ready = state.imageMode ? true : (src.readyState >= 2);
    if (!ready) return;

    const { w, h, dpr } = stageSize();
    if (!w || !h) return;
    if (overlay.width !== Math.round(w * dpr) || overlay.height !== Math.round(h * dpr)) {
      overlay.width = Math.round(w * dpr);
      overlay.height = Math.round(h * dpr);
      overlay.style.width = `${w}px`;
      overlay.style.height = `${h}px`;
    }

    // 检测（节流到 ~12fps）
    let result = state.staticResult;
    if (!state.imageMode) {
      if (ts - lastDetect > 80) {
        result = state.coach?.detect(src, ts) || null;
        state.staticResult = result;
        lastDetect = ts;
        brightness = sampleBrightness(src, src.videoWidth || src.width, src.videoHeight || src.height, scratch);
      } else {
        result = state.staticResult;
      }
    }

    renderFrame(result, w, h, dpr, ts);
  };
  rafId = requestAnimationFrame(tick);
}

function renderFrame(result, w, h, dpr, ts) {
  const src = state.imageMode || $('#video');
  const vw = state.imageMode ? src.naturalWidth : (src.videoWidth || 1280);
  const vh = state.imageMode ? src.naturalHeight : (src.videoHeight || 720);
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  octx.clearRect(0, 0, w, h);
  drawGuides(octx, w, h, { thirds: true });

  const persons = result?.persons || [];
  const map = coverRect(vw, vh, w, h, cam.facing === 'user' && state.camOn);

  // 参考姿势：先按人身上对齐；没有检测结果时给一个居中的默认摆位
  let analysis = null;
  if (persons.length && state.coach?.landmarker) {
    analysis = analyze({
      persons,
      refPose: state.pose,
      w, h,
      videoW: vw, videoH: vh,
      flip: cam.facing === 'user' && state.camOn,
      mapDet: map.toCanvas,
      subjectH: state.ui.subjectH,
      hfov: state.ui.hfov,
      framing: state.ui.framing,
      brightness,
      tilt: state.tilt,
    });
    state.lastAnalysis = analysis;
    window.__lastAnalysis = analysis; // 调试用：控制台可查最近一帧的分析结果
  }

  const alpha = state.ui.opacity;
  if (analysis?.alignedRef) {
    drawSkeleton(octx, analysis.alignedRef, {
      color: '#59a6ff', jointColor: '#8ec8ff',
      lineWidth: Math.max(2, h * 0.006), alpha: Math.max(alpha, 0.35),
      scores: analysis.segScores, weakColor: 'rgba(120,150,190,.5)',
    });
  } else if (state.pose) {
    // 没人时把参考姿势摆在画面中央（等比，避免宽画布拉伸）
    const refPx = {};
    const unitX = h * 0.80, unitY = h * 0.85;
    for (const k in state.pose.joints) {
      refPx[k] = [w / 2 + (state.pose.joints[k][0] - 0.5) * unitX, h / 2 + (state.pose.joints[k][1] - 0.5) * unitY];
    }
    drawSkeleton(octx, refPx, { color: 'rgba(89,166,255,.85)', lineWidth: 3, alpha });
  }

  // 实测骨架
  if (analysis?.detCanvas) {
    drawSkeleton(octx, analysis.detCanvas, { color: 'rgba(255,255,255,.55)', jointColor: '#fff', lineWidth: 1.6, jointRadius: 2.4 });
  }

  // 面板节流更新
  if (ts - lastPanel > 180) {
    lastPanel = ts;
    updateHud(analysis, persons.length, ts);
  }
}

function updateHud(analysis, people, ts) {
  const m = analysis?.metrics || {};
  $('#m-dist').textContent = m.distance ? `${m.distance.toFixed(1)} m` : '—';
  $('#m-dist-target').textContent = m.distanceTarget ? `${m.distanceTarget.toFixed(1)} m` : '—';
  $('#m-fill').textContent = m.fill ? `${Math.round(m.fill * 100)}%` : '—';
  $('#m-pose').textContent = (typeof m.poseScore === 'number') ? `${Math.round(m.poseScore * 100)} 分` : '—';
  $('#m-expo').textContent = (typeof m.brightness === 'number') ? `${Math.round(m.brightness * 100)}%` : '—';
  $('#hud-people').textContent = `${people} 人`;
  if (state.fps == null) state.fps = 0;
  const fps = Math.round(1000 / Math.max(1, ts - (state.lastTs || ts)));
  state.lastTs = ts;
  $('#hud-fps').textContent = `${isFinite(fps) ? Math.min(fps, 99) : 0} fps`;

  const ring = $('#score-ring');
  if (typeof m.poseScore === 'number') {
    ring.hidden = false;
    const arc = $('#score-arc');
    const C = 2 * Math.PI * 19;
    arc.style.strokeDashoffset = String(C * (1 - m.poseScore));
    arc.style.stroke = m.poseScore > 0.8 ? 'var(--acc)' : m.poseScore > 0.55 ? 'var(--warn)' : 'var(--bad)';
    $('#score-num').textContent = String(Math.round(m.poseScore * 100));
  } else {
    ring.hidden = true;
  }

  const hints = (analysis?.hints || []).slice(0, 3);
  const box = $('#hud-hints');
  const html = hints.map((x) => `<div class="hint ${x.level}">${esc(x.text)}</div>`).join('');
  if (box.dataset.sig !== html) { box.innerHTML = html; box.dataset.sig = html; }
}

function renderCamPanel() {
  const mini = $('#pose-mini');
  if (state.pose) {
    $('#pose-name').textContent = state.pose.name;
    const t = state.pose.tips;
    $('#pose-tips').innerHTML = `${esc(t.arm)}；${esc(t.leg)}；${esc(t.gaze)}。`;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = 120, h = 160;
    mini.width = w * dpr; mini.height = h * dpr;
    mini.style.width = `${w}px`; mini.style.height = `${h}px`;
    const ctx = mini.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const px = {};
    for (const k in state.pose.joints) px[k] = [state.pose.joints[k][0] * w, state.pose.joints[k][1] * h];
    drawSkeleton(ctx, px, { color: '#3ddc97', lineWidth: 2.4, jointRadius: 2.6 });
  } else {
    $('#pose-name').textContent = '未选择';
    $('#pose-tips').textContent = '在「姿势」页选一个，或在机位详情点「照这个拍」';
  }
  $$('#seg-framing button').forEach((b) => b.classList.toggle('active', b.dataset.v === state.ui.framing));
  $('#opacity').value = String(state.ui.opacity);
  $('#subj-height').value = String(state.ui.subjectH);
  $('#subj-height-val').textContent = `${state.ui.subjectH.toFixed(2)} m`;
  $('#hfov').value = String(state.ui.hfov);
  $('#hfov-val').textContent = `${state.ui.hfov}°`;
  $('#model-info').textContent = state.modelStatus;
}

$('#btn-rand-pose').addEventListener('click', () => {
  const list = posesFiltered(state.filters);
  if (!list.length) return;
  const next = list[Math.floor(Math.random() * list.length)];
  selectPose(next, { silent: true });
  toast(`参考姿势：${next.name}`);
});

$('#seg-framing').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  state.ui.framing = b.dataset.v;
  localStorage.setItem(UI_KEY, JSON.stringify(state.ui));
  $$('#seg-framing button').forEach((x) => x.classList.toggle('active', x === b));
});

$('#opacity').addEventListener('input', (e) => {
  state.ui.opacity = Number(e.target.value);
  localStorage.setItem(UI_KEY, JSON.stringify(state.ui));
});
$('#subj-height').addEventListener('input', (e) => {
  state.ui.subjectH = Number(e.target.value);
  $('#subj-height-val').textContent = `${state.ui.subjectH.toFixed(2)} m`;
  localStorage.setItem(UI_KEY, JSON.stringify(state.ui));
});
$('#hfov').addEventListener('input', (e) => {
  state.ui.hfov = Number(e.target.value);
  $('#hfov-val').textContent = `${state.ui.hfov}°`;
  localStorage.setItem(UI_KEY, JSON.stringify(state.ui));
});

$('#btn-snap').addEventListener('click', async () => {
  const src = state.imageMode || $('#video');
  if (!src || (!state.camOn && !state.imageMode)) { toast('相机还没开'); return; }
  const vw = state.imageMode ? src.naturalWidth : src.videoWidth;
  const vh = state.imageMode ? src.naturalHeight : src.videoHeight;
  try {
    const blob = await compositeShot({
      source: src, sourceW: vw, sourceH: vh,
      overlayCanvas: overlay, mirror: cam.facing === 'user' && state.camOn,
      withOverlay: true,
    });
    const name = `photo-coach-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    downloadBlob(blob, name);
    toast('已保存到下载目录');
  } catch (e) {
    toast(`保存失败：${e.message}`, 4000);
  }
});

function renderTargetSpot() {
  const box = $('#target-spot');
  const s = state.targetSpot;
  if (!s) { box.textContent = '未绑定。在「打卡点」页选中一个机位后会自动绑定。'; return; }
  const me = state.me;
  const dist = me ? GEO.haversine(me.lat, me.lng, s.lat, s.lng) : null;
  const dir = me ? GEO.compass(GEO.bearing(me.lat, me.lng, s.lat, s.lng)) : null;
  const sun = GEO.goldenHourText(s.lat, s.lng);
  box.innerHTML = `<b>${esc(s.name)}</b>（${esc(s.type)}）<br>
    站到机位上：${dist != null ? `距你 ${fmtDist(dist)}，${dir}方向，步行 ${GEO.fmtWalk(dist)}` : '未定位'}<br>
    推荐 ${s.focal}mm 等效 · 机位高度 ${esc(s.height)} · ${esc(s.bestTime)}
    ${sun ? `<br>今日黄金时刻 ${sun.golden}（日落 ${sun.sunset}）` : ''}
    ${s.note ? `<br><span class="muted">${esc(s.note)}</span>` : ''}`;
}

/* ---- 重力传感器（水平仪） ---- */
function initTilt() {
  const handler = (e) => {
    // 竖屏时用 gamma；横屏时用 beta
    const portrait = (screen.orientation?.angle ?? window.orientation ?? 0) % 180 === 0;
    state.tilt = portrait ? e.gamma : e.beta;
    if (state.tilt != null) state.tilt = Math.round(state.tilt * 10) / 10;
  };
  const start = () => window.addEventListener('deviceorientation', handler, true);
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    // iOS 需要用户手势，挂在第一次点「开启相机」上
    $('#btn-cam-start').addEventListener('click', () => {
      DeviceOrientationEvent.requestPermission().then((r) => { if (r === 'granted') start(); }).catch(() => {});
    }, { once: true });
  } else if (typeof DeviceOrientationEvent !== 'undefined') {
    start();
  }
}

/* ================= 启动 ================= */
initSpots();
initPoses();
initTilt();
renderCamPanel();
renderTargetSpot();

// 默认选一个姿势，进相机页就有参考
(function pickDefault() {
  const p = posesFiltered({ place: 'city' })[0];
  if (p) selectPose(p, { silent: true });
})();

// 只有「已经授权过」才静默定位；没授权就等用户点定位按钮，避免一进页面就弹权限框
(async function autoLocate() {
  try {
    const p = await navigator.permissions?.query({ name: 'geolocation' });
    if (p?.state === 'granted') locate(false);
    else $('#geo-status').textContent = '未定位 · 点「📍 定位」允许位置';
  } catch {
    $('#geo-status').textContent = '未定位 · 点「📍 定位」允许位置';
  }
  // 从别的页面带着目标机位过来时也要刷新一次距离
  renderTargetSpot();
})();

window.addEventListener('beforeunload', () => cam.stop());
