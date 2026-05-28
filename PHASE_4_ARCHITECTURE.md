# Phase 4: Frontend Inventory Architecture

## Component Hierarchy

```
AdminDashboard
  └── Inventory (Main Component)
      ├── Header Section
      │   ├── Title & Description
      │   └── Action Buttons
      │       ├── Record Purchase Button
      │       └── Add Item Button
      │
      ├── Low Stock Alert Banner (conditional)
      │   └── List of low stock items
      │
      ├── Search & Filter Bar
      │   ├── Search Input
      │   └── Status Filter Dropdown
      │
      ├── Inventory Grid (responsive)
      │   └── Inventory Item Cards (map)
      │       ├── Item Info
      │       ├── Stock Details
      │       └── Action Buttons
      │           ├── Adjust Button
      │           └── Delete Button
      │
      ├── Empty State (conditional)
      │
      └── Modals (conditional rendering)
          ├── AddInventoryModal
          ├── AdjustStockModal
          └── RecordPurchaseModal
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     Component Mount                         │
└───────────────┬─────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│  loadInventory() + loadLowStockItems()                      │
│  ├── GET /api/bar/inventory/items?restaurantId=bar-001     │
│  └── GET /api/bar/inventory/low-stock?restaurantId=bar-001 │
└───────────────┬─────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│  setInventory(data) + setLowStockItems(data)                │
│  Loading complete, render UI                                │
└───────────────┬─────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│  Socket.io Connection Established                           │
│  ├── socket.on('inventory:updated', handler)                │
│  └── socket.on('inventory:low_stock', handler)              │
└─────────────────────────────────────────────────────────────┘
```

## User Interaction Flow

### Create New Inventory Item

```
User clicks "Add Item"
  ↓
Open AddInventoryModal
  ↓
Fetch bar menu items (GET /api/bar/menu/items)
  ↓
User fills form & submits
  ↓
POST /api/bar/inventory/items
  ↓
Success → Update local state
  ↓
Close modal & show alert
  ↓
Backend emits socket event → Other clients update
```

### Adjust Stock

```
User clicks "Adjust" on item card
  ↓
setSelectedItem(item)
  ↓
Open AdjustStockModal
  ↓
User enters quantity change & type
  ↓
Preview shows new stock level
  ↓
User submits form
  ↓
POST /api/bar/inventory/adjust-stock
  ↓
Success → alert + loadInventory()
  ↓
Close modal
  ↓
Backend emits socket event → Real-time update
```

### Record Purchase

```
User clicks "Record Purchase"
  ↓
Open RecordPurchaseModal
  ↓
User selects item from dropdown
  ↓
User enters quantity, cost, supplier
  ↓
User submits form
  ↓
POST /api/bar/inventory/record-purchase
  ↓
Success → alert + loadInventory()
  ↓
Close modal
  ↓
Stock levels updated in real-time
```

### Delete Item

```
User clicks trash icon
  ↓
confirm() dialog appears
  ↓
User confirms deletion
  ↓
DELETE /api/bar/inventory/items/:id
  ↓
Success → Remove from local state
  ↓
Show alert
  ↓
Backend emits update
```

## Real-Time Updates

```
┌─────────────────────────────────────────────────────────────┐
│  Backend: Stock level changes                               │
│  (via API call from any client)                             │
└───────────────┬─────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│  Backend emits Socket.io event                              │
│  socket.emit('inventory:updated', { item })                 │
└───────────────┬─────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│  All connected clients receive event                        │
│  socket.on('inventory:updated', ({ item }) => {...})        │
└───────────────┬─────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│  Frontend updates local state                               │
│  setInventory(prev => {                                     │
│    const index = prev.findIndex(i => i.id === item.id);    │
│    updated[index] = item;                                   │
│  })                                                          │
└───────────────┬─────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│  React re-renders with new data                             │
│  UI updates automatically (no refresh needed)               │
└─────────────────────────────────────────────────────────────┘
```

## State Management

```javascript
// Local State (Inventory Component)
const [inventory, setInventory] = useState([])           // All items
const [loading, setLoading] = useState(true)             // Initial load
const [lowStockItems, setLowStockItems] = useState([])   // Alert banner
const [searchTerm, setSearchTerm] = useState('')         // Search filter
const [filterStatus, setFilterStatus] = useState('all')  // Status filter

// Modal States
const [showAddModal, setShowAddModal] = useState(false)
const [showAdjustModal, setShowAdjustModal] = useState(false)
const [showPurchaseModal, setShowPurchaseModal] = useState(false)
const [selectedItem, setSelectedItem] = useState(null)   // For adjust modal

// Socket Connection
const socket = useSocket('bar-001')
```

## API Service Layer

```
barInventoryApi.js
├── parseResponse(res)          // Helper function
├── fetchBarInventory()         // GET all items
├── createInventoryItem(data)   // POST new item
├── updateInventoryItem(id, data) // PATCH existing
├── deleteInventoryItem(id)     // DELETE item
├── adjustStock(data)           // POST adjustment
├── recordPurchase(data)        // POST purchase
├── fetchTransactions(filters)  // GET history
├── fetchDailyReport(date)      // GET daily report
└── fetchLowStockItems()        // GET low stock
```

## Styling Architecture

```
Tailwind CSS Classes

Color Palette:
├── Primary:     bg-[#E53935] text-white
├── Success:     bg-green-600 text-white
├── Warning:     bg-amber-50 border-amber-500
├── Error:       bg-red-600 text-white
├── Neutral:     bg-gray-100 text-gray-600
└── Background:  bg-[#FFF5F5]

Layout:
├── Container:   space-y-6
├── Grid:        grid-cols-1 md:grid-cols-2 lg:grid-cols-3
├── Cards:       rounded-2xl shadow-xl p-6
├── Modals:      fixed inset-0 z-50
└── Buttons:     rounded-xl hover:scale-105 active:scale-95

Typography:
├── Headers:     font-black uppercase tracking-[0.2em]
├── Labels:      text-sm font-bold
├── Body:        text-sm text-gray-600
└── Buttons:     text-xs uppercase
```

## Error Handling Flow

```
API Call Initiated
  ↓
try {
  const result = await apiFunction()
  ↓
  Success → Update state
  ↓
  Show success alert
  ↓
  Reload data if needed
}
catch (error) {
  ↓
  console.error('[Component] Operation failed:', error)
  ↓
  alert(error.message)
  ↓
  Keep existing state (no changes)
}
```

## Stock Status Calculation

```javascript
getStockStatus(item) {
  const bottles = Math.floor(item.currentStock / item.bottleSize)
  const reorderBottles = Math.ceil(item.reorderLevel / item.bottleSize)

  if (item.currentStock <= 0) {
    return {
      status: 'out',
      label: 'Out of Stock',
      color: 'text-red-600'
    }
  }

  if (item.currentStock <= item.reorderLevel) {
    return {
      status: 'low',
      label: 'Low Stock',
      color: 'text-amber-600'
    }
  }

  return {
    status: 'ok',
    label: 'In Stock',
    color: 'text-green-600'
  }
}
```

## Search & Filter Logic

```javascript
filteredInventory = inventory.filter(item => {
  // Search by name
  const matchesSearch =
    item.menuItem?.name
      ?.toLowerCase()
      .includes(searchTerm.toLowerCase())

  // Filter by status
  const stockStatus = getStockStatus(item).status
  const matchesFilter =
    filterStatus === 'all' ||
    stockStatus === filterStatus

  return matchesSearch && matchesFilter
})
```

## Modal Component Structure

```
Modal Component
├── Fixed overlay (bg-black/50)
├── Centered container
│   ├── Header (title)
│   ├── Form
│   │   ├── Form fields
│   │   ├── Validation (HTML5 required)
│   │   └── Submit handler
│   └── Footer
│       ├── Cancel button → onClose()
│       └── Submit button → onSave(data)
└── Close on backdrop click (optional)
```

## Responsive Breakpoints

```
Mobile (< 640px):
├── Grid: 1 column
├── Buttons: Full width
├── Modal: Full screen padding
└── Font sizes: Base

Tablet (640px - 1024px):
├── Grid: 2 columns
├── Buttons: Auto width
├── Modal: Max width 640px
└── Font sizes: Slightly larger

Desktop (> 1024px):
├── Grid: 3 columns
├── Buttons: Auto width with padding
├── Modal: Max width 768px
└── Font sizes: Optimized for reading
```

## Performance Optimizations

```
Implemented:
├── Loading state prevents multiple fetches
├── Socket event cleanup on unmount
├── Memoized filter computation (implicit)
├── Optimistic UI updates (state before API)
└── Minimal re-renders (local state in modals)

Potential Future:
├── React.memo() for item cards
├── useCallback for event handlers
├── Virtualized list for 100+ items
├── Debounced search input
└── Pagination for large datasets
```

## Security Considerations

```
Current:
├── No authentication (internal use only)
├── Restaurant ID hardcoded ('bar-001')
├── All endpoints public
└── No rate limiting on frontend

Future (if needed):
├── JWT token authentication
├── Role-based access control
├── CSRF protection
├── Rate limiting
└── Audit logs
```

## Testing Strategy

```
Manual Testing:
├── CRUD operations
├── Real-time updates
├── Search & filter
├── Modal interactions
├── Error handling
└── Responsive design

Automated Testing (future):
├── Unit tests (Vitest)
├── Component tests (React Testing Library)
├── Integration tests (API mocking)
├── E2E tests (Playwright)
└── Visual regression tests
```

## Deployment Architecture

```
Frontend (Vercel):
├── Build: npm run build
├── Output: dist/
├── Environment: VITE_API_URL
└── Auto-deploy on main branch push

Backend (Render.com):
├── Inventory API endpoints
├── Socket.io server
├── PostgreSQL database
└── Real-time event emission

Connection:
Frontend ←→ HTTPS/WSS ←→ Backend
├── REST API calls
└── Socket.io (WebSocket)
```

## Database Schema (Backend Reference)

```sql
-- Inventory Items
CREATE TABLE bar_inventory (
  id UUID PRIMARY KEY,
  restaurant_id VARCHAR NOT NULL,
  menu_item_id UUID REFERENCES menu_items(id),
  bottle_size INTEGER NOT NULL,
  current_stock DECIMAL(10,2) NOT NULL,
  reorder_level DECIMAL(10,2) NOT NULL,
  cost_per_bottle DECIMAL(10,2),
  unit_of_measure VARCHAR DEFAULT 'ml',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Inventory Transactions
CREATE TABLE bar_inventory_transactions (
  id UUID PRIMARY KEY,
  restaurant_id VARCHAR NOT NULL,
  item_id UUID REFERENCES bar_inventory(id),
  type VARCHAR NOT NULL, -- ADJUSTMENT, WASTAGE, PURCHASE, SALE
  quantity_change DECIMAL(10,2) NOT NULL,
  notes TEXT,
  cost_per_bottle DECIMAL(10,2),
  supplier_name VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Future Enhancements Roadmap

```
Phase 5 (Potential):
├── Transaction History Viewer
├── Visual Analytics Dashboard
├── CSV Export/Import
├── Barcode Scanning
└── Automated Reorder Alerts

Phase 6 (Potential):
├── Multi-location Inventory
├── Stock Transfer Between Outlets
├── Expiry Date Tracking
├── Supplier Management
└── Purchase Order System
```

---

## Quick Reference: File Locations

```
Frontend:
├── src/admin/AdminComponents.jsx (Inventory component)
├── src/admin/AdminDashboard.jsx (renders Inventory)
├── src/services/barInventoryApi.js (API client)
├── src/hooks/useSocket.js (Socket.io hook)
└── src/services/apiConfig.js (API base URL)

Backend (reference):
├── routes/barInventoryRoutes.js
├── controllers/barInventoryController.js
├── services/barInventoryService.js
└── models/barInventoryModel.js
```

This architecture document provides a comprehensive overview of how the inventory management system is structured and how data flows through the application.
