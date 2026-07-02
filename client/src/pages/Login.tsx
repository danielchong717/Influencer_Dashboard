import React, { useState } from 'react';
import { loginDashboard } from '../lib/api';

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('danielchonggoonhin@gmail.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await loginDashboard(email, password);
      localStorage.setItem('dash_token', res.data.token);
      onLogin();
    } catch {
      setError('Incorrect password. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
        <div className="flex items-center gap-2.5 mb-7">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-sm">IH</div>
          <div>
            <div className="font-bold text-slate-900 text-sm leading-tight">Influencer Hub</div>
            <div className="text-xs text-slate-400">Marketing CRM</div>
          </div>
        </div>

        <h1 className="text-xl font-bold text-slate-900 mb-1">Sign in</h1>
        <p className="text-sm text-slate-500 mb-6">Enter your password to continue</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
              required
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full justify-center"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
