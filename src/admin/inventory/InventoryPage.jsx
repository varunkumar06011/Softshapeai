// ─────────────────────────────────────────────────────────────────────────────
// InventoryPage — top-level inventory page with Bar/Kitchen tabs
// ─────────────────────────────────────────────────────────────────────────────
// Replaces the old InventorySection in adminRoutes.jsx.
// Tab logic (bar/kitchen/both) is handled here, preserving the existing
// enabledModules checks and outlet switching behavior.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { TAB_BAR, TAB_KITCHEN } from './inventoryConstants';
import { useInventoryData } from './useInventoryData';
import { InventorySummaryCards } from './InventorySummaryCards';
import { InventoryToolbar } from './InventoryToolbar';
import { InventoryTable } from './InventoryTable';
import { AddItemModal } from './AddItemModal';
import { EditItemModal } from './EditItemModal';
import { RecordPurchaseModal } from './RecordPurchaseModal';
import { StockAdjustmentModal } from './StockAdjustmentModal';
import { ItemDetailsDrawer } from './ItemDetailsDrawer';

export function InventoryPage() {
  const { restaurant } = useAuth();
  const enabledModules = restaurant?.enabledModules || {};

  const hasBar = enabledModules.bar_inventory === true || enabledModules.bar === true;
  const hasFood = enabledModules.food !== false;

  // Determine initial tab
  const [tab, setTab] = useState(hasBar ? TAB_BAR : TAB_KITCHEN);

  // Modal state
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [purchaseItem, setPurchaseItem] = useState(null);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [adjustItem, setAdjustItem] = useState(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [viewItem, setViewItem] = useState(null);
  const [viewOpen, setViewOpen] = useState(false);

  // Data hook
  const inventory = useInventoryData(tab, restaurant);

  const handleAddItem = () => setAddItemOpen(true);
  const handleRecordPurchase = () => {
    if (!purchaseItem && inventory.items.length === 0) {
      alert('Add an inventory item first before recording a purchase.');
      return;
    }
    setPurchaseOpen(true);
  };
  const handleStockAdjustment = () => {
    if (!adjustItem && inventory.items.length === 0) {
      alert('Add an inventory item first before adjusting stock.');
      return;
    }
    setAdjustOpen(true);
  };
  const handleImport = () => {
    // Import is handled by the existing kitchen CSV import flow
    // For now, this is a placeholder that can be wired to the existing import
    alert('Import functionality will be wired to the existing CSV import flow.');
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setEditOpen(true);
  };

  const handleView = (item) => {
    setViewItem(item);
    setViewOpen(true);
  };

  // Per-item actions from the drawer — close drawer, set the item, open modal
  const handleDrawerPurchase = (item) => {
    setViewItem(null);
    setViewOpen(false);
    setPurchaseItem(item);
    setPurchaseOpen(true);
  };
  const handleDrawerAdjust = (item) => {
    setViewItem(null);
    setViewOpen(false);
    setAdjustItem(item);
    setAdjustOpen(true);
  };

  const handleSaved = () => {
    inventory.refresh();
  };

  // Food-only outlet: no tab bar needed
  if (!hasBar && hasFood) {
    return (
      <InventoryContent
        tab={TAB_KITCHEN}
        inventory={inventory}
        onAddItem={handleAddItem}
        onRecordPurchase={handleRecordPurchase}
        onStockAdjustment={handleStockAdjustment}
        onImport={handleImport}
        onEdit={handleEdit}
        onView={handleView}
        modals={
          <>
            <AddItemModal open={addItemOpen} onClose={() => setAddItemOpen(false)} tab={TAB_KITCHEN} onSaved={handleSaved} />
            <EditItemModal open={editOpen} item={editItem} tab={TAB_KITCHEN} onClose={() => setEditOpen(false)} onSaved={handleSaved} />
            <RecordPurchaseModal open={purchaseOpen} item={purchaseItem || inventory.items[0]} tab={TAB_KITCHEN} onClose={() => setPurchaseOpen(false)} onSaved={handleSaved} />
            <StockAdjustmentModal open={adjustOpen} item={adjustItem || inventory.items[0]} tab={TAB_KITCHEN} onClose={() => setAdjustOpen(false)} onSaved={handleSaved} />
            <ItemDetailsDrawer open={viewOpen} item={viewItem} tab={TAB_KITCHEN} onClose={() => setViewOpen(false)} onRecordPurchase={handleDrawerPurchase} onStockAdjustment={handleDrawerAdjust} />
          </>
        }
      />
    );
  }

  // Bar-only outlet: no tab bar needed
  if (hasBar && !hasFood) {
    return (
      <InventoryContent
        tab={TAB_BAR}
        inventory={inventory}
        onAddItem={handleAddItem}
        onRecordPurchase={handleRecordPurchase}
        onStockAdjustment={handleStockAdjustment}
        onImport={handleImport}
        onEdit={handleEdit}
        onView={handleView}
        modals={
          <>
            <AddItemModal open={addItemOpen} onClose={() => setAddItemOpen(false)} tab={TAB_BAR} onSaved={handleSaved} />
            <EditItemModal open={editOpen} item={editItem} tab={TAB_BAR} onClose={() => setEditOpen(false)} onSaved={handleSaved} />
            <RecordPurchaseModal open={purchaseOpen} item={purchaseItem || inventory.items[0]} tab={TAB_BAR} onClose={() => setPurchaseOpen(false)} onSaved={handleSaved} />
            <StockAdjustmentModal open={adjustOpen} item={adjustItem || inventory.items[0]} tab={TAB_BAR} onClose={() => setAdjustOpen(false)} onSaved={handleSaved} />
            <ItemDetailsDrawer open={viewOpen} item={viewItem} tab={TAB_BAR} onClose={() => setViewOpen(false)} onRecordPurchase={handleDrawerPurchase} onStockAdjustment={handleDrawerAdjust} />
          </>
        }
      />
    );
  }

  // Bar + dining outlet: show tabs
  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setTab(TAB_BAR)}
          className={`px-4 py-3 font-bold text-sm transition-all ${
            tab === TAB_BAR ? 'border-b-2 border-[#E53935] text-[#E53935]' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Bar Inventory
        </button>
        <button
          onClick={() => setTab(TAB_KITCHEN)}
          className={`px-4 py-3 font-bold text-sm transition-all ${
            tab === TAB_KITCHEN ? 'border-b-2 border-[#E53935] text-[#E53935]' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Kitchen Inventory
        </button>
      </div>

      <InventoryContent
        tab={tab}
        inventory={inventory}
        onAddItem={handleAddItem}
        onRecordPurchase={handleRecordPurchase}
        onStockAdjustment={handleStockAdjustment}
        onImport={handleImport}
        onEdit={handleEdit}
        onView={handleView}
        modals={
          <>
            <AddItemModal open={addItemOpen} onClose={() => setAddItemOpen(false)} tab={tab} onSaved={handleSaved} />
            <EditItemModal open={editOpen} item={editItem} tab={tab} onClose={() => setEditOpen(false)} onSaved={handleSaved} />
            <RecordPurchaseModal open={purchaseOpen} item={purchaseItem || inventory.items[0]} tab={tab} onClose={() => setPurchaseOpen(false)} onSaved={handleSaved} />
            <StockAdjustmentModal open={adjustOpen} item={adjustItem || inventory.items[0]} tab={tab} onClose={() => setAdjustOpen(false)} onSaved={handleSaved} />
            <ItemDetailsDrawer open={viewOpen} item={viewItem} tab={tab} onClose={() => setViewOpen(false)} onRecordPurchase={handleDrawerPurchase} onStockAdjustment={handleDrawerAdjust} />
          </>
        }
      />
    </div>
  );
}

// Inner content component (shared between all outlet types)
function InventoryContent({ tab, inventory, onAddItem, onRecordPurchase, onStockAdjustment, onImport, onEdit, onView, modals }) {
  const { loading, error } = inventory;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <InventorySummaryCards
        summary={inventory.summary}
        filterStatus={inventory.filterStatus}
        setFilterStatus={inventory.setFilterStatus}
      />

      {/* Toolbar */}
      <InventoryToolbar
        search={inventory.search}
        setSearch={inventory.setSearch}
        category={inventory.category}
        setCategory={inventory.setCategory}
        categories={inventory.categories}
        onAddItem={onAddItem}
        onRecordPurchase={onRecordPurchase}
        onStockAdjustment={onStockAdjustment}
        onImport={onImport}
      />

      {/* Error state */}
      {error && (
        <div className="bg-red-50 text-red-600 text-sm rounded-lg p-4">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
          Loading inventory...
        </div>
      ) : (
        /* Table */
        <InventoryTable
          items={inventory.pagedItems}
          tab={tab}
          page={inventory.page}
          totalPages={inventory.totalPages}
          setPage={inventory.setPage}
          onEdit={onEdit}
          onView={onView}
        />
      )}

      {/* Modals */}
      {modals}
    </div>
  );
}
