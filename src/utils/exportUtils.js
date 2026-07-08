import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';

/**
 * Formats attendance records for export by extracting necessary fields
 */
const formatDataForExport = (records) => {
  return records.map(record => ({
    'Date': record.date || new Date().toLocaleDateString(),
    'Employee Name': record.name,
    'Role': record.role,
    'Punch In': record.punchIn,
    'Punch Out': record.punchOut,
    'Status': record.status,
    'Location': record.location?.address || 'N/A'
  }));
};

/**
 * Exports data to an Excel (.xlsx) file
 */
export const exportAttendanceToExcel = (records) => {
  const data = formatDataForExport(records);
  
  // Create a new workbook and worksheet
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Report');
  
  // Trigger download
  XLSX.writeFile(workbook, `Attendance_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
};

/**
 * Exports data to a PDF file with a formatted table
 */
export const exportAttendanceToPDF = (records) => {
  const doc = new jsPDF();
  
  // Document Title
  doc.setFontSize(18);
  doc.text('Daily Attendance Report', 14, 22);
  
  // Document Date
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
  
  const data = formatDataForExport(records);
  
  if (data.length === 0) {
    doc.text('No attendance records found.', 14, 40);
    doc.save(`Attendance_Report_${new Date().toISOString().split('T')[0]}.pdf`);
    return;
  }
  
  // Map data to array format for jspdf-autotable
  const tableColumn = Object.keys(data[0]);
  const tableRows = data.map(record => Object.values(record));
  
  doc.autoTable({
    startY: 35,
    head: [tableColumn],
    body: tableRows,
    theme: 'grid',
    styles: { fontSize: 8 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255 }
  });
  
  // Trigger download
  doc.save(`Attendance_Report_${new Date().toISOString().split('T')[0]}.pdf`);
};
