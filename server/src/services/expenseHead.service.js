import mongoose from 'mongoose';
import ExpenseHead from '../models/ExpenseHead.js';
import ApiError from '../utils/ApiError.js';
import { getPagination, paginated, escapeRegex } from '../utils/pagination.js';

function statusFilter(status) {
  if (status === 'all') return {};
  if (status === 'inactive') return { isActive: false };
  return { isActive: true };
}

export async function list(query) {
  const { page, limit, skip } = getPagination(query);
  const filter = { ...statusFilter(query.status) };

  if (query.search) {
    filter.name = new RegExp(escapeRegex(query.search.trim()), 'i');
  }

  const [items, total] = await Promise.all([
    ExpenseHead.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
    ExpenseHead.countDocuments(filter),
  ]);

  return paginated(items, total, page, limit);
}

export async function getById(id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Expense head not found');
  const head = await ExpenseHead.findById(id);
  if (!head) throw ApiError.notFound('Expense head not found');
  return head;
}

export async function create(data) {
  const name = (data.name || '').trim();
  if (!name) throw ApiError.badRequest('name is required');

  const exists = await ExpenseHead.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
  if (exists) throw ApiError.conflict(`An expense head named "${name}" already exists`);

  return ExpenseHead.create({ name });
}

export async function update(id, data) {
  const head = await getById(id);

  if (data.name !== undefined) {
    const name = String(data.name).trim();
    if (!name) throw ApiError.badRequest('name cannot be empty');
    if (name.toLowerCase() !== head.name.toLowerCase()) {
      const clash = await ExpenseHead.findOne({
        name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
        _id: { $ne: head._id },
      });
      if (clash) throw ApiError.conflict(`An expense head named "${name}" already exists`);
    }
    head.name = name;
  }
  if (data.isActive !== undefined) head.isActive = Boolean(data.isActive);

  await head.save();
  return head;
}

export async function deactivate(id) {
  const head = await getById(id);
  head.isActive = false;
  await head.save();
  return head;
}
