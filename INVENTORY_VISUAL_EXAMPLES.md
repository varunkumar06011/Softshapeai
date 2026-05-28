# Bar Inventory - Visual Examples & Walkthroughs

## 🎬 Complete Example: From Zero to Fully Tracked

Let's follow **"The Sunset Bar"** as they set up inventory for the first time.

---

## Day 1: Initial Setup (Monday Morning)

### Step 1: Taking Stock
Manager counts the liquor cabinet:
- 8 bottles of Johnnie Walker Black (750ml each)
- 15 bottles of Absolut Vodka (750ml each)
- 24 bottles of Kingfisher Beer (330ml each)
- 12 bottles of Bacardi White Rum (750ml each)

### Step 2: Adding First Item - Johnnie Walker

**Screen View:**
```
┌─────────────────────────────────────────────┐
│  Bar Inventory                              │
│  Manage liquor stock levels and purchases   │
│                                             │
│  [+ Record Purchase]  [+ Add Item]          │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  📦 No inventory items found                │
│  Click "+ Add Item" to get started          │
└─────────────────────────────────────────────┘
```

**Manager clicks "+ Add Item"**

```
┌───────────────────────────────┐
│  Add Inventory Item       [X] │
├───────────────────────────────┤
│                               │
│  Select Menu Item *           │
│  [Johnnie Walker Black ▼]     │
│                               │
│  Bottle Size (ml) *           │
│  [750_____________]           │
│                               │
│  Current Stock (ml) *         │
│  [6000____________]           │← 8 bottles × 750ml
│                               │
│  Reorder Level (ml) *         │
│  [3750____________]           │← 5 bottles × 750ml
│                               │
│  Cost per Bottle              │
│  [1500____________]           │
│                               │
│         [Create Item]         │
└───────────────────────────────┘
```

**After clicking "Create Item":**
```
✅ Inventory item created
```

**Grid now shows:**
```
┌─────────────────────────────────────┐
│ 🥃 Johnnie Walker Black             │
│ Category: Whiskey                   │
│                                     │
│ 📦 Current Stock                    │
│    8 bottles (6000 ml)              │
│                                     │
│ 🔔 Reorder At                       │
│    5 bottles (3750 ml)              │
│                                     │
│ 💰 Cost                             │
│    ₹1,500.00 per bottle             │
│                                     │
│ [🟢 In Stock]                       │
│                                     │
│ [Adjust] 🗑️                         │
└─────────────────────────────────────┘
```

### Step 3: Adding Other Items

Manager repeats for:
- Absolut Vodka: 15 bottles (11,250ml), reorder at 7 bottles (5,250ml)
- Kingfisher Beer: 24 bottles (7,920ml), reorder at 10 bottles (3,300ml)
- Bacardi Rum: 12 bottles (9,000ml), reorder at 6 bottles (4,500ml)

**Grid after all added:**
```
┌────────────┬────────────┬────────────┬────────────┐
│ Johnnie    │ Absolut    │ Kingfisher │ Bacardi    │
│ Walker     │ Vodka      │ Beer       │ Rum        │
│ Black      │            │            │            │
│            │            │            │            │
│ 8 bottles  │ 15 bottles │ 24 bottles │ 12 bottles │
│ (6000 ml)  │ (11250 ml) │ (7920 ml)  │ (9000 ml)  │
│            │            │            │            │
│ Reorder: 5 │ Reorder: 7 │ Reorder:10 │ Reorder: 6 │
│            │            │            │            │
│🟢 In Stock │🟢 In Stock │🟢 In Stock │🟢 In Stock │
└────────────┴────────────┴────────────┴────────────┘
```

✅ **Inventory system is now live!**

---

## Day 3: First Sales (Wednesday Evening)

### What Happened During the Day:
- Table 5 ordered: 3 × Whiskey 60ml
- Table 8 ordered: 2 × Vodka 60ml, 1 × Beer Full Bottle
- Table 12 ordered: 5 × Beer Full Bottle

**Cashier processed payments for all tables**

### Automatic Stock Deduction:

**Before sales:**
```
Johnnie Walker: 8 bottles (6000ml)
Absolut Vodka:  15 bottles (11250ml)
Kingfisher:     24 bottles (7920ml)
```

**After automatic deduction:**
```
Johnnie Walker: 7.76 bottles (5820ml)  ← Reduced by 180ml (3×60ml)
Absolut Vodka:  14.84 bottles (11130ml) ← Reduced by 120ml (2×60ml)
Kingfisher:     18 bottles (5940ml)     ← Reduced by 1980ml (6×330ml)
```

**Manager checks inventory next morning:**
```
┌────────────┬────────────┬────────────┐
│ Johnnie    │ Absolut    │ Kingfisher │
│ Walker     │ Vodka      │ Beer       │
│            │            │            │
│ 7 bottles  │ 14 bottles │ 18 bottles │← Updated!
│ (5820 ml)  │ (11130 ml) │ (5940 ml)  │
│            │            │            │
│🟢 In Stock │🟢 In Stock │🟢 In Stock │
└────────────┴────────────┴────────────┘
```

💡 **Manager didn't do anything - system auto-deducted!**

---

## Day 5: Low Stock Alert (Friday Morning)

After busy week, Kingfisher stock drops below reorder level.

**Screen shows:**
```
┌─────────────────────────────────────────────────────┐
│ ⚠️  1 item needs attention                          │
│                                                     │
│ • Kingfisher Beer (9 bottles) - Below reorder      │
│   level of 10 bottles                              │
└─────────────────────────────────────────────────────┘

Search: [_________________]  Filter: [All Items ▼]

┌────────────┬────────────┬────────────┐
│ Johnnie    │ Absolut    │ Kingfisher │
│ Walker     │ Vodka      │ Beer       │
│            │            │            │
│ 6 bottles  │ 13 bottles │ 9 bottles  │
│            │            │            │
│🟢 In Stock │🟢 In Stock │🟠 Low Stock│← Amber!
└────────────┴────────────┴────────────┘
```

**Manager's action:**
1. Calls supplier: "Send 2 crates of Kingfisher (48 bottles)"
2. Waits for delivery...

---

## Day 5: Supplier Delivery (Friday Afternoon)

Delivery arrives: 2 crates = 48 bottles of Kingfisher

### Manager Records Purchase:

**Clicks "+ Record Purchase"**
```
┌───────────────────────────────┐
│  Record Purchase          [X] │
├───────────────────────────────┤
│                               │
│  Select Item *                │
│  [Kingfisher Beer ▼]          │
│                               │
│  Quantity (ml) *              │
│  [15840___________]           │← 48 bottles × 330ml
│                               │
│  Supplier                     │
│  [Premier Beverages]          │
│                               │
│  Cost per Bottle              │
│  [55.00___________]           │
│                               │
│  Notes                        │
│  [Invoice #KB-2024-0523]      │
│                               │
│      [Record Purchase]        │
└───────────────────────────────┘
```

**After clicking "Record Purchase":**
```
✅ Purchase recorded successfully
```

**Grid updates automatically:**
```
┌────────────┬────────────┬────────────┐
│ Johnnie    │ Absolut    │ Kingfisher │
│ Walker     │ Vodka      │ Beer       │
│            │            │            │
│ 6 bottles  │ 13 bottles │ 57 bottles │← Increased!
│            │            │ (18810 ml) │
│            │            │            │
│🟢 In Stock │🟢 In Stock │🟢 In Stock │← Green again!
└────────────┴────────────┴────────────┘
```

**Low stock alert disappears** ✅

---

## Day 6: Accidental Breakage (Saturday Night)

Waiter drops tray with 2 bottles of Absolut Vodka.

### Manager Adjusts Stock:

**Finds Absolut card, clicks "Adjust"**
```
┌───────────────────────────────┐
│  Adjust Stock             [X] │
├───────────────────────────────┤
│                               │
│  Absolut Vodka                │
│  Current: 13 bottles (9750ml) │
│                               │
│  Quantity Change (ml) *       │
│  [-1500___________]           │← 2 bottles × 750ml (negative!)
│                               │
│  Adjustment Type *            │
│  [WASTAGE ▼]                  │
│    ADJUSTMENT                 │
│  → WASTAGE                    │
│    PURCHASE                   │
│                               │
│  Notes                        │
│  [Waiter dropped tray during  │
│   service - 2 bottles broke]  │
│                               │
│  ────────────────────────     │
│  Preview:                     │
│  New Stock: 11 bottles        │
│             (8250 ml)         │
│  ────────────────────────     │
│                               │
│        [Adjust Stock]         │
└───────────────────────────────┘
```

**After clicking "Adjust Stock":**
```
✅ Stock adjusted successfully
```

**Vodka card updates:**
```
┌─────────────────────────────────────┐
│ 🍸 Absolut Vodka                    │
│ Category: Vodka                     │
│                                     │
│ 📦 Current Stock                    │
│    11 bottles (8250 ml)             │← Reduced
│                                     │
│ 🔔 Reorder At                       │
│    7 bottles (5250 ml)              │
│                                     │
│🟢 In Stock                          │
└─────────────────────────────────────┘
```

---

## Day 10: Physical Count Audit (Mid-Month)

Manager does physical count and finds discrepancies:

### Physical Count vs System:
| Item | System | Physical | Difference |
|------|--------|----------|------------|
| Johnnie Walker | 5 bottles | 5 bottles | ✅ Match |
| Absolut Vodka | 10 bottles | 9 bottles | ❌ -1 bottle |
| Kingfisher | 45 bottles | 47 bottles | ❌ +2 bottles |
| Bacardi Rum | 11 bottles | 11 bottles | ✅ Match |

### Correcting Vodka (1 bottle missing):

**Clicks "Adjust" on Absolut**
```
┌───────────────────────────────┐
│  Adjust Stock             [X] │
├───────────────────────────────┤
│                               │
│  Absolut Vodka                │
│  Current: 10 bottles (7500ml) │
│                               │
│  Quantity Change (ml) *       │
│  [-750____________]           │← 1 bottle × 750ml
│                               │
│  Adjustment Type *            │
│  [ADJUSTMENT ▼]               │
│                               │
│  Notes                        │
│  [Mid-month audit 05/15:      │
│   Physical count shows 9,     │
│   system shows 10. Correcting]│
│                               │
│  Preview: 9 bottles (6750ml)  │
│                               │
│        [Adjust Stock]         │
└───────────────────────────────┘
```

### Correcting Beer (2 bottles extra):

**Clicks "Adjust" on Kingfisher**
```
┌───────────────────────────────┐
│  Adjust Stock             [X] │
├───────────────────────────────┤
│                               │
│  Kingfisher Beer              │
│  Current: 45 bottles (14850ml)│
│                               │
│  Quantity Change (ml) *       │
│  [+660____________]           │← 2 bottles × 330ml (positive!)
│                               │
│  Adjustment Type *            │
│  [ADJUSTMENT ▼]               │
│                               │
│  Notes                        │
│  [Mid-month audit 05/15:      │
│   Physical count shows 47,    │
│   system shows 45. Correcting]│
│                               │
│  Preview: 47 bottles (15510ml)│
│                               │
│        [Adjust Stock]         │
└───────────────────────────────┘
```

✅ **System now matches physical reality**

---

## Day 15: Using Search & Filter

Manager needs to check all low stock items quickly.

### Scenario 1: Find all beer items
```
Search: [beer__________]  Filter: [All Items ▼]

Results:
┌────────────┬────────────┐
│ Kingfisher │ Corona     │
│ Beer       │ Beer       │
│            │            │
│ 42 bottles │ 8 bottles  │
└────────────┴────────────┘
```

### Scenario 2: Show only items needing reorder
```
Search: [______________]  Filter: [Low Stock ▼]

Results:
┌────────────┬────────────┐
│ Bacardi    │ Tequila    │← Only amber/red items
│ Rum        │ Silver     │
│            │            │
│ 5 bottles  │ 2 bottles  │
│🟠 Low Stock│🟠 Low Stock│
└────────────┴────────────┘
```

**Manager immediately calls supplier for these 2 items**

---

## Day 20: Completely Out of Stock

Popular item (Smirnoff Vodka) runs out during evening service.

**Grid shows:**
```
┌─────────────────────────────────────┐
│ 🍸 Smirnoff Vodka                   │
│ Category: Vodka                     │
│                                     │
│ 📦 Current Stock                    │
│    0 bottles (0 ml)                 │← Zero!
│                                     │
│ 🔔 Reorder At                       │
│    6 bottles (4500 ml)              │
│                                     │
│🔴 Out of Stock                      │← RED alert
└─────────────────────────────────────┘
```

**Low stock banner:**
```
┌─────────────────────────────────────────────────────┐
│ ⚠️  1 item needs attention                          │
│                                                     │
│ • Smirnoff Vodka (0 bottles) - OUT OF STOCK       │
└─────────────────────────────────────────────────────┘
```

**Emergency action:**
1. Manager filters: "Out of Stock"
2. Calls emergency supplier
3. Gets same-day delivery (15 bottles)
4. Records purchase immediately
5. Alert clears, service continues

---

## Day 30: Month-End Summary

### Inventory Snapshot:
```
┌─────────────────────────────────────────────────────┐
│  Bar Inventory - End of May 2024                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Total Items Tracked:      12                      │
│  Items In Stock:           10  🟢                   │
│  Items Low Stock:           2  🟠                   │
│  Items Out of Stock:        0  🔴                   │
│                                                     │
│  Purchases This Month:     8                       │
│  Wastage Events:           2                       │
│  Manual Adjustments:       4                       │
│                                                     │
│  Top Consumed:                                      │
│    1. Kingfisher Beer      (-156 bottles)          │
│    2. Absolut Vodka        (-24 bottles)           │
│    3. Johnnie Walker       (-18 bottles)           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Common UI States & What They Mean

### Empty State
```
┌─────────────────────────────────────┐
│                                     │
│          📦                         │
│                                     │
│  No inventory items found           │
│                                     │
│  Click "+ Add Item" to start        │
│  tracking your liquor stock         │
│                                     │
└─────────────────────────────────────┘
```
**Meaning:** No items added yet OR search/filter returned no results.

---

### Loading State
```
┌─────────────────────────────────────┐
│                                     │
│          ⏳                         │
│     (spinning animation)            │
│                                     │
│    Loading inventory...             │
│                                     │
└─────────────────────────────────────┘
```
**Meaning:** Fetching data from backend. Usually takes 0.5-2 seconds.

---

### Low Stock Alert (Multiple Items)
```
┌─────────────────────────────────────────────────────┐
│ ⚠️  3 items need attention                          │
│                                                     │
│ • Kingfisher Beer (8 bottles) - Below reorder      │
│ • Bacardi Rum (4 bottles) - Below reorder          │
│ • Corona Beer (2 bottles) - Below reorder          │
│                                                     │
│ [ View Low Stock Items ]                           │
└─────────────────────────────────────────────────────┘
```
**Meaning:** Multiple items hit reorder threshold. Click button to filter view.

---

## Real-World Tips from The Sunset Bar

### What Worked Well:
✅ Set reorder levels to 1.5× weekly consumption
✅ Physical counts every Saturday morning (off-peak)
✅ Always record purchases same day as delivery
✅ Used notes field religiously for audits
✅ Trained all managers on search & filter features

### What They Learned:
💡 Beer runs out faster on weekends - adjusted reorder levels
💡 Audit weekly, not monthly - catches issues early
💡 Low stock alerts saved them 3 times from mid-service stockouts
💡 System accuracy improved from 85% to 98% in 2 weeks
💡 Wastage tracking helped identify handling issues

---

## Visual Guide: Button Locations

```
┌─────────────────────────────────────────────────────┐
│  Bar Inventory                      🔴[+Add Item]   │← Main action
│  Manage liquor stock                🟢[+Purchase]   │← Main action
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  ⚠️  Low stock alert (if any)                       │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  🔍[Search box]         [Filter dropdown▼]          │← Quick filters
└─────────────────────────────────────────────────────┘

┌───────────┬───────────┬───────────┐
│ Item      │ Item      │ Item      │
│ Card      │ Card      │ Card      │
│           │           │           │
│[Adjust]🗑️ │[Adjust]🗑️ │[Adjust]🗑️ │← Per-item actions
└───────────┴───────────┴───────────┘
```

---

**Now you're ready to use the inventory system like a pro!** 🎉

For detailed information, see: `INVENTORY_USER_GUIDE.md`
For quick reference, see: `INVENTORY_QUICK_REFERENCE.md`
