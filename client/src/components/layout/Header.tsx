import React from 'react';
import { Wifi, WifiOff, ChevronDown, Bell } from 'lucide-react';
import { useAppStore } from '../../store';
import { getGmailAuthUrl, disconnectGmail } from '../../lib/api';

const TAB_TITLES: Record<string, string> = {
  outreach: 'Outreach',
  pipeline: 'Pipeline',
  content: 'Content Schedule',
  payment: 'Payment',
  report: 'Report',
  longterm: 'Long-term Partners',
};

export default function Header() {
  const { activeTab, gmailConnected, gmailEmail, activeCampaign, campaigns, setActiveCampaign, showToast, setGmailConnected } = useAppStore();
  const [showCampaignDrop, setShowCampaignDrop] = React.useState(false);

  const handleConnectGmail = async () => {
    const { data } = await getGmailAuthUrl();
    window.location.href = data.url;
  };

  const handleDisconnect = async () => {
    await disconnectGmail();
    setGmailConnected(false);
    showToast('Gmail disconnected', 'info');
  };

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-semibold text-slate-900">{TAB_TITLES[activeTab]}</h1>
        {activeCampaign && (
          <span className="text-xs text-slate-400">/ {activeCampaign.name}</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Campaign selector */}
        {campaigns.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowCampaignDrop(!showCampaignDrop)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <span className="truncate max-w-[140px]">{activeCampaign?.name || 'Select Campaign'}</span>
              <ChevronDown size={14} />
            </button>
            {showCampaignDrop && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowCampaignDrop(false)} />
                <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 min-w-[200px]">
                  {campaigns.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setActiveCampaign(c); setShowCampaignDrop(false); }}
                      className="w-full px-3 py-2 text-sm text-left hover:bg-slate-50 flex items-center justify-between"
                    >
                      <span className="truncate">{c.name}</span>
                      {activeCampaign?.id === c.id && <span className="text-blue-600 text-xs">✓</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Gmail status */}
        {gmailConnected ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs border border-green-200">
              <Wifi size={12} />
              <span className="truncate max-w-[120px]">{gmailEmail || 'Gmail Connected'}</span>
            </div>
            <button onClick={handleDisconnect} className="text-xs text-slate-400 hover:text-red-500 transition-colors">Disconnect</button>
          </div>
        ) : (
          <button
            onClick={handleConnectGmail}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs border border-blue-200 hover:bg-blue-100 transition-colors"
          >
            <WifiOff size={12} />
            Connect Gmail
          </button>
        )}

        <button className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
          <Bell size={16} />
        </button>
      </div>
    </header>
  );
}
