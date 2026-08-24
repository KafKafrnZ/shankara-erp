import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api, isApiError } from '../lib/api.ts';

export type ItemFormValues = {
  itemCode: string;
  itemName: string;
  brand: string;
  catalogueNo: string;
  sapItemCode: string;
  alias: string;
  mainGroup: string;
  subGroup: string;
  uom: string;
  hsnDescription: string;
  extra: Array<{ key: string; value: string }>;
};

export function emptyItemFormValues(): ItemFormValues {
  return {
    itemCode: '', itemName: '', brand: '', catalogueNo: '', sapItemCode: '',
    alias: '', mainGroup: '', subGroup: '', uom: '', hsnDescription: '', extra: [],
  };
}

type Props = {
  initial: ItemFormValues;
  /** Locked once an item exists — the item code is how every version links
   *  together, so changing it here would silently start a different item
   *  instead of editing this one. */
  lockItemCode: boolean;
  onCancel: () => void;
  onSaved: (itemCode: string) => void;
};

export function ItemEditForm({ initial, lockItemCode, onCancel, onSaved }: Props) {
  const [values, setValues] = useState<ItemFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [knownFields, setKnownFields] = useState<string[]>([]);
  const merged = useRef(false);

  // Every extra column the live sheet has anywhere, not just the ones this
  // one item happens to carry — so "add a new instance of data" shows the
  // whole sheet's shape up front instead of making someone retype a field
  // name from memory. Merged into `extra` once, as blank rows for whatever
  // known fields aren't already present; the free-form "+ Add a field" flow
  // below stays for a column that doesn't exist anywhere yet.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fields = await api<Array<{ key: string; count: number }>>('/api/item-search/fields');
        if (cancelled) return;
        const keys = fields.map((f) => f.key).sort((a, b) => a.localeCompare(b));
        setKnownFields(keys);
        if (!merged.current) {
          merged.current = true;
          setValues((prev) => {
            const present = new Set(prev.extra.map((r) => r.key));
            const missing = keys.filter((k) => !present.has(k)).map((key) => ({ key, value: '' }));
            return missing.length === 0 ? prev : { ...prev, extra: [...prev.extra, ...missing] };
          });
        }
      } catch {
        /* the fixed fields and free-form "+ Add a field" still work without this */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setField = (key: keyof Omit<ItemFormValues, 'extra'>, v: string) =>
    setValues((prev) => ({ ...prev, [key]: v }));

  const addExtraRow = () => setValues((prev) => ({ ...prev, extra: [...prev.extra, { key: '', value: '' }] }));
  const removeExtraRow = (i: number) =>
    setValues((prev) => ({ ...prev, extra: prev.extra.filter((_, idx) => idx !== i) }));
  const setExtraRow = (i: number, field: 'key' | 'value', v: string) =>
    setValues((prev) => ({
      ...prev,
      extra: prev.extra.map((row, idx) => (idx === i ? { ...row, [field]: v } : row)),
    }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const itemCode = values.itemCode.trim();
    const itemName = values.itemName.trim();
    if (!itemCode || !itemName) {
      setError('Item code and item name are required');
      return;
    }
    setSaving(true);
    try {
      const extra: Record<string, string> = {};
      for (const row of values.extra) {
        const key = row.key.trim();
        if (key) extra[key] = row.value.trim();
      }
      await api('/api/item-master/rows', {
        method: 'POST',
        body: JSON.stringify({
          itemCode,
          itemName,
          brand: values.brand.trim() || undefined,
          catalogueNo: values.catalogueNo.trim() || undefined,
          sapItemCode: values.sapItemCode.trim() || undefined,
          alias: values.alias.trim() || undefined,
          mainGroup: values.mainGroup.trim() || undefined,
          subGroup: values.subGroup.trim() || undefined,
          uom: values.uom.trim() || undefined,
          hsnDescription: values.hsnDescription.trim() || undefined,
          extra: Object.keys(extra).length > 0 ? extra : undefined,
        }),
      });
      onSaved(itemCode);
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Could not save this item');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="item-edit-form" onSubmit={(e) => void onSubmit(e)}>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="item-edit-grid">
        <label className="field">
          <span>Item Code</span>
          <input
            value={values.itemCode}
            onChange={(e) => setField('itemCode', e.target.value)}
            disabled={lockItemCode}
            required
            maxLength={200}
          />
        </label>
        <label className="field">
          <span>Item Name</span>
          <input value={values.itemName} onChange={(e) => setField('itemName', e.target.value)} required maxLength={500} />
        </label>
        <label className="field">
          <span>Brand</span>
          <input value={values.brand} onChange={(e) => setField('brand', e.target.value)} />
        </label>
        <label className="field">
          <span>Catalogue No</span>
          <input value={values.catalogueNo} onChange={(e) => setField('catalogueNo', e.target.value)} />
        </label>
        <label className="field">
          <span>SAP Item Code</span>
          <input value={values.sapItemCode} onChange={(e) => setField('sapItemCode', e.target.value)} />
        </label>
        <label className="field">
          <span>Alias</span>
          <input value={values.alias} onChange={(e) => setField('alias', e.target.value)} />
        </label>
        <label className="field">
          <span>Main Group</span>
          <input value={values.mainGroup} onChange={(e) => setField('mainGroup', e.target.value)} />
        </label>
        <label className="field">
          <span>Sub Group</span>
          <input value={values.subGroup} onChange={(e) => setField('subGroup', e.target.value)} />
        </label>
        <label className="field">
          <span>UOM</span>
          <input value={values.uom} onChange={(e) => setField('uom', e.target.value)} />
        </label>
        <label className="field item-edit-span">
          <span>HSN Description</span>
          <input value={values.hsnDescription} onChange={(e) => setField('hsnDescription', e.target.value)} />
        </label>
      </div>

      <div className="item-edit-extra">
        <h3>Sheet fields</h3>
        <p className="muted">Every column the catalog sheet has — leave any of these blank if this item has no value for it.</p>
        <div className="item-edit-grid">
          {values.extra.map((row, i) =>
            knownFields.includes(row.key) ? (
              <label className="field" key={row.key}>
                <span>{row.key}</span>
                <input
                  value={row.value}
                  onChange={(e) => setExtraRow(i, 'value', e.target.value)}
                />
              </label>
            ) : null,
          )}
        </div>
      </div>

      <div className="item-edit-extra">
        <h3>Custom fields</h3>
        <p className="muted">A column that doesn't exist anywhere in the sheet yet.</p>
        {values.extra.filter((row) => !knownFields.includes(row.key)).length === 0 && (
          <p className="muted">None added.</p>
        )}
        {values.extra.map((row, i) =>
          knownFields.includes(row.key) ? null : (
            <div key={i} className="item-edit-extra-row">
              <input
                placeholder="Field name"
                aria-label="Field name"
                value={row.key}
                onChange={(e) => setExtraRow(i, 'key', e.target.value)}
              />
              <input
                placeholder="Value"
                aria-label="Field value"
                value={row.value}
                onChange={(e) => setExtraRow(i, 'value', e.target.value)}
              />
              <button
                type="button"
                className="filter-bar-remove"
                aria-label="Remove this field"
                onClick={() => removeExtraRow(i)}
              >
                ×
              </button>
            </div>
          ),
        )}
        <button type="button" className="btn btn-ghost" onClick={addExtraRow}>
          + Add a field
        </button>
      </div>

      <div className="item-edit-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
