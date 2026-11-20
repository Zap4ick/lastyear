import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Concert } from '../../shared/types.ts';
import { calendar, headliner } from '../../shared/concert.ts';
import type { Pick } from '../picks.ts';

export interface SlotView {
  pick: Pick;
  concert: Concert;
  photo: string | null;
  photoCount: number;
}

interface Props {
  slots: SlotView[];
  max: number;
  onMove: (from: number, to: number) => void;
  onRemove: (key: string) => void;
  onChoosePhoto: (key: string) => void;
}

/**
 * The three slots. Order = rank. Reorder by dragging a card (mouse, touch with a short hold, or keyboard:
 * focus a card, Space, arrows, Space).
 */
export function TopPicks({ slots, max, onMove, onRemove, onChoosePhoto }: Props) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // A short hold before dragging, so a swipe over the bar still scrolls the page.
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const keys = slots.map((s) => s.pick.key);

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    onMove(keys.indexOf(String(e.active.id)), keys.indexOf(String(e.over.id)));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={keys} strategy={horizontalListSortingStrategy}>
        <ol className="slots" style={{ gridTemplateColumns: `repeat(${max}, minmax(0, 1fr))` }}>
          {slots.map((s, i) => (
            <Slot key={s.pick.key} rank={i + 1} view={s} onRemove={onRemove} onChoosePhoto={onChoosePhoto} />
          ))}
          {Array.from({ length: max - slots.length }, (_, i) => (
            <li key={`empty-${i}`} className="slot empty">
              <span className="rank">#{slots.length + i + 1}</span>
              <span className="muted small">Tap a concert below</span>
            </li>
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function Slot({
  rank,
  view,
  onRemove,
  onChoosePhoto,
}: {
  rank: number;
  view: SlotView;
  onRemove: (key: string) => void;
  onChoosePhoto: (key: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: view.pick.key,
  });
  const { concert: c, photo } = view;
  const { month, day } = calendar(c.date);
  const name = headliner(c) ?? c.title;
  return (
    <li
      ref={setNodeRef}
      className={`slot${isDragging ? ' dragging' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <div
        className="slot-main"
        {...attributes}
        {...listeners}
        aria-label={`#${rank}: ${c.title}, ${month} ${day}. Drag to reorder.`}
      >
        <div className="slot-photo" style={photo ? { backgroundImage: `url(${photo})` } : undefined}>
          <span className="rank">#{rank}</span>
        </div>
        <div className="slot-text">
          <b>{c.kind === 'festival' ? c.title : name}</b>
          <span className="muted small">
            {month} {day} · {c.venue}
          </span>
        </div>
      </div>
      <div className="slot-actions">
        <button
          type="button"
          className="link"
          onClick={() => onChoosePhoto(view.pick.key)}
          disabled={view.photoCount < 2}
          title={
            view.photoCount < 2 ? 'No other photos for this concert' : `Choose a photo (${view.photoCount})`
          }
        >
          Photo
        </button>
        <button
          type="button"
          className="link remove"
          onClick={() => onRemove(view.pick.key)}
          aria-label={`Remove #${rank}`}
          title="Remove"
        >
          ✕
        </button>
      </div>
    </li>
  );
}
