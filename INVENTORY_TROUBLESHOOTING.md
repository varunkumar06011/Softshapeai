# Bar Inventory - Troubleshooting Guide

## 🔧 Common Issues & Solutions

---

## Issue 1: Item Not Appearing in "Add Item" Dropdown

### Symptom:
You try to add a new inventory item, but the liquor you want isn't in the menu item dropdown.

### Cause:
The menu item doesn't exist in the bar menu system yet.

### Solution:
1. **Close the "Add Item" modal**
2. **Navigate to Menu Management** (in Admin sidebar)
3. **Switch to Bar outlet** (if not already)
4. **Create the menu item:**
   - Name: e.g., "Absolut Vodka"
   - Category: Select appropriate (Vodka, Whiskey, etc.)
   - Menu Type: **"LIQUOR"** (critical!)
   - Add variants with serving sizes:
     - "30ml Peg" - ₹150
     - "60ml Peg" - ₹280
     - "Full Bottle" - ₹2,800
5. **Save menu item**
6. **Go back to Inventory tab**
7. **Click "+ Add Item"** again
8. ✅ Item now appears in dropdown

**Prevention:** Always create bar menu items first, then add to inventory.

---

## Issue 2: Stock Not Auto-Deducting After Orders

### Symptom:
Customer orders "Whiskey 60ml", pays bill, but inventory still shows same stock level.

### Possible Causes & Solutions:

#### Cause A: Item name doesn't include serving size
**Check:** Menu item name is just "Whiskey" (no "60ml")

**Solution:**
1. Go to Menu Management
2. Edit the menu item
3. Update name to include serving: "Whiskey 60ml" or "Whiskey 30ml"
4. OR ensure variant names are clear: "60ml Peg", "30ml Peg"
5. Save changes
6. Test with new order

#### Cause B: Inventory item not created
**Check:** Menu item exists, but no inventory tracking set up

**Solution:**
1. Go to Inventory tab
2. Check if item appears in grid
3. If not: Click "+ Add Item" and create inventory entry
4. Link to menu item
5. Set bottle size, current stock, reorder level
6. Save
7. Test with new order

#### Cause C: Price mismatch with variant
**Check:** Order price doesn't match any variant price

**Solution:**
1. Go to Menu Management
2. Check variant prices
3. Ensure order price exactly matches a variant
4. Example:
   - Order shows ₹280
   - Variant "60ml Peg" must be ₹280 (not ₹281 or ₹279)
5. Fix pricing
6. Test with new order

#### Cause D: Backend not processing payment correctly
**Check:** Console errors when paying bill

**Solution:**
1. Open browser console (F12)
2. Look for red errors during payment
3. If you see "[Orders] Failed to process payment":
   - Backend may be down
   - Check backend server status
   - Contact admin
4. If no errors but still not deducting:
   - Clear browser cache
   - Reload page
   - Try again

---

## Issue 3: Low Stock Alert Not Clearing After Purchase

### Symptom:
You recorded a purchase, but the amber alert banner still shows the item as low stock.

### Cause:
Purchase didn't bring stock ABOVE the reorder level, only to it.

### Example:
- Reorder level: 5 bottles (3,750ml)
- Before purchase: 3 bottles (2,250ml)
- You added: 2 bottles (1,500ml)
- After purchase: 5 bottles (3,750ml)
- **Problem:** 5 = 5, not 5 > 5

### Solution:
**Option 1: Record additional purchase**
1. Click "+ Record Purchase" again
2. Add more stock (e.g., 1-2 more bottles)
3. Stock now exceeds reorder level
4. ✅ Alert clears

**Option 2: Adjust reorder level**
1. Find the item card
2. Click "Adjust"
3. Actually, you can't change reorder level here (feature limitation)
4. Delete item and recreate with lower reorder level (not recommended)
5. **Better:** Just add more stock (Option 1)

**Best Practice:** When reordering, always order 1.5-2× the reorder level, not exactly to it.

---

## Issue 4: Cannot Delete Inventory Item

### Symptom:
You click the trash icon, confirm deletion, but get an error or item doesn't delete.

### Possible Causes & Solutions:

#### Cause A: Item has active transactions
**Error message:** "Cannot delete item with transaction history"

**Solution:**
This is actually not the current behavior (items CAN be deleted with cascade), but if you see this:
1. Don't delete - this item has history
2. Instead:
   - Set stock to 0
   - Stop tracking it
   - Keep it for records
3. If you MUST delete:
   - Contact admin to manually remove from database
   - This will erase all transaction history

#### Cause B: Network error
**Error message:** "Failed to delete inventory item"

**Solution:**
1. Check internet connection
2. Check backend is running
3. Try again in 30 seconds
4. If persists, reload page and retry

#### Cause C: Permission issue (future)
If authentication is added later:

**Solution:**
1. Ensure you're logged in as Admin
2. Regular captains/cashiers won't have delete permission
3. Contact admin to perform deletion

---

## Issue 5: Numbers Showing Incorrectly (Decimal Confusion)

### Symptom:
Card shows "7.76 bottles" instead of "8 bottles" - confusing!

### This is NORMAL:
**Explanation:**
- System tracks in ML (precise)
- Converts to bottles for display
- 5,820ml ÷ 750ml = 7.76 bottles

**What it means:**
- You have 7 full bottles
- Plus 0.76 of another bottle (570ml remaining in opened bottle)

**If you want whole numbers:**
1. This is actually more accurate (tracks partial bottles)
2. Round in your head: 7.76 ≈ 8 bottles
3. Or adjust stock to exact bottle amounts:
   - Click "Adjust"
   - Bring to exact bottle count
   - Example: Add 180ml to reach 6,000ml = exactly 8 bottles

**Best Practice:** Keep it as-is. Precision is good for liquor tracking.

---

## Issue 6: Search Not Finding Items

### Symptom:
You type "beer" in search, but Kingfisher Beer doesn't show up.

### Possible Causes & Solutions:

#### Cause A: Filter is active
**Check:** Filter dropdown shows "Low Stock" or "Out of Stock"

**Solution:**
1. Change filter to "All Items"
2. Search again
3. ✅ Item appears

#### Cause B: Typo in search
**Check:** You typed "ber" instead of "beer"

**Solution:**
1. Fix spelling
2. Search is case-insensitive but requires correct spelling

#### Cause C: Item name is different
**Check:** Menu item name is "Kingfisher Premium Lager" not "Kingfisher Beer"

**Solution:**
1. Search by partial name: "king"
2. Or check exact name in menu
3. Update search term

---

## Issue 7: Modal Won't Close

### Symptom:
You're in "Add Item" modal, clicking outside doesn't close it, X button not working.

### Solutions:

**Try these in order:**
1. **Click the X button** in top-right corner
2. **Press ESC key** on keyboard
3. **Click outside the modal** on the dark background
4. **Refresh the page** (F5)
   - Your data is safe (already saved to backend)
5. **Close and reopen tab**

**If modal froze during form submission:**
1. Wait 10 seconds (may be processing)
2. Check if alert appeared behind modal
3. Refresh page
4. Check if item was created (may have succeeded)

---

## Issue 8: "Loading inventory..." Stuck Forever

### Symptom:
Spinner keeps spinning, inventory never loads.

### Possible Causes & Solutions:

#### Cause A: Backend is down
**Check:** Open console (F12), look for network errors

**Solution:**
1. Check backend status (contact admin)
2. Verify backend URL in environment variables
3. Wait for backend to restart
4. Reload page when backend is up

#### Cause B: Network timeout
**Check:** Slow internet connection

**Solution:**
1. Check internet speed
2. Wait 30 seconds
3. Refresh page (F5)
4. If still stuck, contact admin

#### Cause C: Browser cache issue
**Check:** Page worked before, now stuck

**Solution:**
1. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
2. Clear browser cache:
   - Chrome: Settings > Privacy > Clear browsing data
   - Select "Cached images and files"
   - Clear
3. Reload page

---

## Issue 9: Real-Time Updates Not Working

### Symptom:
Admin 1 adjusts stock, but Admin 2's screen doesn't update automatically.

### Possible Causes & Solutions:

#### Cause A: Socket.io disconnected
**Check:** Console shows "Socket disconnected"

**Solution:**
1. Reload page (Socket will reconnect)
2. Check backend Socket.io server is running
3. If persists, check firewall/network blocking WebSocket connections

#### Cause B: Different restaurants/outlets
**Check:** Admin 1 is in "Bar" outlet, Admin 2 is in "Restaurant" outlet

**Solution:**
1. Ensure both are in "Bar" outlet (top toggle)
2. Socket rooms are per-outlet
3. Switch to same outlet

#### Cause C: Manual refresh needed
**Not a bug:** Some updates require manual refresh

**Solution:**
1. Refresh page (F5)
2. Updates will appear
3. Real-time only works for:
   - Stock adjustments
   - Purchases
   - Low stock alerts

---

## Issue 10: Cost Per Bottle Wrong

### Symptom:
You entered ₹60 cost per bottle, but card shows ₹6,000 or ₹0.60.

### Cause:
Input field parsing issue or typo.

### Solution:

**If showing ₹6,000 (too high):**
1. Find item card
2. Click "Adjust" (we can't edit cost directly, so use workaround)
3. Actually, you CAN'T edit cost via UI after creation
4. **Workaround:**
   - Delete item (trash icon)
   - Recreate with correct cost
   - OR contact admin to manually update in database

**Prevention:** Double-check cost before clicking "Create Item"

**Future Enhancement:** Add "Edit Item" modal to change cost without deleting.

---

## Issue 11: Wastage/Adjustment Not Recording

### Symptom:
You submit adjustment form, get success alert, but stock didn't change.

### Possible Causes & Solutions:

#### Cause A: Forgot negative sign
**Check:** You entered `660` instead of `-660` for reduction

**Solution:**
1. Stock actually INCREASED by 2 bottles (oops!)
2. Click "Adjust" again
3. Enter `-1320` (double the amount to correct)
4. Submit
5. ✅ Stock now correct

#### Cause B: Form validation failed silently
**Check:** Required fields empty

**Solution:**
1. Ensure all fields filled:
   - Quantity Change (required)
   - Adjustment Type (required)
   - Notes (optional but recommended)
2. Resubmit

---

## Issue 12: Mobile/Tablet Display Issues

### Symptom:
On phone/tablet, UI looks broken, buttons overlap, can't scroll modal.

### Solutions by Symptom:

#### Cards overlapping:
1. Hold device vertical (portrait mode)
2. Grid auto-adjusts to single column

#### Modal doesn't scroll:
1. Use two-finger swipe inside modal
2. Or tap and drag scroll bar on right
3. Content scrolls within modal

#### Buttons too small:
1. Zoom in: Pinch gesture
2. Buttons are touch-optimized (48px min)
3. If still hard to tap, report to admin

#### Text cut off:
1. Rotate to landscape mode
2. Or zoom out slightly
3. Report screen size/device model to admin

---

## Issue 13: Audit Discrepancy Too Large

### Symptom:
Physical count: 10 bottles, System shows: 15 bottles (5 bottle difference!)

### Possible Causes:

1. **Unrecorded wastage** - Bottles broke but not logged
2. **Unrecorded consumption** - Staff drinks not in system
3. **Purchase double-recorded** - Same delivery logged twice
4. **Theft** - Inventory shrinkage
5. **Wrong initial stock** - Started with wrong count

### Investigation Steps:

1. **Check recent transactions** (via backend/logs):
   - Look for duplicate purchases
   - Look for missing wastage entries
   - Look for suspicious patterns

2. **Interview staff:**
   - Any unreported breakages?
   - Any complimentary drinks given?
   - Any bottles moved to restaurant (if shared inventory)?

3. **Review purchase invoices:**
   - Match invoice quantities to system records
   - Ensure no double-entries

4. **Check physical location:**
   - Are bottles in storage area counted?
   - Any bottles behind bar not counted?

### Resolution:

1. **Record adjustment** with detailed note:
   ```
   Adjustment: -3750ml (-5 bottles)
   Type: ADJUSTMENT
   Notes: "Week 3 audit: Physical 10, System 15.
          Cause: Unrecorded wastage from May 15 incident
          (2 bottles) + staff complimentary (3 bottles).
          Correcting to match physical."
   ```

2. **Implement controls:**
   - Mandatory wastage logging
   - Daily quick counts on high-value items
   - Weekly full audits

---

## Error Messages Decoded

| Error Message | Meaning | Solution |
|---------------|---------|----------|
| "Request failed (500)" | Backend error | Check backend logs, contact admin |
| "Failed to fetch inventory items" | Network/backend issue | Refresh, check connection |
| "Menu item not found" | Linked menu item was deleted | Recreate menu item first |
| "Invalid quantity" | Non-numeric input | Enter numbers only |
| "Item already exists" | Duplicate inventory entry | Check existing items, don't recreate |
| "Insufficient stock" | Can't deduct more than available | This is just a warning, payment continues |

---

## Performance Issues

### Symptom: Page is slow, laggy

**If inventory has 100+ items:**

1. **Use search** to narrow down view
2. **Filter by status** to reduce items shown
3. **Close unused tabs** (frees memory)
4. **Upgrade browser** (Chrome 100+, Firefox 90+)

**If modals are slow to open:**

1. Check internet speed
2. Backend may be slow (contact admin)
3. Try during off-peak hours

---

## When to Contact Admin

Contact your system admin if:

- ❌ Backend is down (all APIs failing)
- ❌ Data corruption (numbers completely wrong across all items)
- ❌ Authentication issues (when added in future)
- ❌ Database errors in console
- ❌ Need to bulk-edit items
- ❌ Need transaction history report
- ❌ Need to recover deleted items
- ❌ Suspect security issue

---

## Prevention Checklist

**To avoid 90% of issues:**

- ✅ Always create menu items before inventory items
- ✅ Include serving sizes in menu item names (e.g., "Whiskey 60ml")
- ✅ Record purchases same day as delivery
- ✅ Use negative sign for reductions (e.g., `-750`)
- ✅ Add notes to all manual adjustments
- ✅ Set reorder levels realistically (1.5× weekly usage)
- ✅ Do weekly audits to catch discrepancies early
- ✅ Train all staff on proper procedures
- ✅ Keep backend running (if self-hosted)
- ✅ Use modern browser (Chrome 100+, Firefox 90+)

---

## Quick Debug Checklist

**When something isn't working:**

1. [ ] Refresh page (F5)
2. [ ] Check internet connection
3. [ ] Check backend is running
4. [ ] Clear browser cache (Ctrl+Shift+R)
5. [ ] Check console for errors (F12)
6. [ ] Try different browser
7. [ ] Check if issue is specific to one item
8. [ ] Try on different device
9. [ ] Check if other features work (menu, orders)
10. [ ] Contact admin with specific error message

---

## Browser Console - What to Look For

**Open console:** Press F12, click "Console" tab

**Good (no issues):**
```
[Inventory] Loaded 12 items
Socket connected
[Inventory] Low stock check: 2 items
```

**Bad (problems):**
```
❌ Failed to fetch: NetworkError
❌ Socket disconnected
❌ TypeError: Cannot read property 'name' of undefined
❌ 500 Internal Server Error
```

**Copy error messages** and send to admin for faster troubleshooting.

---

## Emergency Procedures

### During Service - Stockout Emergency

**Critical item ran out, customers waiting:**

1. ⚡ **Immediate:** Offer substitute item
2. 📞 **Call backup supplier** (have numbers ready)
3. 🚗 **Send runner** to nearby liquor store if urgent
4. 📝 **Record emergency purchase** when stock arrives
5. 🔍 **Review reorder levels** next day to prevent recurrence

### System Down - Manual Tracking

**Backend/frontend both down:**

1. 📋 **Switch to paper** temporarily
2. ✍️ **Note all sales** by item and quantity
3. 💾 **Keep receipts** for verification
4. 🔄 **Enter into system** when back online
5. ☑️ **Audit immediately** after manual entry

---

## Support Resources

- **Full User Guide:** `INVENTORY_USER_GUIDE.md`
- **Quick Reference:** `INVENTORY_QUICK_REFERENCE.md`
- **Visual Examples:** `INVENTORY_VISUAL_EXAMPLES.md`
- **Technical Docs:** `PHASE_4_IMPLEMENTATION_SUMMARY.md`
- **Backend API:** `../softshape-backend/INVENTORY_API_DOCUMENTATION.md`

---

**Still stuck? Document the issue:**
1. What you tried to do
2. What happened instead
3. Error message (exact text or screenshot)
4. Browser console errors (F12)
5. When it started happening

Send to admin with this info for fastest resolution! 🚀

---

**Version:** 1.0.0 | **Last Updated:** May 28, 2026
