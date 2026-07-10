import React, { useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Users, ChevronDown, GripVertical, RotateCcw, Wallet } from 'lucide-react';

function SortableItem({ route, activePage, onNavigate }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: route.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1 rounded-md ${
        activePage === route.key ? 'bg-white text-[#B71C1C]' : 'text-white hover:bg-white/10'
      }`}
    >
      <button
        onClick={() => onNavigate(route.key)}
        className="flex flex-1 items-center gap-2 px-3 py-2 text-sm min-w-0"
      >
        <route.icon size={route.group === 'hr' || route.group === 'finance' ? 14 : 16} />
        <span className="truncate">{route.label}</span>
      </button>
      <button
        className={`ml-1 p-1.5 rounded-md cursor-grab active:cursor-grabbing transition-colors ${
          activePage === route.key
            ? 'bg-[#B71C1C]/10 text-[#B71C1C]/70 hover:text-[#B71C1C] hover:bg-[#B71C1C]/20'
            : 'bg-white/10 text-white/70 hover:text-white hover:bg-white/25'
        }`}
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${route.label}`}
        title={`Drag to reorder ${route.label}`}
      >
        <GripVertical size={16} />
      </button>
    </div>
  );
}

function SortableGroup({
  groupKey,
  groupLabel,
  groupIcon: GroupIcon,
  groupRoutes,
  activePage,
  onNavigate,
  onReorder,
  isExpanded,
  onToggle,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: groupKey });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleSubDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = groupRoutes.findIndex((r) => r.key === active.id);
      const newIndex = groupRoutes.findIndex((r) => r.key === over.id);
      onReorder(arrayMove(groupRoutes, oldIndex, newIndex));
    }
  };

  const isActive = groupRoutes.some((r) => r.key === activePage);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  if (groupRoutes.length === 0) return null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-md ${isActive ? 'bg-white/10' : ''}`}
    >
      <div className="flex items-center gap-1">
        <button
          onClick={onToggle}
          className={`flex flex-1 items-center gap-2 px-3 py-2 text-sm min-w-0 ${
            isActive ? 'text-white' : 'text-white hover:bg-white/10'
          }`}
        >
          <GroupIcon size={16} />
          <span className="truncate">{groupLabel}</span>
          <ChevronDown
            size={14}
            className={`ml-auto transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          />
        </button>
        <button
          className="ml-1 p-1.5 rounded-md bg-white/10 text-white/70 hover:text-white hover:bg-white/25 cursor-grab active:cursor-grabbing transition-colors"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${groupLabel} section`}
          title={`Drag to move ${groupLabel} section`}
        >
          <GripVertical size={16} />
        </button>
      </div>
      {isExpanded && (
        <div className="pl-4 pr-1 pb-1">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleSubDragEnd}
          >
            <SortableContext
              items={groupRoutes.map((r) => r.key)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1">
                {groupRoutes.map((route) => (
                  <SortableItem
                    key={route.key}
                    route={route}
                    activePage={activePage}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  );
}

export default function SortableSidebar({
  visibleRoutes,
  activePage,
  onNavigate,
  hrExpanded,
  onToggleHr,
  financeExpanded,
  onToggleFinance,
  userId,
}) {
  const storageKey = useMemo(() => `admin-nav-order:${userId || 'default'}`, [userId]);
  const HR_GROUP_KEY = '__hr_group__';
  const FINANCE_GROUP_KEY = '__finance_group__';

  const [order, setOrder] = React.useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const nonHrRoutes = useMemo(
    () => visibleRoutes.filter((r) => !r.group || (r.group !== 'hr' && r.group !== 'finance')),
    [visibleRoutes]
  );
  const hrRoutes = useMemo(
    () => visibleRoutes.filter((r) => r.group === 'hr'),
    [visibleRoutes]
  );
  const financeRoutes = useMemo(
    () => visibleRoutes.filter((r) => r.group === 'finance'),
    [visibleRoutes]
  );

  // Migrate old saved order (no group key) to new format
  const effectiveOrder = useMemo(() => {
    if (order.length === 0) return order;
    let migrated = order;
    // Insert HR group key if missing
    if (!migrated.includes(HR_GROUP_KEY) && hrRoutes.length > 0) {
      const firstHrIndex = migrated.findIndex((key) =>
        hrRoutes.some((r) => r.key === key)
      );
      if (firstHrIndex >= 0) {
        migrated = [
          ...migrated.slice(0, firstHrIndex),
          HR_GROUP_KEY,
          ...migrated.slice(firstHrIndex),
        ];
      } else {
        migrated = [...migrated, HR_GROUP_KEY];
      }
    }
    // Insert finance group key if missing
    if (!migrated.includes(FINANCE_GROUP_KEY) && financeRoutes.length > 0) {
      const firstFinanceIndex = migrated.findIndex((key) =>
        financeRoutes.some((r) => r.key === key)
      );
      if (firstFinanceIndex >= 0) {
        migrated = [
          ...migrated.slice(0, firstFinanceIndex),
          FINANCE_GROUP_KEY,
          ...migrated.slice(firstFinanceIndex),
        ];
      } else {
        migrated = [...migrated, FINANCE_GROUP_KEY];
      }
    }
    return migrated;
  }, [order, hrRoutes, financeRoutes]);

  React.useEffect(() => {
    if (effectiveOrder !== order && effectiveOrder.length > 0) {
      setOrder(effectiveOrder);
      try {
        localStorage.setItem(storageKey, JSON.stringify(effectiveOrder));
      } catch {
        // ignore
      }
    }
  }, [effectiveOrder, order, storageKey]);

  const orderMap = useMemo(
    () => new Map(effectiveOrder.map((key, idx) => [key, idx])),
    [effectiveOrder]
  );

  const mainItems = useMemo(() => {
    const items = [
      ...nonHrRoutes,
      { key: HR_GROUP_KEY, label: 'HR', isGroup: 'hr' },
      { key: FINANCE_GROUP_KEY, label: 'Finance', isGroup: 'finance' },
    ];
    return items.sort((a, b) => {
      const aIdx = orderMap.get(a.key);
      const bIdx = orderMap.get(b.key);
      if (aIdx !== undefined && bIdx !== undefined) return aIdx - bIdx;
      if (aIdx !== undefined) return -1;
      if (bIdx !== undefined) return 1;
      return 0;
    });
  }, [nonHrRoutes, orderMap]);

  const sortedHrRoutes = useMemo(() => {
    return [...hrRoutes].sort((a, b) => {
      const aIdx = orderMap.get(a.key);
      const bIdx = orderMap.get(b.key);
      if (aIdx !== undefined && bIdx !== undefined) return aIdx - bIdx;
      if (aIdx !== undefined) return -1;
      if (bIdx !== undefined) return 1;
      return 0;
    });
  }, [hrRoutes, orderMap]);

  const sortedFinanceRoutes = useMemo(() => {
    return [...financeRoutes].sort((a, b) => {
      const aIdx = orderMap.get(a.key);
      const bIdx = orderMap.get(b.key);
      if (aIdx !== undefined && bIdx !== undefined) return aIdx - bIdx;
      if (aIdx !== undefined) return -1;
      if (bIdx !== undefined) return 1;
      return 0;
    });
  }, [financeRoutes, orderMap]);

  const defaultOrder = useMemo(
    () => [...nonHrRoutes.map((r) => r.key), HR_GROUP_KEY, ...hrRoutes.map((r) => r.key), FINANCE_GROUP_KEY, ...financeRoutes.map((r) => r.key)],
    [nonHrRoutes, hrRoutes, financeRoutes]
  );
  const hasCustomOrder = useMemo(() => {
    if (effectiveOrder.length === 0) return false;
    if (effectiveOrder.length !== defaultOrder.length) return true;
    return effectiveOrder.some((key, idx) => key !== defaultOrder[idx]);
  }, [effectiveOrder, defaultOrder]);

  const saveOrder = (nextMainOrder, nextHrOrder, nextFinanceOrder) => {
    const hrIndex = nextMainOrder.indexOf(HR_GROUP_KEY);
    const financeIndex = nextMainOrder.indexOf(FINANCE_GROUP_KEY);
    // Build the full order by replacing group keys with their children
    const nextOrder = [];
    for (const key of nextMainOrder) {
      if (key === HR_GROUP_KEY) {
        nextOrder.push(HR_GROUP_KEY);
        nextOrder.push(...(nextHrOrder || sortedHrRoutes.map((r) => r.key)));
      } else if (key === FINANCE_GROUP_KEY) {
        nextOrder.push(FINANCE_GROUP_KEY);
        nextOrder.push(...(nextFinanceOrder || sortedFinanceRoutes.map((r) => r.key)));
      } else {
        nextOrder.push(key);
      }
    }
    setOrder(nextOrder);
    try {
      localStorage.setItem(storageKey, JSON.stringify(nextOrder));
    } catch {
      // ignore
    }
  };

  const resetOrder = () => {
    setOrder([]);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleMainDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = mainItems.findIndex((i) => i.key === active.id);
      const newIndex = mainItems.findIndex((i) => i.key === over.id);
      const reorderedMainItems = arrayMove(mainItems, oldIndex, newIndex);
      saveOrder(
        reorderedMainItems.map((i) => i.key),
        sortedHrRoutes.map((r) => r.key),
        sortedFinanceRoutes.map((r) => r.key)
      );
    }
  };

  const handleHrReorder = (reordered) => {
    saveOrder(
      mainItems.map((i) => i.key),
      reordered.map((r) => r.key),
      sortedFinanceRoutes.map((r) => r.key)
    );
  };

  const handleFinanceReorder = (reordered) => {
    saveOrder(
      mainItems.map((i) => i.key),
      sortedHrRoutes.map((r) => r.key),
      reordered.map((r) => r.key)
    );
  };

  return (
    <div className="space-y-1">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleMainDragEnd}
      >
        <SortableContext
          items={mainItems.map((i) => i.key)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1">
            {mainItems.map((item) =>
              item.isGroup === 'hr' ? (
                <SortableGroup
                  key={item.key}
                  groupKey={item.key}
                  groupLabel="HR"
                  groupIcon={Users}
                  groupRoutes={sortedHrRoutes}
                  activePage={activePage}
                  onNavigate={onNavigate}
                  onReorder={handleHrReorder}
                  isExpanded={hrExpanded}
                  onToggle={onToggleHr}
                />
              ) : item.isGroup === 'finance' ? (
                <SortableGroup
                  key={item.key}
                  groupKey={item.key}
                  groupLabel="Finance"
                  groupIcon={Wallet}
                  groupRoutes={sortedFinanceRoutes}
                  activePage={activePage}
                  onNavigate={onNavigate}
                  onReorder={handleFinanceReorder}
                  isExpanded={financeExpanded}
                  onToggle={onToggleFinance}
                />
              ) : (
                <SortableItem
                  key={item.key}
                  route={item}
                  activePage={activePage}
                  onNavigate={onNavigate}
                />
              )
            )}
          </div>
        </SortableContext>
      </DndContext>
      {hasCustomOrder && (
        <button
          onClick={resetOrder}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-black uppercase tracking-wider text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          aria-label="Reset sidebar order"
        >
          <RotateCcw size={14} />
          Reset Order
        </button>
      )}
    </div>
  );
}
