# Bar Inventory - Quick Reference Card

## 🎯 3 Main Actions

| Action | Button | When to Use |
|--------|--------|-------------|
| **Add New Item** | `+ Add Item` (Red) | First time tracking a liquor item |
| **Record Purchase** | `+ Record Purchase` (Green) | Supplier delivered new stock |
| **Adjust Stock** | `Adjust` (on card) | Fix mistakes, breakage, or manual count |

---

## 📝 Quick Formulas

### Calculate ML from Bottles
```
ML = Number of Bottles × Bottle Size

Examples:
- 10 bottles × 750ml = 7500 ml
- 24 bottles × 330ml = 7920 ml
- 6 bottles × 650ml = 3900 ml
```

### Calculate Bottles from ML
```
Bottles = ML ÷ Bottle Size

Examples:
- 7500 ml ÷ 750ml = 10 bottles
- 3960 ml ÷ 330ml = 12 bottles
```

---

## 🚦 Status Colors

| Color | Badge | Meaning | Action Needed |
|-------|-------|---------|---------------|
| 🟢 Green | In Stock | All good | None |
| 🟠 Amber | Low Stock | Running low | Order soon |
| 🔴 Red | Out of Stock | Empty | Order NOW |

---

## 🔢 Common Bottle Sizes

| Liquor Type | Standard Size | Example |
|-------------|---------------|---------|
| Whiskey | 750 ml | Johnnie Walker |
| Vodka | 750 ml | Absolut |
| Rum | 750 ml | Bacardi |
| Beer | 330 ml | Kingfisher |
| Beer (Large) | 650 ml | Kingfisher Strong |
| Wine | 750 ml | Red/White wine |

---

## 🔄 Daily Workflow

### Morning (Delivery Time)
1. Receive supplier delivery
2. Count bottles physically
3. Click `+ Record Purchase`
4. Enter each item delivered
5. File invoice

### During Service
- **No action needed!**
- System auto-deducts when customers pay

### Evening (Before Close)
1. Check low stock alerts (amber banner)
2. Note items to reorder tomorrow
3. (Optional) Quick physical count of high-movers

### Weekly
1. Full physical count
2. Compare with system
3. Use `Adjust` to fix differences
4. Type: "ADJUSTMENT"
5. Note: "Weekly audit [date]"

### Monthly
1. Same as weekly, but more thorough
2. Check cost per bottle accuracy
3. Review slow-moving items

---

## ⚡ Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Search | Click search box, start typing |
| Clear search | Backspace in search box |
| Close modal | Click outside or X button |

---

## 🎓 Training: 5-Minute Drill

**Practice these 5 actions:**

1. **Add Item:** Beer, 330ml, 12 bottles (3960ml), reorder at 5, cost ₹60
2. **Search:** Type "beer" in search box
3. **Filter:** Select "Low Stock" from dropdown
4. **Adjust:** Click Adjust, enter -660, type WASTAGE, note "Broke 2 bottles"
5. **Purchase:** Record Purchase, select item, enter 7920ml, supplier "ABC"

**Time limit:** 5 minutes ✅

---

## 🐛 Common Mistakes

| Mistake | Fix |
|---------|-----|
| Entering bottles instead of ML | Always multiply: Bottles × Bottle Size |
| Forgetting negative sign | Use `-` for reductions (e.g., `-750`) |
| Empty notes field | Always explain why you adjusted |
| Wrong bottle size | Check physical bottle label |
| Not recording purchases same day | Record immediately when delivered |

---

## 📋 Checklists

### ✅ New Item Setup
- [ ] Item exists in Bar Menu
- [ ] Bottle size is correct (check label)
- [ ] Current stock calculated: Bottles × Size
- [ ] Reorder level set (3-10 bottles based on sales)
- [ ] Cost per bottle entered (check invoice)

### ✅ Recording Purchase
- [ ] Physical bottles counted
- [ ] Quantity calculated: Bottles × Size
- [ ] Supplier name entered
- [ ] Cost per bottle entered (from invoice)
- [ ] Invoice number in notes
- [ ] Low stock alert cleared after

### ✅ Stock Adjustment
- [ ] Correct item selected
- [ ] Change amount calculated correctly
- [ ] Positive (+) or negative (-) sign correct
- [ ] Adjustment type selected (ADJUSTMENT/WASTAGE/PURCHASE)
- [ ] Reason written in notes
- [ ] Preview checked before submit

### ✅ Weekly Audit
- [ ] All items counted physically
- [ ] System stock vs physical compared
- [ ] Differences adjusted with notes
- [ ] Low stock items noted for ordering
- [ ] Audit date documented

---

## 💰 Cost Tracking Tips

| What to Track | Where | Why |
|---------------|-------|-----|
| Purchase price | Cost per Bottle field | Calculate profit margins |
| Invoice number | Notes field (purchases) | Match with accounting |
| Supplier name | Supplier field | Track best prices |
| Wastage reasons | Notes field (adjustments) | Reduce losses |

---

## 📱 Mobile Tips

**Using on tablet/phone:**
- Grid shows 1 column (scrolls vertically)
- Tap search box to bring up keyboard
- Scroll modals if screen is small
- Hold phone horizontal for better view

---

## 🆘 Emergency Numbers

**Stock ran out during service:**
1. Check "Out of Stock" filter
2. Call backup supplier immediately
3. Order double the reorder level
4. Record purchase when delivered

**System showing wrong numbers:**
1. Do physical count
2. Click Adjust on item
3. Calculate difference
4. Enter correction with note
5. Type: "ADJUSTMENT"
6. Note: "Emergency correction - [reason]"

---

## 🎯 Success Metrics

**You're doing it right if:**
- ✅ No items show "Out of Stock" during service
- ✅ Low stock alerts checked daily
- ✅ All purchases recorded same day
- ✅ Weekly audits show <5% variance
- ✅ All adjustments have notes
- ✅ Suppliers called before items hit zero

---

## 📊 Monthly Review Questions

Ask yourself:
- Which items go low stock most often? (Order more)
- Which items never go low? (Order less)
- Any patterns in wastage? (Fix handling)
- Cost per bottle increasing? (Negotiate with supplier)
- System accuracy good? (If not, audit more often)

---

## 🔗 Related Documents

- Full guide: `INVENTORY_USER_GUIDE.md`
- Technical docs: `PHASE_4_IMPLEMENTATION_SUMMARY.md`
- API docs: `../softshape-backend/INVENTORY_API_DOCUMENTATION.md`

---

**Print this card and keep near your admin computer!**

**Version:** 1.0.0 | **Status:** Production Ready ✅
