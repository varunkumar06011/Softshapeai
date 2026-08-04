import { useState, useEffect } from 'react';
import { apiUrl, getAuthHeaders } from '../services/apiConfig.js';
import { Megaphone, X } from 'lucide-react';

export default function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState([]);
  const [dismissed, setDismissed] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiUrl('/api/public/announcements'), {
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setAnnouncements(data.announcements || []);
        }
      } catch {
        // silently fail
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const visible = announcements.filter(a => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  const styles = {
    info: 'bg-blue-600/10 border-blue-600/30 text-blue-300',
    warning: 'bg-yellow-600/10 border-yellow-600/30 text-yellow-300',
    critical: 'bg-red-600/10 border-red-600/30 text-red-300',
  };

  return (
    <div className="space-y-2 mb-2">
      {visible.map((a) => (
        <div
          key={a.id}
          className={`flex items-start gap-3 px-4 py-2.5 rounded-lg border text-sm ${styles[a.type] || styles.info}`}
        >
          <Megaphone className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <span className="font-semibold">{a.title}</span>
            {a.body && <span className="ml-2 opacity-80">{a.body}</span>}
          </div>
          <button
            onClick={() => setDismissed(prev => new Set([...prev, a.id]))}
            className="opacity-50 hover:opacity-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
