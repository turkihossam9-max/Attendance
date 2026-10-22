import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { AttendanceWithDetails } from '../types/database';
import { formatDateTime } from './time';

export function exportToExcel(records: AttendanceWithDetails[], filename: string) {
  const rows = records.map((r) => ({
    Employee: r.employee_name || r.employee?.full_name || '',
    Type: r.type === 'check_in' ? 'Check In' : 'Check Out',
    Location: r.location_name || r.work_location?.name || '',
    Latitude: r.latitude.toFixed(6),
    Longitude: r.longitude.toFixed(6),
    'Date & Time': formatDateTime(r.timestamp),
    Note: r.note || '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 20 }, { wch: 12 }, { wch: 20 },
    { wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 20 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportToPDF(records: AttendanceWithDetails[], filename: string, title: string) {
  const doc = new jsPDF({ orientation: 'landscape' });

  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59);
  doc.text(title, 14, 20);

  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated: ${formatDateTime(new Date().toISOString())}`, 14, 27);
  doc.text(`Total Records: ${records.length}`, 14, 33);

  autoTable(doc, {
    startY: 38,
    head: [['Employee', 'Type', 'Location', 'Date & Time', 'Note']],
    body: records.map((r) => [
      r.employee_name || r.employee?.full_name || '',
      r.type === 'check_in' ? 'Check In' : 'Check Out',
      r.location_name || r.work_location?.name || '',
      formatDateTime(r.timestamp),
      r.note || '',
    ]),
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 10 },
    bodyStyles: { fontSize: 9, textColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    margin: { left: 14, right: 14 },
  });

  doc.save(`${filename}.pdf`);
}
