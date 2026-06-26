import React, { useState } from 'react';
import { Plus, Trash2, Wine } from 'lucide-react';

const VENUE_TYPES = [
  { value: 'DINE_IN', label: 'Dine-in Restaurant' },
  { value: 'BAR', label: 'Bar / Pub' },
  { value: 'CAFE', label: 'Cafe' },
  { value: 'TAKEAWAY', label: 'Takeaway / Parcel' },
  { value: 'DELIVERY', label: 'Delivery Only' },
  { value: 'BANQUET', label: 'Banquet Hall' },
  { value: 'CONFERENCE', label: 'Conference Hall' },
  { value: 'PDR', label: 'Private Dining Room (PDR)' },
  { value: 'ROOM_SERVICE', label: 'Room Service' },
];

export default function StepBusinessAreas({ data, onChange, onNext, onBack }) {
  const [errors, setErrors] = useState({});

  const validate = () => {
    const errs = {};
    if (!data.venues || data.venues.length === 0) {
      errs.venues = 'Select at least one business area';
    }
    for (let i = 0; i < (data.venues || []).length; i++) {
      const v = data.venues[i];
      if (!v.name?.trim()) errs[`venue_${i}_name`] = 'Name is required';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (validate()) onNext();
  };

  const toggleVenueType = (type) => {
    const venues = data.venues || [];
    const exists = venues.find(v => v.venueType === type);
    if (exists) {
      onChange({ venues: venues.filter(v => v.venueType !== type) });
    } else {
      const defaultName = VENUE_TYPES.find(t => t.value === type)?.label || type;
      onChange({ venues: [...venues, { name: defaultName, venueType: type, floors: [], tableCount: type === 'TAKEAWAY' || type === 'DELIVERY' ? 0 : 4 }] });
    }
  };

  const updateVenue = (index, updates) => {
    const venues = [...(data.venues || [])];
    venues[index] = { ...venues[index], ...updates };
    onChange({ venues });
  };

  const addFloor = (venueIndex) => {
    const venues = [...(data.venues || [])];
    const floors = [...(venues[venueIndex].floors || []), { name: '', sections: [{ name: '', tables: [] }] }];
    venues[venueIndex] = { ...venues[venueIndex], floors };
    onChange({ venues });
  };

  const removeFloor = (venueIndex, floorIndex) => {
    const venues = [...(data.venues || [])];
    venues[venueIndex].floors = venues[venueIndex].floors.filter((_, i) => i !== floorIndex);
    onChange({ venues });
  };

  const updateFloor = (venueIndex, floorIndex, updates) => {
    const venues = [...(data.venues || [])];
    venues[venueIndex].floors[floorIndex] = { ...venues[venueIndex].floors[floorIndex], ...updates };
    onChange({ venues });
  };

  const addSection = (venueIndex, floorIndex) => {
    const venues = [...(data.venues || [])];
    venues[venueIndex].floors[floorIndex].sections = [...venues[venueIndex].floors[floorIndex].sections, { name: '', tables: [] }];
    onChange({ venues });
  };

  const removeSection = (venueIndex, floorIndex, sectionIndex) => {
    const venues = [...(data.venues || [])];
    venues[venueIndex].floors[floorIndex].sections = venues[venueIndex].floors[floorIndex].sections.filter((_, i) => i !== sectionIndex);
    onChange({ venues });
  };

  const updateSection = (venueIndex, floorIndex, sectionIndex, updates) => {
    const venues = [...(data.venues || [])];
    venues[venueIndex].floors[floorIndex].sections[sectionIndex] = { ...venues[venueIndex].floors[floorIndex].sections[sectionIndex], ...updates };
    onChange({ venues });
  };

  const addTable = (venueIndex, floorIndex, sectionIndex) => {
    const venues = [...(data.venues || [])];
    const tables = venues[venueIndex].floors[floorIndex].sections[sectionIndex].tables || [];
    const nextNumber = tables.length > 0 ? Math.max(...tables.map(t => t.number)) + 1 : 1;
    venues[venueIndex].floors[floorIndex].sections[sectionIndex].tables = [...tables, { number: nextNumber, capacity: 4 }];
    onChange({ venues });
  };

  const removeTable = (venueIndex, floorIndex, sectionIndex, tableIndex) => {
    const venues = [...(data.venues || [])];
    venues[venueIndex].floors[floorIndex].sections[sectionIndex].tables = venues[venueIndex].floors[floorIndex].sections[sectionIndex].tables.filter((_, i) => i !== tableIndex);
    onChange({ venues });
  };

  const updateTable = (venueIndex, floorIndex, sectionIndex, tableIndex, updates) => {
    const venues = [...(data.venues || [])];
    venues[venueIndex].floors[floorIndex].sections[sectionIndex].tables[tableIndex] = { ...venues[venueIndex].floors[floorIndex].sections[sectionIndex].tables[tableIndex], ...updates };
    onChange({ venues });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Business Areas</h2>
      <p className="text-gray-600">Select the areas your restaurant operates.</p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {VENUE_TYPES.map((type) => {
          const selected = (data.venues || []).some(v => v.venueType === type.value);
          return (
            <button
              key={type.value}
              type="button"
              onClick={() => toggleVenueType(type.value)}
              className={`p-3 rounded-lg border text-left transition-colors ${selected ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 hover:border-gray-300'}`}
            >
              <span className="font-medium">{type.label}</span>
            </button>
          );
        })}
      </div>
      {errors.venues && <p className="text-sm text-red-600">{errors.venues}</p>}

      {(data.venues || []).map((venue, vIdx) => (
        <div key={vIdx} className="border rounded-lg p-4 space-y-3 bg-white">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={venue.name}
              onChange={(e) => updateVenue(vIdx, { name: e.target.value })}
              placeholder="Venue name"
              className="flex-1 border rounded-md px-3 py-2"
            />
            {venue.venueType === 'BAR' && (
              <div className="flex items-center gap-2">
                <Wine className="w-4 h-4 text-gray-500" />
                <input
                  type="number"
                  value={venue.barUnitMl ?? ''}
                  onChange={(e) => updateVenue(vIdx, { barUnitMl: Number(e.target.value) })}
                  placeholder="Unit ML"
                  className="w-20 border rounded-md px-2 py-2"
                />
              </div>
            )}
          </div>
          {errors[`venue_${vIdx}_name`] && <p className="text-sm text-red-600">{errors[`venue_${vIdx}_name`]}</p>}

          {venue.venueType !== 'TAKEAWAY' && venue.venueType !== 'DELIVERY' && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Tables (without floors):</span>
                <input
                  type="number"
                  min={0}
                  value={venue.tableCount ?? 0}
                  onChange={(e) => updateVenue(vIdx, { tableCount: Number(e.target.value) })}
                  className="w-20 border rounded-md px-2 py-1"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Floors</span>
                  <button type="button" onClick={() => addFloor(vIdx)} className="text-sm text-red-600 flex items-center gap-1">
                    <Plus className="w-4 h-4" /> Add Floor
                  </button>
                </div>
                {(venue.floors || []).map((floor, fIdx) => (
                  <div key={fIdx} className="border rounded-md p-3 bg-gray-50">
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="text"
                        value={floor.name}
                        onChange={(e) => updateFloor(vIdx, fIdx, { name: e.target.value })}
                        placeholder="Floor name"
                        className="flex-1 border rounded-md px-2 py-1"
                      />
                      <button type="button" onClick={() => removeFloor(vIdx, fIdx)} className="text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="space-y-2 ml-4">
                      {(floor.sections || []).map((section, sIdx) => (
                        <div key={sIdx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={section.name}
                            onChange={(e) => updateSection(vIdx, fIdx, sIdx, { name: e.target.value })}
                            placeholder="Section name"
                            className="flex-1 border rounded-md px-2 py-1"
                          />
                          <button type="button" onClick={() => addTable(vIdx, fIdx, sIdx)} className="text-xs text-gray-600">+Table</button>
                          <button type="button" onClick={() => removeSection(vIdx, fIdx, sIdx)} className="text-red-500">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      {floor.sections?.length === 0 && (
                        <button type="button" onClick={() => addSection(vIdx, fIdx)} className="text-xs text-red-600">+ Section</button>
                      )}
                      {(floor.sections || []).map((section, sIdx) => (
                        <div key={`tables-${sIdx}`} className="flex flex-wrap gap-2 ml-4">
                          {(section.tables || []).map((table, tIdx) => (
                            <div key={tIdx} className="flex items-center gap-1 bg-white border rounded px-2 py-1">
                              <span className="text-xs">T{table.number}</span>
                              <input
                                type="number"
                                min={1}
                                value={table.number}
                                onChange={(e) => updateTable(vIdx, fIdx, sIdx, tIdx, { number: Number(e.target.value) })}
                                className="w-12 text-xs border rounded px-1"
                              />
                              <button type="button" onClick={() => removeTable(vIdx, fIdx, sIdx, tIdx)} className="text-red-400">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ))}

      <div className="flex justify-between pt-4">
        <button type="button" onClick={onBack} className="px-4 py-2 border rounded-md text-gray-700 hover:bg-gray-50">Back</button>
        <button type="button" onClick={handleNext} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">Next</button>
      </div>
    </div>
  );
}
