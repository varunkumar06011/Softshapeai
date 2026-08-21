const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'admin', 'TodaySpecials.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Find the SPECIALS GRID section and replace it
const startMarker = '      {/* SPECIALS GRID */}';
const endMarker = '      {/* SWIGGY/ZOMATO SYNC ACTIONS */}';

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
  console.error('Markers not found');
  process.exit(1);
}

// The grid section is from startMarker to the </div> just before endMarker
// Find the last </div> before endMarker (after the empty-state block)
const gridSection = content.substring(startIdx, endIdx);
// The grid section ends with "      </div>\n\n\n\n      {/* SWIGGY..."
// We want to replace from startMarker up to and including that </div>

// Find the closing </div> that ends the grid
// It's the last standalone </div> before the end marker
const lastDivIdx = gridSection.lastIndexOf('      </div>');
if (lastDivIdx === -1) {
  console.error('Closing </div> not found');
  process.exit(1);
}

const replaceEnd = startIdx + lastDivIdx + '      </div>'.length;

const newGrid = `      {/* SPECIALS GRID — grouped by outlet when viewing All Outlets */}
      {(() => {
        // Group displayedSpecials by outletId, preserving the sorted order
        const groups = new Map();
        for (const special of displayedSpecials) {
          const key = special.outletId || '__no_outlet__';
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(special);
        }

        const showGroupHeaders = selectedOutletId === 'all' && groups.size > 1;

        if (!showGroupHeaders) {
          // Single outlet or single group — render flat grid (existing behavior)
          return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {displayedSpecials.map(special => {
                const isExpired = Date.now() > (special.expiresAt || 0);
                const isActive = special.active && !isExpired;
                return (
                  <div key={special.id} className={\`bg-white rounded-2xl border \${isActive ? 'border-amber-200 shadow-lg shadow-amber-50' : 'border-gray-200 opacity-70 grayscale'} overflow-hidden flex flex-col group\`}>
                    <div className="h-40 w-full bg-gray-100 relative overflow-hidden flex-shrink-0">
                      {special.img ? (
                        <img src={special.img} alt={special.n} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          <ImageIcon size={32} />
                        </div>
                      )}
                      <div className="absolute top-3 left-3 flex gap-2">
                        <label className="w-6 h-6 rounded-md flex items-center justify-center bg-white shadow-sm border border-gray-200 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedSpecialIds.has(special.id)}
                            onChange={() => toggleSelectSpecial(special.id)}
                            className="w-4 h-4 rounded border-gray-300 text-[#E53935] focus:ring-[#E53935]"
                          />
                        </label>
                      </div>
                      <div className="absolute top-3 right-3 flex gap-2">
                        {special.isCombo && (
                          <span className="bg-amber-500 text-white px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest shadow-sm">Combo</span>
                        )}
                        {selectedOutletId === 'all' && special.outletId && (
                          <span className="bg-blue-500 text-white px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest shadow-sm">
                            {outlets.find(o => o.id === special.outletId)?.name || special.outletId}
                          </span>
                        )}
                        <div className={\`w-5 h-5 rounded-md flex items-center justify-center bg-white shadow-sm border \${special.t === 'veg' ? 'border-green-500 text-green-500' : 'border-red-500 text-red-500'}\`}>
                          <div className={\`w-2 h-2 rounded-full \${special.t === 'veg' ? 'bg-green-500' : 'bg-red-500'}\`} />
                        </div>
                      </div>
                    </div>
                    <div className="p-4 flex flex-col flex-grow">
                      <div className="flex justify-between items-start mb-1">
                        <h3 className="text-sm font-black text-gray-900 leading-tight">{special.n}</h3>
                        <span className="text-sm font-black text-[#E53935]">₹{special.p}</span>
                      </div>
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{special.c}</span>
                      {(() => {
                        const sold = specialsSold.find(s => s.id === special.id);
                        return sold && sold.soldCount > 0 ? (
                          <div className="mt-2 inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-wider">
                            <Flame size={12} /> {sold.soldCount} sold
                          </div>
                        ) : (
                          <div className="mt-2 inline-flex items-center gap-1.5 bg-gray-50 text-gray-400 rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-wider">
                            <Flame size={12} /> 0 sold
                          </div>
                        );
                      })()}
                      <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={\`w-2 h-2 rounded-full \${isActive ? 'bg-green-500' : 'bg-gray-400'}\`} />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                            {isActive ? (special.isAvailable ? 'Active' : 'Hidden') : (isExpired ? 'Expired' : 'Inactive')}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          {!isActive ? (
                            <button
                              onClick={() => handleActivate(special.id)}
                              className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-green-600 transition-colors"
                            >
                              Activate
                            </button>
                          ) : (
                            <button
                              onClick={() => handleDeactivate(special.id)}
                              className="px-3 py-1.5 bg-gray-200 text-gray-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-gray-300 transition-colors flex items-center gap-1"
                            >
                              <Pause size={12} /> Deactivate
                            </button>
                          )}
                          <button
                            onClick={() => { setFormData({ ...special, available: special.isAvailable !== false, duration: '1 Day', gstEnabled: special.gstEnabled !== false, printerTarget: special.printerTarget || '', printerName: special.printerName || '', outletPrinterNames: special.outletId ? { [special.outletId]: special.printerName || special.printerTarget || '' } : {}, venuePrices: special.venuePrices || {}, unit: special.unit || '', menuType: special.menuType || 'FOOD', outletSelection: special.outletId || 'all', mappedMenuItemId: null }); setSelectedMenuItem(null); setRecipeStatus(null); setRecipeIngredients([]); setShowManualRecipe(false); setManualIngredients([]); setIngredientSearchQuery(''); setAllInventoryItems([]); setInventoryLoaded(false); setIsModalOpen(true); checkRecipe(special.id, { populateManual: true }); }}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(special.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {displayedSpecials.length === 0 && (
                <div className="col-span-full py-16 bg-white rounded-3xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-center">
                  <StarIcon size={40} className="text-gray-300 mb-4" />
                  <h3 className="text-lg font-black text-gray-900 mb-2">
                    {specialSearchQuery.trim() ? 'No Matching Specials' : availabilityFilter !== 'all' ? 'No Specials Match This Filter' : 'No Specials Added'}
                  </h3>
                  <p className="text-xs font-bold text-gray-500 max-w-sm">
                    {specialSearchQuery.trim()
                      ? 'Try a different search term or clear the filter.'
                      : availabilityFilter !== 'all'
                        ? 'Switch the availability filter to "All" to see every special.'
                        : "Create today's specials to instantly push recommendations to the Captain App."}
                  </p>
                </div>
              )}
            </div>
          );
        }

        // Multiple outlets — render grouped sections with outlet headers
        return (
          <div className="space-y-8">
            {Array.from(groups.entries()).map(([outletKey, groupSpecials]) => {
              const outletName = outletKey === '__no_outlet__'
                ? 'Unassigned'
                : (outlets.find(o => o.id === outletKey)?.name || outletKey);
              return (
                <div key={outletKey}>
                  {/* Outlet group header */}
                  <div className="flex items-center gap-2 mb-3 sticky top-0 bg-gray-50/80 backdrop-blur-sm py-2 z-10">
                    <Store size={16} className="text-[#E53935]" />
                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">{outletName}</h3>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      {groupSpecials.length} special{groupSpecials.length === 1 ? '' : 's'}
                    </span>
                    <div className="flex-1 h-px bg-gray-200 ml-2" />
                  </div>

                  {/* Specials within this outlet */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {groupSpecials.map(special => {
                      const isExpired = Date.now() > (special.expiresAt || 0);
                      const isActive = special.active && !isExpired;
                      return (
                        <div key={special.id} className={\`bg-white rounded-2xl border \${isActive ? 'border-amber-200 shadow-lg shadow-amber-50' : 'border-gray-200 opacity-70 grayscale'} overflow-hidden flex flex-col group\`}>
                          <div className="h-40 w-full bg-gray-100 relative overflow-hidden flex-shrink-0">
                            {special.img ? (
                              <img src={special.img} alt={special.n} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-400">
                                <ImageIcon size={32} />
                              </div>
                            )}
                            <div className="absolute top-3 left-3 flex gap-2">
                              <label className="w-6 h-6 rounded-md flex items-center justify-center bg-white shadow-sm border border-gray-200 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedSpecialIds.has(special.id)}
                                  onChange={() => toggleSelectSpecial(special.id)}
                                  className="w-4 h-4 rounded border-gray-300 text-[#E53935] focus:ring-[#E53935]"
                                />
                              </label>
                            </div>
                            <div className="absolute top-3 right-3 flex gap-2">
                              {special.isCombo && (
                                <span className="bg-amber-500 text-white px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest shadow-sm">Combo</span>
                              )}
                              <div className={\`w-5 h-5 rounded-md flex items-center justify-center bg-white shadow-sm border \${special.t === 'veg' ? 'border-green-500 text-green-500' : 'border-red-500 text-red-500'}\`}>
                                <div className={\`w-2 h-2 rounded-full \${special.t === 'veg' ? 'bg-green-500' : 'bg-red-500'}\`} />
                              </div>
                            </div>
                          </div>
                          <div className="p-4 flex flex-col flex-grow">
                            <div className="flex justify-between items-start mb-1">
                              <h3 className="text-sm font-black text-gray-900 leading-tight">{special.n}</h3>
                              <span className="text-sm font-black text-[#E53935]">₹{special.p}</span>
                            </div>
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{special.c}</span>
                            {(() => {
                              const sold = specialsSold.find(s => s.id === special.id);
                              return sold && sold.soldCount > 0 ? (
                                <div className="mt-2 inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-wider">
                                  <Flame size={12} /> {sold.soldCount} sold
                                </div>
                              ) : (
                                <div className="mt-2 inline-flex items-center gap-1.5 bg-gray-50 text-gray-400 rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-wider">
                                  <Flame size={12} /> 0 sold
                                </div>
                              );
                            })()}
                            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className={\`w-2 h-2 rounded-full \${isActive ? 'bg-green-500' : 'bg-gray-400'}\`} />
                                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                                  {isActive ? (special.isAvailable ? 'Active' : 'Hidden') : (isExpired ? 'Expired' : 'Inactive')}
                                </span>
                              </div>
                              <div className="flex gap-2">
                                {!isActive ? (
                                  <button
                                    onClick={() => handleActivate(special.id)}
                                    className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-green-600 transition-colors"
                                  >
                                    Activate
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleDeactivate(special.id)}
                                    className="px-3 py-1.5 bg-gray-200 text-gray-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-gray-300 transition-colors flex items-center gap-1"
                                  >
                                    <Pause size={12} /> Deactivate
                                  </button>
                                )}
                                <button
                                  onClick={() => { setFormData({ ...special, available: special.isAvailable !== false, duration: '1 Day', gstEnabled: special.gstEnabled !== false, printerTarget: special.printerTarget || '', printerName: special.printerName || '', outletPrinterNames: special.outletId ? { [special.outletId]: special.printerName || special.printerTarget || '' } : {}, venuePrices: special.venuePrices || {}, unit: special.unit || '', menuType: special.menuType || 'FOOD', outletSelection: special.outletId || 'all', mappedMenuItemId: null }); setSelectedMenuItem(null); setRecipeStatus(null); setRecipeIngredients([]); setShowManualRecipe(false); setManualIngredients([]); setIngredientSearchQuery(''); setAllInventoryItems([]); setInventoryLoaded(false); setIsModalOpen(true); checkRecipe(special.id, { populateManual: true }); }}
                                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  onClick={() => handleDelete(special.id)}
                                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {displayedSpecials.length === 0 && (
              <div className="py-16 bg-white rounded-3xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-center">
                <StarIcon size={40} className="text-gray-300 mb-4" />
                <h3 className="text-lg font-black text-gray-900 mb-2">
                  {specialSearchQuery.trim() ? 'No Matching Specials' : availabilityFilter !== 'all' ? 'No Specials Match This Filter' : 'No Specials Added'}
                </h3>
                <p className="text-xs font-bold text-gray-500 max-w-sm">
                  {specialSearchQuery.trim()
                    ? 'Try a different search term or clear the filter.'
                    : availabilityFilter !== 'all'
                      ? 'Switch the availability filter to "All" to see every special.'
                      : "Create today's specials to instantly push recommendations to the Captain App."}
                </p>
              </div>
            )}
          </div>
        );
      })()}`;

// Replace the old grid section with the new one
content = content.substring(0, startIdx) + newGrid + content.substring(replaceEnd);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Replacement done. File size:', content.length);
