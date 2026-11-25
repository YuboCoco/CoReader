import { readdir, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';

export { pickNextAmbientIndex } from './ambient-shared.mjs';

export const AMBIENT_MIME_TYPES = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.webm': 'audio/webm',
  '.opus': 'audio/opus',
};

export const AMBIENT_CATEGORY_ORDER = ['nature', 'rain', 'animals', 'places', 'things', 'transport', 'urban', 'noise'];

export const AMBIENT_CATEGORY_LABELS = {
  nature: '自然',
  rain: '雨声',
  animals: '动物',
  places: '场所',
  things: '器物',
  transport: '交通',
  urban: '城市',
  noise: '噪音',
  custom: '自定义',
};

export const BUILTIN_AMBIENT_LABELS = {
  // nature
  'river': '河流',
  'waves': '海浪',
  'campfire': '烤火',
  'wind': '微风',
  'howling-wind': '呼啸寒风',
  'wind-in-trees': '林间风声',
  'waterfall': '瀑布',
  'walk-in-snow': '雪地脚步',
  'walk-on-leaves': '踩落叶',
  'walk-on-gravel': '踩碎石',
  'droplets': '水滴',
  'jungle': '丛林',
  // rain
  'light-rain': '下雨 · 细雨',
  'heavy-rain': '倾盆大雨',
  'thunder': '雷声',
  'rain-on-window': '窗外雨声',
  'rain-on-car-roof': '车顶雨声',
  'rain-on-umbrella': '雨伞雨声',
  'rain-on-tent': '帐篷雨声',
  'rain-on-leaves': '叶间雨声',
  // animals
  'birds': '鸟鸣',
  'seagulls': '海鸥',
  'crickets': '蟋蟀',
  'wolf': '狼嚎',
  'owl': '猫头鹰',
  'frog': '蛙鸣',
  'dog-barking': '犬吠',
  'horse-galopp': '马蹄奔跑',
  'cat-purring': '猫咪呼噜',
  'crows': '乌鸦',
  'whale': '鲸鸣',
  'beehive': '蜂嗡',
  'woodpecker': '啄木鸟',
  'chickens': '鸡鸣',
  'cows': '牛叫',
  'sheep': '羊咩',
  // urban
  'highway': '高速公路',
  'road': '马路车流',
  'ambulance-siren': '救护车笛',
  'busy-street': '繁华街道',
  'crowd': '人群熙攘',
  'traffic': '城市交通',
  'fireworks': '烟花',
  // places
  'cafe': '咖啡馆',
  'airport': '机场大厅',
  'church': '教堂',
  'temple': '古寺禅意',
  'construction-site': '施工工地',
  'underwater': '水下世界',
  'crowded-bar': '热闹酒馆',
  'night-village': '夜幕乡村',
  'subway-station': '地铁站',
  'office': '办公室',
  'supermarket': '超市',
  'carousel': '旋转木马',
  'laboratory': '实验室',
  'laundry-room': '洗衣房',
  'restaurant': '餐厅',
  'library': '图书馆',
  // transport
  'train': '行驶火车',
  'inside-a-train': '火车车厢',
  'airplane': '飞机客舱',
  'submarine': '潜水艇',
  'sailboat': '帆船',
  'rowing-boat': '划船',
  // things
  'keyboard': '机械键盘',
  'typewriter': '老式打字机',
  'paper': '翻阅纸张',
  'clock': '时钟滴答',
  'wind-chimes': '风铃',
  'singing-bowl': '颂钵',
  'ceiling-fan': '吊扇转动',
  'dryer': '烘干机',
  'slide-projector': '幻灯机',
  'boiling-water': '煮沸开水',
  'bubbles': '水中气泡',
  'tuning-radio': '调频收音机',
  'morse-code': '摩尔斯电码',
  'washing-machine': '洗衣机',
  'vinyl-effect': '黑胶底噪',
  'windshield-wipers': '雨刮器',
  // noise
  'white-noise': '白噪音',
  'pink-noise': '粉红噪音',
  'brown-noise': '布朗噪音',
};

const PRIORITY_BUILTIN_IDS = ['campfire', 'light-rain', 'waves', 'rain-on-window', 'thunder', 'cafe', 'library', 'keyboard', 'white-noise', 'pink-noise', 'brown-noise'];
const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function ambientMimeType(name) {
  if (typeof name !== 'string') return null;
  return AMBIENT_MIME_TYPES[extname(name).toLowerCase()] || null;
}

export function isAmbientAudioPath(relPath) {
  if (typeof relPath !== 'string' || !relPath.trim()) return false;
  const normalized = relPath.replace(/\\/g, '/');
  if (normalized.startsWith('/') || normalized.includes('..') || /^[a-zA-Z]:/.test(normalized)) return false;
  const parts = normalized.split('/');
  if (!parts.length || parts.some((p) => !p || p === '.' || p.startsWith('.'))) return false;
  return Boolean(ambientMimeType(parts[parts.length - 1]));
}

export const isAmbientAudioName = isAmbientAudioPath;

export function resolveAmbientAudioFile(folderPath, relPath) {
  if (typeof folderPath !== 'string' || !folderPath.trim() || !isAmbientAudioPath(relPath)) return null;
  const root = resolve(folderPath);
  const target = resolve(root, relPath);
  const rel = relative(root, target);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null;
  if (rel.replace(/\\/g, '/') !== relPath.replace(/\\/g, '/')) return null;
  return target;
}

export function ambientTrackTitle(relPath, builtin = false) {
  const fileName = String(relPath || '').replace(/\\/g, '/').split('/').pop() || '';
  const ext = extname(fileName);
  const base = ext ? fileName.slice(0, -ext.length) : fileName;
  if (builtin && BUILTIN_AMBIENT_LABELS[base]) return BUILTIN_AMBIENT_LABELS[base];
  return base;
}

async function scanAudioTree(root, prefix = '', depth = 0) {
  const entries = await readdir(root, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (!entry.name || entry.name.startsWith('.')) continue;
    const rel = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isFile() && isAmbientAudioPath(rel)) {
      results.push(rel);
    } else if (entry.isDirectory() && depth < 1) {
      results.push(...await scanAudioTree(resolve(root, entry.name), rel, depth + 1));
    }
  }
  return results;
}

export async function listAmbientAudio(folderPath, builtin = false) {
  if (typeof folderPath !== 'string' || !folderPath.trim()) {
    return { path: '', tracks: [], missing: false };
  }
  const root = resolve(folderPath);
  let info;
  try {
    info = await stat(root);
  } catch {
    return { path: root, tracks: [], missing: true };
  }
  if (!info.isDirectory()) {
    return { path: root, tracks: [], missing: true };
  }
  const relFiles = await scanAudioTree(root);
  const tracks = relFiles.map((rel) => {
    const parts = rel.split('/');
    const category = builtin && parts.length > 1 && AMBIENT_CATEGORY_LABELS[parts[0]] ? parts[0] : 'custom';
    const fileName = parts[parts.length - 1];
    const ext = extname(fileName);
    const id = ext ? fileName.slice(0, -ext.length) : fileName;
    return {
      name: rel,
      id,
      category,
      categoryLabel: AMBIENT_CATEGORY_LABELS[category] || category,
      title: ambientTrackTitle(rel, builtin),
      builtin,
    };
  });

  tracks.sort((a, b) => {
    if (builtin) {
      const catA = AMBIENT_CATEGORY_ORDER.indexOf(a.category);
      const catB = AMBIENT_CATEGORY_ORDER.indexOf(b.category);
      if (catA !== catB) {
        if (catA === -1) return 1;
        if (catB === -1) return -1;
        return catA - catB;
      }
      const pA = PRIORITY_BUILTIN_IDS.indexOf(a.id);
      const pB = PRIORITY_BUILTIN_IDS.indexOf(b.id);
      if (pA !== -1 || pB !== -1) {
        if (pA === -1) return 1;
        if (pB === -1) return -1;
        return pA - pB;
      }
    }
    return nameCollator.compare(a.title, b.title);
  });

  return { path: root, tracks, missing: false };
}
