import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/daybook', label: 'Day Book' },
  { to: '/reports', label: 'Reports' },
  { to: '/parties', label: 'Parties' },
  { to: '/products', label: 'Products' },
  { to: '/banks', label: 'Banks' },
  { to: '/expense-heads', label: 'Expense Heads' },
];

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="no-print bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-6">
              <span className="font-semibold whitespace-nowrap">Maryam Fashion</span>
              <nav className="flex gap-1 text-sm">
                {NAV.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `px-3 py-1.5 rounded ${
                        isActive ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-500 hidden sm:inline">
                {user?.name} · {user?.role}
              </span>
              <button
                onClick={logout}
                className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-100"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
