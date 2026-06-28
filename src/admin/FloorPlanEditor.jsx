import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronRight, MapPin, Hash, Users, Loader2, X, Check, AlertTriangle
} from 'lucide-react';
import {
  fetchVenues, createVenue, updateVenue, deleteVenue,
  createSection, updateSection, deleteSection,
  createTable, updateTable, deleteTable,
} from '../services/tableApi';

const VENUE_TYPES = [
  { value: 'DINE_IN', label: 'Dine-in' },
  { value: 'BAR', label: 'Bar' },
  { value: 'CAFE', label: 'Cafe' },
  { value: 'TAKEAWAY', label: 'Takeaway' },
  { value: 'DELIVERY', label: 'Delivery' },
];

const inputCls = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E53935] bg-white";
const btnPrimary = "flex items-center gap-1.5 px-3 py-1.5 bg-[#E53935] text-white text-xs font-bold rounded-lg hover:bg-[#B71C1C] transition";
const btnGhost = "flex items-center gap-1.5 px-3 py-1.5 text-gray-500 text-xs font-bold rounded-lg hover:bg-gray-100 transition";

export default function FloorPlanEditor() {
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedVenues, setExpandedVenues] = useState(new Set());
  const [expandedSections, setExpandedSections] = useState(new Set());

  const loadVenues = useCallback(async () => {
    try {
      const data = await fetchVenues();
      setVenues(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadVenues(); }, [loadVenues]);

  const toggleVenue = (id) => {
    setExpandedVenues(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSection = (id) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAddVenue = async (name, venueType) => {
    try { await createVenue({ name, venueType }); await loadVenues(); }
    catch (err) { setError(err.message); }
  };
  const handleRenameVenue = async (id, name) => {
    try { await updateVenue(id, { name }); await loadVenues(); }
    catch (err) { setError(err.message); }
  };
  const handleDeleteVenue = async (id) => {
    try { await deleteVenue(id); await loadVenues(); }
    catch (err) { setError(err.message); }
  };
  const handleAddSection = async (name, venueId) => {
    try { await createSection({ name, venueId }); await loadVenues(); setExpandedVenues(prev => new Set(prev).add(venueId)); }
    catch (err) { setError(err.message); }
  };
  const handleRenameSection = async (id, name) => {
    try { await updateSection(id, { name }); await loadVenues(); }
    catch (err) { setError(err.message); }
  };
  const handleDeleteSection = async (id) => {
    try { await deleteSection(id); await loadVenues(); }
    catch (err) { setError(err.message); }
  };
  const handleAddTable = async (number, capacity, sectionId) => {
    try { await createTable({ number, capacity, sectionId }); await loadVenues(); }
    catch (err) { setError(err.message); }
  };
  const handleUpdateTable = async (id, data) => {
    try { await updateTable(id, data); await loadVenues(); }
    catch (err) { setError(err.message); }
  };
  const handleDeleteTable = async (id) => {
    try { await deleteTable(id); await loadVenues(); }
    catch (err) { setError(err.message); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-[#E53935]" />
      </div>
    );
  }

  const allSections = venues.flatMap(v => {
    const direct = (v.sections || []).map(s => ({ id: s.id, name: s.name, venueName: v.name }));
    const viaFloors = (v.floors || []).flatMap(f =>
      (f.sections || []).map(s => ({ id: s.id, name: s.name, venueName: v.name }))
    );
    return [...direct, ...viaFloors];
  });

  return (
    <div className="space-y-4 font-sans">
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X size={14} /></button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Manage venues, sections, and tables</p>
        <AddVenueButton onAdd={handleAddVenue} />
      </div>

      {venues.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">No venues configured. Click "Add Venue" to get started.</div>
      )}

      <div className="space-y-3">
        {venues.map(venue => (
          <VenueCard
            key={venue.id}
            venue={venue}
            expanded={expandedVenues.has(venue.id)}
            onToggle={() => toggleVenue(venue.id)}
            expandedSections={expandedSections}
            onToggleSection={toggleSection}
            onAddSection={handleAddSection}
            onRenameSection={handleRenameSection}
            onDeleteSection={handleDeleteSection}
            onAddTable={handleAddTable}
            onUpdateTable={handleUpdateTable}
            onDeleteTable={handleDeleteTable}
            onRenameVenue={handleRenameVenue}
            onDeleteVenue={handleDeleteVenue}
            allSections={allSections}
          />
        ))}
      </div>
    </div>
  );
}

// ── AddVenueButton ──────────────────────────────────────────────────────────

function AddVenueButton({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('DINE_IN');

  const handleSubmit = () => {
    if (name.trim()) {
      onAdd(name.trim(), type);
      setName('');
      setType('DINE_IN');
      setOpen(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={btnPrimary}>
        <Plus size={14} /> Add Venue
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') { setOpen(false); setName(''); } }}
        placeholder="Venue name (e.g. Bar, Conference)"
        className={inputCls + ' max-w-xs'}
      />
      <select value={type} onChange={e => setType(e.target.value)} className={inputCls + ' max-w-32'}>
        {VENUE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <button onClick={handleSubmit} className="p-1.5 bg-[#E53935] text-white rounded-lg hover:bg-[#B71C1C]"><Check size={14} /></button>
      <button onClick={() => { setOpen(false); setName(''); }} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={14} /></button>
    </div>
  );
}

// ── VenueCard ───────────────────────────────────────────────────────────────

function VenueCard({
  venue, expanded, onToggle, expandedSections, onToggleSection,
  onAddSection, onRenameSection, onDeleteSection,
  onAddTable, onUpdateTable, onDeleteTable,
  onRenameVenue, onDeleteVenue, allSections,
}) {
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(venue.name);
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');

  const sections = [
    ...(venue.sections || []),
    ...((venue.floors || []).flatMap(f => f.sections || [])),
  ];

  const handleSaveName = () => {
    if (nameInput.trim() && nameInput !== venue.name) onRenameVenue(venue.id, nameInput.trim());
    setEditing(false);
  };

  const handleDelete = () => {
    if (sections.length > 0) {
      alert(`"${venue.name}" has ${sections.length} section(s). Delete or move them first.`);
      return;
    }
    if (confirm(`Delete venue "${venue.name}"?`)) onDeleteVenue(venue.id);
  };

  const handleAddSectionSubmit = () => {
    if (newSectionName.trim()) {
      onAddSection(newSectionName.trim(), venue.id);
      setNewSectionName('');
      setAddingSection(false);
    }
  };

  const venueTypeLabel = VENUE_TYPES.find(t => t.value === venue.venueType)?.label || venue.venueType;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50/50 border-b border-gray-100">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button onClick={onToggle} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          <MapPin size={16} className="text-[#E53935] flex-shrink-0" />
          {editing ? (
            <input
              autoFocus
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') { setEditing(false); setNameInput(venue.name); } }}
              onBlur={handleSaveName}
              className={inputCls + ' max-w-xs'}
            />
          ) : (
            <button onClick={() => { setEditing(true); setNameInput(venue.name); }} className="font-bold text-sm text-gray-900 truncate hover:text-[#E53935]">
              {venue.name}
            </button>
          )}
          <span className="text-[10px] font-bold uppercase text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">{venueTypeLabel}</span>
          <span className="text-[10px] text-gray-400 flex-shrink-0">{sections.length} section(s)</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => { setEditing(true); setNameInput(venue.name); }} className="p-1.5 text-gray-400 hover:text-[#E53935] rounded-lg hover:bg-gray-100"><Pencil size={14} /></button>
          <button onClick={handleDelete} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100"><Trash2 size={14} /></button>
        </div>
      </div>

      {expanded && (
        <div className="p-3 space-y-2">
          {sections.map(section => (
            <SectionRow
              key={section.id}
              section={section}
              expanded={expandedSections.has(section.id)}
              onToggle={() => onToggleSection(section.id)}
              onRename={onRenameSection}
              onDelete={onDeleteSection}
              onAddTable={onAddTable}
              onUpdateTable={onUpdateTable}
              onDeleteTable={onDeleteTable}
              allSections={allSections}
            />
          ))}

          {sections.length === 0 && !addingSection && (
            <p className="text-xs text-gray-400 py-2 text-center">No sections yet</p>
          )}

          {addingSection ? (
            <div className="flex items-center gap-2 pl-4">
              <input
                autoFocus
                value={newSectionName}
                onChange={e => setNewSectionName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddSectionSubmit(); if (e.key === 'Escape') { setAddingSection(false); setNewSectionName(''); } }}
                placeholder="Section name (e.g. AC Hall)"
                className={inputCls + ' flex-1 max-w-xs'}
              />
              <button onClick={handleAddSectionSubmit} className="p-1.5 bg-[#E53935] text-white rounded-lg hover:bg-[#B71C1C]"><Check size={14} /></button>
              <button onClick={() => { setAddingSection(false); setNewSectionName(''); }} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={14} /></button>
            </div>
          ) : (
            <button onClick={() => setAddingSection(true)} className={btnGhost + ' ml-4'}><Plus size={14} /> Add Section</button>
          )}
        </div>
      )}
    </div>
  );
}

// ── SectionRow ──────────────────────────────────────────────────────────────

function SectionRow({
  section, expanded, onToggle,
  onRename, onDelete, onAddTable, onUpdateTable, onDeleteTable, allSections,
}) {
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(section.name);
  const [addingTable, setAddingTable] = useState(false);
  const [newTableNum, setNewTableNum] = useState('');
  const [newTableCap, setNewTableCap] = useState('4');

  const tables = section.tables || [];

  const handleSaveName = () => {
    if (nameInput.trim() && nameInput !== section.name) onRename(section.id, nameInput.trim());
    setEditing(false);
  };

  const handleDelete = () => {
    if (tables.length > 0) {
      alert(`"${section.name}" has ${tables.length} table(s). Move or delete them first.`);
      return;
    }
    if (confirm(`Delete section "${section.name}"?`)) onDelete(section.id);
  };

  const handleAddTableSubmit = () => {
    const num = parseInt(newTableNum);
    const cap = parseInt(newTableCap) || 4;
    if (num > 0) {
      onAddTable(num, cap, section.id);
      setNewTableNum('');
      setNewTableCap('4');
      setAddingTable(false);
    }
  };

  return (
    <div className="ml-2 border-l-2 border-gray-100 pl-3">
      <div className="flex items-center justify-between py-1.5">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button onClick={onToggle} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {editing ? (
            <input
              autoFocus
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') { setEditing(false); setNameInput(section.name); } }}
              onBlur={handleSaveName}
              className={inputCls + ' max-w-xs'}
            />
          ) : (
            <button onClick={() => { setEditing(true); setNameInput(section.name); }} className="font-bold text-sm text-gray-700 truncate hover:text-[#E53935]">
              {section.name}
            </button>
          )}
          <span className="text-[10px] text-gray-400 flex-shrink-0">{tables.length} table(s)</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => { setEditing(true); setNameInput(section.name); }} className="p-1 text-gray-400 hover:text-[#E53935] rounded-lg hover:bg-gray-100"><Pencil size={12} /></button>
          <button onClick={handleDelete} className="p-1 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100"><Trash2 size={12} /></button>
        </div>
      </div>

      {expanded && (
        <div className="ml-5 space-y-1.5 pb-2">
          {tables.map(table => (
            <TableRow
              key={table.id}
              table={table}
              sectionId={section.id}
              allSections={allSections}
              onUpdate={onUpdateTable}
              onDelete={onDeleteTable}
            />
          ))}

          {tables.length === 0 && !addingTable && (
            <p className="text-xs text-gray-400 py-1">No tables yet</p>
          )}

          {addingTable ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="number"
                min="1"
                value={newTableNum}
                onChange={e => setNewTableNum(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddTableSubmit(); if (e.key === 'Escape') { setAddingTable(false); setNewTableNum(''); } }}
                placeholder="Table #"
                className={inputCls + ' w-24'}
              />
              <input
                type="number"
                min="1"
                value={newTableCap}
                onChange={e => setNewTableCap(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddTableSubmit(); }}
                placeholder="Cap"
                className={inputCls + ' w-24'}
              />
              <button onClick={handleAddTableSubmit} className="p-1.5 bg-[#E53935] text-white rounded-lg hover:bg-[#B71C1C]"><Check size={14} /></button>
              <button onClick={() => { setAddingTable(false); setNewTableNum(''); setNewTableCap('4'); }} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={14} /></button>
            </div>
          ) : (
            <button onClick={() => setAddingTable(true)} className={btnGhost}><Plus size={12} /> Add Table</button>
          )}
        </div>
      )}
    </div>
  );
}

// ── TableRow ────────────────────────────────────────────────────────────────

function TableRow({ table, sectionId, allSections, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [num, setNum] = useState(String(table.number));
  const [cap, setCap] = useState(String(table.capacity));
  const [moveSection, setMoveSection] = useState(sectionId);

  const isActive = table.status && table.status !== 'AVAILABLE' && table.status !== 'available';

  const handleSave = () => {
    const parsedNum = parseInt(num);
    const parsedCap = parseInt(cap) || 4;
    if (parsedNum > 0) {
      const data = { number: parsedNum, capacity: parsedCap };
      if (moveSection !== sectionId) data.sectionId = moveSection;
      onUpdate(table.id, data);
    }
    setEditing(false);
  };

  const handleDelete = () => {
    if (isActive) {
      alert(`Table ${table.number} has an active session. Clear or bill it first.`);
      return;
    }
    if (confirm(`Delete Table ${table.number}?`)) onDelete(table.id);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
        <Hash size={12} className="text-gray-400" />
        <input
          autoFocus
          type="number"
          min="1"
          value={num}
          onChange={e => setNum(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
          className={inputCls + ' w-20'}
        />
        <Users size={12} className="text-gray-400" />
        <input
          type="number"
          min="1"
          value={cap}
          onChange={e => setCap(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
          className={inputCls + ' w-20'}
        />
        <select value={moveSection} onChange={e => setMoveSection(e.target.value)} className={inputCls + ' max-w-40'}>
          {allSections.map(s => (
            <option key={s.id} value={s.id}>{s.venueName} — {s.name}</option>
          ))}
        </select>
        <button onClick={handleSave} className="p-1.5 bg-[#E53935] text-white rounded-lg hover:bg-[#B71C1C]"><Check size={14} /></button>
        <button onClick={() => setEditing(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={14} /></button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1 text-sm font-bold text-gray-700">
          <Hash size={12} className="text-gray-400" />T{table.number}
        </span>
        <span className="flex items-center gap-1 text-xs text-gray-500">
          <Users size={12} className="text-gray-400" />{table.capacity}
        </span>
        {isActive && (
          <span className="text-[9px] font-bold uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{table.status}</span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => { setEditing(true); setNum(String(table.number)); setCap(String(table.capacity)); setMoveSection(sectionId); }} className="p-1 text-gray-400 hover:text-[#E53935] rounded-lg hover:bg-gray-100"><Pencil size={12} /></button>
        <button onClick={handleDelete} className="p-1 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100"><Trash2 size={12} /></button>
      </div>
    </div>
  );
}
