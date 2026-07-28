import Setting from '../models/Setting.js';

// The shop has exactly one Setting document. Create it with defaults on first use.
export async function getSetting() {
  const existing = await Setting.findOne().lean();
  if (existing) return existing;
  const created = await Setting.create({});
  return created.toObject();
}
