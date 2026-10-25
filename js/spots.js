/* 机位（打卡点）存储 + 高德瓦片地图 + 高德 POI 搜索。
   坐标系约定：内部一律存 WGS-84；渲染到高德瓦片前转 GCJ-02。 */

import { wgs84ToGcj02, gcj02ToWgs84, haversine, bearing, fmtDist } from './geo.js';

const KEY = 'photo-coach.spots.v1';

/* ---------------- 存储 ---------------- */
export function loadSpots() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
export function saveSpots(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
}
export function makeSpot(data) {
  return {
    id: `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: data.name || '未命名机位',
    type: data.type || '街拍',
    lat: data.lat, lng: data.lng,
    focal: Number(data.focal) || 35,
    height: data.height || '胸口',
    bestTime: data.bestTime || '日落前 40 分钟',
    note: data.note || '',
    source: data.source || 'user',
    createdAt: Date.now(),
  };
}

/* ---------------- 地图 ---------------- */
const TILES = {
  road: (s) => `https://webrd0${s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}`,
  sat: (s) => `https://webst0${s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}`,
};

export function createMap(el, { center = [30.2590, 120.1500], zoom = 14 } = {}) {
  const map = L.map(el, { zoomControl: true, attributionControl: true }).setView(center, zoom);
  const layers = {};
  let current = 'road';
  const mk = (kind) => L.tileLayer(TILES[kind]('1234').replace('{s}', '{s}'), {
    subdomains: '1234', maxZoom: 18, detectRetina: false,
    attribution: '底图 © 高德地图 | 本站不采集你的位置',
  });
  // Leaflet 需要 {s} 占位，上面模板已包含；这里直接构造
  layers.road = L.tileLayer(TILES.road('{s}'), {
    subdomains: '1234', maxZoom: 18, attribution: '底图 © 高德地图',
  }).addTo(map);
  layers.sat = L.tileLayer(TILES.sat('{s}'), {
    subdomains: '1234', maxZoom: 18, attribution: '底图 © 高德地图（卫星）',
  });
  return {
    map,
    get basemap() { return current; },
    toggleBasemap() {
      if (current === 'road') { map.removeLayer(layers.road); layers.sat.addTo(map); current = 'sat'; }
      else { map.removeLayer(layers.sat); layers.road.addTo(map); current = 'road'; }
      return current;
    },
    leaflet: layers,
  };
}

export function setMe(map, wgsLat, wgsLng) {
  const [lat, lng] = wgs84ToGcj02(wgsLat, wgsLng);
  if (map.__me) map.__me.setLatLng([lat, lng]);
  else {
    map.__me = L.marker([lat, lng], {
      icon: L.divIcon({ className: '', html: '<div class="me-pin"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
      interactive: false, zIndexOffset: 500,
    }).addTo(map);
  }
  return [lat, lng];
}

export function renderSpotMarkers(map, spots, onClick) {
  if (map.__layer) map.removeLayer(map.__layer);
  const layer = L.layerGroup().addTo(map);
  map.__layer = layer;
  for (const s of spots) {
    const [lat, lng] = wgs84ToGcj02(s.lat, s.lng);
    const mk = L.marker([lat, lng], {
      icon: L.divIcon({ className: '', html: '<div class="spot-pin"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
      title: s.name,
    });
    mk.on('click', () => onClick?.(s));
    mk.bindTooltip(`${s.name}`, { direction: 'top', offset: [0, -8] });
    mk.addTo(layer);
  }
}

export function flyToSpot(map, spot, zoom = 17) {
  const [lat, lng] = wgs84ToGcj02(spot.lat, spot.lng);
  map.flyTo([lat, lng], zoom, { duration: 0.6 });
}

/* ---------------- 高德 POI 搜索（可选，需用户自备 Web 服务 Key） ---------------- */
const POI_TYPE = '110000|110200|110100'; // 风景名胜 / 风景名胜相关 / 公园

export async function searchPoi({ key, lat, lng, radius = 3000, keyword = '' }) {
  if (!key) throw new Error('未配置高德 Key');
  const [glat, glng] = wgs84ToGcj02(lat, lng);
  const params = new URLSearchParams({
    key, location: `${glng.toFixed(6)},${glat.toFixed(6)}`,
    radius: String(radius), offset: '25', page: '1', extensions: 'base',
    sortrule: 'distance',
    ...(keyword ? { keywords: keyword } : { types: POI_TYPE }),
  });
  const url = `https://restapi.amap.com/v3/place/around?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`高德接口 HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== '1') throw new Error(`高德返回错误：${data.info || 'unknown'}（${data.infocode || ''}）`);
  const pois = data.pois || [];
  return pois.map((p) => {
    const [lng2, lat2] = String(p.location || '').split(',').map(Number);
    const [wlat, wlng] = gcj02ToWgs84(lat2, lng2);
    return {
      name: p.name,
      type: '山海',
      lat: wlat, lng: wlng,
      focal: 35, height: '胸口', bestTime: '日落前 40 分钟',
      note: [p.type, p.address].filter(Boolean).join(' · '),
      source: 'amap',
    };
  }).filter((s) => isFinite(s.lat) && isFinite(s.lng));
}

/* ---------------- 排序与距离 ---------------- */
export function withDistance(spots, lat, lng) {
  return spots.map((s) => ({
    ...s,
    dist: (isFinite(lat) && isFinite(lng)) ? haversine(lat, lng, s.lat, s.lng) : null,
    dir: (isFinite(lat) && isFinite(lng)) ? bearing(lat, lng, s.lat, s.lng) : null,
  })).sort((a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity));
}

export function navigateUrl(spot) {
  const [lat, lng] = wgs84ToGcj02(spot.lat, spot.lng);
  return `https://uri.amap.com/marker?position=${lng.toFixed(6)},${lat.toFixed(6)}&name=${encodeURIComponent(spot.name)}&coordinate=gaode&callnative=0`;
}

export { fmtDist };
