
const ITEMS = ['Biriyani', 'Chai & Pakoda', 'Paneer Tikka', 'Family Meal Bundle', 'Lassi', 'Chicken 65', 'Veg Biriyani'];
const WEATHER = ['Sunny', 'Rainy', 'Cold', 'Humid'];
const EVENTS = ['Cricket Match', 'Weekend Rush', 'Local Festival', 'Public Holiday', 'None'];
const CATEGORIES = ['Pricing', 'Promotion', 'Inventory', 'Demand', 'Marketing', 'Combo Optimization'];

const RECOMMENDATION_POOL = [
  {
    title: "Increase {item} Price by {percent}%",
    category: "Pricing",
    explanation: "Spike detected from previous {event} traffic. Expected +{impact}% demand.",
    impact: "revenue",
    condition: (c) => c.event !== 'None' || c.isRushHour
  },
  {
    title: "Push combo offers for {item}",
    category: "Promotion",
    explanation: "Low inventory turnover for {item} detected. Optimize wastage by {impact}%.",
    impact: "inventory",
    condition: (c) => c.inventoryPressure
  },
  {
    title: "Promote {item} today",
    category: "Marketing",
    explanation: "Ideal {weather} weather detected. Historical data shows {impact}% higher conversion.",
    impact: "orders",
    condition: (c) => c.weather === 'Rainy' || c.weather === 'Cold'
  },
  {
    title: "Activate {event} Special Combo",
    category: "Combo Optimization",
    explanation: "Aligning with {event} schedule. Projected {impact}% increase in order velocity.",
    impact: "orders",
    condition: (c) => c.event !== 'None'
  },
  {
    title: "Reduce {item} price slightly",
    category: "Pricing",
    explanation: "Price elasticity analysis suggests {impact}% volume growth at lower price point.",
    impact: "volume",
    condition: (c) => !c.isRushHour
  },
  {
    title: "Promote family meal bundles tonight",
    category: "Demand",
    explanation: "{event} evening typically sees larger group orders. Revenue potential: +{impact}%.",
    impact: "revenue",
    condition: (c) => c.timeOfDay === 'Evening'
  }
];

export const getSmartRecommendation = () => {
  const now = new Date();
  const hours = now.getHours();
  
  const conditions = {
    timeOfDay: hours > 18 ? 'Evening' : hours > 11 ? 'Lunch' : 'Morning',
    weather: WEATHER[Math.floor(Math.random() * WEATHER.length)],
    event: EVENTS[Math.floor(Math.random() * EVENTS.length)],
    isRushHour: (hours >= 12 && hours <= 14) || (hours >= 19 && hours <= 21),
    inventoryPressure: Math.random() > 0.7,
    day: now.toLocaleDateString('en-US', { weekday: 'long' })
  };

  const validRecs = RECOMMENDATION_POOL.filter(r => r.condition(conditions));
  const template = validRecs.length > 0 ? validRecs[Math.floor(Math.random() * validRecs.length)] : RECOMMENDATION_POOL[0];
  
  const item = template.title.includes('Chai') ? 'Chai & Pakoda' : ITEMS[Math.floor(Math.random() * ITEMS.length)];
  const percent = 5 + Math.floor(Math.random() * 20);
  const impactVal = 10 + Math.floor(Math.random() * 40);
  
  const title = template.title
    .replace('{item}', item)
    .replace('{percent}', percent)
    .replace('{event}', conditions.event);
    
  const explanation = template.explanation
    .replace('{item}', item)
    .replace('{event}', conditions.event)
    .replace('{impact}', impactVal)
    .replace('{weather}', conditions.weather);

  return {
    category: template.category,
    title,
    explanation,
    confidence: 85 + Math.floor(Math.random() * 14),
    impact: impactVal,
    impactType: template.impact,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    conditions
  };
};
