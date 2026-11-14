// Renders the Store Stock sheets and views with a stubbed context and checks what they send:
// item edit (name / unit / opening), entry edit (purchase / issue), item search, unit list.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react';
import { StoreCtx } from '../storeContext';
import { createBook } from '../storeEngine';
import { EditItemSheet, EditEntrySheet, AddItemSheet, PurchaseSheet } from '../StoreSheets';
import { StockView, ActivityView } from '../StoreViews';

// vitest.config.js has no React plugin, so JSX compiles the classic way: the components need `React` in scope.
globalThis.React = React;

const DEPTS = ['Indian Kitchen', 'Chinese Kitchen', 'Tandoori Kitchen', 'Other'];
const TODAY = '2026-11-10';
let seq = 0;
const ent = (itemId, type, qty, extra = {}) => ({ id: 'e' + ++seq, itemId, type, qty, date: '2026-11-09', ts: 1760000000000 + seq, by: 'Ramu', ...extra });

const ITEMS = [
  { id: 'rice', name: 'Basmati Rice', unit: 'kg' },
  { id: 'oil', name: 'Sunflower Oil', unit: 'tin' },
  { id: 'cola', name: 'Cola', unit: 'bottle' },
  { id: 'salt', name: 'Salt', unit: 'kg' },
];
const mk = () => {
  seq = 0;
  const entries = [
    ent('rice', 'OPENING', 10, { rate: 50 }),
    ent('rice', 'PURCHASE', 5, { rate: 60, supplier: 'Raju' }),
    ent('rice', 'ISSUE', -3, { dept: 'Indian Kitchen', to: 'Ramesh' }),
    ent('oil', 'OPENING', 4, { rate: 1500 }),
    ent('cola', 'OPENING', 24, { rate: 20 }),
    ent('salt', 'OPENING', 0, { rate: 0 }),
  ];
  return { entries, book: createBook({ items: ITEMS, entries, depts: DEPTS }) };
};

let ctx;
const mount = (ui, over = {}) => {
  const { book } = mk();
  ctx = {
    book, today: TODAY, user: 'Tester', depts: DEPTS, people: ['Ramesh'], close: vi.fn(), notify: vi.fn(), openSheet: vi.fn(), openActivity: vi.fn(),
    actions: { editItem: vi.fn().mockResolvedValue(), editEntry: vi.fn().mockResolvedValue(), addItem: vi.fn().mockResolvedValue(), addEntry: vi.fn().mockResolvedValue() },
    ...over,
  };
  return render(<StoreCtx.Provider value={ctx}>{ui}</StoreCtx.Provider>);
};
const press = (name) => fireEvent.click(screen.getByRole('button', { name }));
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => { cleanup(); });

describe('unit list', () => {
  it('shows Weight / Volume / Count / Packaging with tin and bottle when adding an item', () => {
    mount(<AddItemSheet />);
    const select = screen.getByLabelText('Unit of measurement');
    const groups = [...select.querySelectorAll('optgroup')].map((g) => g.label);
    expect(groups).toEqual(['Weight', 'Volume', 'Count', 'Packaging']);
    const values = [...select.querySelectorAll('option')].map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(['kg', 'g', 'tin', 'bottle', 'jar', 'bag', 'carton']));
  });
});

describe('delete item', () => {
  it('asks to confirm, then deletes an item that has only its opening entry', async () => {
    mount(<EditItemSheet itemId="salt" />, { actions: { deleteItem: vi.fn().mockResolvedValue() } });
    press('Delete item');
    expect(ctx.actions.deleteItem).not.toHaveBeenCalled();
    press('Yes, delete');
    await flush();
    expect(ctx.actions.deleteItem).toHaveBeenCalledWith('salt', { by: 'Tester' });
    expect(ctx.close).toHaveBeenCalled();
  });

  it('offers no delete button once the item has purchases or issues', () => {
    mount(<EditItemSheet itemId="rice" />, { actions: { deleteItem: vi.fn() } });
    expect(screen.queryByRole('button', { name: 'Delete item' })).toBeNull();
    expect(screen.getByText(/can’t be deleted/)).toBeTruthy();
  });
});

describe('edit item', () => {
  it('renames and sends only the name', async () => {
    mount(<EditItemSheet itemId="salt" />);
    type('Item name', 'Rock Salt');
    press('Save changes');
    await flush();
    expect(ctx.actions.editItem).toHaveBeenCalledWith('salt', { by: 'Tester', name: 'Rock Salt' });
    expect(ctx.close).toHaveBeenCalled();
  });

  it('refuses a name another item already has', async () => {
    mount(<EditItemSheet itemId="salt" />);
    type('Item name', 'cola');
    press('Save changes');
    await flush();
    expect(ctx.actions.editItem).not.toHaveBeenCalled();
    expect(screen.getByText('Another item already has this name.')).toBeTruthy();
  });

  it('says "nothing changed" instead of calling the server', async () => {
    mount(<EditItemSheet itemId="salt" />);
    press('Save changes');
    await flush();
    expect(ctx.actions.editItem).not.toHaveBeenCalled();
    expect(ctx.notify).toHaveBeenCalledWith('Nothing changed');
  });

  it('only offers the same group of units once there are purchases or issues', () => {
    mount(<EditItemSheet itemId="rice" />);
    const values = [...screen.getByLabelText('Unit of measurement').querySelectorAll('option')].map((o) => o.value);
    expect(values).toEqual(['kg', 'g', 'ton']);
  });

  it('kg → g: shows the opening in grams, sends only the unit (the server converts everything)', async () => {
    mount(<EditItemSheet itemId="rice" />);
    fireEvent.change(screen.getByLabelText('Unit of measurement'), { target: { value: 'g' } });
    expect(screen.getByLabelText(/Opening stock/).value).toBe('10000');
    expect(screen.getByLabelText(/Rate per g/).value).toBe('0.05');
    press('Save changes');
    await flush();
    expect(ctx.actions.editItem).toHaveBeenCalledWith('rice', { by: 'Tester', unit: 'g' });
  });

  it('edits the opening stock and rate', async () => {
    mount(<EditItemSheet itemId="rice" />);
    type(/Opening stock/, '12');
    type(/Rate per KG/, '55');
    press('Save changes');
    await flush();
    expect(ctx.actions.editItem).toHaveBeenCalledWith('rice', { by: 'Tester', openingQty: 12, openingRate: 55 });
  });

  it('oil (tin, only an opening entry) can move to a different kind of unit, but the opening must be re-entered', async () => {
    mount(<EditItemSheet itemId="oil" />);
    fireEvent.change(screen.getByLabelText('Unit of measurement'), { target: { value: 'litre' } });
    expect(screen.getByLabelText(/Opening stock/).value).toBe('');
    press('Save changes');
    await flush();
    expect(ctx.actions.editItem).not.toHaveBeenCalled();
    expect(screen.getByText('Enter the opening stock and rate in L.')).toBeTruthy();
    type(/Opening stock/, '60');
    type(/Rate per L/, '100');
    press('Save changes');
    await flush();
    expect(ctx.actions.editItem).toHaveBeenCalledWith('oil', { by: 'Tester', unit: 'litre', openingQty: 60, openingRate: 100 });
  });

  it('shows the server error and stays open when the save fails', async () => {
    mount(<EditItemSheet itemId="salt" />, { actions: { editItem: vi.fn().mockRejectedValue(new Error('Another item has this name.')) } });
    type('Item name', 'Pepper');
    press('Save changes');
    await flush();
    expect(screen.getByText('Another item has this name.')).toBeTruthy();
    expect(ctx.close).not.toHaveBeenCalled();
  });
});

describe('edit entry', () => {
  const entryId = (type) => mk().entries.find((e) => e.type === type).id; // ids are deterministic per mk()

  it('purchase: sends only the fields that changed', async () => {
    mount(<EditEntrySheet entryId={entryId('PURCHASE')} />);
    type(/Quantity/, '6');
    type(/Rate per KG/, '62.5');
    press('Save changes');
    await flush();
    expect(ctx.actions.editEntry).toHaveBeenCalledWith(entryId('PURCHASE'), { by: 'Tester', qty: 6, rate: 62.5 });
  });

  it('purchase: supplier only', async () => {
    mount(<EditEntrySheet entryId={entryId('PURCHASE')} />);
    type('Supplier (optional)', 'Raju Traders');
    press('Save changes');
    await flush();
    expect(ctx.actions.editEntry).toHaveBeenCalledWith(entryId('PURCHASE'), { by: 'Tester', supplier: 'Raju Traders' });
  });

  it('purchase: rejects a zero quantity without calling the server', async () => {
    mount(<EditEntrySheet entryId={entryId('PURCHASE')} />);
    type(/Quantity/, '0');
    press('Save changes');
    await flush();
    expect(ctx.actions.editEntry).not.toHaveBeenCalled();
    expect(screen.getByText('Enter the quantity.')).toBeTruthy();
  });

  it('issue: quantity is edited as a positive number, department can be switched', async () => {
    mount(<EditEntrySheet entryId={entryId('ISSUE')} />);
    expect(screen.getByLabelText(/Quantity/).value).toBe('3');
    type(/Quantity/, '4');
    press('Chinese Kitchen');
    press('Save changes');
    await flush();
    expect(ctx.actions.editEntry).toHaveBeenCalledWith(entryId('ISSUE'), { by: 'Tester', qty: 4, dept: 'Chinese Kitchen' });
  });

  it('opening: edits stock and rate', async () => {
    mount(<EditEntrySheet entryId={entryId('OPENING')} />);
    type(/Stock/, '11');
    press('Save changes');
    await flush();
    expect(ctx.actions.editEntry).toHaveBeenCalledWith(entryId('OPENING'), { by: 'Tester', qty: 11 });
  });
});

describe('search', () => {
  it('stock tab: matches by name, by unit, and by several words', () => {
    mount(<StockView />);
    const box = screen.getByLabelText('Search items');
    expect(screen.getAllByRole('button', { name: /^Edit / })).toHaveLength(4);
    fireEvent.change(box, { target: { value: 'oil' } });
    expect(screen.getAllByRole('button', { name: /^Edit / })).toHaveLength(1);
    fireEvent.change(box, { target: { value: 'bottle' } }); // by unit
    expect(screen.getByRole('button', { name: 'Edit Cola' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Edit / })).toHaveLength(1);
    fireEvent.change(box, { target: { value: 'rice kg' } }); // two words
    expect(screen.getByRole('button', { name: 'Edit Basmati Rice' })).toBeTruthy();
    fireEvent.change(box, { target: { value: 'rice tin' } });
    expect(screen.getByText(/No item matches/)).toBeTruthy();
  });

  it('stock tab: the pencil on a card opens the item editor', () => {
    mount(<StockView />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Cola' }));
    expect(ctx.openSheet).toHaveBeenCalledWith('editItem', { itemId: 'cola' });
  });

  it('activity: search finds entries by item, supplier or person, and Edit is offered', () => {
    mount(<ActivityView filter={{ type: 'ALL', item: '' }} setFilter={() => {}} />);
    const box = screen.getByLabelText('Search activity');
    fireEvent.change(box, { target: { value: 'raju' } }); // supplier
    expect(screen.getByText(/Raju/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1);
    fireEvent.change(box, { target: { value: 'ramesh' } }); // received by
    expect(screen.getAllByRole('button', { name: 'Correct' })).toHaveLength(1);
    expect(screen.getByText(/received by Ramesh/)).toBeTruthy();
    fireEvent.change(box, { target: { value: 'zzz' } });
    expect(screen.getByText(/No entry matches/)).toBeTruthy();
  });

  it('item picker in the forms: a search box selects the first match', () => {
    mount(<PurchaseSheet />);
    expect(screen.queryByLabelText('Search item')).toBeNull(); // 4 items: no search box needed
    cleanup();
    const many = Array.from({ length: 8 }, (_, i) => ({ id: 'x' + i, name: ['Ajwain', 'Besan', 'Chilli', 'Dal', 'Elaichi', 'Flour', 'Ghee', 'Honey'][i], unit: 'kg' }));
    const book = createBook({ items: many, entries: many.map((i) => ent(i.id, 'OPENING', 1, { rate: 1 })), depts: DEPTS });
    mount(<PurchaseSheet />, { book });
    fireEvent.change(screen.getByLabelText('Search item'), { target: { value: 'gh' } });
    const select = within(document.body).getByLabelText('Item');
    expect(select.value).toBe('x6'); // Ghee
    expect([...select.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Ghee (KG)']);
  });
});
