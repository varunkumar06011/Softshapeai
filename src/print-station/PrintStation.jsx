/**
 * /print-station
 *
 * DEPRECATED: Printing is now handled exclusively by the SoftShape Print Agent
 * (Tauri desktop app). This page is kept for backward compatibility but does
 * NOT join print rooms or connect QZ Tray. All print_job socket events are
 * received and processed only by the print agent.
 *
 * To set up printing, install and run the SoftShape Print Agent on the cashier PC.
 */

import { Printer } from 'lucide-react';

export default function PrintStation() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
      <div className="max-w-md text-center space-y-4">
        <div className="w-16 h-16 mx-auto bg-blue-100 rounded-full flex items-center justify-center">
          <Printer size={32} className="text-blue-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">Printing handled by Print Agent</h1>
        <p className="text-sm text-gray-500">
          All KOT, cancel, and bill printing is now handled by the SoftShape Print Agent desktop app.
          Please ensure it is running on this PC.
        </p>
        <p className="text-xs text-gray-400">
          This page no longer connects to QZ Tray or joins print rooms.
        </p>
      </div>
    </div>
  );
}
