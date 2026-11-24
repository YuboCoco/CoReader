export function fixturePDF() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /Outlines 8 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 520 640] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 520 640] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...['Attention head experiments', '2 Evaluation on page two'].map((text) => {
      const extra = text.startsWith('2 Evaluation')
        ? ' 0 -45 Td (References) Tj 0 -24 Td ([1] Jane Smith. Example Study. 2020. doi:10.1234/fixture) Tj'
        : '';
      const artwork = extra ? [
        'q 0.1 0.37 0.65 rg 105 347 37 32 re f 157 347 37 52 re f 209 347 37 82 re f Q',
        '0.22 0.3 0.38 RG 88 441 m 88 347 l 258 347 l S',
        'BT /F1 11 Tf 88 324 Td (Figure 1. Validation results) Tj ET',
        'BT /F1 11 Tf 88 280 Td (Table 1. Test split) Tj ET',
        '0.25 0.32 0.42 RG 85 263 m 255 263 l S 85 242 m 255 242 l S 85 202 m 255 202 l S',
        'BT /F1 11 Tf 92 249 Td (Model) Tj 97 0 Td (Score) Tj ET',
        'BT /F1 11 Tf 92 227 Td (Baseline) Tj 97 0 Td (0.72) Tj ET',
        'BT /F1 11 Tf 92 209 Td (Proposed) Tj 97 0 Td (0.89) Tj ET',
        'BT /F1 14 Tf 128 163 Td (h = x + y) Tj 180 0 Td (\\(1\\)) Tj ET',
        'BT /F1 12 Tf 55 132 Td (We use x = y in the evaluation.) Tj ET',
      ].join('\n') : '';
      const stream = 'BT /F1 15 Tf 55 550 Td (' + text + ') Tj' + extra + ' ET\n' + artwork;
      return '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream';
    }),
    '<< /Type /Outlines /First 9 0 R /Last 9 0 R /Count 2 >>',
    '<< /Title (Paper overview) /Parent 8 0 R /First 10 0 R /Last 10 0 R /Count 1 /Dest [3 0 R /XYZ 55 558 null] >>',
    '<< /Title (Evaluation on page two) /Parent 9 0 R /Dest [4 0 R /FitH 558] >>',
  ];
  let data = '%PDF-1.4\n';
  const offsets = objects.map((body, index) => {
    const offset = data.length;
    data += (index + 1) + ' 0 obj\n' + body + '\nendobj\n';
    return offset;
  });
  return data + 'xref\n0 ' + (offsets.length + 1) + '\n0000000000 65535 f \n'
    + offsets.map((offset) => String(offset).padStart(10, '0') + ' 00000 n \n').join('')
    + 'trailer\n<< /Size ' + (offsets.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + data.length + '\n%%EOF\n';
}
