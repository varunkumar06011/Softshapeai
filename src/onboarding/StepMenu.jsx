import React, { useState } from 'react';
import { Utensils, Plus, Trash2, Leaf, Wine, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import MenuUpload from './MenuUpload';

const DELIVERY_PLATFORMS = ['Swiggy', 'Zomato', 'Direct'];

const defaultBarMenu = { categories: [{ name: '', items: [{ name: '', price: 0, availableSizes: [] }] }] };

const StepMenu = ({ restaurantType, taxConfig, data, deliveryPlatforms = [], barConfig, onChange, onDeliveryPlatformsChange, onNext, onBack }) => {
  const [mode, setMode] = useState('manual'); // 'manual' or 'upload-file'
  const [hasInteracted, setHasInteracted] = useState(false);
  const [activeTab, setActiveTab] = useState('food');
  const [showItemTax, setShowItemTax] = useState({});

  const isBarType = restaurantType === 'BAR_LOUNGE' || restaurantType === 'BAR_WITH_DINING';
  const isCloud = restaurantType === 'CLOUD_KITCHEN';

  const foodCategories = data.categories || [];
  const barMenu = data.barMenu || defaultBarMenu;

  const getTargetCategories = () => activeTab === 'food' ? foodCategories : barMenu.categories;
  const setTargetCategories = (next) => {
    if (activeTab === 'food') {
      onChange({ ...data, categories: next });
    } else {
      onChange({ ...data, barMenu: { ...barMenu, categories: next } });
    }
  };

  const handleCategoryChange = (categoryIndex, field, value) => {
    setHasInteracted(true);
    const cats = [...getTargetCategories()];
    cats[categoryIndex] = { ...cats[categoryIndex], [field]: value };
    setTargetCategories(cats);
  };

  const handleItemChange = (categoryIndex, itemIndex, field, value) => {
    setHasInteracted(true);
    const cats = [...getTargetCategories()];
    cats[categoryIndex] = {
      ...cats[categoryIndex],
      items: cats[categoryIndex].items.map((item, i) =>
        i === itemIndex ? { ...item, [field]: value } : item
      )
    };
    setTargetCategories(cats);
  };

  const addCategory = () => {
    const baseItem = activeTab === 'food'
      ? { name: '', price: 0, isVeg: true, platforms: [] }
      : { name: '', price: 0, availableSizes: [] };
    setTargetCategories([...getTargetCategories(), { name: '', items: [baseItem] }]);
  };

  const removeCategory = (categoryIndex) => {
    const cats = getTargetCategories();
    if (cats.length > 1) {
      setTargetCategories(cats.filter((_, i) => i !== categoryIndex));
    }
  };

  const addItem = (categoryIndex) => {
    const cats = [...getTargetCategories()];
    const baseItem = activeTab === 'food'
      ? { name: '', price: 0, isVeg: true, platforms: [] }
      : { name: '', price: 0, availableSizes: [] };
    cats[categoryIndex] = { ...cats[categoryIndex], items: [...cats[categoryIndex].items, baseItem] };
    setTargetCategories(cats);
  };

  const removeItem = (categoryIndex, itemIndex) => {
    const cats = [...getTargetCategories()];
    if (cats[categoryIndex].items.length > 1) {
      cats[categoryIndex] = {
        ...cats[categoryIndex],
        items: cats[categoryIndex].items.filter((_, i) => i !== itemIndex)
      };
      setTargetCategories(cats);
    }
  };

  const toggleItemTax = (categoryIndex, itemIndex) => {
    const key = `${categoryIndex}-${itemIndex}`;
    setShowItemTax(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const cats = getTargetCategories();
  const isValid =
    cats.length >= 1 &&
    cats.every(cat => cat.name.length >= 1 && cat.items.length >= 1 && cat.items.every(item => item.name.length >= 1 && item.price > 0));

  // Duplicate detection
  const duplicateNames = [];
  cats.forEach((cat, ci) => {
    const names = cat.items.map(i => i.name.trim().toLowerCase()).filter(n => n);
    const seen = new Set();
    names.forEach((n, ii) => {
      if (seen.has(n)) duplicateNames.push({ category: cat.name, name: cat.items[ii].name });
      seen.add(n);
    });
  });

  const handleSkip = () => {
    // Seed with a placeholder category so validation passes in wizard
    onChange({
      ...data,
      categories: data.categories?.length > 0 ? data.categories : [{ name: 'My Menu', items: [{ name: 'Placeholder', price: 1, isVeg: true, taxRate: defaultTax, platforms: [] }] }]
    });
    onNext();
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <Utensils size={48} className="mx-auto text-[#E53935] mb-4" />
        <h2 className="text-2xl font-bold mb-2">Menu Setup</h2>
        <p className="text-gray-500">Group your dishes into categories like 'Starters', 'Main Course', 'Beverages'.</p>
      </div>

      {isCloud && onDeliveryPlatformsChange && (
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Which platforms will you receive orders from?</h3>
          <div className="flex flex-wrap gap-4">
            {DELIVERY_PLATFORMS.map(p => (
              <label key={p} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={deliveryPlatforms.includes(p)}
                  onChange={(e) => {
                    const current = deliveryPlatforms;
                    const next = e.target.checked ? [...current, p] : current.filter(x => x !== p);
                    onDeliveryPlatformsChange(next);
                  }}
                  className="w-4 h-4 text-[#E53935] rounded border-gray-300"
                />
                <span className="text-gray-700">{p}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {isBarType && (
        <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('food')}
            className={`flex-1 py-2 px-4 rounded-lg transition-all ${activeTab === 'food' ? 'bg-[#E53935] text-white' : 'text-gray-500 hover:text-gray-900'}`}
          >
            Food Menu
          </button>
          <button
            onClick={() => setActiveTab('bar')}
            className={`flex-1 py-2 px-4 rounded-lg transition-all ${activeTab === 'bar' ? 'bg-[#E53935] text-white' : 'text-gray-500 hover:text-gray-900'}`}
          >
            <Wine size={16} className="inline mr-1" />
            Bar Menu
          </button>
        </div>
      )}

      {/* Mode Toggle */}
      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
        <button
          onClick={() => setMode('manual')}
          className={`flex-1 py-2 px-4 rounded-lg transition-all ${mode === 'manual' ? 'bg-[#E53935] text-white' : 'text-gray-500 hover:text-gray-900'}`}
        >
          Manual Entry
        </button>
        <button
          onClick={() => setMode('upload-file')}
          className={`flex-1 py-2 px-4 rounded-lg transition-all ${
            mode === 'upload-file' ? 'bg-[#E53935] text-white' : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          <FileSpreadsheet size={16} className="inline mr-1" />
          Upload File
        </button>
      </div>

      {mode === 'manual' ? (
        <div className="space-y-6">
          {cats.map((category, categoryIndex) => (
            <div key={categoryIndex} className="bg-gray-50 rounded-xl p-4 space-y-4 border border-gray-100">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={category.name}
                  onChange={(e) => handleCategoryChange(categoryIndex, 'name', e.target.value)}
                  className="flex-1 px-4 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-[#E53935] focus:ring-2 focus:ring-red-100 text-gray-900 font-semibold transition-all"
                  placeholder={activeTab === 'bar' ? 'Bar category (e.g., Whisky)' : 'Category name (e.g., Starters)'}
                />
                {cats.length > 1 && (
                  <button onClick={() => removeCategory(categoryIndex)} className="p-2 text-red-600 hover:text-red-500">
                    <Trash2 size={18} />
                  </button>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-gray-700">Items</h4>
                  <button
                    onClick={() => addItem(categoryIndex)}
                    className="flex items-center gap-2 text-sm text-[#E53935] hover:text-[#B71C1C]"
                  >
                    <Plus size={16} /> Add Item
                  </button>
                </div>

                {category.items.map((item, itemIndex) => (
                  <div key={itemIndex} className="bg-white rounded-lg p-3 space-y-2 border border-gray-300">
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => handleItemChange(categoryIndex, itemIndex, 'name', e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-[#E53935] focus:ring-2 focus:ring-red-100 text-gray-900 transition-all"
                          placeholder="Item name"
                        />
                      </div>
                      <div className="w-28 relative">
                        <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-500">₹</span>
                        <input
                          type="number"
                          value={item.price === 0 ? '' : item.price}
                          onChange={(e) => handleItemChange(categoryIndex, itemIndex, 'price', parseFloat(e.target.value) || 0)}
                          className="w-full pl-7 pr-2 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-[#E53935] focus:ring-2 focus:ring-red-100 text-gray-900 transition-all"
                          placeholder="Price"
                          min="0"
                          step="0.01"
                        />
                      </div>
                      {category.items.length > 1 && (
                        <button onClick={() => removeItem(categoryIndex, itemIndex)} className="p-2 text-red-600 hover:text-red-500">
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {activeTab === 'food' && (
                        <button
                          onClick={() => handleItemChange(categoryIndex, itemIndex, 'isVeg', !item.isVeg)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${item.isVeg ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}
                        >
                          <Leaf size={14} /> {item.isVeg ? 'Vegetarian' : 'Non-Veg'}
                        </button>
                      )}

                      {activeTab === 'food' && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleItemTax(categoryIndex, itemIndex)}
                            className="text-xs text-gray-400 hover:text-[#E53935] underline"
                          >
                            {showItemTax[`${categoryIndex}-${itemIndex}`] ? 'Hide tax override' : 'Override tax'}
                          </button>
                          {showItemTax[`${categoryIndex}-${itemIndex}`] && (
                            <select
                              value={item.taxRate || category.taxRate || defaultTax}
                              onChange={(e) => handleItemChange(categoryIndex, itemIndex, 'taxRate', e.target.value)}
                              className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#E53935] text-gray-900"
                            >
                              {TAX_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                          )}
                        </div>
                      )}

                      {isCloud && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">Platforms:</span>
                          {DELIVERY_PLATFORMS.map(p => (
                            <label key={p} className="flex items-center gap-1 text-xs cursor-pointer">
                              <input
                                type="checkbox"
                                checked={(item.platforms || []).includes(p)}
                                onChange={(e) => {
                                  const current = item.platforms || [];
                                  const next = e.target.checked ? [...current, p] : current.filter(x => x !== p);
                                  handleItemChange(categoryIndex, itemIndex, 'platforms', next);
                                }}
                                className="w-3 h-3 text-[#E53935] rounded border-gray-300"
                              />
                              <span className="text-gray-700">{p}</span>
                            </label>
                          ))}
                        </div>
                      )}

                      {activeTab === 'bar' && barConfig?.fullBottleMl && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">Sizes:</span>
                            {['Peg', 'Half', 'Full'].map(size => (
                              <label key={size} className="flex items-center gap-1 text-xs cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={(item.availableSizes || []).includes(size)}
                                  onChange={(e) => {
                                    const current = item.availableSizes || [];
                                    const next = e.target.checked ? [...current, size] : current.filter(x => x !== size);
                                    handleItemChange(categoryIndex, itemIndex, 'availableSizes', next);
                                  }}
                                  className="w-3 h-3 text-[#E53935] rounded border-gray-300"
                                />
                                <span className="text-gray-700">{size}</span>
                              </label>
                            ))}
                          </div>
                          {(item.availableSizes || []).length > 0 && item.price > 0 && (
                            <div className="flex gap-3 text-xs text-gray-500 bg-white rounded-lg px-2 py-1 border border-gray-100">
                              {(item.availableSizes || []).includes('Peg') && (
                                <span>Peg: ₹{Math.round((item.price / barConfig.fullBottleMl) * barConfig.barUnitMl)}</span>
                              )}
                              {(item.availableSizes || []).includes('Half') && (
                                <span>Half: ₹{Math.round((item.price / barConfig.fullBottleMl) * barConfig.halfBottleMl)}</span>
                              )}
                              {(item.availableSizes || []).includes('Full') && (
                                <span>Full: ₹{item.price}</span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <button
            onClick={addCategory}
            className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-500 hover:border-[#E53935] hover:text-[#E53935] transition-all flex items-center justify-center gap-2"
          >
            <Plus size={20} /> Add Category
          </button>
        </div>
      ) : (
        <MenuUpload
          onboardingMode={true}
          restaurantType={restaurantType}
          onImported={(payload) => {
            // payload can be { rows, mode, venueHeaders } (rate-card) or rows array (legacy)
            const rows = Array.isArray(payload) ? payload : (payload.rows || []);
            if (!Array.isArray(rows) || rows.length === 0) return;
            const grouped = rows.reduce((acc, row) => {
              const cat = acc.find(c => c.name === row.category);
              if (activeTab === 'bar') {
                const item = {
                  name: row.name, price: row.price, availableSizes: [],
                  ...(row.variants ? { variants: row.variants } : {}),
                  ...(row.venuePrices ? { venuePrices: row.venuePrices } : {}),
                  ...(row.menuType ? { menuType: row.menuType } : {}),
                  ...(row.unit ? { unit: row.unit } : {}),
                  ...(row.isAvailable === false ? { isAvailable: false } : {}),
                };
                if (cat) { cat.items.push(item); }
                else { acc.push({ name: row.category, items: [item] }); }
              } else {
                const item = {
                  name: row.name, price: row.price, isVeg: row.isVeg, platforms: [],
                  ...(row.variants ? { variants: row.variants } : {}),
                  ...(row.venuePrices ? { venuePrices: row.venuePrices } : {}),
                  ...(row.menuType ? { menuType: row.menuType } : {}),
                  ...(row.unit ? { unit: row.unit } : {}),
                  ...(row.isAvailable === false ? { isAvailable: false } : {}),
                };
                if (cat) { cat.items.push(item); }
                else { acc.push({ name: row.category, items: [item] }); }
              }
              return acc;
            }, []);
            if (activeTab === 'bar') {
              const targetBar = data.barMenu || { categories: [] };
              onChange({ ...data, barMenu: { ...targetBar, categories: grouped.length > 0 ? grouped : targetBar.categories } });
            } else {
              onChange({ ...data, categories: grouped.length > 0 ? grouped : data.categories });
            }
          }}
        />
      )}

      {duplicateNames.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center gap-2 text-yellow-800 text-sm">
          <AlertTriangle size={18} />
          <span>{duplicateNames.length} duplicate item name(s) detected. Consider renaming them.</span>
        </div>
      )}

      {!isValid && hasInteracted && (
        <p className="text-sm text-red-600 text-center">
          Each category needs a name, and every item needs a name and a price greater than 0 before you can continue.
        </p>
      )}

      <div className="bg-gray-50 rounded-xl p-4 text-center">
        <p className="text-sm text-gray-500 mb-2">You can add your full menu from the Admin panel after setup.</p>
        <button
          onClick={handleSkip}
          className="text-sm text-[#E53935] hover:text-[#B71C1C] font-medium underline"
        >
          I'll add my menu later in Admin
        </button>
      </div>

      <div className="flex gap-4">
        <button onClick={onBack} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl font-semibold transition-all">
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!isValid}
          className={`flex-1 py-3 rounded-xl font-semibold transition-all ${isValid ? 'bg-[#E53935] hover:bg-[#B71C1C] text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
        >
          Continue
        </button>
      </div>
    </div>
  );
};

export default StepMenu;
