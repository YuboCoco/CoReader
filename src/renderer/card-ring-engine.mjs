// WebGL 2 two-pass card ring renderer for CoReader account connections.
// Pass 1: 22-card ring with superellipse SDF, double-warped fBm fluid gradient,
//         mirrored mipmapped back-face textures, and per-pixel depth-of-field blur.
// Pass 2: Inside-view side glass rims with non-folding refraction and 7-tap dispersion.

export const RING_DEFAULTS = Object.freeze({
  pIn: 860,
  rim: 160,
  dispersion: 25,
  pOut: 1500,
  blur: 14,
  farFade: 50,
  flow: 20,
  corner: 32,
});

export const RING_COUNT = 22;
export const CARD_W = 180;
export const CARD_H = 300;
export const CARD_GAP = 18;
export const CARD_STEP = CARD_W + CARD_GAP; // 198
export const RING_CIRC = RING_COUNT * CARD_STEP; // 4356
export const RING_RADIUS = RING_CIRC / (2 * Math.PI); // ~693.28
export const LOGICAL_REF_WIDTH = 1040;
export const FLOW_LOOP_SECONDS = 17.07;
export const FLOW_RHO = (0.2 * FLOW_LOOP_SECONDS) / (2 * Math.PI); // ~0.5434

const PALETTES = [
  ['#ff7a3d', '#ff3d77', '#ffc46b', '#7a2cff'], // Tangerine
  ['#00c2c7', '#2f6bff', '#9ff3e0', '#0b2a6f'], // Lagoon
  ['#ff8fb1', '#ffd1dc', '#b84dff', '#ff5a5f'], // Peony
  ['#ffe14d', '#7ee081', '#ff9f1c', '#2ec4b6'], // Citrus
  ['#6a5cff', '#b18cff', '#ff7ad9', '#1b1464'], // Iris
  ['#2af598', '#009efd', '#b3ffab', '#12123a'], // Aurora
];

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const PALETTE_RGB = PALETTES.map((group) => group.map(hexToRgb));

export function parseCssColor(cssColor, fallback = [0.97, 0.98, 0.99]) {
  if (!cssColor || typeof cssColor !== 'string') return fallback;
  const trimmed = cssColor.trim();
  if (trimmed.startsWith('#')) {
    if (trimmed.length === 7) return hexToRgb(trimmed);
    if (trimmed.length === 4) {
      const r = parseInt(trimmed[1] + trimmed[1], 16) / 255;
      const g = parseInt(trimmed[2] + trimmed[2], 16) / 255;
      const b = parseInt(trimmed[3] + trimmed[3], 16) / 255;
      return [r, g, b];
    }
  }
  const match = trimmed.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (match) {
    return [Number(match[1]) / 255, Number(match[2]) / 255, Number(match[3]) / 255];
  }
  return fallback;
}

export function wrapArc(value) {
  const half = RING_CIRC * 0.5;
  return ((((value + half) % RING_CIRC) + RING_CIRC) % RING_CIRC) - half;
}

export function frontCardIndex(offset) {
  return ((Math.round(offset / CARD_STEP) % RING_COUNT) + RING_COUNT) % RING_COUNT;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Exact cubic-bezier(x1, y1, x2, y2) solver via Newton-Raphson + bisection fallback.
export function createBezier(x1, y1, x2, y2) {
  const sampleX = (t) => ((1 - 3 * x2 + 3 * x1) * t + (3 * x2 - 6 * x1)) * t * t + 3 * x1 * t;
  const sampleY = (t) => ((1 - 3 * y2 + 3 * y1) * t + (3 * y2 - 6 * y1)) * t * t + 3 * y1 * t;
  const slopeX = (t) => (3 * (1 - 3 * x2 + 3 * x1) * t + 2 * (3 * x2 - 6 * x1)) * t + 3 * x1;

  return function bezier(x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const dx = sampleX(t) - x;
      if (Math.abs(dx) < 1e-5) return sampleY(t);
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t = clamp(t - dx / d, 0, 1);
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 12; i++) {
      const cur = sampleX(t);
      if (Math.abs(cur - x) < 1e-5) break;
      if (cur < x) lo = t;
      else hi = t;
      t = (lo + hi) * 0.5;
    }
    return sampleY(t);
  };
}

export const EASE_BEND = createBezier(0.65, 0, 0.35, 1);
export const EASE_FLIP = createBezier(0.3, 0, 0.6, 1);
export const EASE_GLIDE = createBezier(0.25, 0.6, 0.2, 1);
export const EASE_FLICK = createBezier(0.4, 0, 0.12, 1);
export const EASE_PRESS = createBezier(0.22, 1, 0.36, 1);

export function cardPose(index, offset, bend, flip) {
  const s = wrapArc(index * CARD_STEP - offset);
  const c = bend / RING_RADIUS;
  let cx;
  let cz;
  let a;
  if (Math.abs(c) < 1e-6) {
    cx = s;
    cz = 0;
    a = 0;
  } else {
    a = s * c;
    cx = Math.sin(a) / c || 0;
    cz = (1 - Math.cos(a)) / c || 0;
  }
  const lag = Math.min(Math.abs(s) / (6 * CARD_STEP), 1);
  const turn = Math.PI * smoothstep(0, 1, flip * 1.55 - lag * 0.55);
  return { s, cx, cz, a, turn, theta: a + turn };
}

const CARD_VS = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aStrip; // x: -2 (left margin), [-1..1] card width, +2 (right margin); y: -1 (bottom), +1 (top)

uniform vec2 uLogicalSize;   // logical frame width, height
uniform float uPerspective;
uniform vec2 uCardSize;      // scaled w, h
uniform float uCenterX;
uniform float uCenterZ;
uniform float uTheta;
uniform float uMarginPx;

out vec2 vLocalPos;
out vec2 vScreenPos;
out float vWorldZ;
out float vHalfHScreen;
out float vSxMin;
out float vSxMax;
out float vFacing;

void main() {
  float cosT = cos(uTheta);
  float sinT = sin(uTheta);
  float halfW = uCardSize.x * 0.5;
  float halfH = uCardSize.y * 0.5;

  // Projected screen X of the card's two vertical edges.
  float zL = uCenterZ - halfW * sinT;
  float zR = uCenterZ + halfW * sinT;
  float xL = uCenterX - halfW * cosT;
  float xR = uCenterX + halfW * cosT;
  float sxL = xL * uPerspective / max(1.0, uPerspective - zL);
  float sxR = xR * uPerspective / max(1.0, uPerspective - zR);
  float sxMin = min(sxL, sxR);
  float sxMax = max(sxL, sxR);

  float uCoord = clamp(aStrip.x, -1.0, 1.0);
  float lx = uCoord * halfW;
  float wx = uCenterX + lx * cosT;
  float wz = uCenterZ + lx * sinT;
  float depth = max(1.0, uPerspective - wz);
  float scale = uPerspective / depth;

  float sx = wx * scale;
  float halfHScreen = halfH * scale;
  float sy = aStrip.y * (halfHScreen + uMarginPx);

  if (aStrip.x < -1.5) {
    float dir = (sxL <= sxR) ? -1.0 : 1.0;
    sx += dir * uMarginPx;
    lx -= (uMarginPx / max(0.05, abs(cosT) * scale));
  } else if (aStrip.x > 1.5) {
    float dir = (sxR >= sxL) ? 1.0 : -1.0;
    sx += dir * uMarginPx;
    lx += (uMarginPx / max(0.05, abs(cosT) * scale));
  }

  float ly = sy / scale;

  vLocalPos = vec2(lx, ly);
  vScreenPos = vec2(sx, sy);
  vWorldZ = wz;
  vHalfHScreen = halfHScreen;
  vSxMin = sxMin;
  vSxMax = sxMax;
  vFacing = wx * sinT + depth * cosT;

  vec2 ndc = vec2(sx / (uLogicalSize.x * 0.5), sy / (uLogicalSize.y * 0.5));
  gl_Position = vec4(ndc, 0.0, 1.0);
}
`;

const CARD_FS = `#version 300 es
precision highp float;
precision highp sampler2DArray;

in vec2 vLocalPos;
in vec2 vScreenPos;
in float vWorldZ;
in float vHalfHScreen;
in float vSxMin;
in float vSxMax;
in float vFacing;

uniform vec2 uLogicalSize;
uniform float uPerspective;
uniform vec2 uCardSize;
uniform float uCorner;
uniform float uSeed;
uniform float uPhi;
uniform float uRho;
uniform float uBend;
uniform float uBlur;
uniform float uFarFade;
uniform float uRingRadius;
uniform vec3 uBgColor;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform float uPicLayer;
uniform float uTexWidth;
uniform float uCosTheta;
uniform sampler2DArray uPictures;

out vec4 outColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p, float blurPx) {
  const mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  float w0 = 0.5;
  float w1 = 0.25 * (1.0 - smoothstep(2.0, 10.0, blurPx));
  float w2 = 0.125 * (1.0 - smoothstep(1.0, 5.0, blurPx));
  float sum = 0.0;
  float norm = 0.0;

  sum += w0 * valueNoise(p);
  norm += w0;

  p = rot * p * 2.02 + vec2(1.7, 9.2);
  sum += w1 * valueNoise(p);
  norm += w1;

  p = rot * p * 2.02 + vec2(1.7, 9.2);
  sum += w2 * valueNoise(p);
  norm += w2;

  return sum / max(0.001, norm);
}

float superellipseSdf(vec2 p, vec2 halfSize, float r) {
  float rr = clamp(r, 0.0, min(halfSize.x, halfSize.y) - 1.0);
  vec2 d = abs(p) - halfSize + rr;
  vec2 m = max(d, 0.0);
  float m4 = m.x * m.x;
  m4 = m4 * m4;
  float my4 = m.y * m.y;
  my4 = my4 * my4;
  return pow(m4 + my4, 0.25) + min(max(d.x, d.y), 0.0) - rr;
}

void main() {
  float outFactor = clamp(-uBend, 0.0, 1.0);
  float halfFrameW = uLogicalSize.x * 0.5;
  float back = clamp(-vWorldZ / (2.0 * uRingRadius), 0.0, 1.0);

  // Outside depth-of-field blur (section 6).
  float blurSide = uBlur * pow(smoothstep(110.0, max(120.0, halfFrameW), abs(vScreenPos.x)), 1.4);
  float blurBack = uBlur * pow(smoothstep(0.25, 0.8, back), 1.2);
  float b = max(blurSide, blurBack) * outFactor;

  float depth = max(1.0, uPerspective - vWorldZ);
  float scale = uPerspective / depth;

  // Screen-space box-blur coverage + softened superellipse corners.
  float dl = vScreenPos.x - vSxMin;
  float dr = vSxMax - vScreenPos.x;
  float dt = vHalfHScreen - vScreenPos.y;
  float db = vHalfHScreen + vScreenPos.y;

  float bb = max(b, 0.75);
  float across = clamp((min(dl, bb) + min(dr, bb)) / (2.0 * bb), 0.0, 1.0);
  float updown = clamp((min(dt, bb) + min(db, bb)) / (2.0 * bb), 0.0, 1.0);
  float boxAlpha = smoothstep(0.0, 1.0, across) * smoothstep(0.0, 1.0, updown);

  float sdfLocal = superellipseSdf(vLocalPos, uCardSize * 0.5, uCorner);
  // Convert local SDF to approximate screen pixels accounting for foreshortening.
  float foreshorten = mix(1.0, max(0.12, abs(uCosTheta)), 0.5);
  float sdfScreen = sdfLocal * scale * foreshorten;
  float cornerAlpha = smoothstep(bb, -bb, sdfScreen);

  float alpha = min(boxAlpha, cornerAlpha);
  if (alpha < 0.002) discard;

  vec3 color;
  if (vFacing >= 0.0) {
    // Front face: double-warped fluid gradient (section 4).
    vec2 uv = (vLocalPos / uCardSize.x) * 0.9 + vec2(uSeed);
    vec2 o1 = uRho * vec2(cos(uPhi), sin(uPhi));
    vec2 o2 = uRho * vec2(cos(uPhi + 2.1), sin(uPhi + 2.1));

    vec2 w1 = vec2(
      fbm(uv + o1, b),
      fbm(uv + vec2(5.2, 1.3) - o1, b)
    );
    vec2 w2 = vec2(
      fbm(uv + 1.5 * w1 + vec2(1.7, 9.2) + o2, b),
      fbm(uv + 1.5 * w1 + vec2(8.3, 2.8) - o2, b)
    );
    float f = fbm(uv * 0.9 + 1.7 * w2, b);

    color = mix(uC0, uC1, smoothstep(0.3, 0.7, f));
    color = mix(color, uC2, smoothstep(0.42, 0.72, w2.x) * 0.9);
    color = mix(color, uC3, smoothstep(0.5, 0.8, w1.y) * 0.7);

    // Soft light across the top (yDown / h is -0.5 at top, +0.5 at bottom).
    float yDownNorm = -vLocalPos.y / uCardSize.y;
    color = mix(color, vec3(1.0), smoothstep(0.1, -0.6, yDownNorm) * 0.12);

    // Subtle film grain (+/- 1.75%) that fades out under blur.
    float grain = (hash21(gl_FragCoord.xy + vec2(uSeed * 13.0, uPhi * 7.0)) - 0.5) * 0.035;
    color += grain * (1.0 - smoothstep(0.5, 6.0, b));
  } else {
    // Back face: picture mirrored horizontally so it reads right way round when turned.
    float picU = clamp(0.5 - vLocalPos.x / uCardSize.x, 0.0, 1.0);
    float picV = clamp(0.5 - vLocalPos.y / uCardSize.y, 0.0, 1.0);
    float screenW = max(1.0, vSxMax - vSxMin);
    float texelsPerPx = uTexWidth / screenW;
    float lod = log2(max(1.0, b * texelsPerPx));
    color = textureLod(uPictures, vec3(picU, picV, uPicLayer), lod).rgb;
  }

  // Far-side fade toward page background (section 6).
  float fadeAmt = (uFarFade / 100.0) * smoothstep(0.3, 1.0, back) * outFactor;
  color = mix(color, uBgColor, fadeAmt);

  // Premultiplied alpha output.
  outColor = vec4(color * alpha, alpha);
}
`;

const GLASS_VS = `#version 300 es
precision highp float;

const vec2 POS[4] = vec2[4](
  vec2(-1.0, -1.0),
  vec2( 1.0, -1.0),
  vec2(-1.0,  1.0),
  vec2( 1.0,  1.0)
);

out vec2 vUv;

void main() {
  vec2 pos = POS[gl_VertexID];
  vUv = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

const GLASS_FS = `#version 300 es
precision highp float;

in vec2 vUv;

uniform sampler2D uScene;
uniform vec2 uLogicalSize;
uniform float uRim;
uniform float uDispersion;
uniform float uBend;
uniform vec3 uBgColor;

out vec4 outColor;

vec4 compositeSample(vec2 uv) {
  vec2 clamped = clamp(uv, vec2(0.0), vec2(1.0));
  vec4 s = texture(uScene, clamped);
  // Premultiplied alpha over page background.
  vec3 rgb = s.rgb + uBgColor * (1.0 - s.a);
  return vec4(rgb, 1.0);
}

void main() {
  float rimEff = uRim * clamp(uBend, 0.0, 1.0);
  vec2 px = vUv * uLogicalSize;
  float d = min(px.x, uLogicalSize.x - px.x);

  if (rimEff <= 0.5 || d >= rimEff) {
    outColor = compositeSample(vUv);
    return;
  }

  float k = pow(1.0 - d / rimEff, 2.4);
  vec2 eye = uLogicalSize * 0.5;
  vec2 toEye = eye - px;
  float signX = (toEye.x >= 0.0) ? 1.0 : -1.0;
  float dx = 0.4 * rimEff * k * signX;
  float dy = abs(toEye.x) > 1e-3 ? dx * (toEye.y / toEye.x) : 0.0;
  vec2 baseOffsetUv = vec2(dx, dy) / uLogicalSize;

  float spread = (uDispersion / 100.0) * k;
  vec3 accum = vec3(0.0);
  vec3 weightSum = vec3(0.0);

  for (int i = 0; i < 7; i++) {
    float t = float(i) / 6.0;
    float mult = 1.0 + spread * (1.0 - 2.0 * t);
    vec3 sampleCol = compositeSample(vUv + baseOffsetUv * mult).rgb;
    vec3 w = clamp(vec3(
      1.5 - 3.0 * t,
      1.0 - 1.5 * abs(2.0 * t - 1.0),
      3.0 * t - 1.5
    ), 0.0, 1.0);
    accum += sampleCol * w;
    weightSum += w;
  }

  vec3 color = accum / max(weightSum, vec3(0.0001));
  color = mix(color, vec3(1.0), pow(k, 3.0) * 0.12);
  outColor = vec4(color, 1.0);
}
`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error('Shader compile error: ' + info);
  }
  return shader;
}

function createProgram(gl, vsSrc, fsSrc) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error('Program link error: ' + info);
  }
  return program;
}

// Build 96-column upright strip + 1 margin column on each side (total 99 vertical columns -> 198 vertices).
function buildCardStripGeometry() {
  const cols = 96;
  const totalCols = cols + 3; // left margin (-2), 0..96 (-1..+1), right margin (+2)
  const data = new Float32Array(totalCols * 2 * 2);
  let ptr = 0;
  for (let i = 0; i < totalCols; i++) {
    let x;
    if (i === 0) x = -2;
    else if (i === totalCols - 1) x = 2;
    else x = ((i - 1) / cols) * 2 - 1;
    // Bottom then top for TRIANGLE_STRIP
    data[ptr++] = x;
    data[ptr++] = -1;
    data[ptr++] = x;
    data[ptr++] = 1;
  }
  return { data, vertexCount: totalCols * 2 };
}

// Render crisp back-face provider card artwork onto an offscreen 2D canvas.
const TEX_W = 360;
const TEX_H = 600;

function drawProviderPoster(canvas, item, iconImage, paletteHex) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, TEX_W, TEX_H);

  // Soft editorial poster background tinted by the provider's palette.
  const grad = ctx.createLinearGradient(0, 0, TEX_W, TEX_H);
  grad.addColorStop(0, '#f8fafc');
  grad.addColorStop(0.55, '#eef2f7');
  grad.addColorStop(1, '#e4ebf3');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  // Subtle color wash blobs at top and bottom corners.
  const topGlow = ctx.createRadialGradient(TEX_W * 0.25, TEX_H * 0.16, 12, TEX_W * 0.25, TEX_H * 0.16, 220);
  topGlow.addColorStop(0, paletteHex[0] + '44');
  topGlow.addColorStop(1, paletteHex[0] + '00');
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  const botGlow = ctx.createRadialGradient(TEX_W * 0.78, TEX_H * 0.84, 12, TEX_W * 0.78, TEX_H * 0.84, 230);
  botGlow.addColorStop(0, paletteHex[1] + '40');
  botGlow.addColorStop(1, paletteHex[1] + '00');
  ctx.fillStyle = botGlow;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  // Clean inner decorative frame.
  ctx.strokeStyle = 'rgba(39, 52, 68, 0.10)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(22, 22, TEX_W - 44, TEX_H - 44, 38);
  ctx.stroke();

  // Top status pill.
  const connected = Boolean(item.connected);
  const pillText = item.badge || (connected ? '已连接' : '未连接');
  ctx.font = '600 20px "MiSans", "Segoe UI", system-ui, sans-serif';
  const pillW = Math.min(TEX_W - 80, ctx.measureText(pillText).width + 44);
  const pillX = (TEX_W - pillW) * 0.5;
  const pillY = 58;
  ctx.fillStyle = connected ? 'rgba(38, 96, 68, 0.12)' : 'rgba(77, 96, 114, 0.10)';
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, 38, 19);
  ctx.fill();
  ctx.fillStyle = connected ? '#266044' : '#4d6072';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(pillText, TEX_W * 0.5, pillY + 19);

  // Center icon medallion.
  const cx = TEX_W * 0.5;
  const cy = TEX_H * 0.43;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, 74, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(39, 52, 68, 0.12)';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (iconImage && iconImage.naturalWidth > 0) {
    const size = 84;
    ctx.drawImage(iconImage, cx - size * 0.5, cy - size * 0.5, size, size);
  } else {
    ctx.fillStyle = '#273444';
    ctx.font = '700 44px "Cascadia Code", Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('</>', cx, cy + 2);
  }

  // Provider title.
  ctx.fillStyle = '#1d2a38';
  ctx.font = '700 32px "MiSans", "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(item.name || item.provider, cx, TEX_H * 0.66);

  // Subtitle / model count.
  ctx.fillStyle = '#4d6072';
  ctx.font = '500 22px "MiSans", "Segoe UI", system-ui, sans-serif';
  ctx.fillText(item.subtitle || '点击卡片管理连接', cx, TEX_H * 0.74);

  // Bottom color accent bar.
  const barGrad = ctx.createLinearGradient(76, 0, TEX_W - 76, 0);
  barGrad.addColorStop(0, paletteHex[0]);
  barGrad.addColorStop(0.5, paletteHex[1]);
  barGrad.addColorStop(1, paletteHex[2]);
  ctx.fillStyle = barGrad;
  ctx.beginPath();
  ctx.roundRect(96, TEX_H - 76, TEX_W - 192, 8, 4);
  ctx.fill();
}

export class CardRingEngine {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.onFrontChange = options.onFrontChange || (() => {});
    this.onCardClick = options.onCardClick || (() => {});
    this.reducedMotion = Boolean(options.reducedMotion);
    this.params = { ...RING_DEFAULTS, ...(options.params || {}) };
    this.view = options.initialView === 'outside' ? 'outside' : 'inside';
    this.bgColor = parseCssColor(options.bgColor);

    this.items = options.items || [];
    this.iconCache = new Map();
    this.posterCanvas = document.createElement('canvas');
    this.posterCanvas.width = TEX_W;
    this.posterCanvas.height = TEX_H;

    // Animation state
    this.offset = 0;
    this.bend = this.view === 'inside' ? 1 : -1;
    this.flip = this.view === 'inside' ? 0 : 1;
    this.phi = 0;
    this.lastTime = 0;
    this.rafId = 0;
    this.lastFront = 0;

    // Active tweens (any new motion cancels the previous one on that channel)
    this.offsetAnim = null;
    this.bendAnim = null;
    this.flipAnim = null;
    this.pressState = new Map(); // cardIndex -> { scale, target, from, start, duration }

    // Pointer drag state
    this.drag = null;
    this.logicalWidth = LOGICAL_REF_WIDTH;
    this.logicalHeight = 380;
    this.stageScale = 1;

    this.gl = null;
    this.destroyed = false;

    this._initGL();
    this._bindEvents();
    this.updateItems(this.items);
    this.resize();

    // Opening flick on Inside view (section 7: 16 cards in 2800ms), skipped under reduced motion.
    if (this.view === 'inside' && !this.reducedMotion) {
      this.offset = -16 * CARD_STEP;
      this._animateOffsetTo(0, 2800, EASE_FLICK, true);
    }

    // Render synchronously before the first paint to prevent any blank/black frame on dialog open.
    this._render(performance.now());
    this._startLoop();
  }

  _initGL() {
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
    });
    if (!gl) {
      throw new Error('WebGL 2 is not available.');
    }
    this.gl = gl;

    this.cardProg = createProgram(gl, CARD_VS, CARD_FS);
    this.glassProg = createProgram(gl, GLASS_VS, GLASS_FS);

    // Card strip VAO
    const { data, vertexCount } = buildCardStripGeometry();
    this.stripVertexCount = vertexCount;
    this.cardVao = gl.createVertexArray();
    gl.bindVertexArray(this.cardVao);
    this.cardVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cardVbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.glassVao = gl.createVertexArray();

    // Cache uniform locations
    this.cardLoc = {};
    for (const name of [
      'uLogicalSize', 'uPerspective', 'uCardSize', 'uCenterX', 'uCenterZ', 'uTheta', 'uMarginPx',
      'uCorner', 'uSeed', 'uPhi', 'uRho', 'uBend', 'uBlur', 'uFarFade', 'uRingRadius',
      'uBgColor', 'uC0', 'uC1', 'uC2', 'uC3', 'uPicLayer', 'uTexWidth', 'uCosTheta', 'uPictures',
    ]) {
      this.cardLoc[name] = gl.getUniformLocation(this.cardProg, name);
    }

    this.glassLoc = {};
    for (const name of ['uScene', 'uLogicalSize', 'uRim', 'uDispersion', 'uBend', 'uBgColor']) {
      this.glassLoc[name] = gl.getUniformLocation(this.glassProg, name);
    }

    // Offscreen FBO for Pass 1
    this.fbo = gl.createFramebuffer();
    this.fboTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Picture texture array (populated in updateItems)
    this.picTex = gl.createTexture();
    this.picLayers = 0;
  }

  _allocFbo(width, height) {
    const gl = this.gl;
    if (!gl || width <= 0 || height <= 0) return;
    gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fboTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  resize() {
    if (this.destroyed || !this.gl) return;
    const rect = this.canvas.getBoundingClientRect();
    const cssW = Math.max(320, Math.round(rect.width || 720));
    const cssH = Math.max(260, Math.round(rect.height || 380));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const fbW = Math.round(cssW * dpr);
    const fbH = Math.round(cssH * dpr);

    // Keep the logical coordinate frame wide enough so Inside shows 5 cards with 160px rims
    // and Outside shows the whole ring cleanly inside the settings dialog.
    this.stageScale = Math.min(1, cssW / LOGICAL_REF_WIDTH);
    this.logicalWidth = cssW / this.stageScale;
    this.logicalHeight = cssH / this.stageScale;

    if (this.canvas.width !== fbW || this.canvas.height !== fbH) {
      this.canvas.width = fbW;
      this.canvas.height = fbH;
      this._allocFbo(fbW, fbH);
      this._render(performance.now());
    }
  }

  setBgColor(cssColor) {
    this.bgColor = parseCssColor(cssColor, this.bgColor);
  }

  setReducedMotion(reduced) {
    this.reducedMotion = Boolean(reduced);
    if (this.reducedMotion && this.offsetAnim?.isDemo) {
      this.offset = this.offsetAnim.to;
      this.offsetAnim = null;
      this._notifyFront();
    }
  }

  setParams(nextParams, stopDemo = true) {
    this.params = { ...this.params, ...nextParams };
    if (stopDemo && this.offsetAnim?.isDemo) {
      this.offsetAnim = null;
    }
  }

  setView(nextView) {
    const normalized = nextView === 'outside' ? 'outside' : 'inside';
    if (this.view === normalized) return;
    this.view = normalized;
    const targetBend = normalized === 'inside' ? 1 : -1;
    const targetFlip = normalized === 'inside' ? 0 : 1;

    if (this.reducedMotion) {
      this.bend = targetBend;
      this.flip = targetFlip;
      this.bendAnim = null;
      this.flipAnim = null;
      return;
    }

    const now = performance.now();
    this.bendAnim = { from: this.bend, to: targetBend, start: now, duration: 1100, ease: EASE_BEND };
    this.flipAnim = { from: this.flip, to: targetFlip, start: now, duration: 1800, ease: EASE_FLIP };
  }

  stepBy(deltaCards) {
    const currentIndex = Math.round(this.offset / CARD_STEP);
    const target = (currentIndex + deltaCards) * CARD_STEP;
    const duration = this.reducedMotion ? 160 : 480;
    this._animateOffsetTo(target, duration, EASE_GLIDE, false);
  }

  goToProvider(providerIndex) {
    const count = Math.max(1, this.items.length);
    const currentCard = Math.round(this.offset / CARD_STEP);
    const currentMod = ((currentCard % count) + count) % count;
    let diff = providerIndex - currentMod;
    if (diff > count / 2) diff -= count;
    if (diff < -count / 2) diff += count;
    if (diff === 0) return;
    const target = (currentCard + diff) * CARD_STEP;
    const duration = this.reducedMotion ? 180 : 760;
    this._animateOffsetTo(target, duration, EASE_GLIDE, false);
  }

  _animateOffsetTo(target, duration, ease, isDemo) {
    const dur = this.reducedMotion ? Math.min(duration, 200) : duration;
    this.offsetAnim = {
      from: this.offset,
      to: target,
      start: performance.now(),
      duration: Math.max(1, dur),
      ease,
      isDemo,
    };
  }

  _setCardPress(index, pressed) {
    const now = performance.now();
    const cur = this._getPressScale(index, now);
    this.pressState.set(index, {
      from: cur,
      to: pressed ? 0.95 : 1,
      start: now,
      duration: this.reducedMotion ? 80 : (pressed ? 140 : 320),
    });
  }

  _getPressScale(index, now) {
    const st = this.pressState.get(index);
    if (!st) return 1;
    const t = clamp((now - st.start) / st.duration, 0, 1);
    const val = st.from + (st.to - st.from) * EASE_PRESS(t);
    if (t >= 1 && st.to === 1) this.pressState.delete(index);
    return val;
  }

  updateItems(items) {
    this.items = Array.isArray(items) && items.length ? items : [{ provider: 'default', name: 'CoReader' }];
    this._uploadPictures();
    // Preload any provider icons not yet loaded and refresh textures when ready.
    for (const item of this.items) {
      if (!item.icon || this.iconCache.has(item.icon)) continue;
      const img = new Image();
      img.decoding = 'async';
      this.iconCache.set(item.icon, img);
      img.onload = () => {
        if (!this.destroyed) this._uploadPictures();
      };
      img.src = item.icon;
    }
  }

  _uploadPictures() {
    const gl = this.gl;
    if (!gl || this.destroyed) return;
    const layers = Math.max(1, this.items.length);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.picTex);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    if (this.picLayers !== layers) {
      gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, TEX_W, TEX_H, layers, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      this.picLayers = layers;
    }

    for (let i = 0; i < layers; i++) {
      const item = this.items[i];
      const img = item.icon ? this.iconCache.get(item.icon) : null;
      drawProviderPoster(this.posterCanvas, item, img, PALETTES[i % PALETTES.length]);
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, TEX_W, TEX_H, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.posterCanvas);
    }
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
  }

  _currentPerspective() {
    const mixT = (1 - this.bend) * 0.5;
    return this.params.pIn + (this.params.pOut - this.params.pIn) * mixT;
  }

  _hitTest(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return -1;
    const sx = ((clientX - rect.left) - rect.width * 0.5) / this.stageScale;
    const sy = (rect.height * 0.5 - (clientY - rect.top)) / this.stageScale;
    const P = this._currentPerspective();

    // Check closest cards first (descending cz).
    const candidates = [];
    for (let i = 0; i < RING_COUNT; i++) {
      const pose = cardPose(i, this.offset, this.bend, this.flip);
      const halfW = CARD_W * 0.5;
      const maxZ = Math.max(pose.cz - halfW * Math.sin(pose.theta), pose.cz + halfW * Math.sin(pose.theta));
      if (P - maxZ < 140) continue;
      candidates.push({ i, pose });
    }
    candidates.sort((a, b) => b.pose.cz - a.pose.cz);

    for (const { i, pose } of candidates) {
      const cosT = Math.cos(pose.theta);
      const sinT = Math.sin(pose.theta);
      const halfW = CARD_W * 0.5;
      const halfH = CARD_H * 0.5;
      const zL = pose.cz - halfW * sinT;
      const zR = pose.cz + halfW * sinT;
      const sxL = (pose.cx - halfW * cosT) * P / (P - zL);
      const sxR = (pose.cx + halfW * cosT) * P / (P - zR);
      const sxMin = Math.min(sxL, sxR);
      const sxMax = Math.max(sxL, sxR);
      if (sx < sxMin || sx > sxMax) continue;
      const halfHScr = halfH * P / (P - pose.cz);
      if (Math.abs(sy) <= halfHScr) return i;
    }
    return -1;
  }

  _bindEvents() {
    const canvas = this.canvas;

    this._onPointerDown = (event) => {
      if (event.button !== 0) return;
      this.offsetAnim = null;
      canvas.setPointerCapture(event.pointerId);
      const hit = this._hitTest(event.clientX, event.clientY);
      if (hit >= 0) this._setCardPress(hit, true);
      const now = performance.now();
      this.drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        lastX: event.clientX,
        lastTime: now,
        startOffset: this.offset,
        velocity: 0, // logical px per ms
        moved: false,
        hitCard: hit,
      };
    };

    this._onPointerMove = (event) => {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      const now = performance.now();
      const dxCss = event.clientX - this.drag.lastX;
      const totalCss = event.clientX - this.drag.startX;
      if (Math.abs(totalCss) > 5) this.drag.moved = true;

      const dt = Math.max(1, now - this.drag.lastTime);
      const dxLogical = dxCss / this.stageScale;
      const instVel = dxLogical / dt;
      this.drag.velocity = this.drag.velocity * 0.65 + instVel * 0.35;
      this.drag.lastX = event.clientX;
      this.drag.lastTime = now;

      this.offset = this.drag.startOffset - totalCss / this.stageScale;
      this._notifyFront();
    };

    this._onPointerUp = (event) => {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      const d = this.drag;
      this.drag = null;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      if (d.hitCard >= 0) this._setCardPress(d.hitCard, false);

      if (!d.moved && d.hitCard >= 0) {
        const front = frontCardIndex(this.offset);
        if (d.hitCard === front) {
          const item = this.items[d.hitCard % this.items.length];
          this.onCardClick(item, d.hitCard);
        } else {
          // Bring clicked card to the front in 760ms (section 7).
          const s = wrapArc(d.hitCard * CARD_STEP - this.offset);
          const target = this.offset + s;
          this._animateOffsetTo(target, 760, EASE_GLIDE, false);
        }
        return;
      }

      // Glide with release speed and snap to nearest card (section 7).
      const projected = this.offset - d.velocity * 260;
      const snapped = Math.round(projected / CARD_STEP) * CARD_STEP;
      const dist = Math.abs(snapped - this.offset);
      const duration = clamp(dist * 1.6, 420, 1100);
      this._animateOffsetTo(snapped, duration, EASE_GLIDE, false);
    };

    this._wheelSnapTimer = null;
    this._wheelVel = 0;
    this._wheelLastTime = 0;
    this._onWheel = (event) => {
      const unit = event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? 200 : 1;
      const dxRaw = event.deltaX * unit;
      const dyRaw = event.deltaY * unit;
      const horizontal = Math.abs(dxRaw) > Math.abs(dyRaw) || (event.shiftKey && Math.abs(dyRaw) > 0);
      if (!horizontal) return;
      const dx = Math.abs(dxRaw) >= Math.abs(dyRaw) ? dxRaw : dyRaw;
      if (!dx) return;
      event.preventDefault();
      this.offsetAnim = null;
      const now = performance.now();
      const dt = Math.max(8, now - (this._wheelLastTime || now - 16));
      const dLogical = dx / Math.max(0.25, this.stageScale);
      this._wheelVel = this._wheelVel * 0.55 + (dLogical / dt) * 0.45;
      this._wheelLastTime = now;
      this.offset += dLogical;
      this._notifyFront();
      if (this._wheelSnapTimer) clearTimeout(this._wheelSnapTimer);
      this._wheelSnapTimer = setTimeout(() => {
        this._wheelSnapTimer = null;
        if (this.destroyed || this.drag) return;
        const projected = this.offset + clamp(this._wheelVel * 90, -CARD_STEP * 0.45, CARD_STEP * 0.45);
        this._wheelVel = 0;
        const snapped = Math.round(projected / CARD_STEP) * CARD_STEP;
        const dist = Math.abs(snapped - this.offset);
        const duration = clamp(dist * 1.4, 280, 560);
        this._animateOffsetTo(snapped, duration, EASE_GLIDE, false);
      }, 110);
    };

    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerup', this._onPointerUp);
    canvas.addEventListener('pointercancel', this._onPointerUp);
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
  }

  _notifyFront() {
    const idx = frontCardIndex(this.offset);
    if (idx !== this.lastFront) {
      this.lastFront = idx;
      this.onFrontChange(idx, this.items[idx % this.items.length]);
    }
  }

  _startLoop() {
    this.lastTime = performance.now();
    const tick = (now) => {
      if (this.destroyed) return;
      this._step(now);
      this._render(now);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  _step(now) {
    const dtSec = Math.min(0.1, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;

    // Accumulate flow phase incrementally so changing the Flow slider never jumps (section 8).
    if (!this.reducedMotion && this.params.flow > 0) {
      const cellsPerSec = this.params.flow / 100;
      this.phi = (this.phi + (cellsPerSec / FLOW_RHO) * dtSec) % (Math.PI * 2);
    }

    if (this.offsetAnim) {
      const t = clamp((now - this.offsetAnim.start) / this.offsetAnim.duration, 0, 1);
      this.offset = this.offsetAnim.from + (this.offsetAnim.to - this.offsetAnim.from) * this.offsetAnim.ease(t);
      if (t >= 1) {
        this.offset = this.offsetAnim.to;
        this.offsetAnim = null;
      }
      this._notifyFront();
    }

    if (this.bendAnim) {
      const t = clamp((now - this.bendAnim.start) / this.bendAnim.duration, 0, 1);
      this.bend = this.bendAnim.from + (this.bendAnim.to - this.bendAnim.from) * this.bendAnim.ease(t);
      if (t >= 1) {
        this.bend = this.bendAnim.to;
        this.bendAnim = null;
      }
    }

    if (this.flipAnim) {
      const t = clamp((now - this.flipAnim.start) / this.flipAnim.duration, 0, 1);
      this.flip = this.flipAnim.from + (this.flipAnim.to - this.flipAnim.from) * this.flipAnim.ease(t);
      if (t >= 1) {
        this.flip = this.flipAnim.to;
        this.flipAnim = null;
      }
    }
  }

  _render(now) {
    const gl = this.gl;
    if (!gl || this.canvas.width === 0 || this.canvas.height === 0) return;

    const fbW = this.canvas.width;
    const fbH = this.canvas.height;
    const P = this._currentPerspective();
    const halfFrameW = this.logicalWidth * 0.5;
    const outFactor = clamp(-this.bend, 0, 1);
    const marginPx = outFactor > 0.001 ? this.params.blur + 4 : 2;

    // Build visible card list and sort farthest first (ascending cz).
    const drawList = [];
    for (let i = 0; i < RING_COUNT; i++) {
      const pose = cardPose(i, this.offset, this.bend, this.flip);
      const scale = this._getPressScale(i, now);
      const halfW = CARD_W * scale * 0.5;
      const cosT = Math.cos(pose.theta);
      const sinT = Math.sin(pose.theta);
      const zL = pose.cz - halfW * sinT;
      const zR = pose.cz + halfW * sinT;
      if (P - Math.max(zL, zR) < 140) continue;

      const sxL = (pose.cx - halfW * cosT) * P / (P - zL);
      const sxR = (pose.cx + halfW * cosT) * P / (P - zR);
      const sxMin = Math.min(sxL, sxR) - marginPx;
      const sxMax = Math.max(sxL, sxR) + marginPx;
      if (sxMax < -halfFrameW || sxMin > halfFrameW) continue;

      drawList.push({ i, pose, scale });
    }
    drawList.sort((a, b) => a.pose.cz - b.pose.cz);

    // --- Pass 1: render cards with premultiplied alpha into offscreen FBO ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, fbW, fbH);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(this.cardProg);
    gl.bindVertexArray(this.cardVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.picTex);
    gl.uniform1i(this.cardLoc.uPictures, 0);
    gl.uniform2f(this.cardLoc.uLogicalSize, this.logicalWidth, this.logicalHeight);
    gl.uniform1f(this.cardLoc.uPerspective, P);
    gl.uniform1f(this.cardLoc.uMarginPx, marginPx);
    gl.uniform1f(this.cardLoc.uCorner, this.params.corner);
    gl.uniform1f(this.cardLoc.uPhi, this.phi);
    gl.uniform1f(this.cardLoc.uRho, FLOW_RHO);
    gl.uniform1f(this.cardLoc.uBend, this.bend);
    gl.uniform1f(this.cardLoc.uBlur, this.params.blur);
    gl.uniform1f(this.cardLoc.uFarFade, this.params.farFade);
    gl.uniform1f(this.cardLoc.uRingRadius, RING_RADIUS);
    gl.uniform3fv(this.cardLoc.uBgColor, this.bgColor);
    gl.uniform1f(this.cardLoc.uTexWidth, TEX_W);

    const layerCount = Math.max(1, this.picLayers);
    for (const entry of drawList) {
      const { i, pose, scale } = entry;
      const pal = PALETTE_RGB[i % PALETTE_RGB.length];
      gl.uniform2f(this.cardLoc.uCardSize, CARD_W * scale, CARD_H * scale);
      gl.uniform1f(this.cardLoc.uCenterX, pose.cx);
      gl.uniform1f(this.cardLoc.uCenterZ, pose.cz);
      gl.uniform1f(this.cardLoc.uTheta, pose.theta);
      gl.uniform1f(this.cardLoc.uCosTheta, Math.cos(pose.theta));
      gl.uniform1f(this.cardLoc.uSeed, i * 3.7 + 0.43);
      gl.uniform3fv(this.cardLoc.uC0, pal[0]);
      gl.uniform3fv(this.cardLoc.uC1, pal[1]);
      gl.uniform3fv(this.cardLoc.uC2, pal[2]);
      gl.uniform3fv(this.cardLoc.uC3, pal[3]);
      gl.uniform1f(this.cardLoc.uPicLayer, i % layerCount);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.stripVertexCount);
    }

    // --- Pass 2: composite + Inside glass rim refraction & dispersion ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, fbW, fbH);
    gl.disable(gl.BLEND);

    gl.useProgram(this.glassProg);
    gl.bindVertexArray(this.glassVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
    gl.uniform1i(this.glassLoc.uScene, 0);
    gl.uniform2f(this.glassLoc.uLogicalSize, this.logicalWidth, this.logicalHeight);
    gl.uniform1f(this.glassLoc.uRim, this.params.rim);
    gl.uniform1f(this.glassLoc.uDispersion, this.params.dispersion);
    gl.uniform1f(this.glassLoc.uBend, this.bend);
    gl.uniform3fv(this.glassLoc.uBgColor, this.bgColor);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  destroy() {
    this.destroyed = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this._wheelSnapTimer) clearTimeout(this._wheelSnapTimer);
    const canvas = this.canvas;
    canvas.removeEventListener('pointerdown', this._onPointerDown);
    canvas.removeEventListener('pointermove', this._onPointerMove);
    canvas.removeEventListener('pointerup', this._onPointerUp);
    canvas.removeEventListener('pointercancel', this._onPointerUp);
    canvas.removeEventListener('wheel', this._onWheel);
    if (this.gl) {
      const gl = this.gl;
      gl.deleteTexture(this.fboTex);
      gl.deleteTexture(this.picTex);
      gl.deleteFramebuffer(this.fbo);
      gl.deleteBuffer(this.cardVbo);
      gl.deleteVertexArray(this.cardVao);
      gl.deleteVertexArray(this.glassVao);
      gl.deleteProgram(this.cardProg);
      gl.deleteProgram(this.glassProg);
      this.gl = null;
    }
  }
}
