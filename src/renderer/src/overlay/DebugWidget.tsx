import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Rnd } from 'react-rnd';
import type { RuntimeState } from '../../../shared/types.ts';

export function DebugWidget({ runtime }: { runtime: RuntimeState }): ReactNode {
  const [size, setSize] = useState({ width: 430, height: 320 });
  const [position, setPosition] = useState({ x: 20, y: 70 });
  const consoleRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [runtime.debugLogs.length, runtime.debugLogs.at(-1)?.time]);
  return <Rnd className="debug-rnd" size={size} position={position} minWidth={300} minHeight={220}
    dragHandleClassName="debug-title" style={{ zIndex: 10000, pointerEvents: 'auto' }}
    onDragStop={(_event, data) => setPosition({ x: data.x, y: data.y })}
    onResizeStop={(_event, _direction, element, _delta, next) => {
      setSize({ width: element.offsetWidth, height: element.offsetHeight }); setPosition(next);
    }}>
    <section className="debug-widget">
      <header className="debug-title">MSCW Helper — Debug</header>
      <div className="debug-potions">
        {Object.entries(runtime.potionTracking).map(([id, status]) => <div key={id}>
          {status.vitals && <>HP {status.vitals.hp}/{status.vitals.maxHp}, MP {status.vitals.mp}/{status.vitals.maxMp}<br /></>}
          {status.message}
        </div>)}
        <strong>Estimated recovery-item uses</strong>
        {runtime.detectedPotions.length ? runtime.detectedPotions.map(p =>
          <div key={p.itemId}>{p.name} ({p.itemId}): {p.count ?? 'waiting for count'}</div>) :
          <div>No identified recovery events yet. Open Meso Tracker to configure HP/MP recovery tracking.</div>}
      </div>
      <pre ref={consoleRef} className="debug-console" aria-label="Debug console">{runtime.debugLogs.map(entry =>
        `${new Date(entry.time).toLocaleTimeString()} [${entry.level}] ${entry.message}`).join('\n')}</pre>
    </section>
  </Rnd>;
}
