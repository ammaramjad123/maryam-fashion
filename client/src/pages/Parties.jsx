import MasterPage from '../components/MasterPage.jsx';

// Parties are identified by NAME. The account code is auto-generated server-side
// and never shown or asked for here (it appears only on the printed ledger).
const config = {
  title: 'Party',
  basePath: '/parties',
  searchPlaceholder: 'Search name or phone…',
  columns: [
    { key: 'name', label: 'Name' },
    { key: 'type', label: 'Type' },
    {
      key: 'opening',
      label: 'Opening',
      render: (p) => `${Number(p.openingBalance).toLocaleString()} ${p.openingType}`,
    },
    { key: 'phone', label: 'Phone', render: (p) => p.phone || '—' },
    { key: 'isActive', label: 'Status', render: (p) => (p.isActive ? 'Active' : 'Inactive') },
  ],
  fields: [
    { name: 'name', label: 'Name', required: true },
    {
      name: 'type',
      label: 'Type',
      type: 'select',
      options: ['CUSTOMER', 'SUPPLIER', 'EMPLOYEE', 'OTHER'],
      required: true,
    },
    { name: 'phone', label: 'Phone' },
    { name: 'address', label: 'Address', full: true },
    { name: 'openingBalance', label: 'Opening Balance', type: 'number', default: '0' },
    {
      name: 'openingType',
      label: 'Opening Type',
      type: 'select',
      options: ['DR', 'CR'],
      required: true,
    },
    { name: 'openingDate', label: 'Opening Date', type: 'date' },
  ],
};

export default function Parties() {
  return <MasterPage config={config} />;
}
