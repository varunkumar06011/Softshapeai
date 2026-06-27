import React, { useState } from 'react';
import { Download, X } from 'lucide-react';
import { useAppUpdate } from '../../hooks/useAppUpdate';

export default function AppUpdateBanner() {
  const { hasUpdate, currentVersion, latestVersion, downloadUrl, appName, checking } = useAppUpdate();
  const [dismissed, setDismissed] = useState(false);

  if (checking || !hasUpdate || dismissed) return null;

  return (
    <div className="fixed left-0 right-0 z-[200] bg-[#B71C1C] text-white px-4 py-3 shadow-lg" style={{ top: 'env(safe-area-inset-top)' }}>
      <div className="flex items-center justify-between gap-3 max-w-4xl mx-auto">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">
            {appName} update available: v{currentVersion} → {latestVersion}
          </p>
          <p className="text-xs text-white/80">
            Download the latest version to get new features and fixes.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-[#B71C1C] hover:bg-white/90 transition-colors"
          >
            <Download size={14} />
            Update
          </a>
          <button
            onClick={() => setDismissed(true)}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
