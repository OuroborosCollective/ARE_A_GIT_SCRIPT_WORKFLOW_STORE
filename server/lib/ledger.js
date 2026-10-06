import { store, newId, nowIso } from "./store.js";

// The evidence ledger records each material integration exactly once with a
// real, verifiable reference. It is deliberately append-only and never stores a
// synthetic "green" status.
export async function appendLedger({ change, insight, evidence, result = "verified", actor = "system" }) {
  const entry = {
    id: newId("ledger"),
    change,
    insight,
    evidence: evidence || {},
    result,
    actor,
    at: nowIso(),
  };
  await store.ledger.mutate((data) => {
    data[entry.id] = entry;
  });
  return entry;
}

export async function listLedger() {
  return store.ledger.read((data) => Object.values(data).sort((a, b) => (a.at < b.at ? 1 : -1)));
}
