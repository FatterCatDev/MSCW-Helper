import { useEffect, useRef, useState, type ReactNode } from 'react';
import { imageUrl } from '../../../shared/ipc.ts';
import { EntryInput, type WidgetProps } from './common.tsx';

export function NotesWidget({ w, dispatch }: WidgetProps<'notes'>): ReactNode {
  const { items, text } = w.data;
  const setItems = (next: typeof items): void => dispatch({ type: 'widget/data', id: w.id, data: { items: next } });
  return (
    <div className="widget-body notes">
      <ul className="checklist">
        {items.map((item) => (
          <li key={item.id} className={item.done ? 'done' : ''}>
            <label>
              <input type="checkbox" checked={item.done} onChange={() => setItems(items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)))} />
              <span>{item.text}</span>
            </label>
            <button className="icon" title="Remove" onClick={() => setItems(items.filter((i) => i.id !== item.id))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <EntryInput placeholder="Add checklist item" buttonLabel="Add" onSubmit={(v) => setItems([...items, { id: crypto.randomUUID(), text: v.slice(0, 200), done: false }])} />
      <NotesText text={text} onCommit={(t) => dispatch({ type: 'widget/data', id: w.id, data: { text: t } })} />
    </div>
  );
}

/** Keeps typing local and commits after a short pause, so state round-trips never move the caret. */
function NotesText({ text, onCommit }: { text: string; onCommit: (text: string) => void }): ReactNode {
  const [draft, setDraft] = useState(text);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!focused.current) setDraft(text);
  }, [text]);

  const commit = (value: string): void => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (value !== text) onCommit(value);
  };

  return (
    <textarea
      placeholder="Notes…"
      value={draft}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        commit(draft);
      }}
      onChange={(e) => {
        const value = e.target.value.slice(0, 20000);
        setDraft(value);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => commit(value), 500);
      }}
      onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
    />
  );
}

export function ImageWidget({ w, dispatch }: WidgetProps<'image'>): ReactNode {
  const { images, index } = w.data;
  if (images.length === 0) {
    return (
      <div className="widget-body center hint">
        <p>No images yet.</p>
        <button onClick={() => window.mscw.openControl(w.id)}>Add images…</button>
      </div>
    );
  }
  const i = Math.min(index, images.length - 1);
  const go = (delta: number): void => dispatch({ type: 'widget/data', id: w.id, data: { index: (i + delta + images.length) % images.length } });
  return (
    <div className="widget-body image-body">
      <img src={imageUrl(images[i]!)} alt="" style={{ objectFit: w.config.fit }} draggable={false} />
      {images.length > 1 && (
        <div className="image-nav">
          <button className="small" onClick={() => go(-1)}>
            ‹
          </button>
          <span className="hint">
            {i + 1}/{images.length}
          </span>
          <button className="small" onClick={() => go(1)}>
            ›
          </button>
        </div>
      )}
    </div>
  );
}
