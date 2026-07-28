import MasterPage from '../components/MasterPage.jsx';

const config = {
  title: 'Expense Head',
  basePath: '/expense-heads',
  searchPlaceholder: 'Search name…',
  columns: [
    { key: 'name', label: 'Name' },
    { key: 'isActive', label: 'Status', render: (h) => (h.isActive ? 'Active' : 'Inactive') },
  ],
  fields: [{ name: 'name', label: 'Name', required: true, full: true }],
};

export default function ExpenseHeads() {
  return <MasterPage config={config} />;
}
