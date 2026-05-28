# Phase 4: Quick Start Guide - Bar Inventory

## 🚀 Immediate Access

1. **Start the application**
   ```bash
   npm run dev
   ```

2. **Navigate to Inventory**
   - Go to `http://localhost:5173/admin`
   - Switch to "Bar" outlet (top right toggle)
   - Click "Inventory" in sidebar

3. **You should see**: Bar Inventory dashboard with action buttons

---

## 📦 What Was Built

### New API Service
**File**: `src/services/barInventoryApi.js`
- 9 functions for inventory operations
- Connects to backend at `/api/bar/inventory/*`

### Updated Component
**File**: `src/admin/AdminComponents.jsx`
- Replaced mock `Inventory` component (lines 1434-1522)
- Added 3 modal components
- Added Socket.io integration

---

## 🎯 Core Features

### 1. View Inventory
- Grid of liquor items
- Stock levels in bottles & ml
- Status badges (In Stock / Low Stock / Out of Stock)
- Search bar & status filter

### 2. Add New Item
- Click "+ Add Item"
- Link to existing menu item
- Set bottle size, stock, reorder level, cost
- Auto-creates inventory record

### 3. Adjust Stock
- Click "Adjust" on any item
- Add stock: positive number (e.g., `750`)
- Reduce stock: negative number (e.g., `-330`)
- Track type: Manual, Wastage, or Purchase
- Real-time preview of new stock level

### 4. Record Purchase
- Click "+ Record Purchase"
- Select item from dropdown
- Enter quantity, cost, supplier
- Auto-increases stock

### 5. Low Stock Alerts
- Amber banner at top
- Shows items below reorder level
- Updates in real-time via Socket.io

### 6. Delete Item
- Click trash icon
- Confirmation prompt
- Removes from system

---

## 🔌 Backend Endpoints Used

```
GET    /api/bar/inventory/items?restaurantId=bar-001
POST   /api/bar/inventory/items
PATCH  /api/bar/inventory/items/:id
DELETE /api/bar/inventory/items/:id
POST   /api/bar/inventory/adjust-stock
POST   /api/bar/inventory/record-purchase
GET    /api/bar/inventory/low-stock?restaurantId=bar-001
```

---

## 🧪 Quick Test

1. **Add Item**:
   - Click "+ Add Item"
   - Select "Kingfisher Beer"
   - Bottle size: `330`
   - Current stock: `3960` (12 bottles)
   - Reorder level: `1650` (5 bottles)
   - Cost: `60.00`
   - Submit

2. **Adjust Stock**:
   - Click "Adjust" on the new item
   - Enter: `-2400` (reduce by ~7 bottles)
   - Type: "Wastage/Spillage"
   - Notes: "Test adjustment"
   - Submit
   - Alert should appear (stock now low)

3. **Record Purchase**:
   - Click "+ Record Purchase"
   - Select the beer
   - Quantity: `6600` (20 bottles)
   - Cost: `58.50`
   - Supplier: "ABC Beverages"
   - Submit
   - Stock should increase

---

## 📊 Stock Status Logic

```
Out of Stock:  currentStock <= 0
Low Stock:     currentStock <= reorderLevel
In Stock:      currentStock > reorderLevel
```

---

## 🎨 Key UI Elements

### Header
```
BAR INVENTORY
Manage liquor stock levels and purchases
[+ Record Purchase] [+ Add Item]
```

### Low Stock Alert (if any)
```
⚠️ 2 Items Need Attention
[Kingfisher Beer (3 bottles)] [Old Monk Rum (1 bottle)]
```

### Search & Filter
```
[Search inventory...] [Status Dropdown ▼]
```

### Item Card
```
┌─────────────────────────────┐
│ Kingfisher Beer    [In Stock]│
│ Beer                          │
│                               │
│ Current Stock: 12 bottles     │
│                (3960 ml)      │
│ Reorder Level: 5 bottles      │
│ Bottle Size:   330 ml         │
│ Cost/Bottle:   ₹60.00         │
│                               │
│ [Adjust] [🗑️]                 │
└─────────────────────────────┘
```

---

## 🔧 Troubleshooting

### Problem: No items loading
**Solution**: Check backend is running, verify `VITE_API_URL` in `.env`

### Problem: Real-time updates not working
**Solution**: Check Socket.io connection in browser console

### Problem: "Failed to load inventory" alert
**Solution**: Check Network tab for failed API calls, verify backend endpoints

### Problem: Modal won't open
**Solution**: Check console for errors, ensure React state management working

### Problem: Low stock alerts not appearing
**Solution**: Verify items have `reorderLevel` set and `currentStock <= reorderLevel`

---

## 📁 File Locations

```
src/
├── admin/
│   └── AdminComponents.jsx          ← Inventory component
├── services/
│   ├── barInventoryApi.js           ← NEW: API client
│   └── apiConfig.js                 ← API base URL
└── hooks/
    └── useSocket.js                 ← Socket.io hook
```

---

## 🔗 Related Documentation

- **Full Implementation**: `PHASE_4_IMPLEMENTATION_SUMMARY.md`
- **Architecture**: `PHASE_4_ARCHITECTURE.md`
- **Testing Guide**: `PHASE_4_TESTING_GUIDE.md`
- **Project Guidelines**: `CLAUDE.md`

---

## 🎯 Next Steps

1. **Test locally**: Run through test cases in `PHASE_4_TESTING_GUIDE.md`
2. **Deploy backend**: Ensure all inventory endpoints live
3. **Deploy frontend**: Push to Vercel, set `VITE_API_URL`
4. **Train users**: Show admin staff how to use inventory
5. **Monitor**: Watch for errors in production

---

## 💡 Pro Tips

1. **Stock Calculation**:
   - Always think in ML for accuracy
   - System auto-converts to bottles for display

2. **Adjustments**:
   - Use "Purchase Received" type for actual purchases
   - Use "Wastage" for breakage/spillage
   - Use "Adjustment" for manual corrections

3. **Cost Tracking**:
   - Update cost when recording purchases
   - Helps with profit margin analysis

4. **Reorder Levels**:
   - Set based on consumption rate
   - Typically 5-7 days of stock

5. **Real-Time Sync**:
   - Keep browser tab open for live updates
   - Multiple users can work simultaneously

---

## ⚡ Quick Commands

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Check for errors
npm run lint
```

---

## 🎉 Success Indicators

✅ Inventory dashboard loads in < 2 seconds
✅ All modals open smoothly
✅ Stock calculations accurate
✅ Real-time updates work across tabs
✅ Mobile responsive
✅ No console errors
✅ Low stock alerts functional

---

**Ready to use!** Navigate to `/admin` → Inventory tab and start managing your bar's liquor stock.

For detailed testing: See `PHASE_4_TESTING_GUIDE.md`
For architecture: See `PHASE_4_ARCHITECTURE.md`
For full details: See `PHASE_4_IMPLEMENTATION_SUMMARY.md`
