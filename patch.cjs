const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src', 'captain', 'CaptainApp.jsx');
let content = fs.readFileSync(file, 'utf8');

// Replace sendIncrementalKOT
const sendKotRegex = /const sendIncrementalKOT = async \(\) => \{[\s\S]*?addNotification\("Submission Failed", "error"\);\s*\}\s*\};/m;

const sendKotReplacement = `const sendIncrementalKOT = async () => {
    try {
      if (currentSessionItems.length === 0) return;
      if (!currentCaptain) { setIsLoginView(true); return; }
      if (!activeTable?.backendId) {
        addNotification("Table is still syncing", "error");
        return;
      }

      // Format items for the API
      const apiItems = currentSessionItems.map(i => ({
        menuItemId: String(i.id || i.menuItemId || i.n || i.name),
        name: i.n || i.name,
        price: Number(i.p ?? i.price ?? 0),
        quantity: Number(i.q ?? i.quantity ?? 1),
        notes: i.notes || null,
      }));

      let order;
      if (activeTable.activeOrder?.id) {
        order = await updateOrderItems(activeTable.activeOrder.id, apiItems);
      } else {
        order = await createOrder({
          tableId: activeTable.backendId,
          restaurantId: RESTAURANT_ID,
          items: apiItems,
        });
      }

      // Update local activeOrder so requestFinalBill can find the ID
      setTables(prev => prev.map(t =>
        t.backendId === activeTable.backendId
          ? { ...t, activeOrder: order, status: TABLE_STATUS.PREPARING }
          : t
      ));

      setCurrentSessionItems([]);
      addNotification(\`KOT Sent\`, 'success');
    } catch (err) {
      console.error(err);
      addNotification("Submission Failed", "error");
    }
  };`;

content = content.replace(sendKotRegex, sendKotReplacement);

// Replace requestFinalBill
const requestBillRegex = /const requestFinalBill = async \(\) => \{[\s\S]*?addNotification\("Billing Request Failed", "error"\);\s*\}\s*\};/m;

const requestBillReplacement = `const requestFinalBill = async () => {
    try {
      // Re-fetch from live tables in case state is stale
      const liveTable = tables.find(t => t.id === activeTableId || t.backendId === activeTableId);
      const orderId = liveTable?.activeOrder?.id;

      if (!orderId) {
        addNotification("Send KOT first before requesting bill", "error");
        return;
      }

      await requestBilling(orderId);
      // Don't manually update tables here — the backend emits table:updated
      // which useTableSync picks up and updates all panels automatically
      addNotification("Billing Requested", 'success');
      setView('tables');
      setActiveTableId(null);
    } catch (err) {
      console.error(err);
      addNotification("Billing Request Failed", "error");
    }
  };`;

content = content.replace(requestBillRegex, requestBillReplacement);

fs.writeFileSync(file, content);
console.log('Done replacing CaptainApp.jsx');
