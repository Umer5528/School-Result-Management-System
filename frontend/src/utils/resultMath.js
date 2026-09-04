/**
 * Client-side mirror of the backend calculation engine, used ONLY for
 * live preview while a teacher is entering marks. The backend
 * independently recalculates everything on save — see
 * backend/src/services/resultCalculationService.js — so this never needs
 * to be perfectly authoritative, just close enough for instant feedback.
 */
export function calculatePreview(subjects, students) {
  const totalMax = subjects.reduce((s, subj) => s + (Number(subj.totalMarks) || 0), 0);

  const calculated = students.map((student) => {
    let totalObtained = 0;
    const failedSubjects = [];
    subjects.forEach((subj) => {
      const mark = student.marks?.[subj.name];
      const obtained = Number(mark) || 0;
      totalObtained += obtained;
      if (obtained < Number(subj.passingMarks || 0)) failedSubjects.push(subj.name);
    });
    const percentage = totalMax > 0 ? Math.round((totalObtained / totalMax) * 10000) / 100 : 0;
    return {
      ...student,
      totalObtained,
      totalMax,
      percentage,
      status: failedSubjects.length > 0 ? 'FAIL' : 'PASS',
      failedSubjects,
    };
  });

  const sorted = [...calculated].sort((a, b) => b.totalObtained - a.totalObtained);
  let lastMarks = null;
  let lastPosition = 0;
  sorted.forEach((s, idx) => {
    if (s.totalObtained !== lastMarks) {
      lastPosition = idx + 1;
      lastMarks = s.totalObtained;
    }
    s.position = lastPosition;
  });

  return sorted;
}
