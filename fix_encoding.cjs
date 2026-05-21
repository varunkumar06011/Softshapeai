const fs = require('fs');
const { execSync } = require('child_process');

const files = [
  { src: "ab0a8a0:src/components/CashierDashboard.jsx", dst: "src/cashier/CashierDashboard.jsx" },
  { src: "ab0a8a0:src/components/CaptainApp.jsx", dst: "src/captain/CaptainApp.jsx" },
  { src: "ab0a8a0:src/components/SurveillanceDashboard.jsx", dst: "src/admin/SurveillanceDashboard.jsx" },
  { src: "ab0a8a0:src/components/AdminDashboard.jsx", dst: "src/admin/AdminDashboard.jsx" },
  { src: "ab0a8a0:src/components/AdminComponents.jsx", dst: "src/admin/AdminComponents.jsx" }
];

files.forEach(f => {
  // Get raw buffer from git show
  const buffer = execSync(`git show ${f.src}`, { encoding: 'buffer' });
  let str = buffer.toString('utf8');
  
  // Apply the same path updates that we need for the refactored structure
  if (f.dst === "src/admin/AdminComponents.jsx") {
    str = str.replace("import CreativeCanvas from './CreativeCanvas';", "import CreativeCanvas from '../shared/components/CreativeCanvas';");
  }
  if (f.dst === "src/admin/AdminDashboard.jsx") {
    str = str.replace('import("./CaptainPerformanceDashboard")', 'import("../captain/CaptainPerformanceDashboard")');
  }
  
  fs.writeFileSync(f.dst, str, 'utf8');
  console.log("Restored and fixed", f.dst);
});
