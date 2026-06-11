@echo off
cd /d "c:\Users\kiran\Downloads\git branch\Softshapeai"
echo === GIT STATUS ===
git status -uno
echo === ADDING FILES ===
git add src/cashier/CashierDashboard.jsx src/print-station/PrintStation.jsx
echo === COMMITTING ===
git commit -m "fix: UI flickers, wrong bill amount after print/settle, KOT push stops"
echo === PULLING ===
git pull origin main --no-edit
echo === PUSHING ===
git push origin main
echo === DONE ===
