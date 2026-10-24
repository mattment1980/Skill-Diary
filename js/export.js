// Word-Export der Spieler-Zusammenfassung (docx-Bibliothek wird erst beim Export geladen).

let loading = null;
function loadDocx() {
  if (window.docx) return Promise.resolve(window.docx);
  loading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'lib/docx.umd.js';
    s.onload = () => resolve(window.docx);
    s.onerror = () => reject(new Error('Word-Bibliothek konnte nicht geladen werden'));
    document.head.appendChild(s);
  });
  return loading;
}

const GREEN = '01663F';
const ORANGE = 'E07A1F';

/**
 * @param {{name:string, period:string, summary:{einschaetzung:string, super:string[], verbessern:string[], stolz:{titel:string,text:string}[]}}} p
 * @returns {Promise<Blob>}
 */
export async function buildDocx({ name, period, summary }) {
  const d = await loadDocx();
  const logo = await (await fetch('assets/logo.png')).arrayBuffer();
  const H = (text, color = GREEN) => new d.Paragraph({
    spacing: { before: 280, after: 100 },
    children: [new d.TextRun({ text, bold: true, size: 28, color, font: 'Calibri' })],
  });
  const P = text => new d.Paragraph({ spacing: { after: 80 }, children: [new d.TextRun({ text, size: 22, font: 'Calibri' })] });
  const B = text => new d.Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: [new d.TextRun({ text, size: 22, font: 'Calibri' })] });

  const doc = new d.Document({
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } },
      children: [
        new d.Paragraph({
          children: [
            new d.ImageRun({ type: 'png', data: logo, transformation: { width: 42, height: 49 } }),
            new d.TextRun({ text: '   Entwicklungsfeedback', bold: true, size: 36, color: GREEN, font: 'Calibri' }),
          ],
        }),
        new d.Paragraph({ spacing: { after: 200 }, children: [
          new d.TextRun({ text: name, bold: true, size: 26, font: 'Calibri' }),
          new d.TextRun({ text: `   ·   ${period}`, size: 22, color: '666666', font: 'Calibri' }),
        ] }),
        H('Unsere Einschätzung'),
        P(summary.einschaetzung),
        H('Das machst du schon super'),
        ...summary.super.map(B),
        H('Hier kannst du dich noch verbessern'),
        ...summary.verbessern.map(B),
        H('Darauf kannst du stolz sein', ORANGE),
        ...summary.stolz.flatMap(s => [
          new d.Paragraph({ spacing: { before: 80, after: 40 }, children: [new d.TextRun({ text: s.titel, bold: true, size: 22, font: 'Calibri' })] }),
          P(s.text),
        ]),
      ],
    }],
  });
  return d.Packer.toBlob(doc);
}
