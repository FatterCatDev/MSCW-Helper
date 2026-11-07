import { useEffect, useState, type ReactNode } from 'react';

/** Text input that keeps a local draft and commits on blur / Enter (avoids caret jumps from state round-trips). */
export function TextField(props: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  validate?: (v: string) => boolean;
  className?: string;
}): ReactNode {
  const [draft, setDraft] = useState(props.value);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(props.value);
  }, [props.value, focused]);
  const valid = props.validate ? props.validate(draft) : true;
  const commit = (): void => {
    if (valid && draft !== props.value) props.onCommit(draft);
    else if (!valid) setDraft(props.value);
  };
  return (
    <input
      className={`${props.className ?? ''} ${valid ? '' : 'error'}`}
      value={draft}
      placeholder={props.placeholder}
      maxLength={props.maxLength}
      onFocus={() => setFocused(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(props.value);
          setTimeout(() => (e.target as HTMLInputElement).blur());
        }
      }}
    />
  );
}

export function NumberField(props: { value: number; onCommit: (v: number) => void; min?: number; max?: number; step?: number; className?: string }): ReactNode {
  const { min = -Infinity, max = Infinity } = props;
  return (
    <TextField
      className={`num ${props.className ?? ''}`}
      value={String(props.value)}
      validate={(v) => {
        const n = Number(v);
        return v.trim() !== '' && Number.isFinite(n) && n >= min && n <= max;
      }}
      onCommit={(v) => props.onCommit(Number(v))}
    />
  );
}

export function Toggle(props: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }): ReactNode {
  return (
    <label className="toggle">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      <span>{props.label}</span>
    </label>
  );
}

export function Slider(props: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }): ReactNode {
  const [draft, setDraft] = useState<number | null>(null);
  const v = draft ?? props.value;
  return (
    <span className="slider">
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={v}
        onChange={(e) => {
          const n = Number(e.target.value);
          setDraft(n);
          props.onChange(n);
        }}
        onPointerUp={() => setDraft(null)}
        onBlur={() => setDraft(null)}
      />
      <span className="mono">{props.format ? props.format(v) : v}</span>
    </span>
  );
}

export function Field(props: { label: string; children: ReactNode; hint?: string }): ReactNode {
  return (
    <div className="field">
      <span className="field-label">{props.label}</span>
      <div className="field-control">
        {props.children}
        {props.hint && <span className="hint">{props.hint}</span>}
      </div>
    </div>
  );
}
