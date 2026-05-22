const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src', 'cashier', 'CashierDashboard.jsx');
let content = fs.readFileSync(file, 'utf8');

const mainTagRegex = /<main className="flex-grow overflow-hidden flex flex-col">/;
const bannerCode = `{/* Billing Alert Banner */}
          {billingAlerts.length > 0 && (
            <div className="mx-4 mt-3 flex flex-col gap-2">
              {billingAlerts.map(alert => (
                <div
                  key={alert.tableBackendId}
                  className="flex items-center justify-between bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 shadow-sm cursor-pointer hover:bg-amber-100 transition-all"
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
content = content.replace(mainTagRegex, `<main className="flex-grow overflow-hidden flex flex-col">\n          ${bannerCode}`);

fs.writeFileSync(file, content);
console.log('Done replacing banner in CashierDashboard.jsx');
