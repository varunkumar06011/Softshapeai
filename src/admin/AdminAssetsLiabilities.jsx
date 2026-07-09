import { useState } from 'react';
import { Building2, TrendingDown } from 'lucide-react';
import AssetLedger from './AssetLedger';

const SUB_TABS = [
  { key: 'assets', label: 'Asset Ledger', icon: Building2, component: AssetLedger },
  // Step 6 will add: { key: 'liabilities', label: 'Liabilities & Equity', icon: TrendingDown, component: LiabilitiesLedger }
];

export default function AdminAssetsLiabilities() {
  const [activeTab, setActiveTab] = useState('assets');

  const ActiveComponent = SUB_TABS.find((t) => t.key === activeTab)?.component || AssetLedger;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Building2 size={22} className="text-[#E53935]" />
        <h1 className="text-lg font-black text-gray-800">Assets & Liabilities</h1>
      </div>

      {/* Sub-tab bar */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {SUB_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-colors ${
                isActive
                  ? 'border-[#E53935] text-[#E53935]'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <ActiveComponent />
    </div>
  );
}
