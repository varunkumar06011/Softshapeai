import React, { useState } from 'react';
import { Utensils, Plus, Trash2, Upload, Leaf } from 'lucide-react';

const StepMenu = ({ data, onChange, onNext, onBack }) => {
  const [mode, setMode] = useState('manual'); // 'manual' or 'upload'
  const [hasInteracted, setHasInteracted] = useState(false);

  const handleCategoryChange = (categoryIndex, field, value) => {
    setHasInteracted(true);
    const newCategories = [...data.categories];
    newCategories[categoryIndex] = { ...newCategories[categoryIndex], [field]: value };
    onChange({ ...data, categories: newCategories });
  };

  const handleItemChange = (categoryIndex, itemIndex, field, value) => {
    setHasInteracted(true);
    const newCategories = [...data.categories];
    newCategories[categoryIndex] = {
      ...newCategories[categoryIndex],
      items: newCategories[categoryIndex].items.map((item, i) =>
        i === itemIndex ? { ...item, [field]: value } : item
      )
    };
    onChange({ ...data, categories: newCategories });
  };

  const addCategory = () => {
    onChange({
      ...data,
      categories: [...data.categories, { name: '', items: [{ name: '', price: 0, isVeg: true }] }]
    });
  };

  const removeCategory = (categoryIndex) => {
    if (data.categories.length > 1) {
      onChange({
        ...data,
        categories: data.categories.filter((_, i) => i !== categoryIndex)
      });
    }
  };

  const addItem = (categoryIndex) => {
    const newCategories = [...data.categories];
    newCategories[categoryIndex] = {
      ...newCategories[categoryIndex],
      items: [...newCategories[categoryIndex].items, { name: '', price: 0, isVeg: true }]
    };
    onChange({ ...data, categories: newCategories });
  };

  const removeItem = (categoryIndex, itemIndex) => {
    if (data.categories[categoryIndex].items.length > 1) {
      const newCategories = [...data.categories];
      newCategories[categoryIndex] = {
        ...newCategories[categoryIndex],
        items: newCategories[categoryIndex].items.filter((_, i) => i !== itemIndex)
      };
      onChange({ ...data, categories: newCategories });
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (parsed.categories && Array.isArray(parsed.categories)) {
          onChange(parsed);
        }
      } catch (err) {
        alert('Invalid JSON file format');
      }
    };
    reader.readAsText(file);
  };

  const isValid =
    data.categories.length >= 1 &&
    data.categories.every(cat => cat.name.length >= 1 && cat.items.length >= 1 && cat.items.every(item => item.name.length >= 1 && item.price > 0));

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <Utensils size={48} className="mx-auto text-blue-500 mb-4" />
        <h2 className="text-2xl font-bold mb-2">Menu Setup</h2>
        <p className="text-gray-400">Add your menu items</p>
      </div>

      {/* Mode Toggle */}
      <div className="flex gap-2 bg-gray-700 p-1 rounded-xl">
        <button
          onClick={() => setMode('manual')}
          className={`flex-1 py-2 px-4 rounded-lg transition-all ${
            mode === 'manual' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          Manual Entry
        </button>
        <button
          onClick={() => setMode('upload')}
          className={`flex-1 py-2 px-4 rounded-lg transition-all ${
            mode === 'upload' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          Upload JSON
        </button>
      </div>

      {mode === 'manual' ? (
        <div className="space-y-6">
          {data.categories.map((category, categoryIndex) => (
            <div key={categoryIndex} className="bg-gray-700/50 rounded-xl p-4 space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={category.name}
                  onChange={(e) => handleCategoryChange(categoryIndex, 'name', e.target.value)}
                  className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 text-white font-semibold"
                  placeholder="Category name (e.g., Starters)"
                />
                {data.categories.length > 1 && (
                  <button
                    onClick={() => removeCategory(categoryIndex)}
                    className="p-2 text-red-400 hover:text-red-300"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-gray-300">Items</h4>
                  <button
                    onClick={() => addItem(categoryIndex)}
                    className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
                  >
                    <Plus size={16} />
                    Add Item
                  </button>
                </div>

                {category.items.map((item, itemIndex) => (
                  <div key={itemIndex} className="bg-gray-700/50 rounded-lg p-3 space-y-2">
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => handleItemChange(categoryIndex, itemIndex, 'name', e.target.value)}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 text-white"
                          placeholder="Item name"
                        />
                      </div>
                      <div className="w-28 relative">
                        <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400">₹</span>
                        <input
                          type="number"
                          value={item.price === 0 ? '' : item.price}
                          onChange={(e) => handleItemChange(categoryIndex, itemIndex, 'price', parseFloat(e.target.value) || 0)}
                          className="w-full pl-7 pr-2 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 text-white"
                          placeholder="Price"
                          min="0"
                          step="0.01"
                        />
                      </div>
                      {category.items.length > 1 && (
                        <button
                          onClick={() => removeItem(categoryIndex, itemIndex)}
                          className="p-2 text-red-400 hover:text-red-300"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleItemChange(categoryIndex, itemIndex, 'isVeg', !item.isVeg)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
                          item.isVeg ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'
                        }`}
                      >
                        <Leaf size={14} />
                        {item.isVeg ? 'Vegetarian' : 'Non-Veg'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <button
            onClick={addCategory}
            className="w-full py-3 border-2 border-dashed border-gray-600 rounded-xl text-gray-400 hover:border-blue-500 hover:text-blue-400 transition-all flex items-center justify-center gap-2"
          >
            <Plus size={20} />
            Add Category
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="border-2 border-dashed border-gray-600 rounded-xl p-8 text-center">
            <Upload size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-300 mb-2">Upload your menu as a JSON file</p>
            <p className="text-sm text-gray-500 mb-4">Format: {`{"categories": [{"name": "Category", "items": [{"name": "Item", "price": 100, "isVeg": true}]}]}`}</p>
            <input
              type="file"
              accept=".json,.txt"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl cursor-pointer transition-all"
            >
              Choose File
            </label>
          </div>

          {data.categories.length > 0 && (
            <div className="bg-gray-700/50 rounded-xl p-4">
              <h4 className="font-semibold mb-3">Preview</h4>
              <div className="space-y-2">
                {data.categories.map((cat, i) => (
                  <div key={i} className="text-sm">
                    <span className="font-medium">{cat.name}:</span> {cat.items.length} items
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!isValid && hasInteracted && (
        <p className="text-sm text-red-400 text-center">
          Each category needs a name, and every item needs a name and a price greater than 0 before you can continue.
        </p>
      )}

      <div className="flex gap-4">
        <button
          onClick={onBack}
          className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl font-semibold transition-all"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!isValid}
          className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
            isValid
              ? 'bg-blue-600 hover:bg-blue-500 text-white'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          Continue
        </button>
      </div>
    </div>
  );
};

export default StepMenu;
