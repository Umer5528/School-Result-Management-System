const PDFDocument = require('pdfkit');
const { effectiveStatus } = require('./resultCalculationService');

const MARGIN = 40;
const ROW_HEIGHT = 20;

/**
 * Streams a professional, multi-page result PDF. Table headers repeat on
 * every page automatically because the row-drawing loop checks remaining
 * page space before each row and re-draws the header after adding a page.
 */
function generateResultPdf(result, res) {
  const doc = new PDFDocument({ margin: MARGIN, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="result-${result._id}.pdf"`);
  doc.pipe(res);

  const subjectNames = result.subjects.map((s) => s.name);
  const columns = [
    { key: 'position', label: 'Pos', width: 30 },
    { key: 'rollNumber', label: 'Roll No', width: 50 },
    { key: 'name', label: 'Student Name', width: 110 },
    { key: 'fatherName', label: "Father's Name", width: 100 },
    ...subjectNames.map((n) => ({ key: n, label: n, width: 55 })),
    { key: 'totalObtained', label: 'Total', width: 50 },
    { key: 'percentage', label: '%', width: 40 },
    { key: 'status', label: 'Status', width: 50 },
    // Permanent record of which subject(s) a student failed -- shown even
    // when a teacher override has changed the final Status to PASS, so
    // "failed Chemistry but promoted" never gets silently erased from the
    // printed document.
    { key: 'remarks', label: 'Remarks', width: 90 },
  ];
  const tableWidth = columns.reduce((s, c) => s + c.width, 0);

  function drawHeader() {
    doc.fontSize(16).font('Helvetica-Bold').text(result.schoolInfo?.name || 'School', MARGIN, MARGIN, {
      width: tableWidth,
      align: 'center',
    });
    if (result.schoolInfo?.address) {
      doc.fontSize(9).font('Helvetica').text(result.schoolInfo.address, { align: 'center' });
    }
    doc.moveDown(0.3);
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .text(`${result.examName || result.examType} — ${result.academicYear}`, { align: 'center' });
    doc
      .fontSize(9)
      .font('Helvetica')
      .text(
        `Class: ${result.class}${result.section ? ' - ' + result.section : ''}    Date: ${new Date(
          result.resultDate
        ).toLocaleDateString()}    Teacher: ${result.teacherNameSnapshot}`,
        { align: 'center' }
      );
    doc.moveDown(0.8);
  }

  function drawTableHeader(y) {
    let x = MARGIN;
    doc.font('Helvetica-Bold').fontSize(8);
    columns.forEach((col) => {
      doc.rect(x, y, col.width, ROW_HEIGHT).stroke();
      doc.text(col.label, x + 2, y + 6, { width: col.width - 4, align: 'center' });
      x += col.width;
    });
    return y + ROW_HEIGHT;
  }

  drawHeader();
  let y = doc.y;
  y = drawTableHeader(y);

  doc.font('Helvetica').fontSize(8);
  const sorted = [...result.students].sort((a, b) => a.position - b.position);

  sorted.forEach((student) => {
    if (y + ROW_HEIGHT > doc.page.height - MARGIN - 60) {
      doc.addPage();
      y = MARGIN;
      y = drawTableHeader(y);
    }

    const marksBySubject = new Map(student.marks.map((m) => [m.subject, m.obtained]));
    let x = MARGIN;
    const status = effectiveStatus(student);
    const isOverridden = !!student.overriddenStatus && student.overriddenStatus !== student.status;
    const remarks =
      student.failedSubjects && student.failedSubjects.length > 0
        ? `Failed: ${student.failedSubjects.join(', ')}${isOverridden ? ' (overridden)' : ''}`
        : '-';
    const rowValues = {
      position: student.position,
      rollNumber: student.rollNumber,
      name: student.name,
      fatherName: student.fatherName || '-',
      ...Object.fromEntries(subjectNames.map((n) => [n, marksBySubject.get(n) ?? '-'])),
      totalObtained: `${student.totalObtained}/${student.totalMax}`,
      percentage: `${student.percentage}%`,
      status,
      remarks,
    };

    columns.forEach((col) => {
      doc.rect(x, y, col.width, ROW_HEIGHT).stroke();
      doc.text(String(rowValues[col.key]), x + 2, y + 6, { width: col.width - 4, align: 'center' });
      x += col.width;
    });
    y += ROW_HEIGHT;
  });

  // Summary block
  y += 15;
  if (y + 80 > doc.page.height - MARGIN) {
    doc.addPage();
    y = MARGIN;
  }
  const st = result.statistics;
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .text(
      `Total Students: ${st.totalStudents}   Passed: ${st.passed}   Failed: ${st.failed}   ` +
        `Pass %: ${st.passPercentage}%   Highest: ${st.highest}   Lowest: ${st.lowest}   Average: ${st.average}`,
      MARGIN,
      y,
      { width: tableWidth }
    );

  // Page numbers
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc
      .font('Helvetica')
      .fontSize(8)
      .text(`Page ${i + 1} of ${range.count}`, MARGIN, doc.page.height - 30, {
        width: tableWidth,
        align: 'right',
      });
  }

  doc.end();
}

module.exports = { generateResultPdf };
