import React, { useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Users, Star, TrendingUp } from "lucide-react";

export default function CaptainPerformanceDashboard() {
  const [range, setRange] = useState("Today");

  const captains = [
    { name: "Rahul Sharma", rating: 4.9, sales: 18400, orders: 127, topItem: "Chicken Biryani", status: "Online", speed: "12m", shift: "Morning", rank: 1, stars: 5 },
    { name: "Suresh Kumar", rating: 4.7, sales: 14200, orders: 98, topItem: "Butter Naan", status: "Online", speed: "15m", shift: "Morning", rank: 2, stars: 4 },
    { name: "Priya Singh", rating: 4.8, sales: 12500, orders: 84, topItem: "Paneer Tikka", status: "Offline", speed: "14m", shift: "Evening", rank: 3, stars: 4 },
    { name: "Amit Patel", rating: 4.5, sales: 11800, orders: 76, topItem: "Veg Pulav", status: "Online", speed: "18m", shift: "Evening", rank: 4, stars: 3 }
  ];

  const trends = [
    { hour: "12 PM", sales: 4200 },
    { hour: "2 PM", sales: 8500 },
    { hour: "4 PM", sales: 3100 },
    { hour: "6 PM", sales: 9400 },
    { hour: "8 PM", sales: 15600 },
    { hour: "10 PM", sales: 11200 }
  ];

  return (
    <div className="space-y-6 font-sans">
      <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-[#FFCDD2] shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-red-50 flex items-center justify-center text-[#B71C1C]">
            <Users size={20} />
          </div>
          <div>
            <h2 className="font-black text-gray-900 tracking-tight">Captain Intelligence</h2>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Performance & Service Quality</p>
          </div>
        </div>
        <div className="flex bg-[#F4F4F5] p-1 rounded-xl">
          {['Today', 'Weekly', 'Monthly'].map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${range === r ? 'bg-white text-[#B71C1C] shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {captains.slice(0, 4).map((c, i) => (
          <div key={i} className="bg-white p-5 rounded-2xl border border-[#FFCDD2] shadow-sm relative overflow-hidden group hover:border-[#B71C1C] transition-all">
            <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
               <Star size={48} className="text-[#B71C1C]" />
            </div>
            <div className="flex items-center gap-3 mb-4">
               <div className="h-12 w-12 rounded-full bg-red-50 flex items-center justify-center text-sm font-black text-[#B71C1C] border-2 border-white shadow-sm">{c.name[0]}</div>
               <div>
                  <p className="font-black text-gray-900">{c.name}</p>
                  <p className="text-[10px] font-bold text-[#F57F17]">{"★".repeat(c.stars)} {c.rating}</p>
               </div>
            </div>
            <div className="space-y-3">
               <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Sales Today</span>
                  <span className="text-sm font-black text-gray-900">₹{c.sales.toLocaleString()}</span>
               </div>
               <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Orders</span>
                  <span className="text-sm font-black text-gray-900">{c.orders}</span>
               </div>
               <div className="pt-3 border-t border-gray-50 flex justify-between items-center">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Top Item</span>
                  <span className="text-[10px] font-black text-[#B71C1C] uppercase truncate max-w-[100px]">{c.topItem}</span>
               </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm">
          <h3 className="font-black text-gray-900 mb-8 flex items-center gap-2">
            <TrendingUp size={18} className="text-[#B71C1C]" />
            Efficiency Trend
          </h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="99%" height="100%">
              <BarChart data={trends}>
                <XAxis dataKey="hour" tick={{fontSize: 10, fontWeight: 'bold'}} axisLine={false} tickLine={false} />
                <YAxis tick={{fontSize: 10, fontWeight: 'bold'}} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="sales" fill="#B71C1C" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm">
          <h3 className="font-black text-gray-900 mb-6">Captain Leaderboard</h3>
          <div className="space-y-4">
            {captains.map((c, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 hover:bg-red-50 transition-colors group cursor-pointer">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black text-gray-300 group-hover:text-[#B71C1C] w-4">#{i+1}</span>
                  <div className="h-8 w-8 rounded-full bg-white flex items-center justify-center text-[10px] font-black border border-gray-100">{c.name.split(' ').map(n => n[0]).join('')}</div>
                  <div>
                    <p className="text-xs font-black text-gray-900">{c.name}</p>
                    <p className="text-[9px] font-bold text-gray-400 uppercase">{c.shift} Shift</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-[#B71C1C]">₹{c.sales.toLocaleString()}</p>
                  <p className="text-[9px] font-bold text-green-600">{c.speed} Speed</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return <div className="rounded-[10px] border border-[#FFCDD2] bg-white p-3"><p className="text-xs text-[#6B6B6B]">{label}</p><p className="text-lg font-bold">{value}</p></div>;
}
