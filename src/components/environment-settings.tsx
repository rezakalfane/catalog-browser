"use client";

import { Fragment, useEffect, useState } from "react";
import type { EnvironmentSummary } from "@/lib/environments";

type FormState = { name: string; storeHash: string; accessToken: string };

const emptyForm: FormState = { name: "", storeHash: "", accessToken: "" };

export default function EnvironmentSettings({
  environments,
  onClose,
  onChanged,
  onReordered,
}: {
  environments: EnvironmentSummary[];
  onClose: () => void;
  onChanged: (environmentId?: number) => void;
  onReordered: (environments: EnvironmentSummary[]) => void;
}) {
  const [editing, setEditing] = useState<EnvironmentSummary | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [orderedEnvironments, setOrderedEnvironments] = useState(environments);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: number; position: "before" | "after" } | null>(null);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const dropEnvironment = async (targetId: number, position = dropTarget?.position) => {
    if (draggedId === null || draggedId === targetId) return;
    const sourceIndex = orderedEnvironments.findIndex((environment) => environment.id === draggedId);
    const next = [...orderedEnvironments];
    const [moved] = next.splice(sourceIndex, 1);
    const targetIndex = next.findIndex((environment) => environment.id === targetId);
    next.splice(targetIndex + (position === "after" ? 1 : 0), 0, moved);
    setOrderedEnvironments(next);
    setDraggedId(null);
    setDropTarget(null);
    const response = await fetch("/api/environments", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: next.map((environment) => environment.id) }),
    });
    const data = await response.json() as { environments?: EnvironmentSummary[]; error?: string };
    if (!response.ok || !data.environments) {
      setOrderedEnvironments(environments);
      setError(data.error || "Unable to reorder environments.");
      return;
    }
    onReordered(data.environments);
  };

  const startEdit = (environment: EnvironmentSummary) => {
    setEditing(environment);
    setForm({ name: environment.name, storeHash: environment.storeHash, accessToken: "" });
    setError("");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const response = await fetch(editing ? `/api/environments?id=${editing.id}` : "/api/environments", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await response.json() as { environment?: EnvironmentSummary; error?: string };
    setSaving(false);
    if (!response.ok || !data.environment) {
      setError(data.error || "Unable to save environment.");
      return;
    }
    onChanged(data.environment.id);
  };

  const remove = async (environment: EnvironmentSummary) => {
    if (!window.confirm(`Remove ${environment.name}?`)) return;
    const response = await fetch(`/api/environments?id=${environment.id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json() as { error?: string };
      setError(data.error || "Unable to remove environment.");
      return;
    }
    onChanged();
  };

  return <div className="settings-backdrop" onClick={onClose}><section className="settings-panel" onClick={(event) => event.stopPropagation()}>
    <button className="close-detail" onClick={onClose} aria-label="Close settings">×</button>
    <p className="eyebrow">Store configuration</p><h2>Environments</h2>
    <div className="environment-settings-list">{orderedEnvironments.map((environment) => <Fragment key={environment.id}>{dropTarget?.id === environment.id && dropTarget.position === "before" && draggedId !== environment.id && <div className="drop-indicator" onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={() => dropEnvironment(environment.id, "before")} />}<div draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.dropEffect = "move"; setDraggedId(environment.id); }} onDragEnd={() => { setDraggedId(null); setDropTarget(null); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; const bounds = event.currentTarget.getBoundingClientRect(); setDropTarget({ id: environment.id, position: event.clientY < bounds.top + bounds.height / 2 ? "before" : "after" }); }} onDrop={() => dropEnvironment(environment.id)} className={draggedId === environment.id ? "dragging" : ""}><span className="drag-handle" title="Drag to reorder">⋮⋮</span><div className="environment-row-main"><strong>{environment.name}</strong><span>{environment.storeHash}</span></div><div className="environment-row-actions"><button onClick={() => startEdit(environment)}>Edit</button><button onClick={() => remove(environment)}>Remove</button></div></div>{dropTarget?.id === environment.id && dropTarget.position === "after" && draggedId !== environment.id && <div className="drop-indicator" onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={() => dropEnvironment(environment.id, "after")} />}</Fragment>)}</div>
    <div className="settings-form-title"><h3>{editing ? `Edit ${editing.name}` : "Add environment"}</h3>{editing && <button onClick={() => { setEditing(null); setForm(emptyForm); setError(""); }}>Add new</button>}</div>
    <form className="environment-form" onSubmit={submit}>
      <label>Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Production store" required /></label>
      <label>Store hash<input value={form.storeHash} onChange={(event) => setForm({ ...form, storeHash: event.target.value })} placeholder="abc123" required /></label>
      <label>Access token<input type="password" value={form.accessToken} onChange={(event) => setForm({ ...form, accessToken: event.target.value })} placeholder={editing ? "Leave blank to keep current token" : "BigCommerce access token"} required={!editing} /></label>
      {error && <p className="settings-error">{error}</p>}
      <button className="settings-save" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Add environment"}</button>
    </form>
  </section></div>;
}
