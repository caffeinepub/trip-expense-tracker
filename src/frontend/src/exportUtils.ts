// ── Export Utilities ─────────────────────────────────────────────────────────
// xlsx types (CDN-loaded at runtime via index.html script tag)
type CellObject = {
  v: string | number;
  t: string;
  s?: unknown;
};
type WorkSheet = Record<string, unknown>;

type Member = "Manoj" | "Ramesh" | "Abhijit" | "Pradeep";

interface Expense {
  id: string;
  date: string;
  description: string;
  location: string;
  amount: number;
  paidBy: Member;
}

interface Settlement {
  from: Member;
  to: Member;
  amount: number;
}

type Currency = "INR" | "THB" | "VND";

const MEMBERS_COUNT = 4;
const MEMBERS: Member[] = ["Manoj", "Ramesh", "Abhijit", "Pradeep"];

const CURRENCY_LABELS: Record<Currency, string> = {
  INR: "Indian Rupee (Rs.)",
  THB: "Thai Baht (THB)",
  VND: "Vietnam Dong (VND)",
};

function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return "";
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

// ── PDF Export (HTML print window) ──────────────────────────────────────────

export function exportToPDF(
  expenses: Expense[],
  settlements: Settlement[],
  currency: Currency,
  formatCurrency: (amount: number, currency: Currency) => string,
): void {
  const exportDate = new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const totalSpend = expenses.reduce((s, e) => s + e.amount, 0);
  const fairShare = totalSpend / MEMBERS_COUNT;

  const sorted = [...expenses].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const expenseRows =
    sorted.length === 0
      ? `<tr><td colspan="6" style="text-align:center;color:#666;font-style:italic;">No expenses recorded</td></tr>`
      : sorted
          .map(
            (e, i) => `
        <tr style="background:${i % 2 === 0 ? "#ffffff" : "#f0f6ff"}">
          <td>${formatDateDisplay(e.date)}</td>
          <td>${e.description || "—"}</td>
          <td>${e.location || "—"}</td>
          <td style="text-align:right">${formatCurrency(e.amount, currency)}</td>
          <td style="text-align:center">${e.paidBy}</td>
          <td style="text-align:right">${formatCurrency(e.amount / MEMBERS_COUNT, currency)}</td>
        </tr>`,
          )
          .join("");

  const settlementRows =
    settlements.length === 0
      ? `<tr><td colspan="3" style="text-align:center;color:#148C78;font-weight:600;">All expenses are settled!</td></tr>`
      : settlements
          .map(
            (s, i) => `
        <tr style="background:${i % 2 === 0 ? "#ffffff" : "#e8faf5"}">
          <td>${s.from}</td>
          <td>${s.to}</td>
          <td style="text-align:right">${formatCurrency(s.amount, currency)}</td>
        </tr>`,
          )
          .join("");

  const perPersonRows = MEMBERS.map((m, i) => {
    const paid = expenses
      .filter((e) => e.paidBy === m)
      .reduce((s, e) => s + e.amount, 0);
    const balance = paid - fairShare;
    const balanceColor = balance >= 0 ? "#1a7a1a" : "#cc0000";
    const balanceText =
      balance >= 0
        ? `+${formatCurrency(balance, currency)}`
        : `-${formatCurrency(Math.abs(balance), currency)}`;
    return `
      <tr style="background:${i % 2 === 0 ? "#fffbeb" : "#ffffff"}">
        <td>${m}</td>
        <td style="text-align:right">${formatCurrency(paid, currency)}</td>
        <td style="text-align:right">${formatCurrency(fairShare, currency)}</td>
        <td style="text-align:right;font-weight:700;color:${balanceColor}">${balanceText}</td>
      </tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>TRIP - Expense Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 10pt; color: #1e1e1e; padding: 20px; }
    .header { background: #0f1734; color: white; padding: 14px 18px; border-radius: 6px; margin-bottom: 20px; }
    .header h1 { font-size: 18pt; font-weight: 700; }
    .header p { font-size: 8.5pt; margin-top: 4px; opacity: 0.85; }
    .section-title { font-size: 11pt; font-weight: 700; padding: 7px 10px; color: white; border-radius: 4px; margin: 18px 0 8px; }
    .expenses-title { background: #b8860b; }
    .settlements-title { background: #148C78; }
    .persons-title { background: #555; }
    table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    th { padding: 6px 8px; text-align: left; color: white; background: #0f1734; }
    th.right { text-align: right; }
    th.center { text-align: center; }
    td { padding: 5px 8px; border-bottom: 1px solid #e8e8e8; }
    .totals-row td { background: #d6e4f7; font-weight: 700; color: #0f1734; }
    .totals-row td:nth-child(4), .totals-row td:nth-child(6) { text-align: right; }
    .footer { margin-top: 24px; font-size: 8pt; color: #999; text-align: center; border-top: 1px solid #e0e0e0; padding-top: 10px; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>TRIP — Expense Report</h1>
    <p>Exported: ${exportDate} &nbsp;|&nbsp; Currency: ${CURRENCY_LABELS[currency]} &nbsp;|&nbsp; Total: ${formatCurrency(totalSpend, currency)}</p>
  </div>

  <div class="section-title expenses-title">EXPENSE DETAILS</div>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Description</th>
        <th>Location</th>
        <th class="right">Amount</th>
        <th class="center">Paid By</th>
        <th class="right">Per Person</th>
      </tr>
    </thead>
    <tbody>
      ${expenseRows}
      <tr class="totals-row">
        <td colspan="3" style="font-weight:700">Total (${expenses.length} expense${expenses.length !== 1 ? "s" : ""})</td>
        <td style="text-align:right">${formatCurrency(totalSpend, currency)}</td>
        <td></td>
        <td style="text-align:right">${formatCurrency(totalSpend / MEMBERS_COUNT, currency)}</td>
      </tr>
    </tbody>
  </table>

  <div class="section-title settlements-title">SETTLEMENT SUMMARY</div>
  <table>
    <thead>
      <tr>
        <th>From (Pays)</th>
        <th>To (Receives)</th>
        <th class="right">Amount</th>
      </tr>
    </thead>
    <tbody>${settlementRows}</tbody>
  </table>

  <div class="section-title persons-title">PER PERSON SHARE</div>
  <table>
    <thead>
      <tr>
        <th>Member</th>
        <th class="right">Total Paid</th>
        <th class="right">Fair Share</th>
        <th class="right">Balance</th>
      </tr>
    </thead>
    <tbody>${perPersonRows}</tbody>
  </table>

  <div class="footer">Generated by Trip Expense Tracker &nbsp;|&nbsp; caffeine.ai</div>
  <script>window.onload = function(){ window.print(); }</script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

// ── Excel Export (real .xlsx via SheetJS) ────────────────────────────────────

export function exportToExcel(
  expenses: Expense[],
  settlements: Settlement[],
  currency: Currency,
  formatCurrency: (amount: number, currency: Currency) => string,
): void {
  // Use XLSX loaded from CDN via index.html script tag
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xlsxPromise: Promise<unknown> = (window as any).XLSX
    ? Promise.resolve((window as any).XLSX)
    : new Promise((resolve) => {
        const script = document.createElement("script");
        script.src =
          "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
        script.onload = () => resolve((window as any).XLSX);
        document.head.appendChild(script);
      });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  xlsxPromise.then((XLSX: any) => {
    const exportDate = new Date().toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    const totalSpend = expenses.reduce((s, e) => s + e.amount, 0);
    const fairShare = totalSpend / MEMBERS_COUNT;

    const sorted = [...expenses].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    const wb = XLSX.utils.book_new();

    // ── Helper: apply styles to a range of cells ──────────────────────────
    type CellStyle = {
      // eslint-disable-line @typescript-eslint/no-unused-vars
      fill?: { fgColor: { rgb: string } };
      font?: { bold?: boolean; color?: { rgb: string }; sz?: number };
      alignment?: { horizontal?: string; vertical?: string };
      border?: {
        top?: { style: string; color: { rgb: string } };
        bottom?: { style: string; color: { rgb: string } };
        left?: { style: string; color: { rgb: string } };
        right?: { style: string; color: { rgb: string } };
      };
    };

    const makeBorder = (): CellStyle["border"] => ({
      top: { style: "thin", color: { rgb: "CCCCCC" } },
      bottom: { style: "thin", color: { rgb: "CCCCCC" } },
      left: { style: "thin", color: { rgb: "CCCCCC" } },
      right: { style: "thin", color: { rgb: "CCCCCC" } },
    });

    const styledCell = (
      value: string | number,
      style: CellStyle,
    ): CellObject => ({
      v: value,
      t: typeof value === "number" ? "n" : "s",
      s: { ...style, border: makeBorder() },
    });

    // ── Build worksheet rows ──────────────────────────────────────────────
    const rows: CellObject[][] = [];

    const DARK_NAVY = "0F1734";
    const GOLD = "B8860B";
    const TEAL = "148C78";
    const PURPLE = "5C4A8A";
    const WHITE_TEXT = "FFFFFF";
    const LIGHT_BLUE_ROW = "EEF3FF";
    const LIGHT_TEAL_ROW = "E8FAF5";
    const LIGHT_PURPLE_ROW = "F0EBFF";
    const TOTALS_BG = "D6E4F7";

    const headerStyle = (bg: string): CellStyle => ({
      fill: { fgColor: { rgb: bg } },
      font: { bold: true, color: { rgb: WHITE_TEXT }, sz: 12 },
      alignment: { horizontal: "center" },
    });

    const sectionLabelStyle = (bg: string): CellStyle => ({
      fill: { fgColor: { rgb: bg } },
      font: { bold: true, color: { rgb: WHITE_TEXT }, sz: 13 },
    });

    const colHeaderStyle = (bg: string): CellStyle => ({
      fill: { fgColor: { rgb: bg } },
      font: { bold: true, color: { rgb: WHITE_TEXT }, sz: 11 },
    });

    // Title row
    rows.push([
      styledCell(
        `TRIP — Expense Report | ${exportDate} | ${CURRENCY_LABELS[currency]}`,
        {
          ...headerStyle(DARK_NAVY),
          font: { bold: true, color: { rgb: WHITE_TEXT }, sz: 14 },
        },
      ),
    ]);
    rows.push([]); // spacer

    // ── EXPENSE DETAILS section ───────────────────────────────────────────
    rows.push([styledCell("EXPENSE DETAILS", sectionLabelStyle(GOLD))]);
    rows.push([
      styledCell("Date", colHeaderStyle(DARK_NAVY)),
      styledCell("Description", colHeaderStyle(DARK_NAVY)),
      styledCell("Location", colHeaderStyle(DARK_NAVY)),
      styledCell("Amount", {
        ...colHeaderStyle(DARK_NAVY),
        alignment: { horizontal: "right" },
      }),
      styledCell("Paid By", {
        ...colHeaderStyle(DARK_NAVY),
        alignment: { horizontal: "center" },
      }),
      styledCell("Per Person", {
        ...colHeaderStyle(DARK_NAVY),
        alignment: { horizontal: "right" },
      }),
    ]);

    if (sorted.length === 0) {
      rows.push([
        styledCell("No expenses recorded", {
          font: { color: { rgb: "666666" } },
        }),
      ]);
    } else {
      sorted.forEach((e, i) => {
        const rowBg = i % 2 === 0 ? "FFFFFF" : LIGHT_BLUE_ROW;
        const cellStyle: CellStyle = { fill: { fgColor: { rgb: rowBg } } };
        rows.push([
          styledCell(formatDateDisplay(e.date), cellStyle),
          styledCell(e.description || "-", cellStyle),
          styledCell(e.location || "-", cellStyle),
          styledCell(formatCurrency(e.amount, currency), {
            ...cellStyle,
            alignment: { horizontal: "right" },
          }),
          styledCell(e.paidBy, {
            ...cellStyle,
            alignment: { horizontal: "center" },
          }),
          styledCell(formatCurrency(e.amount / MEMBERS_COUNT, currency), {
            ...cellStyle,
            alignment: { horizontal: "right" },
          }),
        ]);
      });
      // Totals row
      const totalStyle: CellStyle = {
        fill: { fgColor: { rgb: TOTALS_BG } },
        font: { bold: true, color: { rgb: DARK_NAVY } },
      };
      rows.push([
        styledCell(
          `Total (${expenses.length} expense${expenses.length !== 1 ? "s" : ""})`,
          totalStyle,
        ),
        styledCell("", totalStyle),
        styledCell("", totalStyle),
        styledCell(formatCurrency(totalSpend, currency), {
          ...totalStyle,
          alignment: { horizontal: "right" },
        }),
        styledCell("", totalStyle),
        styledCell(formatCurrency(totalSpend / MEMBERS_COUNT, currency), {
          ...totalStyle,
          alignment: { horizontal: "right" },
        }),
      ]);
    }

    rows.push([]); // spacer

    // ── SETTLEMENT SUMMARY section ────────────────────────────────────────
    rows.push([styledCell("SETTLEMENT SUMMARY", sectionLabelStyle(TEAL))]);
    rows.push([
      styledCell("From (Pays)", colHeaderStyle("1A6B5C")),
      styledCell("To (Receives)", colHeaderStyle("1A6B5C")),
      styledCell("Amount", {
        ...colHeaderStyle("1A6B5C"),
        alignment: { horizontal: "right" },
      }),
    ]);

    if (settlements.length === 0) {
      rows.push([
        styledCell("All expenses are settled!", {
          font: { bold: true, color: { rgb: TEAL } },
        }),
      ]);
    } else {
      settlements.forEach((s, i) => {
        const rowBg = i % 2 === 0 ? "FFFFFF" : LIGHT_TEAL_ROW;
        const cellStyle: CellStyle = { fill: { fgColor: { rgb: rowBg } } };
        rows.push([
          styledCell(s.from, cellStyle),
          styledCell(s.to, cellStyle),
          styledCell(formatCurrency(s.amount, currency), {
            ...cellStyle,
            alignment: { horizontal: "right" },
          }),
        ]);
      });
    }

    rows.push([]); // spacer

    // ── PER PERSON SHARE section ──────────────────────────────────────────
    rows.push([styledCell("PER PERSON SHARE", sectionLabelStyle(PURPLE))]);
    rows.push([
      styledCell("Member", colHeaderStyle("4A3A72")),
      styledCell("Total Paid", {
        ...colHeaderStyle("4A3A72"),
        alignment: { horizontal: "right" },
      }),
      styledCell("Fair Share", {
        ...colHeaderStyle("4A3A72"),
        alignment: { horizontal: "right" },
      }),
      styledCell("Balance", {
        ...colHeaderStyle("4A3A72"),
        alignment: { horizontal: "right" },
      }),
    ]);

    MEMBERS.forEach((m, i) => {
      const paid = expenses
        .filter((e) => e.paidBy === m)
        .reduce((s, e) => s + e.amount, 0);
      const balance = paid - fairShare;
      const balanceColor = balance >= 0 ? "1A7A1A" : "CC0000";
      const balanceBg = balance >= 0 ? "E8F5E8" : "FCE8E8";
      const balanceText =
        balance >= 0
          ? `+${formatCurrency(balance, currency)}`
          : `-${formatCurrency(Math.abs(balance), currency)}`;
      const rowBg = i % 2 === 0 ? "FAF5FF" : LIGHT_PURPLE_ROW;
      const cellStyle: CellStyle = { fill: { fgColor: { rgb: rowBg } } };
      rows.push([
        styledCell(m, { ...cellStyle, font: { bold: true } }),
        styledCell(formatCurrency(paid, currency), {
          ...cellStyle,
          alignment: { horizontal: "right" },
        }),
        styledCell(formatCurrency(fairShare, currency), {
          ...cellStyle,
          alignment: { horizontal: "right" },
        }),
        styledCell(balanceText, {
          fill: { fgColor: { rgb: balanceBg } },
          font: { bold: true, color: { rgb: balanceColor } },
          alignment: { horizontal: "right" },
        }),
      ]);
    });

    rows.push([]); // spacer
    rows.push([
      styledCell("Generated by Trip Expense Tracker — caffeine.ai", {
        font: { color: { rgb: "999999" } },
      }),
    ]);

    // ── Build sheet from rows ─────────────────────────────────────────────
    const ws: WorkSheet = {};
    rows.forEach((row, r) => {
      row.forEach((cell, c) => {
        const addr = XLSX.utils.encode_cell({ r, c });
        ws[addr] = cell;
      });
    });

    // Sheet dimensions
    const maxRow = rows.length - 1;
    const maxCol = 5;
    ws["!ref"] = XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: maxRow, c: maxCol },
    });

    // Column widths
    ws["!cols"] = [
      { wch: 14 }, // Date
      { wch: 18 }, // Description
      { wch: 16 }, // Location / To
      { wch: 18 }, // Amount / Balance
      { wch: 12 }, // Paid By
      { wch: 14 }, // Per Person
    ];

    // Merge title row across all 6 columns
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];

    XLSX.utils.book_append_sheet(wb, ws, "Trip Expenses");

    XLSX.writeFile(wb, "trip-expenses.xlsx");
  });
}
