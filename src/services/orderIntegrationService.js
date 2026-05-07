const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const PLATFORMS = ["Zomato", "Swiggy", "Direct"];
const BRANCHES = ["Main Hall", "Express Outlet"];
const STATUSES = ["Preparing", "Ready", "Dispatched", "Served"];
const DISHES = ["Chicken Biriyani", "Mutton Curry", "Prawn Fry", "Paneer Tikka", "Lassi"];

export const PLATFORM_META = {
  Zomato: { badgeClass: "bg-[#FFEBEE] text-[#B71C1C]" },
  Swiggy: { badgeClass: "bg-orange-100 text-orange-700" },
  Direct: { badgeClass: "bg-blue-100 text-blue-700" },
};

let seedOrders = Array.from({ length: 10 }).map((_, i) => {
  const platform = PLATFORMS[i % PLATFORMS.length];
  const amount = 300 + ((i * 173) % 1400);
  return {
    id: `INT-${1040 + i}`,
    platform,
    branch: BRANCHES[i % BRANCHES.length],
    status: STATUSES[i % STATUSES.length],
    customer: `${platform} Customer ${i + 1}`,
    dish: DISHES[i % DISHES.length],
    amount,
    createdAt: Date.now() - i * 5 * 60 * 1000,
  };
});

export async function fetchUnifiedOrders() {
  await wait(350);
  return seedOrders.sort((a, b) => b.createdAt - a.createdAt);
}

export function subscribeToIncomingOrders(onUpdate) {
  const interval = setInterval(() => {
    const next = {
      id: `INT-${Math.floor(1100 + Math.random() * 900)}`,
      platform: PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)],
      branch: BRANCHES[Math.floor(Math.random() * BRANCHES.length)],
      status: "Preparing",
      customer: `Walk-in ${Math.floor(Math.random() * 99)}`,
      dish: DISHES[Math.floor(Math.random() * DISHES.length)],
      amount: 260 + Math.floor(Math.random() * 1400),
      createdAt: Date.now(),
    };
    seedOrders = [next, ...seedOrders].slice(0, 24);
    onUpdate(seedOrders);
  }, 12000);

  return () => clearInterval(interval);
}

export function getOrderAnalytics(orders) {
  const totalOrders = orders.length;
  const revenueByPlatform = orders.reduce((acc, order) => {
    acc[order.platform] = (acc[order.platform] ?? 0) + order.amount;
    return acc;
  }, {});
  const dishCount = orders.reduce((acc, order) => {
    acc[order.dish] = (acc[order.dish] ?? 0) + 1;
    return acc;
  }, {});
  const mostOrderedDish = Object.entries(dishCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";
  const peak = orders
    .map((order) => new Date(order.createdAt).getHours())
    .reduce((acc, hour) => {
      const slot = `${hour}:00`;
      acc[slot] = (acc[slot] ?? 0) + 1;
      return acc;
    }, {});
  const peakTiming = Object.entries(peak).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";

  return { totalOrders, revenueByPlatform, mostOrderedDish, peakTiming };
}
