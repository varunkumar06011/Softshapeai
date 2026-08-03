import { describe, expect, it } from 'vitest';
import { mapFlatMenuItems, mapPosViewToMenuItems } from '../menuService';

describe('menu service liquor diet mapping', () => {
  it('does not classify liquor as veg or non-veg in flat menu responses', () => {
    const [liquor, food] = mapFlatMenuItems([
      { id: 'liquor-1', name: 'Whisky', menuType: 'LIQUOR', isVeg: true, price: 200 },
      { id: 'food-1', name: 'Paneer', menuType: 'FOOD', isVeg: true, price: 150 },
    ]);

    expect(liquor.t).toBeNull();
    expect(food.t).toBe('veg');
  });

  it('does not classify liquor as veg or non-veg in nested menu responses', () => {
    const [liquor] = mapPosViewToMenuItems([
      {
        name: 'Bar',
        items: [{ id: 'liquor-1', name: 'Rum', menuType: 'BAR', isVeg: false, variants: [{ price: 250 }] }],
      },
    ]);

    expect(liquor.t).toBeNull();
  });
});
