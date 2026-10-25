/* 坐标 / 距离 / 日照 工具集。全部纯函数，无依赖。 */

const PI = Math.PI;
const rad = PI / 180;
const deg = 180 / PI;

/* ---------------- WGS84 <-> GCJ-02 ----------------
   高德瓦片使用 GCJ-02，浏览器 geolocation 返回 WGS84。
   不转换会导致标记偏移 300~700 米。算法为公开的加偏实现。 */
const A = 6378245.0;
const EE = 0.00669342162296594323;

function outOfChina(lat, lng) {
  return !(lng > 73.66 && lng < 135.05 && lat > 3.86 && lat < 53.55);
}
function tLat(x, y) {
  let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  r += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
  r += (20 * Math.sin(y * PI) + 40 * Math.sin(y / 3 * PI)) * 2 / 3;
  r += (160 * Math.sin(y / 12 * PI) + 320 * Math.sin(y * PI / 30)) * 2 / 3;
  return r;
}
function tLng(x, y) {
  let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  r += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
  r += (20 * Math.sin(x * PI) + 40 * Math.sin(x / 3 * PI)) * 2 / 3;
  r += (150 * Math.sin(x / 12 * PI) + 300 * Math.sin(x / 30 * PI)) * 2 / 3;
  return r;
}
export function wgs84ToGcj02(lat, lng) {
  if (outOfChina(lat, lng)) return [lat, lng];
  let dLat = tLat(lng - 105, lat - 35);
  let dLng = tLng(lng - 105, lat - 35);
  const rLat = lat / 180 * PI;
  let magic = Math.sin(rLat);
  magic = 1 - EE * magic * magic;
  const sq = Math.sqrt(magic);
  dLat = (dLat * 180) / ((A * (1 - EE)) / (magic * sq) * PI);
  dLng = (dLng * 180) / (A / sq * Math.cos(rLat) * PI);
  return [lat + dLat, lng + dLng];
}
export function gcj02ToWgs84(lat, lng) {
  if (outOfChina(lat, lng)) return [lat, lng];
  let wLat = lat, wLng = lng;
  for (let i = 0; i < 4; i++) {
    const [gLat, gLng] = wgs84ToGcj02(wLat, wLng);
    wLat += lat - gLat;
    wLng += lng - gLng;
  }
  return [wLat, wLng];
}

/* ---------------- 距离 ---------------- */
export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
export function bearing(lat1, lng1, lat2, lng2) {
  const y = Math.sin((lng2 - lng1) * rad) * Math.cos(lat2 * rad);
  const x = Math.cos(lat1 * rad) * Math.sin(lat2 * rad) -
    Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lng2 - lng1) * rad);
  return (Math.atan2(y, x) * deg + 360) % 360;
}
const DIRS = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
export function compass(degVal) {
  return DIRS[Math.round(((degVal % 360) / 45)) % 8];
}
export function fmtDist(m) {
  if (!isFinite(m)) return '—';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}
export function fmtWalk(m) {
  const min = Math.max(1, Math.round(m / 1.25 / 60)); // 1.25 m/s 步行
  return min < 60 ? `${min} 分钟` : `${(min / 60).toFixed(1)} 小时`;
}

/* ---------------- 日出日落（NOAA 近似解） ---------------- */
function dayOfYear(d) {
  const start = Date.UTC(d.getFullYear(), 0, 0);
  const diff = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - start;
  return Math.floor(diff / 86400000);
}
function sunEvent(lat, lng, date, rising) {
  const N = dayOfYear(date);
  const lngHour = lng / 15;
  const t = rising ? N + ((6 - lngHour) / 24) : N + ((18 - lngHour) / 24);
  const M = (0.9856 * t) - 3.289;
  let L = M + (1.916 * Math.sin(M * rad)) + (0.020 * Math.sin(2 * M * rad)) + 282.634;
  L = (L % 360 + 360) % 360;
  let RA = Math.atan(0.91764 * Math.tan(L * rad)) * deg;
  RA = (RA % 360 + 360) % 360;
  RA += Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90;
  RA /= 15;
  const sinDec = 0.39782 * Math.sin(L * rad);
  const cosDec = Math.cos(Math.asin(sinDec));
  const zenith = 90.833;
  const cosH = (Math.cos(zenith * rad) - (sinDec * Math.sin(lat * rad))) / (cosDec * Math.cos(lat * rad));
  if (cosH > 1 || cosH < -1) return null;
  let H = rising ? 360 - (Math.acos(cosH) * deg) : Math.acos(cosH) * deg;
  H /= 15;
  const T = H + RA - (0.06571 * t) - 6.622;
  let UT = (T - lngHour) % 24;
  if (UT < 0) UT += 24;
  const tz = -date.getTimezoneOffset() / 60; // 东八区 = 8
  const local = UT + tz;
  const h = Math.floor(local);
  const m = Math.round((local - h) * 60);
  return { h: (h + Math.floor(m / 60)) % 24, m: m % 60 };
}
export function sunTimes(lat, lng, date = new Date()) {
  const r = sunEvent(lat, lng, date, true);
  const s = sunEvent(lat, lng, date, false);
  if (!r || !s) return null;
  const fmt = (x) => `${String(x.h).padStart(2, '0')}:${String(x.m).padStart(2, '0')}`;
  const shift = (x, delta) => {
    let t = (x.h * 60 + x.m + delta + 1440) % 1440;
    return { h: Math.floor(t / 60), m: t % 60 };
  };
  return {
    sunrise: fmt(r),
    sunset: fmt(s),
    goldenAM: `${fmt(r)} — ${fmt(shift(r, 45))}`,
    goldenPM: `${fmt(shift(s, -40))} — ${fmt(s)}`,
    blue: `${fmt(s)} — ${fmt(shift(s, 20))}`,
  };
}
export function goldenHourText(lat, lng, date = new Date()) {
  const t = sunTimes(lat, lng, date);
  if (!t) return null;
  return { sunrise: t.sunrise, sunset: t.sunset, golden: t.goldenPM, am: t.goldenAM, blue: t.blue };
}
