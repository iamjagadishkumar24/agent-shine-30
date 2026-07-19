import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export function toCsv(rows: Array<Record<string, unknown>>, filename: string) {
  if (rows.length === 0) {
    downloadText("", filename);
    return;
  }
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
  downloadText(csv, filename);
}

function downloadText(text: string, filename: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type ReportSection = {
  title: string;
  columns: string[];
  rows: Array<Array<string | number>>;
};

export function toPdf(opts: {
  title: string;
  subtitle?: string;
  sections: ReportSection[];
  filename: string;
}) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();

  // Header band
  doc.setFillColor(15, 15, 20);
  doc.rect(0, 0, pageW, 70, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(opts.title, 40, 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(180, 180, 195);
  if (opts.subtitle) doc.text(opts.subtitle, 40, 52);
  doc.text(`Generated ${new Date().toLocaleString()}`, pageW - 40, 52, { align: "right" });

  let cursorY = 100;
  doc.setTextColor(20, 20, 30);

  opts.sections.forEach((section, idx) => {
    if (idx > 0) cursorY += 20;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(section.title, 40, cursorY);
    cursorY += 10;

    autoTable(doc, {
      startY: cursorY,
      head: [section.columns],
      body: section.rows.map((r) => r.map((c) => (c == null ? "" : String(c)))),
      styles: { fontSize: 9, cellPadding: 6 },
      headStyles: { fillColor: [124, 58, 237], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [246, 246, 250] },
      margin: { left: 40, right: 40 },
    });
    // @ts-ignore - lastAutoTable is added by autoTable plugin
    cursorY = doc.lastAutoTable.finalY + 10;
  });

  // Footer on each page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`Page ${i} of ${pageCount} · Zenwork Performance Manager`, pageW - 40, doc.internal.pageSize.getHeight() - 20, { align: "right" });
  }

  doc.save(opts.filename);
}
