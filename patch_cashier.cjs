const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src', 'cashier', 'CashierDashboard.jsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Add [billingAlerts] right after socket definition
const socketDefRegex = /const socket = useSocket\(RESTAURANT_ID\);/;
if (content.match(socketDefRegex)) {
  content = content.replace(socketDefRegex, `const socket = useSocket(RESTAURANT_ID);\n\n  // Real-time billing alert state\n  const [billingAlerts, setBillingAlerts] = useState([]);\n`);
}

// 2. Replace the useEffect for socket that I previously added with the new exact one.
const useEffectRegex = /useEffect\(\(\) => \{\s*const onBillingRequested = [\s\S]*?\}, \[socket\]\);/;
const newUseEffect = `useEffect(() => {
    const onBillingRequested = (payload) => {
      const { table, order } = payload;
      if (!table) return;

      // Add to billing alerts queue for cashier attention
      setBillingAlerts(prev => {
        const exists = prev.find(a => a.tableBackendId === table.id);
        if (exists) return prev;
        return [...prev, {
          tableBackendId: table.id,
          tableNumber: table.number,
          orderId: order?.id,
          totalAmount: order?.totalAmount ?? 0,
          requestedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }];
      });

      addNotification(
        "Bill Requested",
        \`Table \${table.number} is requesting the bill\`,
        'warning'
      );
    };

    const onOrderCreated = (payload) => {
      const { order } = payload;
      if (!order?.tableId) return;
      // useTableSync already updates table state via table:updated event.
      // Here we just ensure the activeOrder reference on selectedTable stays fresh.
      if (selectedTable?.backendId === order.tableId) {
        setSelectedTable(prev => prev ? { ...prev, activeOrder: order } : prev);
      }
    };

    const onOrderUpdated = (payload) => {
      const { order } = payload;
      if (!order?.tableId) return;
      if (selectedTable?.backendId === order.tableId) {
        setSelectedTable(prev => prev ? { ...prev, activeOrder: order } : prev);
      }
    };

    const onOrderPaid = (payload) => {
      const { tableId } = payload;
      // Remove from billing alerts
      setBillingAlerts(prev => prev.filter(a => a.tableBackendId !== tableId));
      // Clear selectedTable if it was the paid one
      if (selectedTable?.backendId === tableId) {
        setSelectedTable(null);
        setCart([]);
        setShowPaymentModal(false);
      }
    };

    socket.on('billing:requested', onBillingRequested);
    socket.on('order:created', onOrderCreated);
    socket.on('order:updated', onOrderUpdated);
    socket.on('order:paid', onOrderPaid);

    return () => {
      socket.off('billing:requested', onBillingRequested);
      socket.off('order:created', onOrderCreated);
      socket.off('order:updated', onOrderUpdated);
      socket.off('order:paid', onOrderPaid);
    };
  }, [socket, selectedTable?.backendId]);`;

content = content.replace(useEffectRegex, newUseEffect);

// 3. Add Billing Alert Banner inside the main content area
// Main content usually starts after </header> or <div className="flex-1 overflow-auto">
// I'll insert it right after `<main className="flex-1 overflow-auto bg-gray-50">` or similar. Let's find it.
const mainTagRegex = /<main className="flex-grow overflow-y-auto bg-\[#F8FAFC\] p-6 custom-scrollbar">/;
const bannerCode = `{/* Billing Alert Banner */}
          {billingAlerts.length > 0 && (
            <div className="mx-4 mt-3 flex flex-col gap-2">
              {billingAlerts.map(alert => (
                <div
                  key={alert.tableBackendId}
                  className="flex items-center justify-between bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 shadow-sm cursor-pointer hover:bg-amber-100 transition-all mb-4"
                  onClick={() => {
                    // Find and select the table so cashier can process payment
                    const t = tables.find(tbl => tbl.backendId === alert.tableBackendId);
                    if (t) {
                      setSelectedTable(t);
                      setActiveTab('tables');
                    }
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-2.5 w-2.5 bg-amber-500 rounded-full animate-pulse" />
                    <div>
                      <p className="text-sm font-bold text-amber-900">
                        Table {alert.tableNumber} — Billing Requested
                      </p>
                      <p className="text-xs text-amber-700">
                        ₹{alert.totalAmount.toFixed(2)} • {alert.requestedAt}
                      </p>
                    </div>
                  </div>
                  <button className="text-xs font-bold text-amber-700 bg-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-300 transition">
                    Collect →
                  </button>
                </div>
              ))}
            </div>
          )}
          `;
content = content.replace(mainTagRegex, `<main className="flex-grow overflow-y-auto bg-[#F8FAFC] p-6 custom-scrollbar">\n          ${bannerCode}`);

// Replace handleSettlement with handlePayment
const handleSettlementRegex = /const handleSettlement = async \(method = 'UPI'\) => \{[\s\S]*?addNotification\("Payment Success", `Transaction \${newTransaction.id} logged.`, 'success'\);\n  \};/;
const newHandlePayment = `const handlePayment = async (method) => {
    const txnAmount = selectedTable
      ? calculateTableBill(selectedTable).total
      : cart.reduce((sum, i) => sum + i.price * i.quantity, 0);

    if (txnAmount === 0) return;

    // 1. Hit the API first — this emits order:paid + table:updated to all panels
    try {
      const orderId = selectedTable?.activeOrder?.id;
      if (orderId) {
        await markOrderPaid(orderId);
      }
    } catch (err) {
      console.error(err);
      addNotification("Payment Failed", "Could not sync payment with server.", 'error');
      return; // stop — don't update UI if server rejected
    }

    // 2. Log transaction locally
    const itemsList = selectedTable?.kotHistory
      ? selectedTable.kotHistory.flatMap(k => k.items || [])
      : cart;

    const newTransaction = {
      id: \`TXN-\${Math.floor(10000 + Math.random() * 90000)}\`,
      kot: \`KOT-\${Math.floor(1000 + Math.random() * 9000)}\`,
      amount: txnAmount,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      date: new Date().toLocaleDateString('en-GB'),
      timestamp: Date.now(),
      items: itemsList.length,
      itemsList,
      captainId: selectedTable?.captainId || 'CASHIER',
      method,
    };

    setPastTransactions(prev => {
      const updated = [newTransaction, ...prev];
      localStorage.setItem('softshape_transactions', JSON.stringify(updated));
      window.dispatchEvent(new Event('softshape_transactions_updated'));
      return updated;
    });

    // 3. Dismiss billing alert for this table
    if (selectedTable?.backendId) {
      setBillingAlerts(prev =>
        prev.filter(a => a.tableBackendId !== selectedTable.backendId)
      );
    }

    // 4. Clear UI state — table itself will auto-reset via table:updated socket event
    setCart([]);
    setSelectedTable(null);
    setShowPaymentModal(false);
    addNotification("Payment Success", \`Transaction \${newTransaction.id} logged.\`, 'success');
  };`;

content = content.replace(handleSettlementRegex, newHandlePayment);

// update any calls to handleSettlement to handlePayment
content = content.replace(/handleSettlement\(/g, 'handlePayment(');

fs.writeFileSync(file, content);
console.log('Done replacing CashierDashboard.jsx');
