# Phase 4: Testing Guide - Bar Inventory Management

## Pre-Testing Setup

### 1. Start Backend Server
Ensure the backend is running with all inventory endpoints:
```bash
# In backend directory
npm start
# Backend should be running on https://softshape-backend.onrender.com
```

### 2. Start Frontend Development Server
```bash
# In frontend directory
npm install
npm run dev
# Should open on http://localhost:5173
```

### 3. Access Admin Panel
1. Navigate to `http://localhost:5173`
2. Click "Admin Login" or navigate to `/admin`
3. Switch to "Bar" outlet (if not already)
4. Click on "Inventory" tab in sidebar

---

## Test Cases

### Test 1: Initial Load
**Objective**: Verify inventory data loads correctly

**Steps**:
1. Navigate to Inventory tab
2. Observe loading spinner
3. Wait for data to load

**Expected Result**:
- Loading spinner appears
- Inventory items display in grid (if data exists)
- OR "No inventory items found" message with package icon (if empty)
- No console errors

**Pass Criteria**: ✅ Data loads within 2 seconds without errors

---

### Test 2: Add New Inventory Item
**Objective**: Create a new inventory item

**Steps**:
1. Click "+ Add Item" button
2. Select a menu item from dropdown (e.g., "Kingfisher Beer")
3. Enter bottle size: `330`
4. Enter current stock: `3960` (12 bottles × 330ml)
5. Enter reorder level: `1650` (5 bottles)
6. Enter cost per bottle: `60.00`
7. Click "Create Item"

**Expected Result**:
- Modal closes
- Alert: "Inventory item created"
- New item appears in grid
- Stock shows: "12 bottles (3960 ml)"
- Status badge: "In Stock" (green)

**Pass Criteria**: ✅ Item created and visible immediately

---

### Test 3: Search Functionality
**Objective**: Filter items by name

**Steps**:
1. Type "beer" in search box
2. Observe filtered results
3. Clear search box
4. Observe all items return

**Expected Result**:
- Only items with "beer" in name display
- Filtering happens in real-time (as you type)
- All items reappear when search is cleared

**Pass Criteria**: ✅ Search works without page refresh

---

### Test 4: Filter by Status
**Objective**: Filter items by stock status

**Steps**:
1. Select "Low Stock" from dropdown
2. Observe filtered results
3. Select "In Stock"
4. Select "All Items"

**Expected Result**:
- Only items matching selected status display
- Filter updates immediately
- "All Items" shows everything

**Pass Criteria**: ✅ Status filter works correctly

---

### Test 5: Adjust Stock - Increase
**Objective**: Add stock to an item

**Steps**:
1. Find an item with low stock
2. Click "Adjust" button
3. Select type: "Purchase Received"
4. Enter quantity change: `3300` (10 bottles × 330ml)
5. Enter notes: "Restocking from supplier"
6. Observe preview (should show new stock)
7. Click "Save Adjustment"

**Expected Result**:
- Modal closes
- Alert: "Stock adjusted successfully"
- Item updates in grid
- New stock level reflects addition
- If was "Low Stock", should now be "In Stock"

**Pass Criteria**: ✅ Stock increases correctly

---

### Test 6: Adjust Stock - Decrease
**Objective**: Reduce stock (wastage/spillage)

**Steps**:
1. Find an item with good stock
2. Click "Adjust"
3. Select type: "Wastage/Spillage"
4. Enter quantity change: `-330` (negative for deduction)
5. Enter notes: "Broken bottle"
6. Observe preview (should show reduced stock in red if negative)
7. Click "Save Adjustment"

**Expected Result**:
- Modal closes
- Alert: "Stock adjusted successfully"
- Stock decreases by 1 bottle (330ml)
- Preview shows warning color for negative result

**Pass Criteria**: ✅ Stock decreases correctly with negative number

---

### Test 7: Record Purchase
**Objective**: Record incoming stock purchase

**Steps**:
1. Click "+ Record Purchase" button
2. Select item from dropdown
3. Enter quantity purchased: `7920` (24 bottles × 330ml)
4. Enter cost per bottle: `58.50`
5. Enter supplier name: "ABC Beverages Ltd"
6. Enter notes: "Invoice #INV-2024-001"
7. Click "Record Purchase"

**Expected Result**:
- Modal closes
- Alert: "Purchase recorded successfully"
- Stock increases by 24 bottles
- Cost per bottle updates to ₹58.50

**Pass Criteria**: ✅ Purchase recorded and stock updated

---

### Test 8: Low Stock Alert
**Objective**: Trigger low stock warning

**Steps**:
1. Find an item with stock > reorder level
2. Click "Adjust"
3. Enter negative quantity to bring stock below reorder level
   - Example: Current 3960ml, Reorder 1650ml → Adjust by -2400ml
4. Click "Save Adjustment"

**Expected Result**:
- Amber alert banner appears at top
- Shows "1 Item Needs Attention"
- Item chip displays name and bottle count
- Item card shows "Low Stock" badge (amber)

**Pass Criteria**: ✅ Low stock alert appears immediately

---

### Test 9: Delete Inventory Item
**Objective**: Remove an item from inventory

**Steps**:
1. Click trash icon on any item card
2. Observe confirmation dialog
3. Click "OK" to confirm

**Expected Result**:
- Confirmation prompt appears
- Alert: "Inventory item deleted"
- Item disappears from grid
- Grid rearranges smoothly

**Pass Criteria**: ✅ Item deleted after confirmation

---

### Test 10: Real-Time Updates (Multi-Tab)
**Objective**: Verify Socket.io sync between tabs

**Steps**:
1. Open admin panel in TWO browser tabs (side by side)
2. In Tab 1: Adjust stock on any item
3. Observe Tab 2 without refreshing

**Expected Result**:
- Tab 2 updates automatically within 1-2 seconds
- Stock level changes without page refresh
- Low stock alerts sync across tabs

**Pass Criteria**: ✅ Updates appear in both tabs instantly

---

### Test 11: Empty State
**Objective**: Verify UI when no items exist

**Steps**:
1. Delete all inventory items (or test on empty database)
2. Observe the display

**Expected Result**:
- Package icon displays (centered)
- Message: "No inventory items found"
- No grid or cards shown
- No errors

**Pass Criteria**: ✅ Empty state displays gracefully

---

### Test 12: Form Validation
**Objective**: Ensure required fields are enforced

**Steps**:
1. Click "+ Add Item"
2. Try to submit without filling any fields
3. Fill only some fields
4. Try to submit with invalid data (negative stock)

**Expected Result**:
- Browser validation prevents submission
- Required fields highlighted in red
- Cannot submit until all required fields valid

**Pass Criteria**: ✅ Form validation prevents invalid submissions

---

### Test 13: Mobile Responsiveness
**Objective**: Verify mobile layout

**Steps**:
1. Open Chrome DevTools (F12)
2. Toggle device toolbar (Ctrl+Shift+M)
3. Select "iPhone 12 Pro" or similar
4. Navigate through inventory

**Expected Result**:
- Grid shows 1 column on mobile
- Buttons stack vertically
- Modal fits screen with scrolling
- All text readable
- Touch targets large enough

**Pass Criteria**: ✅ Fully functional on mobile

---

### Test 14: Tablet Responsiveness
**Objective**: Verify tablet layout

**Steps**:
1. In DevTools, select "iPad Air"
2. Test all functionality

**Expected Result**:
- Grid shows 2 columns
- Layout uses available space
- No horizontal scrolling
- Comfortable spacing

**Pass Criteria**: ✅ Optimized for tablet

---

### Test 15: Desktop Responsiveness
**Objective**: Verify desktop layout

**Steps**:
1. View on full desktop browser (1920×1080)
2. Test all functionality

**Expected Result**:
- Grid shows 3 columns
- Maximum utilization of space
- No cramped layout
- Proper margins and padding

**Pass Criteria**: ✅ Professional desktop appearance

---

### Test 16: Error Handling - Network Failure
**Objective**: Handle API errors gracefully

**Steps**:
1. Open DevTools → Network tab
2. Set throttling to "Offline"
3. Try to add new item or adjust stock
4. Observe error handling

**Expected Result**:
- Alert shows error message
- Console error logged
- No crashes or white screen
- State remains unchanged

**Pass Criteria**: ✅ Graceful error handling

---

### Test 17: Modal Closing
**Objective**: Verify modals close properly

**Steps**:
1. Open "Add Item" modal
2. Click "Cancel" button
3. Open "Adjust Stock" modal
4. Click outside modal (backdrop)
5. Press Escape key (if implemented)

**Expected Result**:
- Modal closes when clicking Cancel
- Modal may close when clicking backdrop
- Form data resets
- No state corruption

**Pass Criteria**: ✅ Modals close cleanly

---

### Test 18: Stock Level Preview
**Objective**: Verify live calculation in Adjust modal

**Steps**:
1. Click "Adjust" on item with 3960ml stock
2. Enter quantity change: `1650`
3. Observe "New Stock After Adjustment" section
4. Change to: `-2000`
5. Observe color change

**Expected Result**:
- Preview shows: 5610ml (3960 + 1650) in green
- Preview shows: 1960ml (3960 - 2000) in green
- Preview shows: -500ml if over-reduction in red
- Calculation updates in real-time as you type

**Pass Criteria**: ✅ Live preview accurate

---

### Test 19: Cost Tracking
**Objective**: Verify cost per bottle updates

**Steps**:
1. Note original cost on an item
2. Record purchase with different cost
3. Observe updated cost

**Expected Result**:
- Original cost visible in item card
- After purchase, cost updates to new value
- Format: ₹XX.XX

**Pass Criteria**: ✅ Cost updates correctly

---

### Test 20: Category Display
**Objective**: Ensure category shows from menu item

**Steps**:
1. View inventory items
2. Check category text below item name

**Expected Result**:
- Category name displays (e.g., "Beer", "Spirits")
- Pulled from linked menu item
- Formatted consistently

**Pass Criteria**: ✅ Categories display correctly

---

## Performance Benchmarks

### Load Time
- Initial page load: < 2 seconds
- Inventory data fetch: < 1 second
- Modal open: < 100ms
- Search filter: Instant (< 50ms)

### Network Requests
- Initial load: 2-3 requests max
  - Inventory items
  - Low stock items
  - Menu items (when opening Add modal)
- Subsequent operations: 1 request each

### Memory Usage
- Check Chrome DevTools → Memory tab
- Should stay under 100MB for inventory page
- No memory leaks over time

---

## Edge Cases to Test

### Edge Case 1: Zero Stock Item
- Create item with 0 current stock
- Should show "Out of Stock" badge (red)
- Should appear in low stock alerts

### Edge Case 2: Exactly at Reorder Level
- Stock = Reorder Level (e.g., both 1650ml)
- Should show "Low Stock" (not "Out of Stock")

### Edge Case 3: Very Large Numbers
- Enter 999999 as stock
- Should handle large numbers gracefully
- No overflow or display issues

### Edge Case 4: Decimal Quantities
- Enter 1650.5 as stock
- Should handle decimals (ml can be fractional)
- Display should show appropriate precision

### Edge Case 5: Special Characters in Notes
- Enter notes with quotes, apostrophes, emojis
- Should save without errors
- Should display correctly

### Edge Case 6: Multiple Simultaneous Users
- Two users adjust same item at same time
- Socket.io should sync final state
- No data corruption

---

## Browser Compatibility

Test on:
- ✅ Chrome (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Edge (latest)
- ✅ Mobile Safari (iOS)
- ✅ Chrome Mobile (Android)

---

## Accessibility Testing

### Keyboard Navigation
- Tab through all interactive elements
- Enter to submit forms
- Escape to close modals (if implemented)

### Screen Reader
- Use NVDA or VoiceOver
- All buttons should have clear labels
- Form fields should announce properly

### Color Contrast
- Text should be readable on all backgrounds
- Check with color contrast analyzer
- Meet WCAG AA standards

---

## Bug Reporting Template

If you find a bug, report it using this format:

```
**Bug Title**: [Short description]

**Steps to Reproduce**:
1. Step one
2. Step two
3. Step three

**Expected Behavior**:
What should happen

**Actual Behavior**:
What actually happens

**Environment**:
- Browser: Chrome 120
- OS: Windows 11
- Screen Size: 1920x1080

**Console Errors**:
[Paste any console errors]

**Screenshots**:
[Attach screenshots if applicable]

**Severity**: Critical / High / Medium / Low
```

---

## Test Results Checklist

After running all tests, verify:

- [ ] All 20 main tests pass
- [ ] All 6 edge cases handled
- [ ] Performance benchmarks met
- [ ] All browsers compatible
- [ ] Mobile responsive
- [ ] Tablet responsive
- [ ] Desktop optimized
- [ ] No console errors
- [ ] No network errors
- [ ] Real-time sync works
- [ ] Error handling graceful
- [ ] Forms validate correctly
- [ ] Modals work properly
- [ ] Search and filter functional
- [ ] Stock calculations accurate

---

## Production Readiness Criteria

Before deploying to production:

✅ **Functionality**
- All CRUD operations work
- Real-time updates functioning
- Search and filters operational
- Low stock alerts accurate

✅ **Performance**
- Page load < 2 seconds
- No memory leaks
- Efficient re-renders
- API calls optimized

✅ **Quality**
- No console errors
- No linting errors
- Follows project conventions
- Clean code structure

✅ **User Experience**
- Responsive on all devices
- Smooth animations
- Clear error messages
- Intuitive navigation

✅ **Security**
- Input validation
- Error handling
- No sensitive data exposed
- Safe API calls

---

## Post-Deployment Monitoring

After deploying, monitor:

1. **Error Tracking**
   - Check for JavaScript errors
   - Monitor API failures
   - Track Socket.io disconnects

2. **Performance**
   - Page load times
   - API response times
   - User session duration

3. **User Feedback**
   - Collect feedback from admin users
   - Note any confusion points
   - Track feature requests

4. **Usage Metrics**
   - How many items tracked
   - Average adjustments per day
   - Most used features

---

## Support Resources

If issues arise:

1. **Check Documentation**
   - `PHASE_4_IMPLEMENTATION_SUMMARY.md`
   - `PHASE_4_ARCHITECTURE.md`
   - `CLAUDE.md` (project guidelines)

2. **Console Logs**
   - Look for `[Inventory]` prefixed errors
   - Check Network tab for failed requests
   - Verify Socket.io connection

3. **Backend Logs**
   - Check backend server logs
   - Verify database connections
   - Confirm Socket.io events emitting

4. **Common Issues**
   - **No data loading**: Check API_BASE URL
   - **Socket not connecting**: Verify backend Socket.io server
   - **Low stock not alerting**: Check reorder levels
   - **Real-time not working**: Check socket connection

---

**Testing Completed By**: ___________________
**Date**: ___________________
**All Tests Passed**: [ ] Yes  [ ] No
**Notes**: ________________________________________

---

This comprehensive testing guide ensures the inventory management system is production-ready and functions correctly across all scenarios.
