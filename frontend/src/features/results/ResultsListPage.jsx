import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { resultsApi } from '../../api/resultsApi';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';

export default function ResultsListPage() {
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1 });
  const [filters, setFilters] = useState({ class: '', academicYear: '', examType: '' });
  const [loading, setLoading] = useState(true);

  function load(page = 1) {
    setLoading(true);
    resultsApi
      .list({ page, ...filters })
      .then(({ data }) => {
        setItems(data.items);
        setPagination(data.pagination);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(1);
  }, []); // eslint-disable-line

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-800">Results</h1>

      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Input placeholder="Class" value={filters.class} onChange={(e) => setFilters({ ...filters, class: e.target.value })} />
          <Input placeholder="Academic Year" value={filters.academicYear} onChange={(e) => setFilters({ ...filters, academicYear: e.target.value })} />
          <Input placeholder="Exam Type" value={filters.examType} onChange={(e) => setFilters({ ...filters, examType: e.target.value })} />
          <button
            onClick={() => load(1)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Search
          </button>
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="No results found" description="Try adjusting your filters, or create a new result." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4">Class</th>
                  <th className="py-2 pr-4">Exam</th>
                  <th className="py-2 pr-4">Academic Year</th>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Students</th>
                  <th className="py-2 pr-4">Pass %</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r._id} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{r.class}{r.section ? ` - ${r.section}` : ''}</td>
                    <td className="py-2 pr-4">{r.examName || r.examType}</td>
                    <td className="py-2 pr-4">{r.academicYear}</td>
                    <td className="py-2 pr-4">{new Date(r.resultDate).toLocaleDateString()}</td>
                    <td className="py-2 pr-4">{r.statistics?.totalStudents}</td>
                    <td className="py-2 pr-4">{r.statistics?.passPercentage}%</td>
                    <td className="py-2 text-right">
                      <Link to={`/results/${r._id}`} className="font-medium text-brand-600">View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
