import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Bot,
  Camera,
  ChartNoAxesCombined,
  ClipboardList,
  DollarSign,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Package,
  Search,
  Settings,
  ShoppingCart,
  Sparkles,
  Table2,
  UtensilsCrossed,
} from "lucide-react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart } from "recharts";
import AIDishCreationModal from "./components/AIDishCreationModal";
import UnifiedOrdersDashboard from "./components/UnifiedOrdersDashboard";
import { STYLES, generateRandomConfig, renderToCanvas } from "./services/creativeEngine";
import { getSmartRecommendation } from "./services/pricingEngine";

import CreativeCanvas from "./components/CreativeCanvas";
import SurveillanceDashboard from "./components/SurveillanceDashboard";

const CaptainPerformanceDashboard = lazy(() => import("./components/CaptainPerformanceDashboard"));

const C = {
  primary: "#E53935",
  primaryLight: "#FFEBEE",
  primaryMid: "#EF9A9A",
  white: "#FFFFFF",
  text: "#1A1A1A",
  muted: "#6B6B6B",
  success: "#2E7D32",
  warning: "#F57F17",
  border: "#FFCDD2",
  sidebar: "#B71C1C",
  page: "#FFF5F5",
};

const MENU_DATA = [
  { n: "Tomato Soup", p: 130, c: "Soups", t: "veg" },
  { n: "Veg Sweet Corn Soup", p: 145, c: "Soups", t: "veg" },
  { n: "Veg Hot & Sour Soup", p: 145, c: "Soups", t: "veg" },
  { n: "Veg Dragon Soup", p: 145, c: "Soups", t: "veg" },
  { n: "Veg Manchow Soup", p: 145, c: "Soups", t: "veg" },
  { n: "Chicken Hot & Sour Soup", p: 150, c: "Soups", t: "non" },
  { n: "Chicken Sweet Corn Soup", p: 150, c: "Soups", t: "non" },
  { n: "Chicken Lungfung Soup", p: 150, c: "Soups", t: "non" },
  { n: "Chicken Manchow Soup", p: 150, c: "Soups", t: "non" },
  { n: "Chicken Dragon Soup", p: 150, c: "Soups", t: "non" },
  { n: "V-Grand Special Cream of Chicken Soup", p: 180, c: "Soups", t: "non" },
  { n: "Boiled Egg", p: 79, c: "Starters", t: "non" },
  { n: "Omelette", p: 89, c: "Starters", t: "non" },
  { n: "Masala Papad", p: 89, c: "Starters", t: "veg" },
  { n: "Crispy Corn", p: 174, c: "Starters", t: "veg" },
  { n: "French Fries", p: 184, c: "Starters", t: "veg" },
  { n: "Aloo 65", p: 199, c: "Starters", t: "veg" },
  { n: "Gobi Manchurian", p: 209, c: "Starters", t: "veg" },
  { n: "Gobi Chilli", p: 209, c: "Starters", t: "veg" },
  { n: "Golden Fried Crispy Baby Corn", p: 240, c: "Starters", t: "veg" },
  { n: "Veg Manchurian", p: 209, c: "Starters", t: "veg" },
  { n: "Veg Shangrilla", p: 249, c: "Starters", t: "veg" },
  { n: "Spring Rolls", p: 234, c: "Starters", t: "veg" },
  { n: "Cashew Nut Roast", p: 279, c: "Starters", t: "veg" },
  { n: "Baby Corn Manchurian", p: 239, c: "Starters", t: "veg" },
  { n: "Baby Corn Chilli", p: 249, c: "Starters", t: "veg" },
  { n: "Mushroom Manchurian", p: 259, c: "Starters", t: "veg" },
  { n: "Mushroom Chilli", p: 259, c: "Starters", t: "veg" },
  { n: "Mushroom Pepper Salt", p: 269, c: "Starters", t: "veg" },
  { n: "Paneer Manchurian", p: 259, c: "Starters", t: "veg" },
  { n: "Paneer Chilli", p: 259, c: "Starters", t: "veg" },
  { n: "Paneer Majestic", p: 259, c: "Starters", t: "veg" },
  { n: "Paneer Tikka", p: 329, c: "Starters", t: "veg" },
  { n: "Chicken Roast", p: 299, c: "Starters", t: "non" },
  { n: "Chicken Fry", p: 299, c: "Starters", t: "non" },
  { n: "Phuket Fish", p: 349, c: "Starters", t: "non" },
  { n: "Basket Chicken", p: 349, c: "Starters", t: "non" },
  { n: "Chicken 555", p: 359, c: "Starters", t: "non" },
  { n: "Lemon Chicken", p: 389, c: "Starters", t: "non" },
  { n: "Ginger Chicken", p: 359, c: "Starters", t: "non" },
  { n: "Chicken Patiala", p: 359, c: "Starters", t: "non" },
  { n: "Cashew Nut Chicken", p: 379, c: "Starters", t: "non" },
  { n: "Fish Fry", p: 389, c: "Starters", t: "non" },
  { n: "Tawa Fish", p: 399, c: "Starters", t: "non" },
  { n: "Mutton Fry", p: 499, c: "Starters", t: "non" },
  { n: "Kheema Balls", p: 499, c: "Starters", t: "non" },
  { n: "Pepper Mutton", p: 499, c: "Starters", t: "non" },
  { n: "Basket Mutton", p: 499, c: "Starters", t: "non" },
  { n: "Chicken Manchurian", p: 319, c: "Chinese", t: "non" },
  { n: "Chicken 65", p: 329, c: "Chinese", t: "non" },
  { n: "Chicken Chilli", p: 329, c: "Chinese", t: "non" },
  { n: "Crispy Chicken Fingers", p: 339, c: "Chinese", t: "non" },
  { n: "Pepper Chicken", p: 339, c: "Chinese", t: "non" },
  { n: "Fish 65", p: 349, c: "Chinese", t: "non" },
  { n: "Fish Manchurian", p: 349, c: "Chinese", t: "non" },
  { n: "Fish Chilli", p: 359, c: "Chinese", t: "non" },
  { n: "Schezwan Chicken", p: 389, c: "Chinese", t: "non" },
  { n: "Star Chicken", p: 369, c: "Chinese", t: "non" },
  { n: "Majestic Chicken", p: 369, c: "Chinese", t: "non" },
  { n: "Dragon Chicken", p: 369, c: "Chinese", t: "non" },
  { n: "Apollo Fish", p: 359, c: "Chinese", t: "non" },
  { n: "Velvet Fish", p: 359, c: "Chinese", t: "non" },
  { n: "Chicken Drumsticks", p: 359, c: "Chinese", t: "non" },
  { n: "Chicken Wings", p: 369, c: "Chinese", t: "non" },
  { n: "Chicken Lollipop", p: 369, c: "Chinese", t: "non" },
  { n: "Chicken Shangrilla", p: 389, c: "Chinese", t: "non" },
  { n: "Chicken 85", p: 369, c: "Chinese", t: "non" },
  { n: "Chicken Alpha", p: 369, c: "Chinese", t: "non" },
  { n: "Chilli Prawns", p: 409, c: "Chinese", t: "non" },
  { n: "Loose Prawns", p: 409, c: "Chinese", t: "non" },
  { n: "Golden Fried Prawns", p: 409, c: "Chinese", t: "non" },
  { n: "Dragon Prawns", p: 434, c: "Chinese", t: "non" },
  { n: "Velvet Prawns", p: 434, c: "Chinese", t: "non" },
  { n: "Chicken Tikka", p: 319, c: "Tandoori", t: "non" },
  { n: "Tandoori Chicken Half", p: 369, c: "Tandoori", t: "non" },
  { n: "Tandoori Chicken Full", p: 619, c: "Tandoori", t: "non" },
  { n: "Hariyali Chicken Kebab", p: 389, c: "Tandoori", t: "non" },
  { n: "Murg Malai Kebab", p: 364, c: "Tandoori", t: "non" },
  { n: "Reshmi Kebab", p: 394, c: "Tandoori", t: "non" },
  { n: "Kalmi Kebab", p: 359, c: "Tandoori", t: "non" },
  { n: "Tangidi Kebab", p: 399, c: "Tandoori", t: "non" },
  { n: "Mutton Seekh Kebab", p: 499, c: "Tandoori", t: "non" },
  { n: "V-Grand Special Tandoori Platter", p: 589, c: "Tandoori", t: "non" },
  { n: "Biryani Rice", p: 214, c: "Biryani", t: "veg" },
  { n: "Veg Biryani", p: 259, c: "Biryani", t: "veg" },
  { n: "Special Veg Biryani", p: 269, c: "Biryani", t: "veg" },
  { n: "Mushroom Biryani", p: 269, c: "Biryani", t: "veg" },
  { n: "Paneer Biryani", p: 269, c: "Biryani", t: "veg" },
  { n: "Cashew Nut Biryani", p: 299, c: "Biryani", t: "veg" },
  { n: "Egg Biryani", p: 259, c: "Biryani", t: "non" },
  { n: "Chicken Dum Biryani", p: 309, c: "Biryani", t: "non" },
  { n: "Chicken Fry Piece Biryani", p: 309, c: "Biryani", t: "non" },
  { n: "Boneless Chicken Biryani", p: 309, c: "Biryani", t: "non" },
  { n: "Lollipop Biryani", p: 339, c: "Biryani", t: "non" },
  { n: "Mughlai Chicken Biryani", p: 399, c: "Biryani", t: "non" },
  { n: "Fish Biryani", p: 359, c: "Biryani", t: "non" },
  { n: "Tikka Biryani", p: 399, c: "Biryani", t: "non" },
  { n: "Tandoori Biryani", p: 399, c: "Biryani", t: "non" },
  { n: "Mutton Dum Biryani", p: 499, c: "Biryani", t: "non" },
  { n: "Mutton Fry Biryani", p: 499, c: "Biryani", t: "non" },
  { n: "Mutton Kheema Biryani", p: 499, c: "Biryani", t: "non" },
  { n: "Prawns Biryani", p: 434, c: "Biryani", t: "non" },
  { n: "Rambo Biryani", p: 399, c: "Biryani", t: "non" },
  { n: "Dilkush Biryani", p: 399, c: "Biryani", t: "non" },
  { n: "Raju Gari Kodi Biryani", p: 399, c: "Biryani", t: "non" },
  { n: "Rangamma Gari Kodi Biryani", p: 399, c: "Biryani", t: "non" },
  { n: "Ajantha Biryani", p: 429, c: "Biryani", t: "non" },
  { n: "Ulavacharu Chicken Biryani", p: 399, c: "Biryani", t: "non" },
  { n: "Kona Seema Chicken Biryani", p: 399, c: "Biryani", t: "non" },
  { n: "Pachimirchi Chicken Biryani", p: 399, c: "Biryani", t: "non" },
  { n: "Military Mutton Biryani", p: 499, c: "Biryani", t: "non" },
  { n: "Raju Gari Royyala Biryani", p: 439, c: "Biryani", t: "non" },
  { n: "OG Gongura Chicken Biryani", p: 399, c: "Biryani", t: "non" },
  { n: "Mirchi Bajji Biryani", p: 399, c: "Biryani", t: "veg" },
  { n: "Sultani Chicken Biryani", p: 399, c: "Biryani", t: "non" },
  { n: "Mutton Shahi Gosh Biryani", p: 499, c: "Biryani", t: "non" },
  { n: "Veg Fried Rice", p: 229, c: "Chinese", t: "veg" },
  { n: "Jeera Fried Rice", p: 234, c: "Chinese", t: "veg" },
  { n: "Schezwan Fried Rice", p: 254, c: "Chinese", t: "veg" },
  { n: "Paneer Fried Rice", p: 254, c: "Chinese", t: "veg" },
  { n: "Mushroom Fried Rice", p: 279, c: "Chinese", t: "veg" },
  { n: "Veg Noodles", p: 254, c: "Chinese", t: "veg" },
  { n: "Schezwan Noodles", p: 269, c: "Chinese", t: "veg" },
  { n: "Paneer Noodles", p: 259, c: "Chinese", t: "veg" },
  { n: "Mushroom Noodles", p: 259, c: "Chinese", t: "veg" },
  { n: "Egg Fried Rice", p: 259, c: "Chinese", t: "non" },
  { n: "Egg Schezwan Fried Rice", p: 269, c: "Chinese", t: "non" },
  { n: "Egg Noodles", p: 259, c: "Chinese", t: "non" },
  { n: "Egg Schezwan Noodles", p: 269, c: "Chinese", t: "non" },
  { n: "Chicken Fried Rice", p: 289, c: "Chinese", t: "non" },
  { n: "Chicken Schezwan Fried Rice", p: 299, c: "Chinese", t: "non" },
  { n: "Chicken Noodles", p: 289, c: "Chinese", t: "non" },
  { n: "Chicken Schezwan Noodles", p: 299, c: "Chinese", t: "non" },
  { n: "V-Grand Special Chicken Fried Rice", p: 319, c: "Chinese", t: "non" },
  { n: "Dal Fry", p: 159, c: "Curries", t: "veg" },
  { n: "Dal Tadka", p: 169, c: "Curries", t: "veg" },
  { n: "Tomato Curry", p: 189, c: "Curries", t: "veg" },
  { n: "Aloo Masala", p: 209, c: "Curries", t: "veg" },
  { n: "Green Peas Masala", p: 209, c: "Curries", t: "veg" },
  { n: "Plain Palak", p: 209, c: "Curries", t: "veg" },
  { n: "Paneer Palak", p: 269, c: "Curries", t: "veg" },
  { n: "Kadai Paneer", p: 289, c: "Curries", t: "veg" },
  { n: "Mixed Veg Curry", p: 239, c: "Curries", t: "veg" },
  { n: "Kadai Veg Curry", p: 259, c: "Curries", t: "veg" },
  { n: "Capsicum Masala", p: 209, c: "Curries", t: "veg" },
  { n: "Baby Corn Masala", p: 239, c: "Curries", t: "veg" },
  { n: "Mushroom Curry", p: 259, c: "Curries", t: "veg" },
  { n: "Veg Kheema Curry", p: 259, c: "Curries", t: "veg" },
  { n: "Malai Kofta", p: 259, c: "Curries", t: "veg" },
  { n: "Veg Jaipuri", p: 259, c: "Curries", t: "veg" },
  { n: "Shahi Kurma", p: 259, c: "Curries", t: "veg" },
  { n: "Methi Chaman", p: 284, c: "Curries", t: "veg" },
  { n: "Paneer Butter Masala", p: 289, c: "Curries", t: "veg" },
  { n: "Cashew Nut Curry", p: 289, c: "Curries", t: "veg" },
  { n: "Egg Burji", p: 154, c: "Curries", t: "non" },
  { n: "Omelette Curry", p: 174, c: "Curries", t: "non" },
  { n: "Boiled Egg Curry", p: 189, c: "Curries", t: "non" },
  { n: "Chicken Afghani", p: 344, c: "Curries", t: "non" },
  { n: "Butter Chicken", p: 369, c: "Curries", t: "non" },
  { n: "Chicken Priya Pasand", p: 369, c: "Curries", t: "non" },
  { n: "Chicken Shahi Kurma", p: 369, c: "Curries", t: "non" },
  { n: "Kashmiri Chicken", p: 369, c: "Curries", t: "non" },
  { n: "Chicken Tikka Masala", p: 369, c: "Curries", t: "non" },
  { n: "Cashew Nut Chicken Curry", p: 369, c: "Curries", t: "non" },
  { n: "Maharani Chicken Curry", p: 369, c: "Curries", t: "non" },
  { n: "Chicken Curry", p: 329, c: "Curries", t: "non" },
  { n: "Andhra Chicken Curry", p: 329, c: "Curries", t: "non" },
  { n: "Kadai Chicken", p: 329, c: "Curries", t: "non" },
  { n: "Gongura Chicken", p: 329, c: "Curries", t: "non" },
  { n: "Fish Curry", p: 359, c: "Curries", t: "non" },
  { n: "Fish Fry Curry", p: 359, c: "Curries", t: "non" },
  { n: "Mughlai Chicken", p: 389, c: "Curries", t: "non" },
  { n: "Prawns Fry", p: 425, c: "Curries", t: "non" },
  { n: "Prawns Curry", p: 425, c: "Curries", t: "non" },
  { n: "Gongura Prawns", p: 425, c: "Curries", t: "non" },
  { n: "Mutton Fry", p: 499, c: "Curries", t: "non" },
  { n: "Mutton Curry", p: 499, c: "Curries", t: "non" },
  { n: "Gongura Mutton", p: 499, c: "Curries", t: "non" },
  { n: "Mutton Kheema Curry", p: 499, c: "Curries", t: "non" },
  { n: "Gongura Mutton Curry", p: 499, c: "Curries", t: "non" },
  { n: "Pulka", p: 39, c: "Breads", t: "veg" },
  { n: "Plain Roti", p: 54, c: "Breads", t: "veg" },
  { n: "Butter Roti", p: 59, c: "Breads", t: "veg" },
  { n: "Plain Naan", p: 54, c: "Breads", t: "veg" },
  { n: "Butter Naan", p: 64, c: "Breads", t: "veg" },
  { n: "Garlic Naan", p: 74, c: "Breads", t: "veg" },
  { n: "Methi Naan", p: 74, c: "Breads", t: "veg" },
  { n: "Methi Paratha", p: 74, c: "Breads", t: "veg" },
  { n: "Paneer Kulcha", p: 89, c: "Breads", t: "veg" },
  { n: "Masala Kulcha", p: 89, c: "Breads", t: "veg" },
  { n: "Plain Rice", p: 109, c: "Rice", t: "veg" },
  { n: "Sambar Rice", p: 149, c: "Rice", t: "veg" },
  { n: "Tomato Rice", p: 149, c: "Rice", t: "veg" },
  { n: "Curd Rice", p: 149, c: "Rice", t: "veg" },
  { n: "Special Curd Rice (Fruit \u0026 Nuts)", p: 199, c: "Rice", t: "veg" },
  { n: "Vanilla", p: 85, c: "Desserts", t: "veg" },
  { n: "Strawberry", p: 85, c: "Desserts", t: "veg" },
  { n: "Chocolate", p: 100, c: "Desserts", t: "veg" },
  { n: "Butterscotch", p: 100, c: "Desserts", t: "veg" },
  { n: "Pista", p: 100, c: "Desserts", t: "veg" },
  { n: "Mango", p: 100, c: "Desserts", t: "veg" },
  { n: "Black Current", p: 100, c: "Desserts", t: "veg" },
  { n: "American Nuts", p: 125, c: "Desserts", t: "veg" },
  { n: "Italian Bounty", p: 125, c: "Desserts", t: "veg" },
  { n: "Caramel", p: 125, c: "Desserts", t: "veg" },
  { n: "Vanilla Milkshake", p: 85, c: "Drinks", t: "veg" },
  { n: "Strawberry Milkshake", p: 85, c: "Drinks", t: "veg" },
  { n: "Chocolate Milkshake", p: 100, c: "Drinks", t: "veg" },
  { n: "Pista Milkshake", p: 100, c: "Drinks", t: "veg" },
  { n: "Black Current Milkshake", p: 100, c: "Drinks", t: "veg" },
  { n: "Mango Milkshake", p: 100, c: "Drinks", t: "veg" },
  { n: "Butterscotch Milkshake", p: 100, c: "Drinks", t: "veg" },
  { n: "Plain Lassi", p: 100, c: "Drinks", t: "veg" },
  { n: "Mango Lassi", p: 100, c: "Drinks", t: "veg" },
];

const navItems = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["pos", "POS Billing", ShoppingCart],
  ["tables", "Tables", Table2],
  ["menu", "Menu", UtensilsCrossed],
  ["orders", "Orders", ClipboardList],
  ["reports", "Reports", ChartNoAxesCombined],
  ["captains", "Captain Analytics", ChartNoAxesCombined],
  ["payroll", "Payroll", DollarSign],
  ["marketing", "Marketing AI", Megaphone],
  ["surveillance", "Surveillance", Camera],
  ["inventory", "Inventory", Package],
  ["pricing", "Pricing", Sparkles],
  ["settings", "Settings", Settings],
];

const btn = "rounded-md bg-[#E53935] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#c62828]";
const cardBase = "rounded-[10px] border border-[#FFCDD2]";
const card = cardBase + " bg-white";
const input = "w-full rounded-[4px] border border-[#FFCDD2] bg-white px-3 py-2 text-sm outline-none focus:border-[#E53935]";

const CAPTAINS = [
  { id: "C1", name: "Lakshmi", img: "👩‍💼", shift: "11AM-8PM", tables: [12, 13, 14, 15], sales: 50300, orders: 44, rating: 4.9, speed: 12 },
  { id: "C2", name: "Raju", img: "👨‍💼", shift: "9AM-6PM", tables: [1, 2, 3, 4], sales: 48200, orders: 42, rating: 4.8, speed: 13 },
  { id: "C3", name: "Meena", img: "👩‍💼", shift: "10AM-7PM", tables: [5, 6, 7, 8], sales: 42900, orders: 38, rating: 4.6, speed: 14 },
  { id: "C4", name: "Suresh", img: "👨‍💼", shift: "12PM-9PM", tables: [9, 10, 11], sales: 39750, orders: 35, rating: 4.4, speed: 16 },
];

const INITIAL_ACTIVITY = [
  { id: 1, text: "Raju closed Table 4 bill for ₹2,450", time: "2 min ago", type: "success" },
  { id: 2, text: "Lakshmi sent KOT for Table 12", time: "5 min ago", type: "info" },
  { id: 3, text: "Meena received ₹320 tip via UPI", time: "12 min ago", type: "tip" },
  { id: 4, text: "Suresh sold 3 Premium Thalis", time: "15 min ago", type: "sales" },
];

function Login({ onLogin, onCaptainLogin }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FFF5F5] p-4 md:p-6">
      <div className="w-full max-w-lg rounded-2xl border border-[#FFCDD2] bg-white pt-4 md:pt-6 px-6 md:px-10 pb-6 md:pb-10 shadow-xl">
        <div className="mb-0 flex items-center justify-center">
          <img 
            src="/logo softshape.ai.png" 
            alt="softshape.ai logo" 
            className="w-full max-w-[280px] sm:max-w-[400px] md:max-w-[480px] h-auto object-contain transition-all duration-700 hover:scale-[1.03]" 
          />
        </div>

        <div className="mb-6 md:mb-8 text-center">
          <p className="text-[8px] md:text-[9px] font-bold uppercase tracking-[0.12em] md:tracking-[0.15em] text-[#6B6B6B] opacity-50">
            Powered by <span className="text-[#1A1A1A] opacity-100">Vtech</span>
          </p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 mb-6">
            <button onClick={onLogin} className="flex flex-col items-center gap-2 p-4 rounded-xl border border-[#FFCDD2] hover:border-[#E53935] hover:bg-[#FFEBEE] transition-all group">
              <div className="h-10 w-10 rounded-full bg-[#FFEBEE] flex items-center justify-center text-xl group-hover:scale-110 transition-transform">👑</div>
              <span className="text-xs font-bold text-[#B71C1C]">Admin Portal</span>
            </button>
            <div className="relative group">
              <div className="flex flex-col items-center gap-2 p-4 rounded-xl border border-[#FFCDD2] bg-gray-50 opacity-50 cursor-not-allowed">
                <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-xl">📱</div>
                <span className="text-xs font-bold text-gray-500">Kitchen View</span>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#FFCDD2]"></div></div>
            <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-widest"><span className="bg-white px-2 text-[#6B6B6B]">Or Login as Captain</span></div>
          </div>

          <div className="grid grid-cols-4 gap-2 py-2">
            {CAPTAINS.map(c => (
              <button key={c.id} onClick={() => onCaptainLogin(c)} className="flex flex-col items-center gap-1 group">
                <div className="h-12 w-12 rounded-full border-2 border-transparent group-hover:border-[#E53935] transition-all flex items-center justify-center bg-[#FFEBEE] text-xl shadow-sm">
                  {c.img}
                </div>
                <span className="text-[10px] font-bold text-[#6B6B6B] group-hover:text-[#E53935]">{c.name}</span>
              </button>
            ))}
          </div>
          
          <button onClick={onLogin} className={`${btn} w-full h-12 text-base shadow-lg shadow-red-100 mt-2`}>
            Enter Admin Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [spireOpen, setSpireOpen] = useState(false);
  const [tableDetail, setTableDetail] = useState(null);
  const [payslip, setPayslip] = useState(null);
  const [incident, setIncident] = useState(false);
  const [poOpen, setPoOpen] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [upload, setUpload] = useState(null);
  const [dishModalOpen, setDishModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [posted, setPosted] = useState(false);
  
  // Live Demo State
  const [liveCaptains, setLiveCaptains] = useState(CAPTAINS);
  const [activityLog, setActivityLog] = useState(INITIAL_ACTIVITY);
  const [revenue, setRevenue] = useState(67950);
  const [ordersCount, setOrdersCount] = useState(89);

  const handleOrderComplete = (captainId, amount, itemsCount, paymentMode) => {
    setRevenue(prev => prev + amount);
    setOrdersCount(prev => prev + 1);
    
    setLiveCaptains(prev => prev.map(c => {
      if (c.id === captainId || (captainId === "ADMIN" && c.name === "Raju")) { // Default to Raju if admin for demo
        return {
          ...c,
          sales: c.sales + amount,
          orders: c.orders + 1,
        };
      }
      return c;
    }));

    const captainName = captainId === "ADMIN" ? "Admin" : CAPTAINS.find(c => c.id === captainId)?.name || "Staff";
    const newActivity = {
      id: Date.now(),
      text: `${captainName} closed order for ₹${amount.toLocaleString()} (${paymentMode})`,
      time: "Just now",
      type: "success"
    };
    setActivityLog(prev => [newActivity, ...prev.slice(0, 7)]);
  };

  const handleKOTSend = (captainName, table) => {
    const newActivity = {
      id: Date.now(),
      text: `${captainName} sent KOT for Table ${table}`,
      time: "Just now",
      type: "info"
    };
    setActivityLog(prev => [newActivity, ...prev.slice(0, 7)]);
  };

  // Simulation Effect
  useEffect(() => {
    if (!loggedIn) return;
    
    const interval = setInterval(() => {
      const randomCaptain = CAPTAINS[Math.floor(Math.random() * CAPTAINS.length)];
      const randomAmount = Math.floor(Math.random() * 3000) + 500;
      const modes = ["Cash", "UPI", "Card"];
      const randomMode = modes[Math.floor(Math.random() * modes.length)];
      
      const eventType = Math.random() > 0.3 ? "success" : "info";
      let text = "";
      
      if (eventType === "success") {
        text = `${randomCaptain.name} closed Table ${Math.floor(Math.random() * 20) + 1} bill for ₹${randomAmount.toLocaleString()} (${randomMode})`;
        setRevenue(prev => prev + randomAmount);
        setOrdersCount(prev => prev + 1);
        setLiveCaptains(prev => prev.map(c => c.id === randomCaptain.id ? { ...c, sales: c.sales + randomAmount, orders: c.orders + 1 } : c));
      } else {
        text = `${randomCaptain.name} sent KOT for Table ${Math.floor(Math.random() * 20) + 1}`;
      }

      setActivityLog(prev => [{
        id: Date.now(),
        text,
        time: "Just now",
        type: eventType
      }, ...prev.slice(0, 7)]);

    }, 15000); // Simulate every 15 seconds

    return () => clearInterval(interval);
  }, [loggedIn]);

  const title = useMemo(() => navItems.find((x) => x[0] === page)?.[1] ?? "Dashboard", [page]);

  const onLogin = () => {
    setCurrentUser({ name: "Admin", role: "admin", img: "👑" });
    setLoggedIn(true);
  };

  const onCaptainLogin = (captain) => {
    setCurrentUser({ ...captain, role: "captain" });
    setLoggedIn(true);
    setPage("pos");
  };

  if (!loggedIn) return <Login onLogin={onLogin} onCaptainLogin={onCaptainLogin} />;

  return (
    <div className="min-h-screen bg-[#FFF5F5] text-[#1A1A1A]">
      {/* Sidebar Overlay */}
      {isSidebarOpen && <div className="fixed inset-0 z-40 bg-black/20 lg:hidden" onClick={() => setIsSidebarOpen(false)} />}
      
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[240px] flex-col border-r border-[#FFCDD2] bg-white transition-transform duration-300 md:translate-x-0 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-16 items-center border-b border-[#FFCDD2] px-6">
          <div className="text-2xl font-black text-[#1A1A1A]">softshape<span className="text-[#E53935]">.ai</span></div>
        </div>
        <div className="p-4 border-b border-[#FFCDD2] bg-[#FFF5F5]/50">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-[#E53935] flex items-center justify-center text-white font-bold shadow-sm ring-2 ring-[#FFCDD2]">
              {currentUser?.img || "👑"}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold truncate text-[#1A1A1A]">{currentUser?.name}</p>
              <p className="text-[10px] uppercase font-black text-[#B71C1C] tracking-tighter opacity-70">{currentUser?.role}</p>
            </div>
          </div>
        </div>
        <nav className="flex-grow space-y-1 overflow-y-auto p-4 custom-scrollbar">
          {navItems.map(([id, label, Icon]) => (
            <button key={id} onClick={() => { setPage(id); setIsSidebarOpen(false); }} className={`flex w-full items-center gap-3 rounded-[8px] px-3 py-2.5 text-sm font-semibold transition-all ${page === id ? "bg-[#FFEBEE] text-[#E53935] shadow-sm" : "text-[#6B6B6B] hover:bg-[#FFF5F5] hover:text-[#E53935]"}`}>
              <Icon size={18} className={page === id ? "text-[#E53935]" : "text-[#B71C1C]"} />
              {label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-[#FFCDD2]">
          <button onClick={() => setLoggedIn(false)} className="flex w-full items-center gap-3 rounded-[8px] px-3 py-2.5 text-sm font-semibold text-gray-500 hover:bg-gray-100 transition-colors">
            <LogOut size={18} />Logout
          </button>
        </div>
      </aside>

      <div className="flex flex-col md:ml-[240px] h-[100dvh] overflow-hidden">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#FFCDD2] bg-white px-4 md:px-6">
          <div className="flex items-center gap-2 md:gap-3 overflow-hidden">
            <button onClick={() => setIsSidebarOpen(true)} className="flex-shrink-0 rounded-md border border-[#FFCDD2] p-2 md:hidden">
              <LayoutDashboard size={18} />
            </button>
            <div className="text-base md:text-xl font-bold truncate">{title}</div>
          </div>
          <div className="hidden lg:block text-sm text-[#6B6B6B]">Wednesday, 7 May 2025</div>
          <div className="flex items-center gap-1.5 md:gap-3 flex-shrink-0">
            <button className="relative rounded-md border border-[#FFCDD2] p-1.5 md:p-2">
              <Bell size={16} />
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#E53935] px-1 text-[9px] font-bold text-white shadow-sm">3</span>
            </button>
            <button className="rounded-md border border-[#FFCDD2] p-1.5 md:p-2"><Search size={16} /></button>
            <div className="h-7 w-7 md:h-8 md:w-8 rounded-full bg-[#FFEBEE]" />
          </div>
        </header>
        <main className="page-enter flex-grow overflow-y-auto p-4 md:p-6 bg-[#FFF5F5]">
          {page === "dashboard" && <Dashboard revenue={revenue} ordersCount={ordersCount} activityLog={activityLog} />}
          {page === "pos" && <Pos currentUser={currentUser} onOrderComplete={handleOrderComplete} onKOTSend={handleKOTSend} />}
          {page === "tables" && <Tables onOpen={setTableDetail} />}
          {page === "menu" && <MenuPage onAddDish={() => setDishModalOpen(true)} />}
          {page === "orders" && <Orders />}
          {page === "reports" && <Reports />}
          {page === "captains" && (
            <Suspense fallback={<div className={card + " p-4"}>Loading captain analytics...</div>}>
              <CaptainPerformanceDashboard captains={liveCaptains} />
            </Suspense>
          )}
          {page === "payroll" && <Payroll onPayslip={setPayslip} />}
          {page === "marketing" && <Marketing upload={upload} setUpload={setUpload} uploadRef={uploadRef} generated={generated} setGenerated={setGenerated} posted={posted} setPosted={setPosted} />}
          {page === "surveillance" && <Surveillance onIncident={() => setIncident(true)} />}
          {page === "inventory" && <Inventory onPo={() => setPoOpen(true)} />}
          {page === "pricing" && <Pricing />}
          {page === "settings" && <SettingsPage />}
        </main>
      </div>

      <button onClick={() => setSpireOpen((v) => !v)} className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-[#E53935] px-4 py-3 text-white hover:bg-[#c62828]">
        <Bot size={16} /> Ask Spire ✦
      </button>
      {spireOpen && <SpirePanel onClose={() => setSpireOpen(false)} />}

      {tableDetail && <Modal title={`Table ${tableDetail.id} Details`} onClose={() => setTableDetail(null)}>
        <p className="text-sm text-[#6B6B6B]">{tableDetail.items}</p>
        <p className="mt-2 text-sm">Seated: {tableDetail.time}</p>
        <p className="text-sm">Bill: {tableDetail.bill}</p>
        <div className="mt-4 flex gap-2">
          <button className={btn}>View Bill</button>
          <button className="rounded-md border border-[#FFCDD2] px-3 py-2 text-sm">Mark Available</button>
        </div>
      </Modal>}

      {payslip && <Modal title={`${payslip} Payslip`} onClose={() => setPayslip(null)}>
        <div className={card + " p-4"}>
          <h4 className="font-semibold">Ravi's Kitchen - Salary Slip</h4>
          <p className="text-sm text-[#6B6B6B]">Month: May 2025</p>
          <p className="mt-2 text-sm">Base: ₹12,000 | Deductions: ₹1,200 | Net: ₹10,800</p>
          <button className={`${btn} mt-4`}>Download PDF</button>
        </div>
      </Modal>}

      {incident && <Modal title="Camera Incident" onClose={() => setIncident(false)}>
        <div className="rounded-md border border-[#E53935] bg-[#FFEBEE] p-3 text-sm">CAM-03 | 14:32:07 | Storage Zone | Confidence: 91%</div>
      </Modal>}

      {poOpen && <Modal title="Auto Purchase Order" onClose={() => setPoOpen(false)}>
        <p className="text-sm">Mutton: 10kg | Milk: 15L</p>
      </Modal>}

      <AIDishCreationModal
        open={dishModalOpen}
        onClose={() => setDishModalOpen(false)}
        onSave={() => setDishModalOpen(false)}
      />
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-2 sm:p-4">
      <div className="relative mx-auto my-4 sm:my-8 w-full max-w-lg rounded-[15px] border border-[#FFCDD2] bg-white p-4 md:p-6 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-[#FFEBEE] rounded-full transition-colors">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Dashboard({ revenue, ordersCount, activityLog }) {
  const sales = [{ d: "Mon", v: 32 }, { d: "Tue", v: 41 }, { d: "Wed", v: 47 }, { d: "Thu", v: 38 }, { d: "Fri", v: 55 }, { d: "Sat", v: 62 }, { d: "Sun", v: 71 }];
  return (
    <div className="space-y-4">
      <div className="rounded-[10px] border border-[#EF9A9A] bg-[#FFEBEE] p-4 text-sm md:text-base animate-fade-in flex items-center gap-3">
        <span className="text-xl">✨</span>
        <p className="font-medium">Live Operational Insight: <span className="font-bold text-[#B71C1C]">Chicken Dum Biryani</span> is moving 15% faster than usual. Average prep time is 12 mins.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {[
          { label: "Today's Revenue", value: `₹${revenue.toLocaleString()}`, sub: "↑12%", color: "text-[#2E7D32]" },
          { label: "Total Orders", value: ordersCount, sub: "live", color: "text-[#1A1A1A]" },
          { label: "Tables Occupied", value: "14/20", sub: "active", color: "text-[#1A1A1A]" },
          { label: "Staff Present", value: "18/21", sub: "today", color: "text-[#1A1A1A]" },
        ].map((x) => (
          <div key={x.label} className={card + " border-t-4 border-t-[#E53935] p-3 md:p-4 min-w-0 shadow-sm transition-all hover:translate-y-[-2px]"}>
            <p className="text-[10px] md:text-xs font-bold uppercase tracking-tight text-[#6B6B6B] truncate">{x.label}</p>
            <div className="mt-1 md:mt-2 flex flex-col sm:flex-row sm:items-baseline gap-1 overflow-hidden">
              <p className="text-xl md:text-2xl lg:text-3xl font-black text-[#1A1A1A] whitespace-nowrap animate-number-grow">{x.value}</p>
              <p className={`text-[10px] md:text-xs font-bold ${x.color} whitespace-nowrap`}>{x.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={card + " p-4 lg:col-span-2"}>
          <h3 className="mb-4 font-bold text-sm md:text-base flex items-center gap-2">
            <ChartNoAxesCombined size={18} className="text-[#E53935]" />
            Sales Attribution - Last 7 days
          </h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sales}>
                <XAxis dataKey="d" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#FFEBEE' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="v" fill="#E53935" radius={[6, 6, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={card + " p-0 overflow-hidden flex flex-col h-[320px] lg:h-auto"}>
          <div className="p-4 border-b border-[#FFCDD2] bg-gray-50 flex items-center justify-between">
            <h3 className="font-bold text-sm md:text-base flex items-center gap-2">
              <ClipboardList size={18} className="text-[#E53935]" />
              Live Activity
            </h3>
            <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
          </div>
          <div className="flex-grow overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {activityLog.map((log) => (
              <div key={log.id} className="flex gap-3 animate-slide-in">
                <div className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${
                  log.type === "success" ? "bg-green-500" : 
                  log.type === "info" ? "bg-blue-500" : 
                  log.type === "tip" ? "bg-amber-500" : "bg-red-500"
                }`} />
                <div className="flex-grow min-w-0">
                  <p className="text-xs font-medium text-[#1A1A1A] leading-relaxed">{log.text}</p>
                  <p className="text-[10px] text-[#6B6B6B] mt-1">{log.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className={card + " p-4 border-l-4 border-l-blue-500"}>
          <h3 className="mb-3 font-bold text-[#1A1A1A] flex items-center gap-2">
            <Bot size={18} className="text-blue-500" />
            AI Operational Insights
          </h3>
          <div className="space-y-3">
            <p className="text-xs text-[#6B6B6B] flex items-start gap-2">
              <span className="text-blue-500 font-bold">●</span>
              Table 7 has been idle for 25 mins after main course. Suggesting dessert menu to Captain Raju.
            </p>
            <p className="text-xs text-[#6B6B6B] flex items-start gap-2">
              <span className="text-blue-500 font-bold">●</span>
              Stock for <span className="font-bold text-[#1A1A1A]">Basmati Rice</span> is 15% lower than expected velocity.
            </p>
          </div>
        </div>

        <div className={card + " p-4 border-l-4 border-l-[#E53935]"}>
          <h3 className="mb-3 font-bold text-[#1A1A1A] flex items-center gap-2">
            <Megaphone size={18} className="text-[#E53935]" />
            Management Alerts
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between bg-red-50 p-2 rounded border border-red-100">
              <p className="text-xs font-bold text-red-700">Deleted Bill: #1042</p>
              <span className="text-[10px] bg-red-700 text-white px-1.5 rounded">Action</span>
            </div>
            <p className="text-xs text-[#6B6B6B]">₹1,200 manual discount added by Raju (Table 4).</p>
            <p className="text-xs text-[#6B6B6B] font-medium text-amber-700">⚠ 3 bills cancelled after KOT confirmation.</p>
          </div>
        </div>

        <div className={card + " p-4 border-l-4 border-l-green-500"}>
          <h3 className="mb-3 font-bold text-[#1A1A1A] flex items-center gap-2">
            <Sparkles size={18} className="text-green-500" />
            Captain Leaderboard
          </h3>
          <div className="space-y-2">
            {activityLog.filter(l => l.type === "success").slice(0, 3).map((l, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-[#E53935]">#{i+1}</span>
                  <span className="text-xs font-bold">{l.text.split(' ')[0]}</span>
                </div>
                <span className="text-xs font-black text-[#2E7D32]">↑ High</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Pos({ currentUser, onOrderComplete, onKOTSend }) {
  const [cat, setCat] = useState("All");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [kotStatus, setKotStatus] = useState(null); // 'sending', 'delivered', 'accepted'
  const [table, setTable] = useState("8");
  
  const items = useMemo(() => {
    let filtered = MENU_DATA;
    if (cat !== "All") filtered = filtered.filter(x => x.c === cat);
    if (search) filtered = filtered.filter(x => x.n.toLowerCase().includes(search.toLowerCase()));
    return filtered.slice(0, 18);
  }, [cat, search]);

  const addToCart = (item) => {
    setCart(prev => {
      const existing = prev.find(x => x.n === item.n);
      if (existing) {
        return prev.map(x => x.n === item.n ? { ...x, q: x.q + 1 } : x);
      }
      return [...prev, { ...item, q: 1 }];
    });
  };

  const removeFromCart = (name) => {
    setCart(prev => prev.filter(x => x.n !== name));
  };

  const subtotal = cart.reduce((acc, x) => acc + (x.p * x.q), 0);
  const gst = subtotal * 0.05;
  const total = subtotal + gst;

  const handleSendToKitchen = () => {
    if (cart.length === 0) return;
    
    setKotStatus('sending');
    onKOTSend(currentUser?.name || "Admin", table);
    
    setTimeout(() => {
      setKotStatus('delivered');
      setTimeout(() => {
        setKotStatus('accepted');
        setTimeout(() => setKotStatus(null), 3000);
      }, 1500);
    }, 1500);
  };

  const handleBill = (paymentMode) => {
    if (cart.length === 0) return;
    onOrderComplete(currentUser?.id || "ADMIN", total, cart.length, paymentMode);
    setCart([]);
    alert(`Order #1043 closed by ${currentUser?.name || "Admin"}. Payment: ${paymentMode}`);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div className="lg:col-span-3 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-grow">
            <input 
              className={input + " pl-10 h-11"} 
              placeholder="Search items or type code..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6B6B]" size={18} />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
            {["All", "Biryani", "Starters", "Chinese", "Tandoori", "Curries", "Breads", "Rice", "Drinks", "Desserts"].map((x) => (
              <button key={x} onClick={() => setCat(x)} className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-xs font-bold transition-all ${cat === x ? "border-[#E53935] bg-[#E53935] text-white shadow-md shadow-red-100" : "border-[#FFCDD2] bg-white text-[#6B6B6B] hover:bg-[#FFF5F5]"}`}>
                {x}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
          {items.map((x) => (
            <div key={x.n} onClick={() => addToCart(x)} className={card + " p-3 flex flex-col justify-between transition-transform active:scale-95 cursor-pointer group hover:border-[#E53935]"}>
              <div>
                <p className="font-bold text-sm md:text-base text-[#1A1A1A] line-clamp-1 group-hover:text-[#E53935]">{x.n}</p>
                <p className="text-sm font-semibold text-[#6B6B6B] mt-0.5 whitespace-nowrap">₹{x.p}</p>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className={`h-4 w-4 rounded-sm border flex items-center justify-center ${x.t === "veg" ? "border-green-600" : "border-red-600"}`}>
                  <div className={`h-1.5 w-1.5 rounded-full ${x.t === "veg" ? "bg-green-600" : "bg-red-600"}`} />
                </div>
                <button className={btn + " px-3 py-1 text-[10px] md:text-xs rounded-full"}>Add</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className={"lg:col-span-2 space-y-4"}>
        <div className={card + " p-4 h-fit lg:sticky lg:top-20 shadow-lg shadow-red-50/50 overflow-hidden"}>
          <div className="flex items-center justify-between border-b border-[#FFCDD2] pb-3 mb-3">
            <h3 className="font-bold text-[#1A1A1A]">Order <span className="text-[#B71C1C]">#1043</span></h3>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-[#6B6B6B]">{currentUser?.name}</span>
              <select value={table} onChange={e => setTable(e.target.value)} className="text-xs bg-[#FFEBEE] text-[#B71C1C] px-2 py-0.5 rounded-full font-bold border-none outline-none">
                <option value="8">Table 8</option>
                <option value="4">Table 4</option>
                <option value="12">Table 12</option>
              </select>
            </div>
          </div>
          
          <div className="space-y-3 max-h-[35vh] lg:max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
            {cart.length === 0 ? (
              <div className="py-10 text-center text-[#6B6B6B] text-sm italic">
                Cart is empty. Add some items to start.
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.n} className="flex justify-between items-center text-sm group">
                  <div className="flex flex-col">
                    <span className="font-medium">{item.n}</span>
                    <span className="text-[10px] text-[#6B6B6B]">₹{item.p} x {item.q}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold">₹{item.p * item.q}</span>
                    <button onClick={(e) => { e.stopPropagation(); removeFromCart(item.n); }} className="text-[#E53935] opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 border-t border-[#FFCDD2] pt-3 space-y-1">
            <div className="flex justify-between text-xs text-[#6B6B6B]"><span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between text-xs text-[#6B6B6B]"><span>GST (5%)</span><span>₹{gst.toFixed(2)}</span></div>
            <div className="flex justify-between text-base font-black text-[#1A1A1A] pt-1"><span>Total</span><span>₹{total.toFixed(2)}</span></div>
          </div>

          {kotStatus && (
            <div className="mt-4 p-3 rounded-lg bg-gray-50 border border-dashed border-[#FFCDD2] animate-pulse">
              <p className="text-center text-xs font-bold text-[#B71C1C] flex items-center justify-center gap-2">
                {kotStatus === 'sending' && <><span className="h-2 w-2 rounded-full bg-blue-500" /> Sending to Kitchen KOT...</>}
                {kotStatus === 'delivered' && <><span className="h-2 w-2 rounded-full bg-green-500" /> KOT Delivered Successfully</>}
                {kotStatus === 'accepted' && <><span className="h-2 w-2 rounded-full bg-green-500 animate-ping" /> Kitchen Accepted ✅</>}
              </p>
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button 
              onClick={handleSendToKitchen}
              className="rounded-md border border-[#E53935] bg-[#FFEBEE] py-2 text-xs font-black text-[#B71C1C] hover:bg-[#EF9A9A] transition-all"
            >
              SEND TO KITCHEN
            </button>
            <button className="rounded-md border border-[#FFCDD2] bg-white py-2 text-xs font-bold text-[#6B6B6B]">KOT History</button>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {["Cash", "Card", "UPI"].map((x) => (
              <button key={x} onClick={() => handleBill(x)} className={`rounded-md border py-2 text-xs font-bold transition-all border-[#FFCDD2] bg-white text-[#6B6B6B] hover:bg-[#FFF5F5] hover:border-[#E53935]`}>
                {x}
              </button>
            ))}
          </div>

          <div className="mt-4">
            <button 
              onClick={() => handleBill("UPI")} 
              className={`${btn} w-full py-3 text-sm shadow-md flex items-center justify-center gap-2`}
            >
              <UtensilsCrossed size={16} /> Complete & Print Bill
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Tables({ onOpen }) {
  const data = [
    { id: 1, status: "occupied", details: "4 guests — ₹1,850 — 45 min" },
    { id: 2, status: "available", details: "Available" },
    { id: 3, status: "occupied", details: "2 guests — ₹650 — 20 min" },
    { id: 4, status: "reserved", details: "Priya 7:00 PM" },
    { id: 5, status: "occupied", details: "6 guests — ₹3,200 — 1h 10m" },
    { id: 6, status: "available", details: "Available" },
    { id: 7, status: "occupied", details: "3 guests — ₹980 — 35 min" },
    { id: 8, status: "occupied", details: "4 guests — ₹1,354 — 15 min" },
    { id: 9, status: "available", details: "Available" },
    { id: 10, status: "reserved", details: "Wedding party 8PM" },
    { id: 11, status: "occupied", details: "2 guests — ₹480 — 12 min" },
    { id: 12, status: "available", details: "Available" },
    { id: 13, status: "occupied", details: "5 guests — ₹2,410 — 53 min" },
    { id: 14, status: "available", details: "Available" },
    { id: 15, status: "occupied", details: "4 guests — ₹1,440 — 24 min" },
    { id: 16, status: "occupied", details: "3 guests — ₹1,140 — 32 min" },
    { id: 17, status: "available", details: "Available" },
    { id: 18, status: "occupied", details: "4 guests — ₹1,760 — 41 min" },
    { id: 19, status: "available", details: "Available" },
    { id: 20, status: "occupied", details: "2 guests — ₹720 — 18 min" },
  ];
  return <div className="space-y-4">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <h3 className="font-semibold">Floor Plan — Main Hall</h3>
      <select className={input + " w-full sm:max-w-52"}><option>Main Hall</option><option>Terrace</option></select>
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {data.map((t) => {
        const bg = t.status === "occupied" ? "bg-[#B71C1C] text-white border-[#B71C1C]" : t.status === "reserved" ? "bg-[#FFF3E0] text-[#8D4E00]" : "bg-[#E8F5E9] text-[#1B5E20]";
        const label = t.status === "occupied" ? `Occupied — ${t.details}` : t.status === "reserved" ? `Reserved — ${t.details}` : "Available";
        return <button key={t.id} onClick={() => t.status === "occupied" && onOpen({ id: t.id, items: "Chicken Dum Biryani x2, Mutton Curry x1, Mango Lassi x2", time: "Seated 45 min ago", bill: "₹1,382" })} className={`${cardBase} ${bg} min-h-[96px] p-3 text-left transition-transform active:scale-95`}><p className="text-lg font-extrabold">T{t.id}</p><p className="text-[10px] font-semibold leading-tight">{label}</p></button>;
      })}
    </div>
    <div className="flex flex-wrap items-center gap-4 rounded-lg bg-white p-3 border border-[#FFCDD2] shadow-sm">
      <span className="text-xs font-bold text-[#6B6B6B] uppercase tracking-wider">Status:</span>
      <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#B71C1C]" /><span className="text-xs font-medium">Occupied</span></div>
      <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#E8F5E9] border border-[#1B5E20]" /><span className="text-xs font-medium">Available</span></div>
      <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#FFF3E0] border border-[#8D4E00]" /><span className="text-xs font-medium">Reserved</span></div>
    </div>
  </div>;
}

function MenuPage({ onAddDish }) {
  const [filter, setFilter] = useState("");
  const items = useMemo(() => MENU_DATA.filter(x => x.n.toLowerCase().includes(filter.toLowerCase()) || x.c.toLowerCase().includes(filter.toLowerCase())), [filter]);
  return <div className={card + " p-4"}>
    <div className="mb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
      <div className="flex items-center gap-4 w-full sm:w-auto">
        <h3 className="font-semibold text-lg">Menu Items</h3>
        <input className={input + " h-9 w-48"} placeholder="Search menu..." value={filter} onChange={e => setFilter(e.target.value)} />
      </div>
      <button className={btn} onClick={onAddDish}>+ Add Item</button>
    </div>
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <div className="inline-block min-w-full align-middle">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-[#FFCDD2]">
              <th className="px-4 py-2">Image</th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Price</th>
              <th className="px-4 py-2">Veg/Non</th>
              <th className="px-4 py-2">Available</th>
              <th className="px-4 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 50).map((item) => (
              <tr key={item.n} className="border-b border-[#FFEBEE] hover:bg-[#FFF5F5]">
                <td className="px-4 py-2"><div className="h-10 w-10 rounded-md bg-[#EF9A9A]" /></td>
                <td className="px-4 py-2 font-medium">{item.n}</td>
                <td className="px-4 py-2">{item.c}</td>
                <td className="px-4 py-2">₹{item.p}</td>
                <td className="px-4 py-2">
                  <span className={`inline-flex h-2 w-2 rounded-full mr-2 ${item.t === "veg" ? "bg-green-600" : "bg-red-600"}`} />
                  {item.t === "veg" ? "Veg" : "Non-Veg"}
                </td>
                <td className="px-4 py-2"><span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">Available</span></td>
                <td className="px-4 py-2">
                  <button className="text-blue-600 mr-3">✏️</button>
                  <button className="text-red-600">🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>;
}

function Orders() {
  const rows = [["#1043", "Dine-In", "Table 8", "3", "₹1,382", "Preparing", "5 min ago", "View"], ["#1042", "Dine-In", "Table 7", "4", "₹850", "Ready", "12 min ago", "View"], ["#1041", "Delivery", "Swiggy — Kiran", "2", "₹890", "Dispatched", "18 min ago", "Track"], ["#1040", "Takeaway", "Walk-in", "1", "₹309", "Ready", "22 min ago", "View"], ["#1039", "Dine-In", "Table 12", "6", "₹2,100", "Served", "35 min ago", "Bill"], ["#1038", "Delivery", "Zomato — Ananya", "3", "₹1,100", "Delivered", "45 min ago", "Done"], ["#1037", "Dine-In", "Table 5", "5", "₹3,200", "Preparing", "8 min ago", "View"], ["#1036", "Takeaway", "Walk-in", "2", "₹650", "Ready", "50 min ago", "View"], ["#1035", "Delivery", "Rajat", "4", "₹1,280", "Dispatched", "1h ago", "Track"], ["#1034", "Dine-In", "Table 4", "3", "₹740", "Cancelled", "1h ago", "View"], ["#1033", "Dine-In", "Table 11", "2", "₹520", "Served", "1h 15m", "Bill"], ["#1032", "Delivery", "Nisha", "3", "₹990", "Delivered", "1h 20m", "Done"]];
  return <div className="space-y-4">
    <UnifiedOrdersDashboard />
    <div className="flex gap-2">{["Dine-In (48)", "Takeaway (23)", "Delivery (18)", "All (89)"].map((x, i) => <button key={x} className={`rounded-md border px-3 py-1 text-sm ${i === 0 ? "border-[#E53935] bg-[#FFEBEE]" : "border-[#FFCDD2]"}`}>{x}</button>)}</div>
    <div className="flex flex-col sm:flex-row gap-2">
      <select className={input + " w-full sm:max-w-[150px]"}><option>All Status</option><option>Preparing</option></select>
      <div className="relative flex-grow">
        <input className={input + " pl-9"} placeholder="Search order ID or customer..." />
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6B6B]" size={16} />
      </div>
    </div>
    <div className={card + " overflow-x-auto -mx-4 sm:mx-0"}>
      <div className="inline-block min-w-full align-middle">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-[#FFEBEE]">
            <tr>
              <th className="p-3">Order ID</th>
              <th className="p-3">Type</th>
              <th className="p-3">Customer/Table</th>
              <th className="p-3">Items</th>
              <th className="p-3">Amount</th>
              <th className="p-3">Status</th>
              <th className="p-3">Time</th>
              <th className="p-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]} className="border-b border-[#FFEBEE] hover:bg-[#FFF5F5]">
                <td className="p-3 font-semibold">{r[0]}</td>
                <td className="p-3">{r[1]}</td>
                <td className="p-3">{r[2]}</td>
                <td className="p-3">{r[3]} items</td>
                <td className="p-3 font-bold">{r[4]}</td>
                <td className="p-3">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] md:text-xs font-semibold ${r[5] === "Preparing" ? "bg-orange-100 text-orange-700" :
                    r[5] === "Ready" ? "bg-green-100 text-green-700" :
                      r[5] === "Dispatched" ? "bg-blue-100 text-blue-700" :
                        "bg-[#FFEBEE] text-[#B71C1C]"
                    }`}>{r[5]}</span>
                </td>
                <td className="p-3 text-[#6B6B6B]">{r[6]}</td>
                <td className="p-3"><button className="font-semibold text-[#B71C1C] hover:underline">{r[7]}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>;
}

function Reports() {
  const trend = Array.from({ length: 30 }).map((_, i) => ({ day: i + 1, rev: 8000 + ((i * 977) % 15000) }));
  const pie = [{ name: "Dine-In", value: 55 }, { name: "Delivery", value: 27 }, { name: "Takeaway", value: 18 }];
  return <div className="space-y-4">
    <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
      <div className="flex gap-2 overflow-x-auto pb-1 w-full sm:w-auto">{["Today", "This Week", "This Month", "Custom"].map((x, i) => <button key={x} className={`whitespace-nowrap rounded-md border px-3 py-1 text-sm ${i === 0 ? "border-[#E53935] bg-[#FFEBEE]" : "border-[#FFCDD2]"}`}>{x}</button>)}</div>
      <div className="flex gap-2 w-full sm:w-auto">
        <button className="flex-1 sm:flex-none rounded-md border border-[#E53935] px-3 py-2 text-sm text-[#B71C1C] font-semibold">Download PDF</button>
        <button className="flex-1 sm:flex-none rounded-md border border-[#E53935] px-3 py-2 text-sm text-[#B71C1C] font-semibold">Download CSV</button>
      </div>
    </div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      {["Total Revenue|₹3,47,250", "Total Orders|624", "Avg Order Value|₹556", "Top Item|Chicken Dum Biryani"].map((x) => (
        <div key={x} className={card + " p-3 border-l-4 border-l-[#E53935] min-w-0"}>
          <p className="text-[10px] uppercase tracking-wider text-[#6B6B6B] truncate">{x.split("|")[0]}</p>
          <p className="mt-1 font-bold text-sm md:text-lg truncate">{x.split("|")[1]}</p>
        </div>
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className={card + " p-4 overflow-hidden"}>
        <h3 className="mb-4 font-semibold text-sm md:text-base">Revenue Trend</h3>
        <div className="h-[220px] w-full min-h-[220px]">
          <ResponsiveContainer width="100%" height="100%" debounce={50}>
            <AreaChart data={trend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <XAxis dataKey="day" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
              <Area type="monotone" dataKey="rev" stroke="#E53935" strokeWidth={2} fillOpacity={1} fill="url(#colorRev)" />
              <defs><linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#E53935" stopOpacity={0.2} /><stop offset="95%" stopColor="#E53935" stopOpacity={0} /></linearGradient></defs>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className={card + " p-4 flex flex-col justify-center"}>
        <h3 className="mb-4 font-semibold text-sm md:text-base">Order Type Distribution</h3>
        <div className="h-[180px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pie} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={5}>
                {pie.map((_, i) => <Cell key={i} fill={["#E53935", "#EF9A9A", "#FFCDD2"][i]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs font-medium">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#E53935]" /> Dine-In 55%</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#EF9A9A]" /> Delivery 27%</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#FFCDD2]" /> Takeaway 18%</span>
        </div>
      </div>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className={card + " p-4"}>
        <h3 className="mb-4 font-semibold text-sm md:text-base">Top 5 Items (Revenue)</h3>
        <div className="space-y-3">
          {[
            { n: "Chicken Dum Biryani", q: "280", r: "₹86,520", p: "30%" },
            { n: "Mutton Dum Biryani", q: "220", r: "₹1,09,780", p: "25%" },
            { n: "Loose Prawns", q: "180", r: "₹73,620", p: "20%" },
            { n: "Veg Biryani", q: "150", r: "₹38,850", p: "13%" },
            { n: "Mango Lassi", q: "320", r: "₹32,000", p: "12%" }
          ].map((item) => (
            <div key={item.n} className="flex items-center justify-between text-xs sm:text-sm gap-2">
              <div className="flex flex-col min-w-0">
                <span className="font-medium truncate">{item.n}</span>
                <span className="text-[10px] text-[#6B6B6B]">{item.q} sold</span>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="font-bold">{item.r}</div>
                <div className="text-[10px] text-[#2E7D32]">{item.p} share</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className={card + " p-4"}>
        <h3 className="mb-4 font-semibold text-sm md:text-base">Peak Hours Traffic</h3>
        <div className="space-y-4">
          {["12PM-2PM", "7PM-10PM", "11AM-12PM", "3PM-5PM"].map((time, i) => (
            <div key={time} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>{time}</span>
                <span className="font-semibold">{[95, 88, 45, 20][i]}% capacity</span>
              </div>
              <div className="h-2 w-full rounded-full bg-[#FFEBEE]">
                <div className="h-2 rounded-full bg-[#E53935]" style={{ width: `${[95, 88, 45, 20][i]}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
    <div className={card + " overflow-x-auto -mx-4 sm:mx-0"}>
      <div className="inline-block min-w-full align-middle">
        <h3 className="p-4 font-semibold border-b border-[#FFCDD2]">Staff Performance Metrics</h3>
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-[#FFEBEE]">
            <tr>
              <th className="p-3">Staff Name</th>
              <th className="p-3 text-center">Orders Handled</th>
              <th className="p-3 text-center">Avg Rating</th>
              <th className="p-3 text-center">Attendance</th>
            </tr>
          </thead>
          <tbody>
            {[["Raju", 210, 4.8, "28/30"], ["Meena", 185, 4.6, "30/30"], ["Suresh", 160, 4.4, "26/30"], ["Lakshmi", 190, 4.9, "29/30"]].map((s) => (
              <tr key={s[0]} className="border-b border-[#FFEBEE]">
                <td className="p-3 font-medium">{s[0]}</td>
                <td className="p-3 text-center">{s[1]}</td>
                <td className="p-3 text-center">
                  <span className="flex items-center justify-center gap-1 text-[#F57F17] font-bold">★ {s[2]}</span>
                </td>
                <td className="p-3 text-center text-[#6B6B6B]">{s[3]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>;
}

function Payroll({ onPayslip }) {
  const staff = ["Raju Kumar|Head Chef|₹18,000|28|2|₹1,200|₹16,800|Paid ✓", "Meena Devi|Waiter|₹12,000|30|0|₹0|₹12,000|Paid ✓", "Suresh Babu|Cook|₹14,000|26|4|₹1,867|₹12,133|Pending", "Lakshmi R|Cashier|₹13,000|29|1|₹433|₹12,567|Paid ✓", "Arjun K|Delivery|₹10,000|25|5|₹1,667|₹8,333|Pending", "Priya S|Helper|₹9,000|30|0|₹0|₹9,000|Paid ✓", "Kiran T|Waiter|₹12,000|27|3|₹1,200|₹10,800|Pending", ...Array.from({ length: 14 }).map((_, i) => `Staff ${i + 8}|Support|₹11,000|28|2|₹733|₹10,267|Paid ✓`)];
  return <div className="space-y-6">
    <div className="flex flex-col md:flex-row items-center justify-between gap-4">
      <div>
        <h2 className="text-xl font-bold text-[#1A1A1A]">Staff Payroll Management</h2>
        <p className="text-xs text-[#6B6B6B]">Automated salary calculation & payslip generation</p>
      </div>
      <div className="flex items-center gap-3 w-full md:w-auto">
        <select className={input + " w-full md:w-40"}><option>May 2025</option><option>April 2025</option></select>
        <button className={btn + " whitespace-nowrap"}>Run Payroll</button>
      </div>
    </div>

    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
      <div className={card + " p-3 md:p-4 border-l-4 border-l-[#E53935] shadow-sm min-w-0"}>
        <p className="text-[9px] md:text-[10px] uppercase font-bold tracking-widest text-[#6B6B6B] truncate">Total Payroll</p>
        <p className="mt-1 text-lg md:text-2xl font-black text-[#1A1A1A] truncate">₹2,35,233</p>
        <p className="text-[9px] md:text-[10px] text-[#2E7D32] font-bold mt-1">21 Staff</p>
      </div>
      <div className={card + " p-3 md:p-4 border-l-4 border-l-[#2E7D32] shadow-sm min-w-0"}>
        <p className="text-[9px] md:text-[10px] uppercase font-bold tracking-widest text-[#6B6B6B] truncate">Total Paid</p>
        <p className="mt-1 text-lg md:text-2xl font-black text-[#2E7D32] truncate">₹1,75,467</p>
        <div className="mt-2 h-1 w-full bg-gray-100 rounded-full overflow-hidden hidden sm:block">
          <div className="h-full bg-[#2E7D32]" style={{ width: '74%' }} />
        </div>
      </div>
      <div className={card + " p-3 md:p-4 border-l-4 border-l-[#F57F17] shadow-sm min-w-0 col-span-2 sm:col-span-1"}>
        <p className="text-[9px] md:text-[10px] uppercase font-bold tracking-widest text-[#6B6B6B] truncate">Total Pending</p>
        <p className="mt-1 text-lg md:text-2xl font-black text-[#F57F17] truncate">₹59,766</p>
        <p className="text-[9px] md:text-[10px] text-[#6B6B6B] mt-1">5 Salaries pending</p>
      </div>
    </div>

    <div className={card + " overflow-hidden shadow-sm"}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-[#FFEBEE] border-b border-[#FFCDD2]">
            <tr>
              <th className="p-4 font-bold text-[#B71C1C] text-xs uppercase tracking-wider">Staff Details</th>
              <th className="p-4 font-bold text-[#B71C1C] text-xs uppercase tracking-wider text-center">Days</th>
              <th className="p-4 font-bold text-[#B71C1C] text-xs uppercase tracking-wider text-center">Deductions</th>
              <th className="p-4 font-bold text-[#B71C1C] text-xs uppercase tracking-wider text-right">Net Salary</th>
              <th className="p-4 font-bold text-[#B71C1C] text-xs uppercase tracking-wider text-center">Status</th>
              <th className="p-4 font-bold text-[#B71C1C] text-xs uppercase tracking-wider text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#FFEBEE]">
            {staff.map((s) => {
              const c = s.split("|");
              return (
                <tr key={s} className="hover:bg-[#FFF5F5] transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-[#FFEBEE] flex items-center justify-center text-[10px] font-bold text-[#E53935]">
                        {c[0].charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-[#1A1A1A]">{c[0]}</p>
                        <p className="text-[10px] text-[#6B6B6B]">{c[1]}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <p className="font-semibold">{c[3]}/30</p>
                    <p className="text-[10px] text-red-500">{c[4]} Absents</p>
                  </td>
                  <td className="p-4 text-center font-bold text-red-600">{c[5]}</td>
                  <td className="p-4 text-right">
                    <p className="font-black text-lg">{c[6]}</p>
                    <p className="text-[10px] text-[#6B6B6B]">Base: {c[2]}</p>
                  </td>
                  <td className="p-4 text-center">
                    <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${c[7].includes("Paid") ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700 animate-pulse"}`}>
                      {c[7]}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <button className="rounded-lg bg-white border border-[#FFCDD2] p-2 hover:border-[#E53935] hover:text-[#E53935] transition-all" onClick={() => onPayslip(c[0])}>
                      <Bot size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
    <div className="rounded-xl bg-gradient-to-r from-[#B71C1C] to-[#E53935] p-4 text-white shadow-lg flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Sparkles size={24} />
        <div>
          <p className="text-sm font-bold">Spire.ai Smart Insight</p>
          <p className="text-xs opacity-90">Payroll for May is 12% lower than April due to seasonal staff adjustments.</p>
        </div>
      </div>
      <button className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg text-xs font-bold transition-all">Details</button>
    </div>
  </div>;
}

function Marketing({ upload, setUpload, uploadRef, generated, setGenerated, posted, setPosted }) {
  const [selectedDesign, setSelectedDesign] = useState(0);
  const [language, setLanguage] = useState("en");
  const [dishName, setDishName] = useState("Chicken Dum Biryani");
  const [isGenerating, setIsGenerating] = useState(false);
  const [designs, setDesigns] = useState([]);
  const [recommendation, setRecommendation] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // New States for Workflow
  const [socialConnected, setSocialConnected] = useState({ ig: false, fb: false });
  const [showSocialModal, setShowSocialModal] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceInput, setVoiceInput] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [scheduledCampaigns, setScheduledCampaigns] = useState([]);
  const [isPosting, setIsPosting] = useState(false);
  const [scheduleModal, setScheduleModal] = useState(false);

  useEffect(() => {
    // Show social modal if not connected
    if (!socialConnected.ig && !socialConnected.fb) {
      const t = setTimeout(() => setShowSocialModal(true), 1000);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    const refresh = () => {
      setIsAnalyzing(true);
      setTimeout(() => {
        setRecommendation(getSmartRecommendation());
        setIsAnalyzing(false);
      }, 1500);
    };
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleGenerate = () => {
    setIsGenerating(true);
    setGenerated(false);
    
    setTimeout(() => {
      const newDesigns = STYLES.map((style, index) => generateRandomConfig(style.id, index));
      setDesigns(newDesigns);
      setIsGenerating(false);
      setGenerated(true);
      setSelectedDesign(0);
    }, 2000);
  };
  const handleUpload = (f) => {
    if (!f) return;
    const url = URL.createObjectURL(f);
    setUpload({ name: f.name, url });
    setGenerated(false);
  };
  const handleVoiceInput = () => {
    setIsListening(true);
    setTimeout(() => {
      const texts = [
        "Hey edi chicken biriyani today special 199",
        "Make it a family combo with free Lassi",
        "Special IPL discount of 20 percent"
      ];
      const randomText = texts[Math.floor(Math.random() * texts.length)];
      setVoiceInput(randomText);
      setIsListening(false);
      
      // Update dish name or recommendation based on voice
      if (randomText.toLowerCase().includes("199")) {
         setRecommendation(prev => ({...prev, title: "Special Deal: ₹199 Offer Active", explanation: "Voice assistant updated campaign based on manual override."}));
      }
    }, 2000);
  };

  const handlePostNow = () => {
    setIsPosting(true);
    setTimeout(() => {
      setIsPosting(false);
      setPosted(true);
      setShowPreview(false);
    }, 3000);
  };

  const handleSchedule = () => {
    const newCampaign = {
      id: Date.now(),
      design: designs[selectedDesign],
      caption: finalCaption,
      time: "Tomorrow, 6:00 PM",
      status: "Scheduled"
    };
    setScheduledCampaigns(prev => [...prev, newCampaign]);
    setScheduleModal(false);
    alert("Campaign scheduled successfully!");
  };

  const finalCaption = useMemo(() => {
    const selectedTagline = designs[selectedDesign]?.text.main.content || "";
    let base = language === "en"
      ? `🍛 ${selectedTagline ? selectedTagline + " — " : ""}Royal ${dishName} — Cooked slow, served fresh! Every grain tells a story of flavor crafted with love at Ravi's Kitchen.
📍 Vijayawada | Order Now ☎ 98765-43210
#ChickenBiriyani #RavisKitchen #Vijayawada #FoodLovers #Biriyani #AndhraFood #FoodPhotography`
      : `🍛 ${selectedTagline ? selectedTagline + " — " : ""}రాయల్ ${dishName} — నెమ్మదిగా వండి, తాజాగా వడ్డించాం!
రవి'స్ కిచెన్ ప్రేమతో తయారైన రుచికి ప్రతి అన్నగింజ సాక్ష్యం.
📍 విజయవాడ | ఇప్పుడే ఆర్డర్ చేయండి ☎ 98765-43210
#చికెన్‌బిర్యానీ #రవిస్‌కిచెన్ #విజయవాడ #ఫుడ్‌లవర్స్ #బిర్యానీ #ఆంధ్రఫుడ్`;

    if (voiceInput) {
       base = `🔥 ${voiceInput.toUpperCase()}!\n\n` + base;
    }
    if (recommendation && (recommendation.title.includes("IPL") || selectedTagline.includes("IPL"))) {
       base = `🏏 IPL SPECIAL! ` + base;
    }
    return base;
  }, [dishName, language, voiceInput, recommendation, designs, selectedDesign]);

  return (
    <div className="space-y-6">
      <div className="rounded-[10px] border border-[#FFCDD2] bg-white p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-[#FFEBEE] flex items-center justify-center text-[#E53935]">
            <Bot size={28} />
          </div>
          <div>
            <h2 className="text-lg font-bold">Spire Marketing AI</h2>
            <p className="text-xs text-[#6B6B6B]">Automated designer & pricing manager</p>
          </div>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 text-[10px] md:text-xs font-bold uppercase tracking-wider whitespace-nowrap">
          <span className="rounded-lg bg-[#E53935] px-3 py-1.5 text-white">1. Upload</span>
          <span className="text-[#FFCDD2]">→</span>
          <span className={`rounded-lg px-3 py-1.5 border ${generated ? "bg-[#E53935] text-white" : "bg-[#FFEBEE] text-[#B71C1C] border-[#EF9A9A]"}`}>2. Design</span>
          <span className="text-[#FFCDD2]">→</span>
          <span className={`rounded-lg px-3 py-1.5 border ${posted ? "bg-green-600 text-white" : "bg-[#FFEBEE] text-[#B71C1C] border-[#EF9A9A]"}`}>3. Publish</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <div className={card + " p-6"}>
            <h3 className="text-sm font-bold uppercase tracking-widest text-[#6B6B6B] mb-4">Promotional Design Variations</h3>
            <div
              onClick={() => uploadRef.current?.click()}
              className="group relative w-full cursor-pointer overflow-hidden rounded-[15px] border-2 border-dashed border-[#FFCDD2] bg-[#FFF5F5] p-10 text-center transition-all hover:border-[#E53935] hover:bg-[#FFEBEE]"
            >
              <div className="flex flex-col items-center">
                <Sparkles className="mb-2 text-[#E53935] transition-transform group-hover:scale-110" size={32} />
                <p className="font-bold text-[#1A1A1A]">Drop your food photo here</p>
                <p className="text-xs text-[#6B6B6B]">or click to browse files</p>
              </div>
            </div>
            <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e.target.files?.[0])} />

            {upload && (
              <div className="mt-4 flex items-center gap-4 rounded-xl border border-[#FFCDD2] p-3 bg-white">
                <img src={upload.url} alt="uploaded" className="h-16 w-16 rounded-lg object-cover shadow-md" />
                <div className="flex-grow">
                  <p className="text-sm font-bold text-[#1A1A1A]">{upload.name}</p>
                  <p className="text-[10px] text-[#6B6B6B]">Ready for AI processing</p>
                </div>
                <button 
                  onClick={handleGenerate} 
                  disabled={isGenerating}
                  className={`${btn} shadow-lg shadow-red-100 flex items-center gap-2`}
                >
                  {isGenerating ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Generating...
                    </>
                  ) : "Generate Designs →"}
                </button>
              </div>
            )}

            {isGenerating && (
              <div className="mt-8 flex flex-col items-center justify-center py-10 animate-fadeIn">
                <div className="relative">
                   <div className="h-20 w-20 rounded-full border-4 border-[#FFEBEE] border-t-[#E53935] animate-spin" />
                   <Bot className="absolute inset-0 m-auto text-[#E53935]" size={32} />
                </div>
                <h4 className="mt-4 font-bold text-lg">Generating AI Creatives...</h4>
                <p className="text-sm text-[#6B6B6B]">Spire is analyzing your food and creating 10 unique styles</p>
                <div className="mt-6 flex gap-1">
                   {[0, 1, 2].map(i => (
                     <div key={i} className="h-2 w-2 rounded-full bg-[#E53935] animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />
                   ))}
                </div>
              </div>
            )}

            {generated && !isGenerating && (
              <div className="mt-6 animate-fadeIn">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
                  {designs.map((config, i) => (
                    <button 
                      key={i} 
                      onClick={() => setSelectedDesign(i)} 
                      className={`group rounded-xl border p-2 transition-all ${selectedDesign === i ? "border-2 border-[#E53935] bg-[#FFEBEE] ring-4 ring-red-50" : "border-[#FFCDD2] hover:bg-[#FFF5F5]"}`}
                    >
                      <div className="aspect-[4/5] w-full rounded-lg bg-black overflow-hidden relative shadow-inner">
                        <CreativeCanvas config={config} uploadUrl={upload.url} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                        <div className={`absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors ${selectedDesign === i ? 'bg-transparent' : ''}`} />
                        <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-white/90 flex items-center justify-center text-[10px] font-black text-[#E53935] shadow-sm">
                          {i + 1}
                        </div>
                      </div>
                      <p className="mt-2 text-[10px] font-black text-[#E53935] text-center uppercase tracking-tighter truncate">{config.styleName}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {generated && (
            <div className={card + " p-6 animate-fadeIn"}>
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-grow space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B]">AI Generated Caption</label>
                    <button 
                      onClick={handleVoiceInput} 
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold transition-all ${isListening ? "bg-red-500 text-white animate-pulse" : "bg-[#FFEBEE] text-[#E53935] hover:bg-[#EF9A9A] hover:text-white"}`}
                    >
                      <Bot size={12} /> {isListening ? "Listening..." : "Voice Assist"}
                    </button>
                  </div>
                  <div className="mt-1 flex gap-2">
                    <button className="h-10 w-10 flex-shrink-0 rounded-full bg-[#E53935] text-white shadow-lg flex items-center justify-center hover:scale-105 transition-transform"><Bot size={18} /></button>
                    <textarea
                      className={input + " min-h-[140px] resize-none text-[13px] leading-relaxed"}
                      value={finalCaption}
                      readOnly
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setLanguage("en")} className={`rounded-lg px-4 py-1.5 text-xs font-bold transition-all ${language === "en" ? "bg-[#E53935] text-white" : "border border-[#FFCDD2] bg-white text-[#6B6B6B]"}`}>English</button>
                    <button onClick={() => setLanguage("te")} className={`rounded-lg px-4 py-1.5 text-xs font-bold transition-all ${language === "te" ? "bg-[#E53935] text-white" : "border border-[#FFCDD2] bg-white text-[#6B6B6B]"}`}>Telugu</button>
                  </div>
                </div>
                <div className="w-full md:w-64 space-y-4 border-t md:border-t-0 md:border-l border-[#FFCDD2] pt-4 md:pt-0 md:pl-6">
                  <p className="text-[10px] font-bold uppercase text-[#6B6B6B]">Campaign Actions</p>
                  <div className="space-y-3">
                    <div className="rounded-lg bg-[#FFF5F5] p-3 border border-[#FFCDD2]">
                      <label className="text-[10px] font-bold text-[#E53935]">OPTIMAL PERFORMANCE</label>
                      <p className="text-sm font-black">+{recommendation?.impact || 24}% Engagement</p>
                      <p className="text-[9px] text-[#6B6B6B]">Based on {recommendation?.conditions.event || 'Current Trends'}</p>
                    </div>
                    
                    {!showPreview ? (
                      <button onClick={() => setShowPreview(true)} className={btn + " w-full py-3 shadow-lg shadow-red-100 flex items-center justify-center gap-2"}>
                        <Sparkles size={16} /> Apply & Preview
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <button 
                          onClick={handlePostNow} 
                          disabled={isPosting}
                          className="w-full bg-green-600 text-white rounded-md py-3 text-sm font-bold shadow-lg shadow-green-100 flex items-center justify-center gap-2"
                        >
                          {isPosting ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Megaphone size={16} />}
                          {isPosting ? "Publishing..." : "Post Now"}
                        </button>
                        <button onClick={() => setScheduleModal(true)} className="w-full border border-[#FFCDD2] bg-white rounded-md py-2 text-xs font-bold hover:bg-gray-50">
                          Schedule for Later
                        </button>
                      </div>
                    )}
                    {posted && <p className="text-center text-[10px] font-bold text-[#2E7D32] animate-bounce">✓ Successfully Published!</p>}
                  </div>
                </div>
              </div>
              
              {showPreview && (
                <div className="mt-6 pt-6 border-t border-[#FFCDD2] animate-fadeIn">
                   <div className="flex items-center justify-between mb-4">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-[#6B6B6B]">Social Media Preview</h4>
                      <button onClick={() => setShowPreview(false)} className="text-[10px] font-bold text-[#E53935] hover:underline">Cancel</button>
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="rounded-xl border border-[#FFCDD2] overflow-hidden bg-white shadow-sm">
                         <div className="p-3 flex items-center gap-2 border-b border-gray-100">
                            <div className="h-6 w-6 rounded-full bg-[#FFEBEE]" />
                            <span className="text-[10px] font-bold">ravis_kitchen • Instagram</span>
                         </div>
                         <div className="aspect-square bg-gray-100">
                            <CreativeCanvas config={designs[selectedDesign]} uploadUrl={upload.url} />
                         </div>
                         <div className="p-3 space-y-2">
                            <div className="flex gap-3 text-gray-700"><Sparkles size={16} /><Bot size={16} /><Megaphone size={16} /></div>
                            <p className="text-[10px] leading-snug line-clamp-2"><span className="font-bold mr-1">ravis_kitchen</span>{finalCaption}</p>
                         </div>
                      </div>
                      <div className="rounded-xl border border-[#FFCDD2] overflow-hidden bg-white shadow-sm">
                         <div className="p-3 flex items-center gap-2 border-b border-gray-100">
                            <div className="h-6 w-6 rounded-full bg-[#FFEBEE]" />
                            <div>
                               <p className="text-[10px] font-bold">Ravi's Kitchen</p>
                               <p className="text-[8px] text-gray-500">Sponsored • Facebook</p>
                            </div>
                         </div>
                         <div className="p-3 text-[10px] leading-snug">{finalCaption.split('\n')[0]}... <span className="text-blue-600">See More</span></div>
                         <div className="aspect-[1.91/1] bg-gray-100 overflow-hidden">
                            <CreativeCanvas config={designs[selectedDesign]} uploadUrl={upload.url} />
                         </div>
                         <div className="p-3 flex justify-between items-center border-t border-gray-50 bg-gray-50/50">
                            <span className="text-[10px] font-bold text-blue-600">Order Now</span>
                            <button className="bg-gray-200 px-3 py-1 rounded text-[9px] font-bold">Learn More</button>
                         </div>
                      </div>
                   </div>
                </div>
              )}
            </div>
          )}

          {scheduledCampaigns.length > 0 && (
            <div className={card + " p-6 animate-fadeIn"}>
               <h3 className="text-sm font-bold uppercase tracking-widest text-[#6B6B6B] mb-4">Upcoming Scheduled Campaigns</h3>
               <div className="space-y-3">
                  {scheduledCampaigns.map(c => (
                    <div key={c.id} className="flex items-center gap-4 p-3 rounded-xl border border-[#FFCDD2] bg-[#FFF5F5]">
                       <div className="h-12 w-12 rounded-lg bg-black overflow-hidden flex-shrink-0">
                          <CreativeCanvas config={c.design} uploadUrl={upload.url} />
                       </div>
                       <div className="flex-grow min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                             <span className="text-[10px] font-black text-[#E53935] uppercase">{c.status}</span>
                             <span className="h-1 w-1 rounded-full bg-[#FFCDD2]" />
                             <span className="text-[10px] font-bold text-[#6B6B6B]">{c.time}</span>
                          </div>
                          <p className="text-xs font-bold truncate">{c.caption.split('\n')[0]}</p>
                       </div>
                       <button className="text-[10px] font-bold text-[#B71C1C] hover:underline">Edit</button>
                    </div>
                  ))}
               </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className={card + " p-6"}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-widest text-[#6B6B6B]">Smart Pricing Engine</h3>
              {isAnalyzing && (
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#E53935] animate-pulse">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#E53935]" /> Analyzing...
                </div>
              )}
            </div>
            
            <div className="space-y-4">
              {recommendation ? (
                <div className={`rounded-xl border p-4 transition-all duration-500 ${isAnalyzing ? 'opacity-40 scale-95' : 'opacity-100 scale-100'} bg-[#E8F5E9] border-[#A5D6A7]`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-[#2E7D32]">
                      <Sparkles size={14} />
                      <span className="text-[9px] font-black uppercase tracking-tighter">{recommendation.category}</span>
                    </div>
                    <span className="text-[9px] font-bold bg-[#2E7D32] text-white px-1.5 py-0.5 rounded-full">
                      {recommendation.confidence}% Confidence
                    </span>
                  </div>
                  
                  <p className="text-sm font-black text-[#1A1A1A]">{recommendation.title}</p>
                  <p className="text-[11px] text-[#2E7D32] mt-1.5 leading-relaxed font-medium">
                    {recommendation.explanation}
                  </p>
                  
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#A5D6A7]/30 pt-3">
                    <div>
                      <p className="text-[9px] font-bold text-[#6B6B6B] uppercase">Revenue Impact</p>
                      <p className="text-xs font-black text-[#2E7D32]">+{recommendation.impact}% {recommendation.impactType}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-bold text-[#6B6B6B] uppercase">Signals</p>
                      <p className="text-[9px] font-medium text-[#6B6B6B]">{recommendation.conditions.weather} • {recommendation.conditions.event}</p>
                    </div>
                  </div>
                  
                  <button className="mt-4 w-full bg-[#2E7D32] text-white py-2.5 rounded-lg text-xs font-bold shadow-md shadow-green-100 active:scale-95 transition-transform">
                    Apply Now
                  </button>
                </div>
              ) : (
                <div className="h-40 animate-pulse rounded-xl bg-gray-50 flex items-center justify-center text-xs text-gray-400 font-medium italic">
                  Initializing Spire Intelligence...
                </div>
              )}

              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase text-[#6B6B6B]">Operational Pulse</p>
                  <span className="text-[9px] text-[#6B6B6B]">Updated {recommendation?.timestamp || 'just now'}</span>
                </div>
                {[
                  { n: "Monsoon Special", d: "₹50 OFF on all Biriyani", s: "Active" },
                  { n: "Lassi Combo", d: "Buy 2 Get 1 Free", s: "Scheduled" }
                ].map(p => (
                  <div key={p.n} className="flex items-center justify-between p-3 rounded-lg border border-[#FFCDD2] bg-white transition-hover hover:border-[#E53935]">
                    <div>
                      <p className="text-xs font-bold">{p.n}</p>
                      <p className="text-[10px] text-[#6B6B6B]">{p.d}</p>
                    </div>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${p.s === "Active" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>{p.s}</span>
                  </div>
                ))}
                <button className="w-full border border-dashed border-[#E53935] text-[#E53935] py-2 rounded-lg text-xs font-bold hover:bg-[#FFEBEE]">+ New Promotion</button>
              </div>
            </div>
          </div>

          <div className={card + " p-6"}>
            <h3 className="text-sm font-bold uppercase tracking-widest text-[#6B6B6B] mb-4">Campaign Performance</h3>
            <div className="space-y-4">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-2xl font-black text-[#1A1A1A]">12.4k</p>
                  <p className="text-[10px] font-bold text-[#6B6B6B] uppercase">Total Impressions</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-[#2E7D32]">↑ 24%</p>
                  <p className="text-[10px] text-[#6B6B6B]">vs last week</p>
                </div>
              </div>
              <div className="h-2 w-full bg-[#FFEBEE] rounded-full overflow-hidden">
                <div className="h-full bg-[#E53935]" style={{ width: '75%' }} />
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <p className="text-sm font-bold">842</p>
                  <p className="text-[9px] text-[#6B6B6B] uppercase">Conversions</p>
                </div>
                <div>
                  <p className="text-sm font-bold">₹1.2k</p>
                  <p className="text-[9px] text-[#6B6B6B] uppercase">Ad Spend</p>
                </div>
              </div>
            </div>
          </div>
      </div>
      </div>

      {/* Social Onboarding Modal */}
      {showSocialModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-left">
          <div className="w-full max-w-md rounded-2xl border border-[#FFCDD2] bg-white p-8 shadow-2xl animate-fadeIn">
            <div className="text-center mb-6">
              <div className="h-16 w-16 rounded-full bg-[#FFEBEE] flex items-center justify-center text-[#E53935] mx-auto mb-4">
                <Sparkles size={32} />
              </div>
              <h2 className="text-2xl font-black text-[#1A1A1A]">Connect Your Socials</h2>
              <p className="text-sm text-[#6B6B6B] mt-1">Let Spire.ai automate your restaurant marketing</p>
            </div>
            <div className="space-y-4">
              <div className="space-y-2 text-left">
                 <label className="text-[10px] font-bold uppercase text-[#6B6B6B]">Restaurant Brand</label>
                 <input className={input} defaultValue="Ravi's Kitchen" />
              </div>
              <div className="grid grid-cols-1 gap-3">
                 <button 
                  onClick={() => setSocialConnected(prev => ({...prev, ig: true}))}
                  className={`flex items-center justify-between border-2 rounded-xl p-4 transition-all ${socialConnected.ig ? "border-green-500 bg-green-50" : "border-[#FFCDD2] hover:border-[#E53935]"}`}
                 >
                   <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center ${socialConnected.ig ? "bg-green-500 text-white" : "bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600 text-white"}`}>
                         {socialConnected.ig ? "✓" : "IG"}
                      </div>
                      <div className="text-left">
                         <p className="text-xs font-black">Instagram Business</p>
                         <p className="text-[9px] text-[#6B6B6B]">{socialConnected.ig ? "@ravis_kitchen connected" : "Not connected"}</p>
                      </div>
                   </div>
                   {!socialConnected.ig && <span className="text-[10px] font-bold text-[#E53935]">Connect</span>}
                 </button>
                 <button 
                  onClick={() => setSocialConnected(prev => ({...prev, fb: true}))}
                  className={`flex items-center justify-between border-2 rounded-xl p-4 transition-all ${socialConnected.fb ? "border-green-500 bg-green-50" : "border-[#FFCDD2] hover:border-[#E53935]"}`}
                 >
                   <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center ${socialConnected.fb ? "bg-green-500 text-white" : "bg-blue-600 text-white"}`}>
                         {socialConnected.fb ? "✓" : "FB"}
                      </div>
                      <div className="text-left">
                         <p className="text-xs font-black">Facebook Page</p>
                         <p className="text-[9px] text-[#6B6B6B]">{socialConnected.fb ? "Ravi's Kitchen connected" : "Not connected"}</p>
                      </div>
                   </div>
                   {!socialConnected.fb && <span className="text-[10px] font-bold text-[#E53935]">Connect</span>}
                 </button>
              </div>
              <button 
                onClick={() => setShowSocialModal(false)}
                disabled={!socialConnected.ig && !socialConnected.fb}
                className={`${btn} w-full py-4 text-base mt-2 disabled:opacity-50`}
              >
                Continue to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {scheduleModal && (
        <Modal title="Schedule Campaign" onClose={() => setScheduleModal(false)}>
          <div className="space-y-4 p-2 text-left">
             <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-[#6B6B6B]">Select Date & Time</label>
                <input type="datetime-local" className={input} defaultValue="2025-05-08T18:00" />
             </div>
             <div className="rounded-xl border border-[#FFCDD2] bg-[#FFF5F5] p-3">
                <p className="text-[10px] font-bold text-[#E53935] uppercase mb-1">Spire Recommendation</p>
                <p className="text-xs font-bold">Tomorrow at 6:45 PM is optimal for your audience.</p>
             </div>
             <button onClick={handleSchedule} className={btn + " w-full py-3"}>Confirm Schedule</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Surveillance({ onIncident }) {
  return <SurveillanceDashboard onIncident={onIncident} />;
}

function Inventory({ onPo }) {
  return <div className="space-y-4">
    <div className="rounded-[10px] border border-[#FFCDD2] bg-[#FFEBEE] p-4">Spire.ai tracks every ingredient — ask anything</div>
    <div className="flex gap-2"><input className={input} defaultValue="Where did my 50kg chicken go today?" /><button className={btn}>Ask Spire →</button></div>
    <div className={card + " p-4 text-sm"}><p>Analyzing your 50kg chicken stock for today...</p><p>→ 12.5kg used in 50 Chicken Dum Biryani plates (₹15,450 revenue)</p><p>→ 3.2kg used in Chicken Fry Piece Biryani — 8 orders (₹2,472)</p><p>→ 35kg currently in cold storage (Fridge #2, Zone B)</p><p>→ 2.5kg UNACCOUNTED ⚠ — checking cameras...</p><p>→ Found: CAM-04 at 14:32 — suspicious activity flagged</p><button className={`${btn} mt-3`}>View Camera Incident</button></div>
    <div className={card + " overflow-x-auto -mx-4 sm:mx-0"}>
      <div className="inline-block min-w-full align-middle">
        <table className="w-full text-left text-xs md:text-sm whitespace-nowrap">
          <thead className="bg-[#FFEBEE]">
            <tr>
              <th className="p-3">Item</th>
              <th className="p-3 text-center">Opening</th>
              <th className="p-3 text-center">Purchased</th>
              <th className="p-3 text-center">Used</th>
              <th className="p-3 text-center">Current</th>
              <th className="p-3 text-center">Status</th>
              <th className="p-3 text-center">Reorder</th>
            </tr>
          </thead>
          <tbody>
            {["Chicken|50 kg|0|15.2 kg|34.8 kg|OK|10 kg", "Basmati Rice|100 kg|0|20 kg|80 kg|OK|20 kg", "Mutton|15 kg|0|3 kg|12 kg|LOW ⚠|10 kg", "Prawns|10 kg|0|2 kg|8 kg|OK|5 kg", "Refined Oil|50 L|0|10 L|40 L|OK|15 L", "Onions|30 kg|0|8 kg|22 kg|OK|10 kg", "Tomatoes|20 kg|0|6 kg|14 kg|OK|8 kg", "Paneer|20 kg|0|8 kg|12 kg|LOW ⚠|10 kg"].map((r) => {
              const c = r.split("|");
              return (
                <tr key={r} className="border-b border-[#FFEBEE] hover:bg-[#FFF5F5]">
                  <td className="p-3 font-semibold">{c[0]}</td>
                  <td className="p-3 text-center">{c[1]}</td>
                  <td className="p-3 text-center text-green-600 font-bold">{c[2]}</td>
                  <td className="p-3 text-center text-red-600">{c[3]}</td>
                  <td className="p-3 text-center font-extrabold">{c[4]}</td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${c[5].includes("LOW") ? "bg-orange-100 text-orange-700 animate-pulse" : "bg-green-100 text-green-700"}`}>
                      {c[5]}
                    </span>
                  </td>
                  <td className="p-3 text-center font-bold text-[#E53935] underline decoration-dotted">{c[6]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
    <button onClick={onPo} className={btn}>Generate Purchase Order</button>
  </div>;
}

function Pricing() {
  return <div className="space-y-4">
    <div className="text-center"><h2 className="text-3xl font-bold">Simple pricing. Powerful AI. Every day.</h2><p className="text-[#6B6B6B]">Less than a cup of chai per day for the AI that runs your restaurant.</p></div>
    <div className="mx-auto flex w-fit gap-2 rounded-md border border-[#FFCDD2] p-1"><button className="rounded-md bg-[#E53935] px-3 py-1 text-white">Yearly</button><button className="rounded-md px-3 py-1">Monthly</button></div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <PriceCard title="Basic POS" price="₹68 /day" billed="billed as ₹25,000/year" features={["✓ Full POS billing", "✓ Table management", "✓ KOT system", "✓ Basic reports", "✓ Menu management", "✗ Spire.ai assistant", "✗ Surveillance AI"]} action="Get Started" />
      <PriceCard title="Spire Starter" popular price="₹110 /day" billed="billed as ₹40,000/year" features={["✓ Everything in Basic +", "✓ Spire.ai voice assistant", "✓ Payroll automation", "✓ AI marketing (50 credits/mo)", "✓ Instagram & Facebook posting", "✗ Camera surveillance"]} action="Start Free Trial" solid />
      <PriceCard title="Spire Pro" price="₹137 /day" billed="billed as ₹50,000/year" features={["✓ Everything in Starter", "✓ Spire.ai cam surveillance", "✓ Inventory AI tracking", "✓ Unlimited marketing credits", "✓ Custom AI training", "✓ Priority support"]} action="Contact Sales" />
    </div>
    <p className="text-center text-sm text-[#6B6B6B]">All plans include: GST billing · Free onboarding · Telugu + English support · 24/7 Spire.ai chat</p>
  </div>;
}

function PriceCard({ title, price, billed, features, action, popular, solid }) {
  return <div className={`relative rounded-[10px] border bg-white p-4 ${popular ? "border-2 border-[#E53935]" : "border-[#FFCDD2]"}`}>{popular && <span className="absolute -top-3 left-4 rounded-full bg-[#E53935] px-2 py-1 text-xs text-white">MOST POPULAR</span>}<h3 className="font-semibold">{title}</h3><p className="mt-2 text-3xl font-bold">{price}</p><p className="text-sm text-[#6B6B6B]">{billed}</p><div className="mt-3 space-y-1 text-sm">{features.map((f) => <p key={f}>{f}</p>)}</div><button className={`mt-4 w-full rounded-md px-3 py-2 text-sm ${solid ? "bg-[#E53935] text-white hover:bg-[#c62828]" : "border border-[#E53935] text-[#B71C1C]"}`}>{action}</button></div>;
}

function SettingsPage() {
  return <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
    <div className="lg:col-span-1">
      <div className="flex gap-2 overflow-x-auto pb-4 lg:flex-col lg:overflow-visible">
        {["Restaurant", "Users", "Spire.ai", "Payments", "Notifications", "Integrations"].map((x, i) => (
          <button key={x} className={`whitespace-nowrap rounded-xl px-4 py-3 text-sm text-left transition-all duration-200 ${i === 0 ? "bg-[#B71C1C] text-white shadow-lg shadow-red-100 font-bold" : "bg-white border border-[#FFCDD2] text-[#6B6B6B] hover:border-[#E53935] hover:text-[#E53935]"}`}>
            {x}
          </button>
        ))}
      </div>
    </div>
    <div className={"lg:col-span-3 " + card + " p-4 md:p-6"}>
      <h3 className="mb-4 font-bold text-xl text-[#B71C1C]">Restaurant Profile</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-[#6B6B6B]">Business Name</label><input className={input} defaultValue="Ravi's Kitchen" /></div>
        <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-[#6B6B6B]">Owner Name</label><input className={input} defaultValue="Ravi Kumar" /></div>
        <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-[#6B6B6B]">Contact Number</label><input className={input} defaultValue="+91 98765 43210" /></div>
        <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-[#6B6B6B]">GST Number</label><input className={input} defaultValue="37AABCU9603R1ZX" /></div>
        <div className="sm:col-span-2 space-y-1"><label className="text-[10px] font-bold uppercase text-[#6B6B6B]">Full Address</label><input className={input} defaultValue="MG Road, Vijayawada, AP 520010" /></div>
      </div>
      <div className="mt-6">
        <label className="text-[10px] font-bold uppercase text-[#6B6B6B]">Business Logo</label>
        <div className="mt-1 flex items-center justify-center rounded-md border-2 border-dashed border-[#FFCDD2] bg-[#FFF5F5] p-6 text-sm text-[#6B6B6B] transition-colors hover:border-[#E53935] cursor-pointer">
          Click to upload or drag and drop
        </div>
      </div>
      <div className="mt-6 rounded-md border border-[#FFCDD2] bg-white p-4">
        <h4 className="text-sm font-bold mb-2">Spire.ai Active Settings</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-3 gap-x-4 text-[11px] text-[#6B6B6B]">
          <div>Language: <span className="text-[#1A1A1A] font-semibold">Telugu/Eng</span></div>
          <div>Voice Sensitivity: <span className="text-[#1A1A1A] font-semibold">High</span></div>
          <div>Auto-post: <span className="text-[#2E7D32] font-semibold">Enabled</span></div>
          <div>Inventory Alert: <span className="text-[#B71C1C] font-semibold">20%</span></div>
          <div>Cam Confidence: <span className="text-[#1A1A1A] font-semibold">85%</span></div>
          <div>Current Plan: <span className="text-[#E53935] font-semibold font-bold">Spire Pro</span></div>
        </div>
      </div>
      <div className="mt-6 flex justify-end">
        <button className={`${btn} px-8`}>Save Changes</button>
      </div>
    </div>
  </div>;
}

function SpirePanel({ onClose }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    { role: "user", content: "Where did my 50kg chicken go today?" },
    {
      role: "spire", content: "Analyzing sales, inventory logs, and camera feeds...",
      details: ["12.5kg used in 50 Chicken Dum Biryani plates", "35kg remains in cold storage (Fridge 2)", "2.5kg discrepancy found."],
      isIncident: true
    }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setInput("");
    setIsTyping(true);

    setTimeout(() => {
      setIsTyping(false);
      setMessages(prev => [...prev, { role: "spire", content: `I'm analyzing your request about "${userMsg}". How can I help you further with your restaurant operations?` }]);
    }, 1500);
  };

  return <div className="fixed bottom-0 right-0 top-0 z-50 w-full sm:w-[400px] border-l border-[#FFCDD2] bg-white shadow-2xl flex flex-col slide-in">
    <div className="flex items-center justify-between border-b border-[#FFCDD2] p-4 bg-[#B71C1C] text-white">
      <div className="flex items-center gap-2 font-bold"><Bot size={20} /> Spire.ai Assistant</div>
      <button onClick={onClose} className="text-white hover:bg-white/10 p-1 rounded-md" title="Close Panel">✕</button>
    </div>
    <div ref={scrollRef} className="flex-grow overflow-y-auto p-4 space-y-4 bg-slate-50/30">
      {messages.map((m, i) => (
        <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
          <div className={`max-w-[85%] rounded-2xl p-3 text-sm shadow-sm border ${m.role === "user"
            ? "rounded-tr-none bg-[#FFF5F5] border-[#FFCDD2] text-[#1A1A1A]"
            : "rounded-tl-none bg-white border-[#EF9A9A] text-[#1A1A1A]"
            }`}>
            {m.role === "spire" && <p className="font-bold text-[#B71C1C] mb-1 flex items-center gap-1.5"><Sparkles size={12} /> Spire Intelligence</p>}
            <p>{m.content}</p>
            {m.details && (
              <div className="mt-2 space-y-1 opacity-90 text-[13px]">
                {m.details.map((d, idx) => <p key={idx}>• {d.includes("discrepancy") ? <span className="font-bold text-[#E53935]">{d}</span> : d}</p>)}
              </div>
            )}
            {m.isIncident && (
              <div className="mt-3 w-full rounded-xl border-2 border-[#E53935] bg-white p-2 shadow-md overflow-hidden">
                <div className="relative aspect-video rounded-lg bg-slate-900 flex items-center justify-center overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute top-2 left-2 flex flex-col gap-1">
                    <div className="flex items-center gap-1 bg-[#E53935] text-white px-1.5 py-0.5 rounded text-[7px] font-black tracking-widest animate-pulse">LIVE INCIDENT</div>
                  </div>
                  <div className="border-2 border-red-500/80 h-12 w-16 relative">
                    <span className="absolute -top-3.5 left-0 text-[6px] text-red-500 font-bold bg-black/40 px-1">Person [91%]</span>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between px-1">
                  <p className="text-[9px] font-black">Unauthorized Access</p>
                  <p className="text-[9px] text-[#6B6B6B] font-mono">14:32:07</p>
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
      {isTyping && (
        <div className="flex justify-start">
          <div className="bg-white border border-[#EF9A9A] rounded-2xl rounded-tl-none p-3 flex gap-1">
            <span className="w-1.5 h-1.5 bg-[#EF9A9A] rounded-full animate-bounce" />
            <span className="w-1.5 h-1.5 bg-[#EF9A9A] rounded-full animate-bounce [animation-delay:0.2s]" />
            <span className="w-1.5 h-1.5 bg-[#EF9A9A] rounded-full animate-bounce [animation-delay:0.4s]" />
          </div>
        </div>
      )}
    </div>
    <div className="p-4 border-t border-[#FFCDD2] bg-white">
      <div className="flex gap-2 bg-[#FFF5F5] rounded-full p-1.5 border border-[#FFCDD2] focus-within:border-[#E53935] transition-colors">
        <input
          className="flex-grow bg-transparent px-3 py-1.5 text-sm outline-none"
          placeholder="Type or ask anything..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="h-9 w-9 flex items-center justify-center rounded-full bg-[#E53935] text-white shadow-lg transition-transform active:scale-95 disabled:opacity-50"
        >
          <Sparkles size={18} />
        </button>
      </div>
    </div>
  </div>;
}

export default App;
