import { useState } from 'react';
import type { KeyboardEvent } from 'react';

export type FacetOption = { value: string; count: number };

export type FilterField = {
  key: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: FacetOption[];
};

export type AvailableField = { key: string; count: number };

type Props = {
  /** Main Group / Sub Group / Brand — always shown, same three people
   *  already learned to use. */
  fixedFields: FilterField[];
  /** Fields someone picked from "+ Add filter" for this session. */
  extraFields: FilterField[];
  onRemoveExtraField: (key: string) => void;
  /** Columns from the uploaded file that aren't one of the fixed three —
   *  what "+ Add filter" offers, minus whatever's already active. */
  availableFields: AvailableField[];
  onAddExtraField: (key: string) => void;
  onApply: () => void;
};

// Lives above the results table, not beside it — a fixed-width side rail
// was most of what made the catalog feel cramped on a 1366px laptop, and
// this bar reflows onto a second line instead of squeezing the table.
export function FilterBar({
  fixedFields,
  extraFields,
  onRemoveExtraField,
  availableFields,
  onAddExtraField,
  onApply,
}: Props) {
  const [picking, setPicking] = useState(false);
  const activeKeys = new Set(extraFields.map((f) => f.key));
  const pickable = availableFields.filter((f) => !activeKeys.has(f.key));

  const onPick = (key: string) => {
    if (!key) return;
    onAddExtraField(key);
    setPicking(false);
  };

  const onPickerKeyDown = (e: KeyboardEvent<HTMLSelectElement>) => {
    if (e.key === 'Escape') setPicking(false);
  };

  return (
    <div className="filter-bar">
      <span className="filter-bar-label">Filters</span>
      <div className="filter-bar-fields">
        {fixedFields.map((f) => (
          <label key={f.key} className="field filter-bar-field">
            <span>{f.label}</span>
            <select value={f.value} onChange={(e) => f.onChange(e.target.value)}>
              <option value="">Any</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>{o.value} ({o.count})</option>
              ))}
            </select>
          </label>
        ))}

        {extraFields.map((f) => (
          <div key={f.key} className="field filter-bar-field filter-bar-field-extra">
            <span>
              {f.label}
              <button
                type="button"
                className="filter-bar-remove"
                aria-label={`Remove ${f.label} filter`}
                onClick={() => onRemoveExtraField(f.key)}
              >
                ×
              </button>
            </span>
            <select value={f.value} onChange={(e) => f.onChange(e.target.value)}>
              <option value="">Any</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>{o.value} ({o.count})</option>
              ))}
            </select>
          </div>
        ))}

        {picking ? (
          <label className="field filter-bar-field filter-bar-picker">
            <span>Filter by</span>
            <select autoFocus onChange={(e) => onPick(e.target.value)} onBlur={() => setPicking(false)} onKeyDown={onPickerKeyDown} defaultValue="">
              <option value="" disabled>Choose a column…</option>
              {pickable.map((f) => (
                <option key={f.key} value={f.key}>{f.key} ({f.count})</option>
              ))}
            </select>
          </label>
        ) : (
          pickable.length > 0 && (
            <button type="button" className="btn btn-ghost filter-bar-add" onClick={() => setPicking(true)}>
              + Add filter
            </button>
          )
        )}
      </div>
      <button type="button" className="btn btn-secondary" onClick={onApply}>
        Apply
      </button>
    </div>
  );
}
