import { useState, type ReactNode } from 'react';

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);

const CODE_MAP: Record<string, string> = {
  Space: 'Space',
  Enter: 'Return',
  Tab: 'Tab',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  NumpadAdd: 'numadd',
  NumpadSubtract: 'numsub',
  NumpadMultiply: 'nummult',
  NumpadDivide: 'numdiv',
  NumpadDecimal: 'numdec'
};

/** Converts a keydown event into an Electron accelerator string, or null if only modifiers are held. */
export function toAccelerator(e: KeyboardEvent | React.KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  let key: string | undefined;
  const code = e.code;
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit\d$/.test(code)) key = code.slice(5);
  else if (/^Numpad\d$/.test(code)) key = `num${code.slice(6)}`;
  else if (/^F\d{1,2}$/.test(code)) key = code;
  else key = CODE_MAP[code];
  if (!key) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Super');
  parts.push(key);
  return parts.join('+');
}

export function HotkeyInput(props: { value: string; onChange: (accel: string) => void; error?: string | undefined }): ReactNode {
  const [recording, setRecording] = useState(false);
  const noModifier = props.value !== '' && !/(Ctrl|Alt|Shift|Super)\+/.test(props.value);
  return (
    <span className="hotkey-input">
      <input
        readOnly
        className={props.error ? 'error' : undefined}
        value={recording ? 'Press keys… (Esc cancel, Del clear)' : props.value || 'None'}
        title={props.error}
        onFocus={() => setRecording(true)}
        onBlur={() => setRecording(false)}
        onKeyDown={(e) => {
          e.preventDefault();
          if (e.key === 'Escape') return e.currentTarget.blur();
          if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey && !e.altKey && !e.shiftKey) {
            props.onChange('');
            return e.currentTarget.blur();
          }
          const accel = toAccelerator(e);
          if (accel) {
            props.onChange(accel);
            e.currentTarget.blur();
          }
        }}
      />
      {props.value && (
        <button className="icon" title="Clear" onClick={() => props.onChange('')}>
          ×
        </button>
      )}
      {props.error && <span className="bad small-text">{props.error}</span>}
      {!props.error && noModifier && <span className="warn-text small-text">No modifier: this key will stop working in-game</span>}
    </span>
  );
}
