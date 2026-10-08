const ExcelJS = require('exceljs');
const { effectiveStatus } = require('./resultCalculationService');

/**
 * Builds a formatted workbook: Sheet 1 is the result table with a merged
 * school header, frozen header row and print setup; Sheet 2 is summary
 * statistics. Returns a Buffer for the controller to stream.
 */
async function generateResultExcel(result) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'School Result Management System';
  workbook.created = new Date();

  const subjectNames = result.subjects.map((s) => s.name);
  const sheet = workbook.addWorksheet('Result', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const columns = [
    { header: 'Position', key: 'position', width: 10 },
    { header: 'Roll No', key: 'rollNumber', width: 12 },
    { header: 'Student Name', key: 'name', width: 24 },
    { header: "Father's Name", key: 'fatherName', width: 22 },
    ...subjectNames.map((n) => ({ header: n, key: n, width: 12 })),
    { header: 'Total Obtained', key: 'totalObtained', width: 14 },
    { header: 'Total Marks', key: 'totalMax', width: 12 },
    { header: 'Percentage', key: 'percentage', width: 12 },
    { header: 'Status', key: 'status', width: 10 },
    // Permanent record of which subject(s) a student failed -- shown even
    // when a teacher override has changed Status to PASS.
    { header: 'Remarks', key: 'remarks', width: 24 },
  ];

  const lastColLetter = sheet.getColumn(columns.length).letter;
  sheet.mergeCells(`A1:${lastColLetter}1`);
  sheet.getCell('A1').value = result.schoolInfo?.name || 'School';
  sheet.getCell('A1').font = { bold: true, size: 16 };
  sheet.getCell('A1').alignment = { horizontal: 'center' };

  sheet.mergeCells(`A2:${lastColLetter}2`);
  sheet.getCell('A2').value =
    `${result.examName || result.examType} — ${result.academicYear} — Class ${result.class}` +
    (result.group ? ` [${result.group}]` : '') +
    (result.section ? ` (${result.section})` : '');
  sheet.getCell('A2').font = { bold: true, size: 12 };
  sheet.getCell('A2').alignment = { horizontal: 'center' };

  sheet.addRow([]); // spacer row 3

  sheet.columns = columns;
  const headerRow = sheet.getRow(4);
  headerRow.values = columns.map((c) => c.header);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };
    cell.alignment = { horizontal: 'center' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9EEF9' } };
  });
  sheet.views = [{ state: 'frozen', ySplit: 4 }];

  const sorted = [...result.students].sort((a, b) => a.position - b.position);
  sorted.forEach((student) => {
    const marksBySubject = new Map(student.marks.map((m) => [m.subject, m.obtained]));
    const status = effectiveStatus(student);
    const isOverridden = !!student.overriddenStatus && student.overriddenStatus !== student.status;
    const remarks =
      student.failedSubjects && student.failedSubjects.length > 0
        ? `Failed: ${student.failedSubjects.join(', ')}${isOverridden ? ' (overridden by teacher)' : ''}`
        : '';
    const row = sheet.addRow({
      position: student.position,
      rollNumber: student.rollNumber,
      name: student.name,
      fatherName: student.fatherName || '',
      ...Object.fromEntries(subjectNames.map((n) => [n, marksBySubject.get(n) ?? ''])),
      totalObtained: student.totalObtained,
      totalMax: student.totalMax,
      percentage: student.percentage / 100,
      status,
      remarks,
    });
    row.getCell('percentage').numFmt = '0.00%';
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
    if (status === 'FAIL') {
      row.getCell('status').font = { color: { argb: 'FFB00020' }, bold: true };
    }
    if (isOverridden) {
      row.getCell('remarks').font = { color: { argb: 'FFB8860B' }, italic: true };
    }
  });

  const statsSheet = workbook.addWorksheet('Statistics');
  statsSheet.columns = [
    { header: 'Metric', key: 'metric', width: 22 },
    { header: 'Value', key: 'value', width: 16 },
  ];
  statsSheet.getRow(1).font = { bold: true };
  const st = result.statistics;
  [
    ['Total Students', st.totalStudents],
    ['Passed', st.passed],
    ['Failed', st.failed],
    ['Pass Percentage', `${st.passPercentage}%`],
    ['Highest Marks', st.highest],
    ['Lowest Marks', st.lowest],
    ['Average Marks', st.average],
  ].forEach(([metric, value]) => statsSheet.addRow({ metric, value }));

  return workbook.xlsx.writeBuffer();
}

module.exports = { generateResultExcel };
