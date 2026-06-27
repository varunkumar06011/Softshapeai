import React, { useState } from 'react';
import AppsSection from '../settings/AppsSection';
import { Settings as SettingsIcon, Download } from 'lucide-react';

export function SettingsPage() {
  const [tab, setTab] = useState('general');

  return (
    <div className="p-6 space-y-6">
      {/* Tab bar */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
        <button
          onClick={() => setTab('general')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors ${tab === 'general' ? 'bg-red-50 text-[#E53935]' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          <SettingsIcon size={16} />
          General
        </button>
        <button
          onClick={() => setTab('apps')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors ${tab === 'apps' ? 'bg-red-50 text-[#E53935]' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          <Download size={16} />
          Download Apps
        </button>
      </div>

      {/* Tab content */}
      {tab === 'general' && (
        <div className="bg-white border rounded-xl font-sans p-6">
          <h2 className="text-xl font-bold mb-4">Global Settings</h2>
          <p className="text-sm text-gray-600">Configure outlet details, printers, and user permissions.</p>
        </div>
      )}
      {tab === 'apps' && <AppsSection />}
    </div>
  );
}
