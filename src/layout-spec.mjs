export const inputSize = 800;
export const layoutWeights = {
  file: 'PP-DocLayoutV3-fp16.onnx',
  url: 'https://huggingface.co/bu44er/PP-DocLayoutV3-FP16-ONNX/resolve/58dfa00ba1135e027817cbd5802f1f0df62aa5c0/PP-DocLayoutV3-fp16.onnx',
  bytes: 67372587,
  sha256: '8bb693ed3b5dcc1cf926b15d89dfe6abf62bc11cdd0afd33c8ffe039db6f8209',
};

const classes = [
  'abstract', 'algorithm', 'aside_text', 'chart', 'content', 'display_formula', 'doc_title', 'figure_title',
  'footer', 'footer_image', 'footnote', 'formula_number', 'header', 'header_image', 'image', 'inline_formula',
  'number', 'paragraph_title', 'reference', 'reference_content', 'seal', 'table', 'text', 'vertical_text', 'vision_footnote',
];

const clamp = (value) => Math.min(1, Math.max(0, value / inputSize));

export function decodeLayout(data) {
  const regions = [];
  for (let offset = 0; offset + 6 < data.length; offset += 7) {
    const region = data.subarray(offset, offset + 7);
    if (!region.every(Number.isFinite)) continue;
    const [index, score, x1, y1, x2, y2, order] = region;
    const label = classes[index];
    if (!label || score < .5) continue;
    const bounds = [clamp(x1), clamp(y1), clamp(x2), clamp(y2)];
    const size = (bounds[2] - bounds[0]) * (bounds[3] - bounds[1]);
    if (bounds[2] <= bounds[0] || bounds[3] <= bounds[1] || (label === 'image' && size > .9)) continue;
    regions.push({ label, score, order, bounds });
  }
  return regions.sort((a, b) => a.order - b.order);
}
