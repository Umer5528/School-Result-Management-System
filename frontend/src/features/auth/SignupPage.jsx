import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../../api/authApi';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';

export default function SignupPage() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    designation: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({});
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrors({});
    setSubmitting(true);
    try {
      await authApi.register(form);
      setDone(true);
    } catch (err) {
      const details = err.response?.data?.details;
      if (Array.isArray(details)) {
        const fieldErrors = {};
        details.forEach((d) => {
          fieldErrors[d.field] = d.message;
        });
        setErrors(fieldErrors);
      } else {
        setErrors({ form: err.response?.data?.message || 'Registration failed' });
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-lg font-semibold text-slate-800">Account Created Successfully</h2>
        <p className="text-sm text-slate-600">
          Your account is currently pending administrator approval. Please wait until an
          administrator approves your registration.
        </p>
        <Link to="/login" className="inline-block text-sm font-medium text-brand-600">
          Back to Login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">Create teacher account</h2>
      {errors.form && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errors.form}</p>}
      <Input label="Full Name" required value={form.name} error={errors.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <Input label="Email" type="email" required value={form.email} error={errors.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <Input label="Designation" required value={form.designation} error={errors.designation}
        onChange={(e) => setForm({ ...form, designation: e.target.value })} />
      <Input label="Password" type="password" required value={form.password} error={errors.password}
        onChange={(e) => setForm({ ...form, password: e.target.value })} />
      <Input label="Confirm Password" type="password" required value={form.confirmPassword}
        error={errors.confirmPassword}
        onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} />
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? 'Creating account...' : 'Create account'}
      </Button>
      <p className="text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-brand-600">
          Sign in
        </Link>
      </p>
    </form>
  );
}
