import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Parties from './pages/Parties.jsx';
import Products from './pages/Products.jsx';
import ExpenseHeads from './pages/ExpenseHeads.jsx';
import BankAccounts from './pages/BankAccounts.jsx';
import DayBook from './pages/DayBook/index.jsx';
import DailySale from './pages/Reports/DailySale.jsx';
import DailyStock from './pages/Reports/DailyStock.jsx';
import Ledger from './pages/Reports/Ledger.jsx';
import CashBook from './pages/Reports/CashBook.jsx';
import Outstanding from './pages/Reports/Outstanding.jsx';
import Position from './pages/Reports/Position.jsx';
import PrintReport from './pages/Reports/PrintReport.jsx';
import { todayYmd } from './lib/day.js';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Bare print pages for the PDF renderer — no app chrome, no auth gate
          (the report data itself is fetched with the token the renderer injects). */}
      <Route path="/print/:report" element={<PrintReport />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Home />} />
        <Route path="/daybook" element={<Navigate to={`/daybook/${todayYmd()}`} replace />} />
        <Route path="/daybook/:date" element={<DayBook />} />
        <Route path="/parties" element={<Parties />} />
        <Route path="/products" element={<Products />} />
        <Route path="/banks" element={<BankAccounts />} />
        <Route path="/expense-heads" element={<ExpenseHeads />} />

        <Route path="/reports" element={<Navigate to="/reports/daily-sale" replace />} />
        <Route path="/reports/daily-sale" element={<DailySale />} />
        <Route path="/reports/daily-stock" element={<DailyStock />} />
        <Route path="/reports/ledger" element={<Ledger />} />
        <Route path="/reports/cashbook" element={<CashBook />} />
        <Route path="/reports/outstanding" element={<Outstanding />} />
        <Route path="/reports/position" element={<Position />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
