import React from 'react';
import { Construction } from 'lucide-react';

export default function ComingSoon({ sectionName }) {
  return (
    <div className="flex-grow flex flex-col items-center justify-center p-8 bg-[#F8FAFC]">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
        <Construction size={28} className="text-gray-300" />
      </div>
      <h2 className="text-lg font-bold text-gray-700 mb-1">{sectionName}</h2>
      <p className="text-sm text-gray-400 font-medium text-center max-w-xs">
        This section is coming soon. Check back in a future update.
      </p>
    </div>
  );
}
