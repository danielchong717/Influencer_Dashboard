import React, { useEffect, useState } from 'react';
import Layout from './components/layout/Layout';
import Overview from './pages/Overview';
import Outreach from './pages/Outreach';
import Pipeline from './pages/Pipeline';
import ContentSchedule from './pages/ContentSchedule';
import Payment from './pages/Payment';
import Report from './pages/Report';
import LongTermPartners from './pages/LongTermPartners';
import Login from './pages/Login';
import { useAppStore } from './store';
import { getCampaigns, getGmailStatus, verifyDashboardToken } from './lib/api';

function PageContent() {
  const { activeTab } = useAppStore();
  switch (activeTab) {
    case 'overview': return <Overview />;
    case 'outreach': return <Outreach />;
    case 'pipeline': return <Pipeline />;
    case 'content': return <ContentSchedule />;
    case 'payment': return <Payment />;
    case 'report': return <Report />;
    case 'longterm': return <LongTermPartners />;
    default: return <Overview />;
  }
}

export default function App() {
  const { setCampaigns, setActiveCampaign, setGmailConnected, showToast } = useAppStore();
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    verifyDashboardToken()
      .then(r => setAuthed(r.data.valid))
      .catch(() => setAuthed(false));
  }, []);

  useEffect(() => {
    // Load campaigns
    getCampaigns().then(res => {
      setCampaigns(res.data);
    }).catch(() => {
      // Server not connected — show friendly hint
      showToast('Connect to the API server to load data (npm run dev in /server)', 'info');
    });

    // Check Gmail status
    getGmailStatus().then(res => {
      if (res.data.connected) {
        setGmailConnected(true, res.data.member?.email);
      }
    }).catch(() => {});

    // Handle OAuth callback params
    const params = new URLSearchParams(window.location.search);
    if (params.get('gmail_connected')) {
      setGmailConnected(true, params.get('email') || undefined);
      showToast(`Gmail connected: ${params.get('email')}`, 'success');
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('gmail_error')) {
      showToast(`Gmail error: ${params.get('gmail_error')}`, 'error');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  if (authed === null) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  return (
    <Layout>
      <PageContent />
    </Layout>
  );
}
