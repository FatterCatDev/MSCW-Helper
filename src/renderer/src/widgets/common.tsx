import { useState, type ReactNode } from 'react';
import type { PotionStatus, WidgetDef, WidgetType } from '../../../shared/types.ts';
import type { Dispatch } from '../common/state.ts';

export interface WidgetProps<T extends WidgetType> {
  w: WidgetDef<T>;
  dispatch: Dispatch;
  now: number;
  potionStatus?: PotionStatus | undefined;
}

/** Single-line input that submits on Enter and releases focus back afterwards. */
export function EntryInput(props: {
  placeholder: string;
  onSubmit: (value: string) => boolean | void;
  buttonLabel?: string;
}): ReactNode {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);
  const submit = (): void => {
    if (!value.trim()) return;
    const ok = props.onSubmit(value.trim());
    if (ok === false) {
      setError(true);
      return;
    }
    setError(false);
    setValue('');
  };
  return (
    <div className="entry">
      <input
        className={error ? 'error' : undefined}
        value={value}
        placeholder={props.placeholder}
        onChange={(e) => {
          setValue(e.target.value);
          setError(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            submit();
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            e.currentTarget.blur();
          }
        }}
      />
      <button onClick={submit}>{props.buttonLabel ?? 'Set'}</button>
    </div>
  );
}

export function Stat(props: { label: string; value: ReactNode; className?: string }): ReactNode {
  return (
    <div className={`stat ${props.className ?? ''}`}>
      <span className="stat-label">{props.label}</span>
      <span className="stat-value">{props.value}</span>
    </div>
  );
}
