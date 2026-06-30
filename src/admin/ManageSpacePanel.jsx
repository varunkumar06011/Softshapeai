// ManageSpacePanel — venue/section/table editor (in-place inside Settings)
import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Plus, Pencil, Trash2, ChevronDown, ChevronRight,
  MapPin, Hash, Users, Loader2, X, Check, AlertTriangle,
  LayoutGrid, Layers, Table2, TriangleAlert,
} from 'lucide-react';
import {
  fetchVenues, createVenue, updateVenue, deleteVenue,
  createSection, updateSection, deleteSection,
  createTable, bulkCreateTables, updateTable, deleteTable,
} from '../services/tableApi';

const cls = {
  input: 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E53935] focus:ring-1 focus:ring-red-100 bg-white transition',
  btnRed: 'flex items-center gap-1.5 px-3 py-1.5 bg-[#E53935] text-white text-xs font-bold rounded-lg hover:bg-[#B71C1C] transition',
  btnGhost: 'flex items-center gap-1.5 px-3 py-1.5 text-gray-500 text-xs font-bold rounded-lg hover:bg-gray-100 transition',
  iconBtn: 'p-1.5 rounded-lg transition',
};

const VENUE_TYPES = [
  { value: 'DINE_IN', label: 'Dine-in', color: 'bg-green-100 text-green-700' },
  { value: 'BAR', label: 'Bar', color: 'bg-purple-100 text-purple-700' },
  { value: 'CAFE', label: 'Cafe', color: 'bg-amber-100 text-amber-700' },
  { value: 'TAKEAWAY', label: 'Takeaway', color: 'bg-blue-100 text-blue-700' },
  { value: 'DELIVERY', label: 'Delivery', color: 'bg-orange-100 text-orange-700' },
];

function venueTypeColor(v) { return VENUE_TYPES.find(t => t.value === v)?.color || 'bg-gray-100 text-gray-600'; }
function venueTypeLabel(v) { return VENUE_TYPES.find(t => t.value === v)?.label || v; }

function WarningModal({ onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <TriangleAlert size={20} className="text-amber-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Changing the floor layout?</h2>
            <p className="text-sm text-gray-500 mt-1">
              Editing venues, sections, or tables will affect the entire POS system. Tables with active orders cannot be deleted.
            </p>
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 space-y-1">
          <p className="font-bold">Before you continue:</p>
          <p>· Make sure no active orders are running</p>
          <p>· Adding/removing tables will update all connected devices</p>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 text-sm font-bold rounded-xl hover:bg-gray-50 transition">Cancel</button>
          <button onClick={onConfirm} className="flex-1 px-4 py-2.5 bg-[#E53935] text-white text-sm font-bold rounded-xl hover:bg-[#B71C1C] transition">Yes, Edit Layout</button>
        </div>
      </div>
    </div>
  );
}

export default function ManageSpacePanel({ onBack }) {
  const [warned, setWarned] = useState(false);
  const [showWarning, setShowWarning] = useState(true);
  if (showWarning && !warned) {
    return <WarningModal onConfirm={() => { setWarned(true); setShowWarning(false); }} onCancel={onBack} />;
  }
  return <SpaceEditor onBack={onBack} />;
}

function SpaceEditor({ onBack }) {
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedVenues, setExpandedVenues] = useState(new Set());
  const [expandedSections, setExpandedSections] = useState(new Set());
  const [successMsg, setSuccessMsg] = useState('');

  const showSuccess = (msg) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 2500); };

  const loadVenues = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchVenues();
      const list = Array.isArray(data) ? data : [];
      setVenues(list); setError(null);
      setExpandedVenues(new Set(list.map(v => v.id)));
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadVenues(); }, [loadVenues]);

  const toggleVenue = id => setExpandedVenues(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSection = id => setExpandedSections(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const allSections = venues.flatMap(v => {
    const direct = (v.sections || []).map(s => ({ id: s.id, name: s.name, venueName: v.name }));
    const viaFloors = (v.floors || []).flatMap(f => (f.sections || []).map(s => ({ id: s.id, name: s.name, venueName: v.name })));
    return [...direct, ...viaFloors];
  });

  const nextTableNumForVenue = (venue) => {
    const sections = [...(venue.sections || []), ...((venue.floors || []).flatMap(f => f.sections || []))];
    const nums = sections.flatMap(s => (s.tables || []).map(t => t.number || 0));
    return nums.length > 0 ? Math.max(...nums) + 1 : 1;
  };

  const handleAddVenue = async (name, venueType, kotEnabled) => {
    try { await createVenue({ name, venueType, kotEnabled }); await loadVenues(); showSuccess(`Venue "${name}" created`); }
    catch (err) { setError(err.message); }
  };
  const handleRenameVenue = async (id, name, venueType, kotEnabled) => {
    try { await updateVenue(id, { name, venueType, kotEnabled }); await loadVenues(); showSuccess('Venue updated'); }
    catch (err) { setError(err.message); }
  };
  const handleDeleteVenue = async (id, name, sectionsCount) => {
    if (sectionsCount > 0) { setError(`"${name}" has ${sectionsCount} section(s). Delete or move sections first.`); return; }
    try { await deleteVenue(id); await loadVenues(); showSuccess(`Venue "${name}" deleted`); }
    catch (err) { setError(err.message); }
  };
  const handleAddSection = async (name, venueId) => {
    try { await createSection({ name, venueId }); await loadVenues(); setExpandedVenues(p => new Set(p).add(venueId)); showSuccess(`Section "${name}" created`); }
    catch (err) { setError(err.message); }
  };
  const handleRenameSection = async (id, name) => {
    try { await updateSection(id, { name }); await loadVenues(); showSuccess('Section renamed'); }
    catch (err) { setError(err.message); }
  };
  const handleDeleteSection = async (id, name, tablesCount) => {
    if (tablesCount > 0) { setError(`"${name}" has ${tablesCount} table(s). Delete or move them first.`); return; }
    try { await deleteSection(id); await loadVenues(); showSuccess(`Section "${name}" deleted`); }
    catch (err) { setError(err.message); }
  };
  const handleAddTable = async (number, capacity, sectionId) => {
    try { await createTable({ number, capacity, sectionId }); await loadVenues(); showSuccess(`Table ${number} added`); }
    catch (err) { setError(err.message); }
  };
  const handleBulkAddTable = async (sectionId, count, capacity) => {
    try { const res = await bulkCreateTables({ sectionId, count, capacity }); await loadVenues(); showSuccess(`${res.created || count} tables added`); }
    catch (err) { setError(err.message); }
  };
  const handleUpdateTable = async (id, data) => {
    try { await updateTable(id, data); await loadVenues(); showSuccess('Table updated'); }
    catch (err) { setError(err.message); }
  };
  const handleDeleteTable = async (id, num, isActive) => {
    if (isActive) { setError(`Table ${num} has an active session — bill it first.`); return; }
    try { await deleteTable(id); await loadVenues(); showSuccess(`Table ${num} deleted`); }
    catch (err) { setError(err.message); }
  };

  return (
    <div className="space-y-5 font-sans">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition">
          <ArrowLeft size={16} /> Back to Settings
        </button>
        <div className="h-5 w-px bg-gray-200" />
        <div>
          <h2 className="text-base font-bold text-gray-900">Manage Space</h2>
          <p className="text-xs text-gray-400">Venues · Sections · Tables</p>
        </div>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-2.5 text-sm font-bold">
          <Check size={15} /> {successMsg}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
          <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X size={13} /></button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-[#E53935]" />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4 px-4 py-3 bg-gray-50 rounded-xl border border-gray-100 text-xs text-gray-500">
            <span className="flex items-center gap-1.5 font-bold text-gray-700">
              <LayoutGrid size={13} className="text-[#E53935]" />
              {venues.length} venue{venues.length !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1.5">
              <Layers size={13} /> {allSections.length} section{allSections.length !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1.5">
              <Table2 size={13} />
              {venues.reduce((acc, v) => {
                const secs = [...(v.sections || []), ...((v.floors || []).flatMap(f => f.sections || []))];
                return acc + secs.reduce((a, s) => a + (s.tables?.length || 0), 0);
              }, 0)} tables
            </span>
            <div className="flex-1" />
            <AddVenueInline onAdd={handleAddVenue} />
          </div>

          {venues.length === 0 && (
            <div className="text-center py-14 text-gray-400">
              <LayoutGrid size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-bold">No venues yet</p>
              <p className="text-xs mt-1">Click "Add Venue" above to get started</p>
            </div>
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
                onRenameVenue={handleRenameVenue}
                onDeleteVenue={handleDeleteVenue}
                onAddSection={handleAddSection}
                onRenameSection={handleRenameSection}
                onDeleteSection={handleDeleteSection}
                onAddTable={handleAddTable}
                onBulkAddTable={handleBulkAddTable}
                onUpdateTable={handleUpdateTable}
                onDeleteTable={handleDeleteTable}
                allSections={allSections}
                nextTableNum={nextTableNumForVenue(venue)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function AddVenueInline({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('DINE_IN');
  const [kotOn, setKotOn] = useState(true);
  const submit = () => { if (name.trim()) { onAdd(name.trim(), type, kotOn); setName(''); setType('DINE_IN'); setKotOn(true); setOpen(false); } };
  if (!open) return <button onClick={() => setOpen(true)} className={cls.btnRed}><Plus size={13} /> Add Venue</button>;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setOpen(false); setName(''); } }} placeholder="Venue name…" className={cls.input + ' w-40'} />
      <select value={type} onChange={e => setType(e.target.value)} className={cls.input + ' w-32'}>{VENUE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
      <button type="button" onClick={() => setKotOn(v => !v)} className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-colors ${kotOn ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`} title={kotOn ? 'KOT ON' : 'KOT OFF — direct bill only'}>
        <span className={`w-2 h-2 rounded-full ${kotOn ? 'bg-green-500' : 'bg-gray-400'}`} />
        KOT: {kotOn ? 'ON' : 'OFF'}
      </button>
      <button onClick={submit} className="p-1.5 bg-[#E53935] text-white rounded-lg hover:bg-[#B71C1C]"><Check size={13} /></button>
      <button onClick={() => { setOpen(false); setName(''); }} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={13} /></button>
    </div>
  );
}

function VenueCard({ venue, expanded, onToggle, expandedSections, onToggleSection, onRenameVenue, onDeleteVenue, onAddSection, onRenameSection, onDeleteSection, onAddTable, onBulkAddTable, onUpdateTable, onDeleteTable, allSections, nextTableNum }) {
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(venue.name);
  const [typeInput, setTypeInput] = useState(venue.venueType || 'DINE_IN');
  const [kotInput, setKotInput] = useState(venue.kotEnabled !== false);
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');

  const sections = [...(venue.sections || []), ...((venue.floors || []).flatMap(f => f.sections || []))];
  const totalTables = sections.reduce((a, s) => a + (s.tables?.length || 0), 0);

  const saveVenue = () => { if (nameInput.trim()) onRenameVenue(venue.id, nameInput.trim(), typeInput, kotInput); setEditing(false); };
  const addSection = () => { if (newSectionName.trim()) { onAddSection(newSectionName.trim(), venue.id); setNewSectionName(''); setAddingSection(false); } };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
        <button onClick={onToggle} className="text-gray-400 hover:text-gray-700 flex-shrink-0">{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
        <MapPin size={15} className="text-[#E53935] flex-shrink-0" />
        {editing ? (
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            <input autoFocus value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveVenue(); if (e.key === 'Escape') { setEditing(false); setNameInput(venue.name); } }} className={cls.input + ' max-w-[160px]'} />
            <select value={typeInput} onChange={e => setTypeInput(e.target.value)} className={cls.input + ' max-w-[120px]'}>{VENUE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
            <button type="button" onClick={() => setKotInput(v => !v)} className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-colors ${kotInput ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`} title={kotInput ? 'KOT ON' : 'KOT OFF — direct bill only'}>
              <span className={`w-2 h-2 rounded-full ${kotInput ? 'bg-green-500' : 'bg-gray-400'}`} />
              KOT: {kotInput ? 'ON' : 'OFF'}
            </button>
            <button onClick={saveVenue} className="p-1.5 bg-[#E53935] text-white rounded-lg hover:bg-[#B71C1C]"><Check size={13} /></button>
            <button onClick={() => { setEditing(false); setNameInput(venue.name); setTypeInput(venue.venueType || 'DINE_IN'); setKotInput(venue.kotEnabled !== false); }} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={13} /></button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="font-bold text-sm text-gray-900 truncate">{venue.name}</span>
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0 ${venueTypeColor(venue.venueType)}`}>{venueTypeLabel(venue.venueType)}</span>
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0 ${venue.kotEnabled !== false ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`} title={venue.kotEnabled !== false ? 'KOT printing enabled' : 'KOT printing disabled — direct bill only'}>KOT: {venue.kotEnabled !== false ? 'ON' : 'OFF'}</span>
            <span className="text-[10px] text-gray-400 flex-shrink-0">{sections.length} section{sections.length !== 1 ? 's' : ''} · {totalTables} table{totalTables !== 1 ? 's' : ''}</span>
          </div>
        )}
        {!editing && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => setEditing(true)} className={cls.iconBtn + ' text-gray-400 hover:text-[#E53935] hover:bg-red-50'} title="Rename venue"><Pencil size={13} /></button>
            <button onClick={() => onDeleteVenue(venue.id, venue.name, sections.length)} className={cls.iconBtn + ' text-gray-400 hover:text-red-500 hover:bg-red-50'} title="Delete venue"><Trash2 size={13} /></button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="p-3 space-y-2">
          {sections.map(section => (
            <SectionCard key={section.id} section={section} expanded={expandedSections.has(section.id)} onToggle={() => onToggleSection(section.id)} onRename={onRenameSection} onDelete={onDeleteSection} onAddTable={onAddTable} onBulkAddTable={onBulkAddTable} onUpdateTable={onUpdateTable} onDeleteTable={onDeleteTable} allSections={allSections} nextTableNum={nextTableNum} />
          ))}
          {sections.length === 0 && !addingSection && <p className="text-xs text-gray-400 text-center py-3">No sections — add one below</p>}
          {addingSection ? (
            <div className="flex items-center gap-2 mt-1 pl-3">
              <Layers size={13} className="text-gray-400 flex-shrink-0" />
              <input autoFocus value={newSectionName} onChange={e => setNewSectionName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addSection(); if (e.key === 'Escape') { setAddingSection(false); setNewSectionName(''); } }} placeholder="Section name (e.g. AC Hall)" className={cls.input + ' flex-1 max-w-xs'} />
              <button onClick={addSection} className="p-1.5 bg-[#E53935] text-white rounded-lg hover:bg-[#B71C1C]"><Check size={13} /></button>
              <button onClick={() => { setAddingSection(false); setNewSectionName(''); }} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={13} /></button>
            </div>
          ) : (
            <button onClick={() => setAddingSection(true)} className={cls.btnGhost + ' ml-3 mt-1'}><Plus size={12} /> Add Section</button>
          )}
        </div>
      )}
    </div>
  );
}

function SectionCard({ section, expanded, onToggle, onRename, onDelete, onAddTable, onBulkAddTable, onUpdateTable, onDeleteTable, allSections, nextTableNum }) {
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(section.name);
  const [addingTable, setAddingTable] = useState(false);
  const [newNum, setNewNum] = useState('');
  const [newCap, setNewCap] = useState('4');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkCount, setBulkCount] = useState('4');
  const [bulkCap, setBulkCap] = useState('4');

  const tables = section.tables || [];
  const saveName = () => { if (nameInput.trim() && nameInput !== section.name) onRename(section.id, nameInput.trim()); setEditing(false); };
  const startAddTable = () => { setBulkMode(false); setNewNum(String(nextTableNum)); setAddingTable(true); };
  const startBulkAdd = () => { setAddingTable(false); setBulkMode(true); };
  const submitBulk = () => {
    const count = Math.max(1, Math.min(100, parseInt(bulkCount) || 1));
    const cap = Math.max(1, parseInt(bulkCap) || 4);
    onBulkAddTable(section.id, count, cap);
    setBulkCount('4'); setBulkCap('4'); setBulkMode(false);
  };
  const submitTable = () => {
    const num = parseInt(newNum); const cap = parseInt(newCap) || 4;
    if (num > 0) { onAddTable(num, cap, section.id); setNewNum(''); setNewCap('4'); setAddingTable(false); }
  };

  return (
    <div className="ml-3 border-l-2 border-gray-100 pl-3">
      <div className="flex items-center justify-between py-1.5">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button onClick={onToggle} className="text-gray-400 hover:text-gray-600 flex-shrink-0">{expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>
          {editing ? (
            <div className="flex items-center gap-1.5">
              <input autoFocus value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setEditing(false); setNameInput(section.name); } }} onBlur={saveName} className={cls.input + ' max-w-[180px]'} />
              <button onClick={saveName} className="p-1 bg-[#E53935] text-white rounded-lg"><Check size={12} /></button>
              <button onClick={() => { setEditing(false); setNameInput(section.name); }} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={12} /></button>
            </div>
          ) : (
            <span className="font-semibold text-sm text-gray-700 truncate">{section.name}</span>
          )}
          <span className="text-[10px] text-gray-400 flex-shrink-0">{tables.length} table{tables.length !== 1 ? 's' : ''}</span>
        </div>
        {!editing && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button onClick={() => setEditing(true)} className={cls.iconBtn + ' text-gray-400 hover:text-[#E53935] hover:bg-red-50'} title="Rename section"><Pencil size={12} /></button>
            <button onClick={() => onDelete(section.id, section.name, tables.length)} className={cls.iconBtn + ' text-gray-400 hover:text-red-500 hover:bg-red-50'} title="Delete section"><Trash2 size={12} /></button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="ml-4 space-y-1.5 pb-2">
          {tables.map(table => <TableRow key={table.id} table={table} sectionId={section.id} allSections={allSections} onUpdate={onUpdateTable} onDelete={onDeleteTable} />)}
          {tables.length === 0 && !addingTable && <p className="text-xs text-gray-400 py-1">No tables yet</p>}
          {addingTable ? (
            <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 flex-wrap">
              <span className="text-xs text-gray-500 font-bold">Table #</span>
              <input autoFocus type="number" min="1" value={newNum} onChange={e => setNewNum(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submitTable(); if (e.key === 'Escape') { setAddingTable(false); } }} className={cls.input + ' w-20'} />
              <span className="text-xs text-gray-500 font-bold">Seats</span>
              <input type="number" min="1" value={newCap} onChange={e => setNewCap(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submitTable(); }} className={cls.input + ' w-20'} />
              <button onClick={submitTable} className="p-1.5 bg-[#E53935] text-white rounded-lg hover:bg-[#B71C1C]"><Check size={13} /></button>
              <button onClick={() => { setAddingTable(false); setNewNum(''); setNewCap('4'); }} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={13} /></button>
            </div>
          ) : bulkMode ? (
            <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 flex-wrap">
              <span className="text-xs text-gray-500 font-bold">Add</span>
              <input autoFocus type="number" min="1" max="100" value={bulkCount} onChange={e => setBulkCount(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submitBulk(); if (e.key === 'Escape') { setBulkMode(false); } }} className={cls.input + ' w-20'} placeholder="Count" />
              <span className="text-xs text-gray-400">tables ×</span>
              <input type="number" min="1" max="20" value={bulkCap} onChange={e => setBulkCap(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submitBulk(); }} className={cls.input + ' w-20'} placeholder="Seats" />
              <span className="text-xs text-gray-400">seats each</span>
              <button onClick={submitBulk} className="flex items-center gap-1 px-2.5 py-1.5 bg-[#E53935] text-white text-xs font-bold rounded-lg hover:bg-[#B71C1C]"><Plus size={12} /> Add Tables</button>
              <button onClick={() => { setBulkMode(false); setBulkCount('4'); setBulkCap('4'); }} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={13} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={startAddTable} className={cls.btnGhost + ' text-[11px]'}><Plus size={11} /> Add Table</button>
              <button onClick={startBulkAdd} className={cls.btnGhost + ' text-[11px]'}><Plus size={11} /> Quick Add Tables</button>
            </div>
          )
        </div>
      )}
    </div>
  );
}

function TableRow({ table, sectionId, allSections, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [num, setNum] = useState(String(table.number));
  const [cap, setCap] = useState(String(table.capacity || 4));
  const [moveTo, setMoveTo] = useState(sectionId);

  const isActive = table.status && table.status !== 'AVAILABLE' && table.status !== 'available' && table.status !== 'Free';

  const save = () => {
    const n = parseInt(num); const c = parseInt(cap) || 4;
    if (n > 0) { const data = { number: n, capacity: c }; if (moveTo !== sectionId) data.sectionId = moveTo; onUpdate(table.id, data); }
    setEditing(false);
  };

  if (editing) return (
    <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 flex-wrap">
      <Hash size={11} className="text-gray-400" />
      <input autoFocus type="number" min="1" value={num} onChange={e => setNum(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }} className={cls.input + ' w-20'} />
      <Users size={11} className="text-gray-400" />
      <input type="number" min="1" value={cap} onChange={e => setCap(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); }} className={cls.input + ' w-20'} />
      <select value={moveTo} onChange={e => setMoveTo(e.target.value)} className={cls.input + ' max-w-[160px]'} title="Move to section">
        {allSections.map(s => <option key={s.id} value={s.id}>{s.venueName} — {s.name}</option>)}
      </select>
      <button onClick={save} className="p-1.5 bg-[#E53935] text-white rounded-lg hover:bg-[#B71C1C]"><Check size={13} /></button>
      <button onClick={() => setEditing(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={13} /></button>
    </div>
  );

  return (
    <div className="flex items-center justify-between bg-gray-50 hover:bg-gray-100 rounded-lg px-3 py-2 group transition">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1 text-sm font-bold text-gray-700"><Hash size={11} className="text-gray-400" />{table.number}</span>
        <span className="flex items-center gap-1 text-xs text-gray-400"><Users size={11} />{table.capacity || 4}</span>
        {isActive && <span className="text-[9px] font-bold uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{table.status}</span>}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
        <button onClick={() => { setEditing(true); setNum(String(table.number)); setCap(String(table.capacity || 4)); setMoveTo(sectionId); }} className={cls.iconBtn + ' text-gray-400 hover:text-[#E53935] hover:bg-red-50'} title="Edit table"><Pencil size={12} /></button>
        <button onClick={() => onDelete(table.id, table.number, isActive)} className={cls.iconBtn + ' text-gray-400 hover:text-red-500 hover:bg-red-50'} title="Delete table"><Trash2 size={12} /></button>
      </div>
    </div>
  );
}
