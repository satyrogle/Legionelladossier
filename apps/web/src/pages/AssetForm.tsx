import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ASSET_TYPES, ASSET_TYPE_LABELS, FREQUENCY_LABELS, templatesForAsset, type AssetType, type LoopRank } from '@ld/core';
import { api } from '../api/client.js';

export function AssetForm() {
  const { siteId = '' } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ type: 'hot_outlet' as AssetType, name: '', location: '', tag: '', sentinel: false, littleUsed: false, loopRank: 'principal' as LoopRank, notes: '' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const preview = useMemo(
    () => templatesForAsset({ type: form.type, sentinel: form.sentinel, littleUsed: form.littleUsed, loopRank: form.type === 'return_loop' ? form.loopRank : undefined }),
    [form.type, form.sentinel, form.littleUsed, form.loopRank],
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createAsset(siteId, {
        type: form.type,
        name: form.name,
        location: form.location || undefined,
        tag: form.tag || undefined,
        sentinel: form.sentinel,
        littleUsed: form.littleUsed,
        loopRank: form.type === 'return_loop' ? form.loopRank : undefined,
        notes: form.notes || undefined,
      });
      navigate(`/sites/${siteId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <p className="small">
        <Link to={`/sites/${siteId}`}>Site</Link> / New asset
      </p>
      <h1>Add asset</h1>
      <form className="card" onSubmit={submit}>
        <label className="field">
          <span>Type</span>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AssetType })}>
            {ASSET_TYPES.map((t) => (
              <option key={t} value={t}>
                {ASSET_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Name</span>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Kitchen hot tap" />
        </label>
        <div className="row">
          <label className="field" style={{ flex: 2 }}>
            <span>Location</span>
            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Block, floor, room" />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>Asset tag</span>
            <input value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} />
          </label>
        </div>
        {form.type === 'return_loop' ? (
          <label className="field">
            <span>Loop rank</span>
            <select value={form.loopRank} onChange={(e) => setForm({ ...form, loopRank: e.target.value as LoopRank })}>
              <option value="principal">Principal (monthly)</option>
              <option value="subordinate">Subordinate (quarterly)</option>
              <option value="tertiary">Tertiary (annual profile)</option>
            </select>
          </label>
        ) : (
          <>
            <label className="check">
              <input type="checkbox" checked={form.sentinel} onChange={(e) => setForm({ ...form, sentinel: e.target.checked })} />
              Sentinel outlet (nearest / furthest from the calorifier or incoming main)
            </label>
            <label className="check">
              <input type="checkbox" checked={form.littleUsed} onChange={(e) => setForm({ ...form, littleUsed: e.target.checked })} />
              Little used (weekly flushing)
            </label>
          </>
        )}
        <label className="field">
          <span>Notes</span>
          <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>

        <div className="card tight" style={{ background: 'var(--bg)' }}>
          <b className="small">Tasks that will be scheduled</b>
          {preview.length === 0 && <p className="small muted">None for this combination.</p>}
          <ul className="small" style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {preview.map((t) => (
              <li key={t.code}>
                {t.title} · {FREQUENCY_LABELS[t.frequency]}
              </li>
            ))}
          </ul>
        </div>

        {error && <p className="error small">{error}</p>}
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            Save asset
          </button>
          <Link className="btn" to={`/sites/${siteId}`}>
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
