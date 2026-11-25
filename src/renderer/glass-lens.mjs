const namespace = 'http://www.w3.org/2000/svg';
const corners = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'];
const maps = new Map();
let filterId = 0;

const svgElement = (name, attributes) => {
  const node = document.createElementNS(namespace, name);
  setAttributes(node, attributes);
  return node;
};

function setAttributes(node, attributes) {
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
}

export function supportsGlassLens() {
  return /\b(?:Chrome|Chromium)\//.test(navigator.userAgent)
    && CSS.supports('backdrop-filter', 'url("#glass")');
}

export function rimWidth(width, height) {
  return Math.max(4, Math.min(44, Math.floor(Math.min(width, height) / 3.5)));
}

function cornerPower(shape) {
  if (!shape || shape === 'round') return 2;
  if (shape === 'squircle') return 4;
  if (shape === 'bevel') return 1;
  if (shape === 'square') return 64;
  const exponent = /^superellipse\(([\d.+-]+)\)$/.exec(shape)?.[1];
  return exponent === undefined || Number(exponent) < 0 ? null : Math.min(64, 2 ** Number(exponent));
}

function radiiFor(style, width, height) {
  const radii = corners.map((corner) => {
    const [x, y = x] = style['border' + corner + 'Radius'].split(' ');
    const pixels = (value, size) => (parseFloat(value) || 0) * (value.endsWith('%') ? size / 100 : 1);
    return [pixels(x, width), pixels(y, height), cornerPower(style['corner' + corner + 'Shape'])];
  });
  if (radii.some(([, , power]) => power === null)) return null;
  const [tl, tr, br, bl] = radii;
  const ratio = Math.min(1, width / (tl[0] + tr[0]), width / (bl[0] + br[0]),
    height / (tl[1] + bl[1]), height / (tr[1] + br[1]));
  return radii.map(([x, y, power]) => [Math.round(x * ratio), Math.round(y * ratio), power]);
}

function displacement(dx, dy, rim) {
  const distance = Math.hypot(dx, dy);
  if (!distance || distance >= rim) return [128, 128];
  const amount = 127 * (1 - distance / rim) ** 2.6 / distance;
  return [Math.round(128 + dx * amount), Math.round(128 + dy * amount)];
}

function cornerSampler(rx, ry, power, rim, horizontal, vertical) {
  const curve = Array.from({ length: 33 }, (_, i) => {
    const angle = i * Math.PI / 64;
    return [rx * (1 - Math.cos(angle) ** (2 / power)), ry * (1 - Math.sin(angle) ** (2 / power))];
  });
  return (x, y) => {
    if (rx && ry && x < rx && y < ry && ((1 - x / rx) ** power + (1 - y / ry) ** power > 1)) {
      return [128, 128];
    }
    // Adjacent straight edges continue beyond the tangent points.
    let [dx, dy] = y < x ? [Math.min(0, x - rx), y] : [x, Math.min(0, y - ry)];
    let nearest = dx * dx + dy * dy;
    for (let i = 1; i < curve.length; i++) {
      const [ax, ay] = curve[i - 1];
      const [bx, by] = curve[i];
      const vx = bx - ax, vy = by - ay;
      const length = vx * vx + vy * vy;
      if (!length) continue;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / length));
      const px = x - (ax + t * vx), py = y - (ay + t * vy);
      const distance = px * px + py * py;
      if (distance < nearest) {
        nearest = distance;
        dx = px;
        dy = py;
      }
    }
    if (x >= rx && y * y < nearest) [dx, dy] = [0, y];
    if (y >= ry && x * x < dx * dx + dy * dy) [dx, dy] = [x, 0];
    return displacement(dx * horizontal, dy * vertical, rim);
  };
}

function tileMap(key, width, height, sample) {
  if (maps.has(key)) return maps.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const image = context.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const [red, green] = sample(x, y);
      image.data.set([red, green, 128, 255], offset);
    }
  }
  context.putImageData(image, 0, 0);
  const url = canvas.toDataURL();
  const decoder = new Image();
  decoder.src = url;
  const ready = decoder.decode().then(() => url, (error) => {
    maps.delete(key);
    throw error;
  });
  if (maps.size >= 96) maps.delete(maps.keys().next().value);
  maps.set(key, ready);
  return ready;
}

function mapTiles(width, height, radii, rim) {
  const locations = radii.map(([rx, ry, power], i) => {
    const left = i === 0 || i === 3;
    const top = i === 0 || i === 1;
    const w = Math.max(rim, rx), h = Math.max(rim, ry);
    const sample = cornerSampler(rx, ry, power, rim, left ? 1 : -1, top ? 1 : -1);
    const key = ['corner', i, rx, ry, power, rim].join('/');
    return {
      x: left ? 0 : width - w, y: top ? 0 : height - h,
      width: w, height: h,
      url: tileMap(key, w, h, (x, y) => sample(left ? x + .5 : w - x - .5, top ? y + .5 : h - y - .5)),
    };
  });
  const [tl, tr, br, bl] = locations;
  const edges = [
    [tl.width, 0, width - tl.width - tr.width, rim, true, 1],
    [width - rim, tr.height, rim, height - tr.height - br.height, false, -1],
    [bl.width, height - rim, width - bl.width - br.width, rim, true, -1],
    [0, tl.height, rim, height - tl.height - bl.height, false, 1],
  ];
  for (const [x, y, w, h, horizontal, sign] of edges) {
    const key = ['edge', horizontal, sign, rim].join('/');
    // Stretch only across the uniform axis. The rim keeps its original thickness.
    const sample = (sx, sy) => {
      const row = horizontal ? sy : sx;
      const distance = sign > 0 ? row + .5 : rim - row - .5;
      return displacement(horizontal ? 0 : sign * distance, horizontal ? sign * distance : 0, rim);
    };
    locations.push({
      x, y, width: Math.max(0, w), height: Math.max(0, h),
      url: tileMap(key, horizontal ? 1 : rim, horizontal ? rim : 1, sample),
    });
  }
  return locations;
}

const channelMatrix = (channel) => Array.from({ length: 20 }, (_, index) =>
  index === channel * 6 || index === 18 ? 1 : 0).join(' ');

function createFilter(split) {
  const id = 'elr-glass-rim-' + ++filterId;
  const svg = svgElement('svg', { width: 0, height: 0, 'aria-hidden': 'true', focusable: 'false' });
  svg.style.cssText = 'position:fixed;inset:0 auto auto 0;pointer-events:none';
  const filter = svgElement('filter', {
    id, x: 0, y: 0, filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB',
  });
  const flood = svgElement('feFlood', { 'flood-color': '#808080', result: 'neutral' });
  const merge = svgElement('feMerge', { result: 'map' });
  merge.append(svgElement('feMergeNode', { in: 'neutral' }));
  const tiles = Array.from({ length: 8 }, (_, index) => {
    const result = 'map-tile-' + index;
    merge.append(svgElement('feMergeNode', { in: result }));
    return svgElement('feImage', { result, preserveAspectRatio: 'none' });
  });
  filter.append(flood, ...tiles, merge);
  const bends = [1 + split, 1, 1 - split].map((multiplier, index) => {
    const bend = svgElement('feDisplacementMap', {
      in: 'SourceGraphic', in2: 'map', xChannelSelector: 'R', yChannelSelector: 'G', result: 'bend-' + index,
    });
    filter.append(bend, svgElement('feColorMatrix', {
      in: 'bend-' + index, type: 'matrix', values: channelMatrix(index), result: 'channel-' + index,
    }));
    return { bend, multiplier };
  });
  filter.append(
    svgElement('feBlend', { in: 'channel-0', in2: 'channel-1', mode: 'screen', result: 'rg' }),
    svgElement('feBlend', { in: 'rg', in2: 'channel-2', mode: 'screen' }),
  );
  svg.append(filter);
  document.body.append(svg);
  return { id, svg, filter, tiles, bends };
}

function composited(element) {
  for (let node = element; node && node !== document.body; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.willChange !== 'auto' || style.transform !== 'none' || style.scale !== 'none'
        || Number(style.opacity) < 1 || style.filter !== 'none') return true;
  }
  return false;
}

export function createGlassLens(surface, split) {
  let active = null;
  let geometry = '';
  let revision = 0;
  function clear() {
    revision++;
    geometry = '';
    surface.style.removeProperty('--elr-liquid-lens');
    active?.svg.remove();
    active = null;
  }
  async function update(enabled) {
    const width = surface.offsetWidth, height = surface.offsetHeight;
    if (!enabled || Math.min(width, height) < 32 || composited(surface)) {
      if (geometry || active) clear();
      return;
    }
    const rim = rimWidth(width, height);
    const radii = radiiFor(getComputedStyle(surface), width, height);
    if (!radii) {
      if (geometry || active) clear();
      return;
    }
    const key = JSON.stringify([width, height, radii, rim]);
    if (key === geometry) return;
    geometry = key;
    const requested = ++revision;
    const tiles = mapTiles(width, height, radii, rim);
    try {
      const urls = await Promise.all(tiles.map((tile) => tile.url));
      if (revision !== requested || !surface.isConnected) return;
      active ??= createFilter(split);
      setAttributes(active.filter, { width, height });
      active.tiles.forEach((tile, index) => {
        const { x, y, width: tileWidth, height: tileHeight } = tiles[index];
        setAttributes(tile, { href: urls[index], x, y, width: tileWidth, height: tileHeight });
      });
      for (const { bend, multiplier } of active.bends) bend.setAttribute('scale', 2.2 * rim * multiplier);
      surface.style.setProperty('--elr-liquid-lens', 'url("#' + active.id + '")');
    } catch {
      if (revision === requested) clear();
    }
  }
  return { update, clear };
}
