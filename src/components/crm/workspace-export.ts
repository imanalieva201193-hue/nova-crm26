import * as XLSX from "xlsx";
export function exportWorkbook(name: string, sheets: Record<string, Record<string, unknown>[]>) {
  const workbook = XLSX.utils.book_new();
  for (const [title, rows] of Object.entries(sheets))
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), title.slice(0, 31));
  XLSX.writeFile(workbook, `${name}.xlsx`);
}
