// ─────────────────────────────────────────────────────────────────────────────
// InventoryPage — top-level inventory page with Bar/Kitchen tabs
// ─────────────────────────────────────────────────────────────────────────────
// Replaces the old InventorySection in adminRoutes.jsx.
// Tab logic (bar/kitchen/both) is handled here, preserving the existing
// enabledModules checks and outlet switching behavior.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { TAB_BAR, TAB_KITCHEN, TAB_RECONCILIATION } from './inventoryConstants';
import { useInventoryData } from './useInventoryData';
import { InventorySummaryCards } from './InventorySummaryCards';
import { InventoryToolbar } from './InventoryToolbar';
import { InventoryTable } from './InventoryTable';
import { CombinedBarTable } from './CombinedBarTable';
import { InventoryReconciliation } from './InventoryReconciliation';
import { AddItemModal } from './AddItemModal';
import { EditItemModal } from './EditItemModal';
import { RecordPurchaseModal } from './RecordPurchaseModal';
import { StockAdjustmentModal } from './StockAdjustmentModal';
import { ItemDetailsDrawer } from './ItemDetailsDrawer';
import { StockSheetPrintModal } from './StockSheetPrintModal';
import LiquorDailyReportModal from './LiquorDailyReportModal';
import { NonAcDeductionModal } from './NonAcDeductionModal';
import { fetchCombinedInventory } from '../../services/barInventoryApi';
import { getKolkataDateString } from '../../shared/utils/dateFormat';

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
  const [printSheetOpen, setPrintSheetOpen] = useState(false);
  const [liquorReportOpen, setLiquorReportOpen] = useState(false);
  const [nonAcDeductItem, setNonAcDeductItem] = useState(null);
  const [nonAcDeductOpen, setNonAcDeductOpen] = useState(false);

  // Combined bar inventory (AC + Non-AC)
  const [combinedItems, setCombinedItems] = useState([]);
  const [combinedSummary, setCombinedSummary] = useState(null);
  const [combinedLoading, setCombinedLoading] = useState(false);

  // Data hook
  const inventory = useInventoryData(tab, restaurant);

  // Fetch combined bar inventory when tab is bar
  const fetchCombined = useCallback(async () => {
    if (tab !== TAB_BAR || !restaurant?.id) return;
    setCombinedLoading(true);
    try {
      const today = getKolkataDateString();
      const opts = {
        fromDate: inventory.fromDate || today,
        toDate: inventory.toDate || inventory.fromDate || today,
      };
      const data = await fetchCombinedInventory(opts);
      setCombinedItems(data?.items || []);
      setCombinedSummary(data?.summary || null);
    } catch {
      setCombinedItems([]);
      setCombinedSummary(null);
    } finally {
      setCombinedLoading(false);
    }
  }, [tab, restaurant?.id, inventory.fromDate, inventory.toDate]);

  useEffect(() => { fetchCombined(); }, [fetchCombined]);

  const handleAddItem = () => setAddItemOpen(true);
  const handleRecordPurchase = () => {
    if (inventory.items.length === 0) {
      alert('Add an inventory item first before recording a purchase.');
      return;
    }
    // Do NOT default to inventory.items[0] — the modal opens an item picker
    // step when no item is pre-selected, so the user must choose explicitly.
    setPurchaseOpen(true);
  };
  const handleStockAdjustment = () => {
    if (inventory.items.length === 0) {
      alert('Add an inventory item first before adjusting stock.');
      return;
    }
    // Do NOT default to inventory.items[0] — the modal opens an item picker
    // step when no item is pre-selected, so the user must choose explicitly.
    setAdjustOpen(true);
  };
  const handleImport = () => {
    // Import is handled by the existing kitchen CSV import flow
    // For now, this is a placeholder that can be wired to the existing import
    alert('Import functionality will be wired to the existing CSV import flow.');
  };

  const handlePrintSheet = () => setPrintSheetOpen(true);
  const handleLiquorReport = () => setLiquorReportOpen(true);

  const handleNonAcDeduct = (item) => {
    setNonAcDeductItem(item);
    setNonAcDeductOpen(true);
  };

  const handleNonAcSaved = () => {
    fetchCombined();
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
    fetchCombined();
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
        onPrintSheet={handlePrintSheet}
        onEdit={handleEdit}
        onView={handleView}
        combinedItems={[]}
        combinedLoading={false}
        combinedSummary={null}
        onNonAcDeduct={null}
        onRefresh={handleSaved}
        modals={
          <>
            <AddItemModal open={addItemOpen} onClose={() => setAddItemOpen(false)} tab={TAB_KITCHEN} onSaved={handleSaved} />
            <EditItemModal open={editOpen} item={editItem} tab={TAB_KITCHEN} onClose={() => setEditOpen(false)} onSaved={handleSaved} />
            <RecordPurchaseModal open={purchaseOpen} item={purchaseItem} items={inventory.items} tab={TAB_KITCHEN} onClose={() => setPurchaseOpen(false)} onSaved={handleSaved} />
            <StockAdjustmentModal open={adjustOpen} item={adjustItem} items={inventory.items} tab={TAB_KITCHEN} onClose={() => setAdjustOpen(false)} onSaved={handleSaved} />
            <ItemDetailsDrawer open={viewOpen} item={viewItem} tab={TAB_KITCHEN} onClose={() => setViewOpen(false)} onRecordPurchase={handleDrawerPurchase} onStockAdjustment={handleDrawerAdjust} />
            <StockSheetPrintModal open={printSheetOpen} tab={TAB_KITCHEN} restaurant={restaurant} defaultDate={inventory.fromDate || undefined} onClose={() => setPrintSheetOpen(false)} />
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
        onPrintSheet={handlePrintSheet}
        onLiquorReport={handleLiquorReport}
        onEdit={handleEdit}
        onView={handleView}
        combinedItems={combinedItems}
        combinedLoading={combinedLoading}
        combinedSummary={combinedSummary}
        onNonAcDeduct={handleNonAcDeduct}
        onRefresh={handleSaved}
        modals={
          <>
            <AddItemModal open={addItemOpen} onClose={() => setAddItemOpen(false)} tab={TAB_BAR} onSaved={handleSaved} />
            <EditItemModal open={editOpen} item={editItem} tab={TAB_BAR} date={inventory.fromDate || undefined} onClose={() => setEditOpen(false)} onSaved={handleSaved} />
            <RecordPurchaseModal open={purchaseOpen} item={purchaseItem} items={combinedItems.length > 0 ? combinedItems : inventory.items} tab={TAB_BAR} onClose={() => setPurchaseOpen(false)} onSaved={handleSaved} />
            <StockAdjustmentModal open={adjustOpen} item={adjustItem} items={combinedItems.length > 0 ? combinedItems : inventory.items} tab={TAB_BAR} onClose={() => setAdjustOpen(false)} onSaved={handleSaved} />
            <ItemDetailsDrawer open={viewOpen} item={viewItem} tab={TAB_BAR} onClose={() => setViewOpen(false)} onRecordPurchase={handleDrawerPurchase} onStockAdjustment={handleDrawerAdjust} />
            <StockSheetPrintModal open={printSheetOpen} tab={TAB_BAR} restaurant={restaurant} defaultDate={inventory.fromDate || undefined} onClose={() => setPrintSheetOpen(false)} />
            <LiquorDailyReportModal open={liquorReportOpen} date={inventory.fromDate || undefined} onClose={() => setLiquorReportOpen(false)} onSaved={handleSaved} />
            <NonAcDeductionModal open={nonAcDeductOpen} item={nonAcDeductItem} date={inventory.fromDate || undefined} onClose={() => setNonAcDeductOpen(false)} onSaved={handleNonAcSaved} />
          </>
        }
      />
    );
  }

  // Bar + dining outlet: show tabs
  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-2 border-b border-gray-200 overflow-x-auto flex-nowrap [&::-webkit-scrollbar]:hidden [scrollbar-width:none] [-ms-overflow-style:none]">
        <button
          onClick={() => setTab(TAB_BAR)}
          className={`px-4 py-3 font-bold text-sm transition-all whitespace-nowrap shrink-0 ${
            tab === TAB_BAR ? 'border-b-2 border-[#E53935] text-[#E53935]' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Bar Inventory
        </button>
        <button
          onClick={() => setTab(TAB_KITCHEN)}
          className={`px-4 py-3 font-bold text-sm transition-all whitespace-nowrap shrink-0 ${
            tab === TAB_KITCHEN ? 'border-b-2 border-[#E53935] text-[#E53935]' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Kitchen Inventory
        </button>
        <button
          onClick={() => setTab(TAB_RECONCILIATION)}
          className={`px-4 py-3 font-bold text-sm transition-all whitespace-nowrap shrink-0 ${
            tab === TAB_RECONCILIATION ? 'border-b-2 border-[#E53935] text-[#E53935]' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Reconciliation
        </button>
      </div>

      {tab === TAB_RECONCILIATION ? (
        <InventoryReconciliation />
      ) : (
        <InventoryContent
        tab={tab}
        inventory={inventory}
        onAddItem={handleAddItem}
        onRecordPurchase={handleRecordPurchase}
        onStockAdjustment={handleStockAdjustment}
        onImport={handleImport}
        onPrintSheet={handlePrintSheet}
        onLiquorReport={handleLiquorReport}
        onEdit={handleEdit}
        onView={handleView}
        combinedItems={combinedItems}
        combinedLoading={combinedLoading}
        combinedSummary={combinedSummary}
        onNonAcDeduct={handleNonAcDeduct}
        onRefresh={handleSaved}
        modals={
          <>
            <AddItemModal open={addItemOpen} onClose={() => setAddItemOpen(false)} tab={tab} onSaved={handleSaved} />
            <EditItemModal open={editOpen} item={editItem} tab={tab} date={inventory.fromDate || undefined} onClose={() => setEditOpen(false)} onSaved={handleSaved} />
            <RecordPurchaseModal open={purchaseOpen} item={purchaseItem} items={tab === 'bar' && combinedItems.length > 0 ? combinedItems : inventory.items} tab={tab} onClose={() => setPurchaseOpen(false)} onSaved={handleSaved} />
            <StockAdjustmentModal open={adjustOpen} item={adjustItem} items={tab === 'bar' && combinedItems.length > 0 ? combinedItems : inventory.items} tab={tab} onClose={() => setAdjustOpen(false)} onSaved={handleSaved} />
            <ItemDetailsDrawer open={viewOpen} item={viewItem} tab={tab} onClose={() => setViewOpen(false)} onRecordPurchase={handleDrawerPurchase} onStockAdjustment={handleDrawerAdjust} />
            <StockSheetPrintModal open={printSheetOpen} tab={tab} restaurant={restaurant} defaultDate={inventory.fromDate || undefined} onClose={() => setPrintSheetOpen(false)} />
            <LiquorDailyReportModal open={liquorReportOpen} date={inventory.fromDate || undefined} onClose={() => setLiquorReportOpen(false)} onSaved={handleSaved} />
            <NonAcDeductionModal open={nonAcDeductOpen} item={nonAcDeductItem} date={inventory.fromDate || undefined} onClose={() => setNonAcDeductOpen(false)} onSaved={handleNonAcSaved} />
          </>
        }
      />
      )}
    </div>
  );
}

// Inner content component (shared between all outlet types)
function InventoryContent({ tab, inventory, onAddItem, onRecordPurchase, onStockAdjustment, onImport, onPrintSheet, onLiquorReport, onEdit, onView, modals, combinedItems, combinedLoading, combinedSummary, onNonAcDeduct, onRefresh }) {
  const { loading, error } = inventory;

  return (
    <div className="space-y-4">
      {/* Business Position summary cards (bar only — 16 cards) */}
      {tab === 'bar' && combinedSummary && (
        <InventorySummaryCards summary={combinedSummary} />
      )}

      {/* Toolbar */}
      <InventoryToolbar
        search={inventory.search}
        setSearch={inventory.setSearch}
        category={inventory.category}
        setCategory={inventory.setCategory}
        categories={inventory.categories}
        fromDate={inventory.fromDate}
        setFromDate={inventory.setFromDate}
        toDate={inventory.toDate}
        setToDate={inventory.setToDate}
        onAddItem={onAddItem}
        onRecordPurchase={onRecordPurchase}
        onStockAdjustment={onStockAdjustment}
        onImport={onImport}
        onPrintSheet={onPrintSheet}
        onLiquorReport={tab === 'bar' ? onLiquorReport : undefined}
      />

      {/* Error state */}
      {error && (
        <div className="bg-red-50 text-red-600 text-sm rounded-lg p-4">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading || (tab === 'bar' && combinedLoading) ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
          Loading inventory...
        </div>
      ) : tab === 'bar' ? (
        /* Combined AC + Non-AC table for bar */
        <CombinedBarTable
          items={combinedItems}
          search={inventory.search}
          onNonAcDeduct={onNonAcDeduct}
          onEdit={onEdit}
          onView={onView}
          onRefresh={onRefresh}
          date={inventory.fromDate || undefined}
        />
      ) : (
        /* Kitchen table */
        <InventoryTable
          items={inventory.pagedItems}
          tab={tab}
          page={inventory.page}
          totalPages={inventory.totalPages}
          setPage={inventory.setPage}
          onEdit={onEdit}
          onView={onView}
          onRefresh={onRefresh}
        />
      )}

      {/* Modals */}
      {modals}
    </div>
  );
}
