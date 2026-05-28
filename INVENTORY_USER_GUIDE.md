# Bar Inventory Module - Simple User Guide

## What is this module?

The Bar Inventory Module helps you track liquor stock levels in your bar. It automatically reduces stock when customers order drinks and alerts you when stock is running low.

---

## 📍 How to Access

1. Open your Softshapeai app
2. Click **"Admin Login"** (top right)
3. Switch to **"Bar"** outlet (toggle at top)
4. Click **"Inventory"** tab in the left sidebar

---

## 🎯 Main Screen Overview

When you open Inventory, you'll see:

### Top Section
- **"Bar Inventory"** heading
- **"+ Record Purchase"** button (green) - Add new stock
- **"+ Add Item"** button (red) - Add new liquor items

### Low Stock Alert (if any items are low)
- **Amber banner** showing items that need restocking
- Example: "⚠️ 3 items need attention: Whiskey (2 bottles), Beer (5 bottles)"

### Search & Filter Bar
- **Search box** - Type drink name to find items
- **Filter dropdown** - Show All / In Stock / Low Stock / Out of Stock

### Inventory Grid
Cards showing each liquor item with:
- Item name and category
- Current stock (in bottles and ML)
- Reorder level
- Cost per bottle
- Status badge (Green = In Stock, Amber = Low, Red = Out)
- **"Adjust"** button - Change stock levels
- **Trash icon** - Delete item

---

## 🚀 Step-by-Step: How to Use

### **1. Adding Your First Item**

**Scenario:** You want to start tracking "Kingfisher Beer" inventory

**Steps:**
1. Click **"+ Add Item"** button (red, top right)
2. Modal opens with form:
   - **Select Menu Item:** Choose "Kingfisher Beer" from dropdown
   - **Bottle Size (ml):** Enter `330` (330ml bottle)
   - **Current Stock (ml):** Enter `3960` (12 bottles × 330ml)
   - **Reorder Level (ml):** Enter `1650` (5 bottles - when to reorder)
   - **Cost per Bottle:** Enter `60.00` (your purchase cost)
3. Click **"Create Item"**
4. ✅ Alert: "Inventory item created"
5. Item appears in the grid showing "12 bottles (3960 ml)"

**Tips:**
- Always calculate stock in ML: Bottles × Bottle Size
- Example: 10 bottles of 750ml whiskey = 7500 ml
- Reorder level: Set to 3-5 bottles worth to avoid stockouts

---

### **2. Recording New Stock Purchases**

**Scenario:** You bought 24 bottles of beer from supplier

**Steps:**
1. Click **"+ Record Purchase"** button (green, top right)
2. Modal opens with form:
   - **Select Item:** Choose "Kingfisher Beer"
   - **Quantity (ml):** Enter `7920` (24 bottles × 330ml)
   - **Supplier:** Enter "ABC Liquors"
   - **Cost per Bottle:** Enter `58.00` (this purchase price)
   - **Notes:** (Optional) "Invoice #12345"
3. Click **"Record Purchase"**
4. ✅ Alert: "Purchase recorded successfully"
5. Stock automatically increases: 12 → 36 bottles

**What happens behind the scenes:**
- Stock level increases
- Purchase transaction recorded in history
- Cost tracking updated
- If item was "Low Stock", alert disappears

---

### **3. Manual Stock Adjustments**

**Scenario:** 2 bottles broke or you need to correct stock count

**Steps:**
1. Find the item card in the grid
2. Click **"Adjust"** button
3. Modal opens with form:
   - Item name shown at top
   - **Current Stock:** Displays current amount (read-only)
   - **Quantity Change (ml):**
     - Enter `-660` (to reduce by 2 bottles)
     - Or enter `+330` (to add 1 bottle)
   - **Adjustment Type:** Choose from:
     - **ADJUSTMENT** - General correction
     - **WASTAGE** - Breakage, spoilage
     - **PURCHASE** - Manual stock addition
   - **Notes:** Enter reason (e.g., "2 bottles broke during delivery")
4. **Preview shows:** "New Stock: X bottles (Y ml)"
5. Click **"Adjust Stock"**
6. ✅ Alert: "Stock adjusted successfully"

**Quick Reference:**
- **Reduce stock:** Use negative number (e.g., `-750`)
- **Increase stock:** Use positive number (e.g., `+1500`)
- **Preview updates in real-time** as you type

---

### **4. Understanding Stock Status**

Each item shows a colored badge:

| Badge Color | Status | Meaning |
|-------------|--------|---------|
| 🟢 **Green** | In Stock | Stock is above reorder level |
| 🟠 **Amber** | Low Stock | Stock is AT or BELOW reorder level |
| 🔴 **Red** | Out of Stock | Stock is zero (0 bottles) |

**Example:**
- Whiskey has 3 bottles, reorder level is 5 bottles
- Badge shows: 🟠 **"Low Stock"** (amber)
- Time to reorder!

---

### **5. Searching & Filtering**

**Search by Name:**
1. Type in search box: "beer"
2. Only items with "beer" in name show
3. Clear search box to see all items again

**Filter by Status:**
1. Click dropdown (shows "All Items")
2. Select:
   - **All Items** - Everything
   - **In Stock** - Only green badge items
   - **Low Stock** - Only amber badge items
   - **Out of Stock** - Only red badge items (0 bottles)
3. Grid updates instantly

**Use Cases:**
- Find all low stock items: Select "Low Stock" filter
- Check what beer you have: Search "beer"
- See items needing immediate reorder: Filter "Out of Stock"

---

### **6. Deleting an Item**

**Scenario:** You no longer sell a liquor item

**Steps:**
1. Find the item card
2. Click **trash icon** (red, bottom right of card)
3. Confirmation popup: "Are you sure you want to delete this inventory item?"
4. Click **"OK"** to confirm (or Cancel to abort)
5. ✅ Alert: "Inventory item deleted"
6. Item disappears from grid

**Warning:** This is permanent! Transaction history for this item is also deleted.

---

## 🔄 Automatic Features

### **1. Auto Stock Deduction on Sales**

**How it works:**
- Customer orders "Whiskey 60ml" at a table
- Captain adds order via KOT
- Customer pays bill at cashier
- **Automatically:** System deducts 60ml from Whiskey inventory
- No manual action needed!

**What gets deducted:**
- **30ml peg:** Reduces stock by 30ml
- **60ml peg:** Reduces stock by 60ml
- **Full bottle:** Reduces stock by entire bottle size (750ml/650ml)
- **Multiple quantities:** 3 × 60ml = 180ml deducted

**Behind the scenes:**
- System matches order item to menu item
- Finds serving size from item name or variant price
- Deducts exact ML consumed
- Records transaction with order ID
- Triggers low stock alert if needed

---

### **2. Real-Time Updates**

**Scenario:** Two admins are logged in

**What happens:**
- Admin 1 adjusts Whiskey stock from 5 → 10 bottles
- **Instantly:** Admin 2's screen updates to show 10 bottles
- No page refresh needed!

**Powered by:** Socket.io real-time communication

---

### **3. Low Stock Alerts**

**When triggered:**
- Item stock drops to reorder level or below
- Example: Reorder level is 5 bottles, stock hits 4 bottles

**What you see:**
- 🟠 **Amber banner** at top of page
- "⚠️ 3 items need attention"
- List of items: "Whiskey (4 bottles), Beer (2 bottles), Vodka (1 bottle)"
- Item badges turn amber

**How to clear alert:**
- Record purchase to bring stock above reorder level
- Alert automatically disappears

---

## 📊 Reading the Inventory Cards

Each card shows:

```
┌─────────────────────────────────────┐
│ 🍺 Kingfisher Beer                  │
│ Category: Beer                      │
│                                     │
│ 📦 Current Stock                    │
│    12 bottles (3960 ml)             │
│                                     │
│ 🔔 Reorder At                       │
│    5 bottles (1650 ml)              │
│                                     │
│ 💰 Cost                             │
│    ₹60.00 per bottle                │
│                                     │
│ [🟢 In Stock]                       │
│                                     │
│ [Adjust] 🗑️                         │
└─────────────────────────────────────┘
```

**Understanding the numbers:**
- **12 bottles** = Actual bottles you have
- **(3960 ml)** = Total ML remaining
- **Reorder At 5 bottles** = Alert triggers when ≤ 5 bottles left
- **₹60.00 per bottle** = Your purchase cost (for margin tracking)

---

## 💡 Best Practices

### **Setting Reorder Levels**
- **High-selling items:** Set to 7-10 bottles
- **Moderate sellers:** Set to 4-6 bottles
- **Slow-moving items:** Set to 2-3 bottles
- **Formula:** Weekly sales × 1.5 weeks of buffer

### **Recording Purchases Immediately**
- Don't wait days to record purchases
- Record when delivery arrives
- Helps track real-time stock accuracy

### **Weekly Stock Audits**
1. Physically count bottles once a week
2. Compare with system count
3. Use "Adjust" to fix any differences
4. Select "ADJUSTMENT" type and note: "Weekly audit correction"

### **Using Notes Field**
Always add notes when adjusting stock:
- ✅ "2 bottles broke during delivery"
- ✅ "End-of-month physical count correction"
- ✅ "Returned expired stock to supplier"
- ❌ "" (empty - not helpful later)

---

## ⚙️ Common Scenarios

### **Scenario 1: Starting Fresh**

**You have no inventory items yet**

1. Count all liquor bottles physically
2. For each item:
   - Click "+ Add Item"
   - Select menu item
   - Enter bottle size (check bottle label)
   - Calculate current stock: Bottles × Bottle size
   - Set reorder level (see best practices)
   - Enter cost (check invoice)
   - Submit
3. Repeat for all liquor items
4. ✅ Inventory system is live!

---

### **Scenario 2: Daily Supplier Delivery**

**Every morning, supplier delivers stock**

1. Click "+ Record Purchase"
2. For each item delivered:
   - Select item from dropdown
   - Calculate quantity: Bottles delivered × Bottle size
   - Enter supplier name
   - Enter cost (from invoice)
   - Add invoice number in notes
   - Submit
3. Check that low stock alerts clear
4. File invoice for accounting

---

### **Scenario 3: Monthly Stock Audit**

**Last day of month, you count all bottles**

1. Print/export current inventory list (or view on tablet)
2. Physically count each item
3. For each mismatch:
   - Click "Adjust" on that item
   - Calculate difference: (Physical count × Bottle size) - System stock
   - Enter as quantity change
   - Select "ADJUSTMENT" type
   - Note: "March 2024 month-end audit"
   - Submit
4. All counts now match physical stock

---

### **Scenario 4: Breakage/Wastage**

**Waiter dropped 3 beer bottles**

1. Find "Kingfisher Beer" card
2. Click "Adjust"
3. Enter `-990` (3 bottles × 330ml)
4. Select **"WASTAGE"** type
5. Note: "Dropped by waiter during service"
6. Submit
7. Stock reduces by 3 bottles

---

### **Scenario 5: Checking What Needs Reordering**

**Before calling supplier**

1. Select filter: **"Low Stock"**
2. All items needing reorder show
3. Note down item names and how many bottles needed
4. Call supplier with order list
5. When delivered, use "+ Record Purchase"

---

## 🎓 Training Checklist

**For new bar managers:**

- [ ] Can access Inventory tab
- [ ] Understands 3 main buttons (Add/Adjust/Purchase)
- [ ] Can add a new item with correct ML calculation
- [ ] Can record a purchase delivery
- [ ] Can manually adjust stock with reason
- [ ] Understands low stock alerts
- [ ] Can use search to find items
- [ ] Can filter by stock status
- [ ] Knows how to do weekly audit

---

## ❓ Quick Troubleshooting

### **Q: Item not showing in "Add Item" dropdown**
**A:** Go to Menu Management first and create the bar menu item, then come back to Inventory.

---

### **Q: Stock showing incorrect after sales**
**A:** Check that menu item has correct serving size in name (e.g., "Whiskey 60ml") or in variant names. System uses this to deduct correct amount.

---

### **Q: Low stock alert not clearing after purchase**
**A:** Ensure purchase quantity brings stock ABOVE reorder level, not just equal to it.

---

### **Q: Can't delete an item**
**A:** Click trash icon, then click OK on confirmation. If still fails, item may have active transactions - contact admin.

---

### **Q: Numbers showing in ML are confusing**
**A:** Focus on the bottles number (in bold). ML is just for system accuracy. Example: "12 bottles (3960 ml)" - you have 12 bottles.

---

### **Q: How do I view transaction history?**
**A:** Not yet available in UI (coming soon). For now, system logs all changes in background database.

---

## 📞 Support

**Need help?**
- Check this guide first
- Ask your admin/owner
- Contact: varunkumar06011 (GitHub owner)

---

## 🔮 Coming Soon

Features in development:
- 📊 **Transaction History Tab** - View all stock changes over time
- 📈 **Reports Dashboard** - Charts showing consumption trends
- 🔔 **Toast Notifications** - Better alerts instead of popups
- 📤 **Export to Excel** - Download inventory reports
- 📱 **Barcode Scanning** - Quick stock updates via phone camera

---

**Version:** 1.0.0
**Last Updated:** May 28, 2026
**Module Status:** ✅ Production Ready
