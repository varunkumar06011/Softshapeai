import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, ChevronDown, Plus, Loader2 } from 'lucide-react';
import { apiFetch } from '../../services/apiConfig';

export default function LedgerCategoryPicker({ entryType = 'EXPENSE', value, onChange, placeholder = 'Search category...' }) {
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState(value?.name || '');
  const [showDropdown, setShowDropdown] = useState(false);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/ledger-categories?entryType=${entryType}`);
      setCategories(data || []);
    } catch (err) {
      console.error('[LedgerCategoryPicker] Load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [entryType]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    setSearch(value?.name || '');
  }, [value]);

  const filtered = categories.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const hasExactMatch = categories.some(
    (c) => c.name.toLowerCase() === search.trim().toLowerCase()
  );

  const handleSelect = (category) => {
    onChange?.(category);
    setSearch(category.name);
    setShowDropdown(false);
  };

  const handleCreate = async () => {
    const trimmed = search.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const created = await apiFetch('/api/ledger-categories', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed, entryType }),
      });
      setCategories((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      handleSelect(created);
    } catch (err) {
      console.error('[LedgerCategoryPicker] Create failed:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder={placeholder}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setShowDropdown(true);
            onChange?.(null);
          }}
          onFocus={() => setShowDropdown(true)}
          className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
        />
        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
      </div>
      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center px-3 py-3">
              <Loader2 size={16} className="animate-spin text-gray-400" />
            </div>
          )}
          {!loading && filtered.length > 0 && (
            <div className="p-1">
              {filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleSelect(c)}
                  className="w-full text-left px-3 py-2 text-sm font-bold hover:bg-gray-50 rounded-lg text-[#E53935]"
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
          {!loading && search.trim() && !hasExactMatch && (
            <div className="p-1 border-t border-gray-100">
              <button
                onClick={handleCreate}
                disabled={creating}
                className="w-full text-left px-3 py-2 text-sm font-bold hover:bg-gray-50 rounded-lg text-[#E53935] flex items-center gap-1"
              >
                {creating ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Plus size={14} />
                )}
                {creating ? 'Creating...' : `Create "${search.trim()}"`}
              </button>
            </div>
          )}
          {!loading && !search.trim() && filtered.length === 0 && (
            <p className="px-3 py-3 text-xs text-gray-400 text-center">Start typing to search</p>
          )}
          {!loading && search.trim() && filtered.length === 0 && hasExactMatch && (
            <p className="px-3 py-1 text-[10px] text-gray-400 text-center">No matching category</p>
          )}
        </div>
      )}
    </div>
  );
}
