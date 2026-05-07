const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const captains = [
  { name: "Raju", tables: [1, 2, 4], orders: 42, sales: 48200, upsell: 22, rating: 4.8, shift: "9AM-6PM", speed: 13 },
  { name: "Meena", tables: [5, 6, 8], orders: 38, sales: 42900, upsell: 19, rating: 4.6, shift: "10AM-7PM", speed: 14 },
  { name: "Suresh", tables: [9, 10, 11], orders: 35, sales: 39750, upsell: 14, rating: 4.4, shift: "12PM-9PM", speed: 16 },
  { name: "Lakshmi", tables: [12, 13, 14], orders: 44, sales: 50300, upsell: 26, rating: 4.9, shift: "11AM-8PM", speed: 12 },
];

export async function fetchCaptainPerformance() {
  await wait(500);
  return captains.map((captain) => ({
    ...captain,
    stars: Math.round(captain.rating),
    badge: captain.rating > 4.7 ? "Top Performer" : captain.upsell > 20 ? "Upsell Pro" : "Steady",
    trend: captain.orders > 40 ? "up" : "flat",
  }));
}
