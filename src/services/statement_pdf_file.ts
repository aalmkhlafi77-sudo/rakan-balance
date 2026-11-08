/**
 * RAKAN BALANCE - real A4 PDF generated entirely in the browser.
 * Arabic text is shaped by the browser canvas renderer and embedded as JPEG
 * page images in a valid PDF 1.4 document (not HTML renamed as PDF).
 * No remote service, font download, or financial data mutation is involved.
 */
export interface StatementPdfData {
  accountName: string;
  ownerName: string;
  periodLabel: string;
  currencySymbol: string;
  openingBalance: string;
  totalOwedBy: string;
  totalOwedTo: string;
  closingBalance: string;
  rows: Array<{
    date: string;
    description: string;
    owedBy: string;
    owedTo: string;
    runningBalance: string;
  }>;
}

const PAGE_WIDTH = 620;
const PAGE_HEIGHT = 877;
const SCALE = 2;
const FONT = '"Arial", "Tahoma", sans-serif';
const MARGIN = 34;

function wrapText(ctx: CanvasRenderingContext2D, input: string, width: number): string[] {
  const lines: string[] = [];
  for (const part of String(input || '—').split(/\r?\n/)) {
    let line = '';
    for (const word of (part.trim().split(/\s+/).filter(Boolean).length ? part.trim().split(/\s+/) : ['—'])) {
      const candidate = line ? line + ' ' + word : word;
      if (ctx.measureText(candidate).width <= width) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = '';
        for (const character of word) {
          if (line && ctx.measureText(line + character).width > width) {
            lines.push(line);
            line = character;
          } else {
            line += character;
          }
        }
      }
    }
    lines.push(line || '—');
  }
  return lines;
}

function writeText(
  ctx: CanvasRenderingContext2D,
  content: string,
  x: number,
  y: number,
  options: { font?: string; color?: string; align?: CanvasTextAlign; direction?: CanvasDirection } = {},
): void {
  ctx.save();
  ctx.font = options.font || '12px ' + FONT;
  ctx.fillStyle = options.color || '#1e293b';
  ctx.textAlign = options.align || 'right';
  ctx.textBaseline = 'middle';
  ctx.direction = options.direction || 'rtl';
  ctx.fillText(content, x, y);
  ctx.restore();
}

function makePage(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_WIDTH * SCALE;
  canvas.height = PAGE_HEIGHT * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('تعذر تشغيل محرك رسم كشف الحساب في هذا المتصفح.');
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  return { canvas, ctx };
}

function pageHeader(ctx: CanvasRenderingContext2D, data: StatementPdfData, pageNo: number): void {
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, PAGE_WIDTH, 79);
  writeText(ctx, 'راكان بلانس  |  RAKAN BALANCE', PAGE_WIDTH - MARGIN, 25,
    { font: 'bold 18px ' + FONT, color: '#ffffff' });
  writeText(ctx, 'كشف حساب: ' + data.accountName, PAGE_WIDTH - MARGIN, 53,
    { font: 'bold 13px ' + FONT, color: '#d1fae5' });
  writeText(ctx, data.ownerName, MARGIN, 53,
    { font: '11px ' + FONT, color: '#cbd5e1', align: 'left' });
  writeText(ctx, data.periodLabel, PAGE_WIDTH - MARGIN, 105,
    { font: '11px ' + FONT, color: '#475569' });
  writeText(ctx, 'صفحة ' + pageNo, MARGIN, PAGE_HEIGHT - 30,
    { font: '11px ' + FONT, color: '#64748b', align: 'left' });
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(MARGIN, PAGE_HEIGHT - 47, PAGE_WIDTH - MARGIN * 2, 1);
}

function headingRow(ctx: CanvasRenderingContext2D, y: number): void {
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(MARGIN, y, PAGE_WIDTH - MARGIN * 2, 29);
  writeText(ctx, 'التاريخ', 570, y + 15, { font: 'bold 10px ' + FONT });
  writeText(ctx, 'البيان', 480, y + 15, { font: 'bold 10px ' + FONT });
  writeText(ctx, 'لك', 242, y + 15, { font: 'bold 10px ' + FONT });
  writeText(ctx, 'عليك', 162, y + 15, { font: 'bold 10px ' + FONT });
  writeText(ctx, 'الرصيد', 91, y + 15, { font: 'bold 10px ' + FONT });
}

function summary(ctx: CanvasRenderingContext2D, data: StatementPdfData): number {
  const items = [
    ['رصيد أول المدة', data.openingBalance],
    ['إجمالي لك', data.totalOwedBy],
    ['إجمالي عليك', data.totalOwedTo],
    ['الرصيد الختامي', data.closingBalance],
  ];
  let y = 123;
  for (let i = 0; i < items.length; i++) {
    const [label, value] = items[i];
    ctx.fillStyle = i === 3 ? '#d1fae5' : i % 2 ? '#f8fafc' : '#f1f5f9';
    ctx.fillRect(MARGIN, y, PAGE_WIDTH - 2 * MARGIN, 31);
    writeText(ctx, label, 573, y + 16, { font: 'bold 11px ' + FONT });
    writeText(ctx, value, 49, y + 16, { font: 'bold 11px ' + FONT, align: 'left', direction: 'ltr' });
    y += 33;
  }
  return y + 15;
}

function jpegBytes(canvas: HTMLCanvasElement): Uint8Array {
  const url = canvas.toDataURL('image/jpeg', 0.85);
  if (!url.startsWith('data:image/jpeg;base64,')) throw new Error('تعذر تحويل صفحة الكشف إلى صورة صالحة.');
  const decoded = atob(url.slice('data:image/jpeg;base64,'.length));
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
  return bytes;
}

/** PDF contains only ASCII syntax and raw JPEG streams; object offsets are byte-accurate. */
export function encodeJpegPagesAsPdf(images: Uint8Array[], width: number, height: number): Uint8Array {
  if (!images.length) throw new Error('لا توجد صفحات لإنشاء PDF.');
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let position = 0;
  const append = (data: Uint8Array) => { chunks.push(data); position += data.byteLength; };
  const ascii = (value: string) => append(encoder.encode(value));
  const object = (id: number, value: string) => {
    offsets[id] = position;
    ascii(id + ' 0 obj\n' + value + '\nendobj\n');
  };
  append(new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10, 37, 226, 227, 207, 211, 10]));
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  const kids = images.map((_, index) => (3 + 3 * index) + ' 0 R').join(' ');
  object(2, '<< /Type /Pages /Kids [ ' + kids + ' ] /Count ' + images.length + ' >>');
  images.forEach((jpeg, index) => {
    const page = 3 + 3 * index;
    const content = page + 1;
    const image = page + 2;
    object(page, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ' + image + ' 0 R >> >> /Contents ' + content + ' 0 R >>');
    const instructions = 'q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n';
    object(content, '<< /Length ' + encoder.encode(instructions).length + ' >>\nstream\n' + instructions + 'endstream');
    offsets[image] = position;
    ascii(image + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + width +
      ' /Height ' + height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpeg.length + ' >>\nstream\n');
    append(jpeg);
    ascii('\nendstream\nendobj\n');
  });
  const startXref = position;
  const size = 3 + 3 * images.length;
  ascii('xref\n0 ' + size + '\n0000000000 65535 f \n');
  for (let id = 1; id < size; id++) {
    if (offsets[id] === undefined) throw new Error('PDF object is missing: ' + id);
    ascii(String(offsets[id]).padStart(10, '0') + ' 00000 n \n');
  }
  ascii('trailer\n<< /Size ' + size + ' /Root 1 0 R >>\nstartxref\n' + startXref + '\n%%EOF\n');
  const result = new Uint8Array(position);
  let cursor = 0;
  for (const chunk of chunks) { result.set(chunk, cursor); cursor += chunk.length; }
  return result;
}

/** Browser-only. Generate a real, readable PDF without private notes or remote requests. */
export function createStatementPdf(data: StatementPdfData): File {
  const images: Uint8Array[] = [];
  let { canvas, ctx } = makePage();
  let pageNo = 1;
  pageHeader(ctx, data, pageNo);
  let y = summary(ctx, data);
  headingRow(ctx, y);
  y += 34;

  const savePage = () => { images.push(jpegBytes(canvas)); };
  const nextPage = () => {
    savePage();
    pageNo += 1;
    ({ canvas, ctx } = makePage());
    pageHeader(ctx, data, pageNo);
    y = 133;
    headingRow(ctx, y);
    y += 34;
  };

  for (let index = 0; index < data.rows.length; index++) {
    const row = data.rows[index];
    ctx.font = '11px ' + FONT;
    const lines = wrapText(ctx, row.description, 188);
    const rowHeight = Math.max(43, lines.length * 15 + 14);
    if (rowHeight > 580) throw new Error('بيان إحدى الحركات طويل جدًا لإنشاء صفحة كشف حساب.');
    if (y + rowHeight > PAGE_HEIGHT - 63) nextPage();
    ctx.fillStyle = index % 2 ? '#f8fafc' : '#ffffff';
    ctx.fillRect(MARGIN, y, PAGE_WIDTH - MARGIN * 2, rowHeight);
    writeText(ctx, row.date, 572, y + 18, { font: '10px ' + FONT });
    for (let i = 0; i < lines.length; i++) {
      writeText(ctx, lines[i], 479, y + 17 + i * 15, { font: '11px ' + FONT });
    }
    writeText(ctx, row.owedBy || '—', 241, y + 18, { font: '10px ' + FONT });
    writeText(ctx, row.owedTo || '—', 162, y + 18, { font: '10px ' + FONT });
    writeText(ctx, row.runningBalance, 94, y + 18, { font: '10px ' + FONT });
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(MARGIN, y + rowHeight - 1, PAGE_WIDTH - MARGIN * 2, 1);
    y += rowHeight;
  }
  if (!data.rows.length) writeText(ctx, 'لا توجد حركات خلال هذه الفترة', 580, y + 25);
  savePage();

  const result = encodeJpegPagesAsPdf(images, PAGE_WIDTH * SCALE, PAGE_HEIGHT * SCALE);
  // Do not create a file if the PDF header/xref was not generated.
  if (result[0] !== 37 || result[1] !== 80 || result[2] !== 68 || result[3] !== 70) {
    throw new Error('فشل التحقق من ملف PDF.');
  }
  const safeName = data.accountName.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
  const filename = 'statement_' + safeName + '_' + new Date().toISOString().slice(0, 10) + '.pdf';
  return new File([result as BlobPart], filename, { type: 'application/pdf' });
}

export function downloadPdfFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
