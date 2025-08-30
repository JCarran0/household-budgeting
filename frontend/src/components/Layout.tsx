import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { Home, Receipt, CreditCard, LogOut, Menu, X, TrendingUp, PiggyBank } from 'lucide-react';
import { useState } from 'react';

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navLinks = [
    { to: '/dashboard', label: 'Dashboard', icon: Home },
    { to: '/transactions', label: 'Transactions', icon: Receipt },
    { to: '/accounts', label: 'Accounts', icon: CreditCard },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Desktop Sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-72 lg:flex-col">
        <div className="flex flex-col flex-grow bg-bg-secondary border-r border-border">
          {/* Logo */}
          <div className="flex items-center h-20 px-8">
            <div className="flex items-center">
              <PiggyBank className="h-8 w-8 text-pastel-yellow mr-3" />
              <h1 className="text-2xl font-bold bg-gradient-to-r from-pastel-yellow via-pastel-blue to-pastel-pink bg-clip-text text-transparent">
                Budget Tracker
              </h1>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 pb-4 space-y-2">
            {navLinks.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className={`
                  group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200
                  ${isActive(to)
                    ? 'bg-bg-elevated text-pastel-blue shadow-lg shadow-black/20'
                    : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
                  }
                `}
              >
                <Icon className={`
                  mr-3 h-5 w-5 transition-colors
                  ${isActive(to) ? 'text-pastel-blue' : 'text-text-muted group-hover:text-pastel-blue'}
                `} />
                {label}
                {isActive(to) && (
                  <div className="ml-auto w-1 h-6 bg-pastel-blue rounded-full" />
                )}
              </Link>
            ))}
          </nav>

          {/* User Section */}
          <div className="flex-shrink-0 border-t border-border">
            <div className="p-4">
              <div className="flex items-center px-4 py-3 rounded-xl bg-bg-elevated">
                <div className="flex-1">
                  <p className="text-sm font-medium text-text-primary">
                    {user?.username}
                  </p>
                  <p className="text-xs text-text-muted">
                    Personal Account
                  </p>
                </div>
                <button
                  onClick={handleLogout}
                  className="ml-3 p-2 rounded-lg hover:bg-bg-primary transition-colors group"
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4 text-text-muted group-hover:text-pastel-pink transition-colors" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Header */}
      <div className="lg:hidden sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-border bg-bg-secondary px-4 shadow-sm">
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="p-2.5 text-text-muted hover:text-text-primary"
        >
          <Menu className="h-6 w-6" />
        </button>
        <div className="flex flex-1 items-center justify-between">
          <h1 className="text-lg font-semibold text-text-primary">
            Budget Tracker
          </h1>
          <PiggyBank className="h-6 w-6 text-pastel-yellow" />
        </div>
      </div>

      {/* Mobile Sidebar */}
      {isMobileMenuOpen && (
        <div className="relative z-50 lg:hidden">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          
          {/* Sidebar */}
          <div className="fixed inset-y-0 left-0 flex w-full max-w-xs flex-col bg-bg-secondary">
            {/* Close button */}
            <div className="flex items-center justify-between h-16 px-6">
              <h2 className="text-lg font-semibold text-text-primary">
                Menu
              </h2>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-bg-elevated transition-colors"
              >
                <X className="h-5 w-5 text-text-muted" />
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-4 pb-4 space-y-2">
              {navLinks.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`
                    flex items-center px-4 py-3 text-base font-medium rounded-xl transition-all
                    ${isActive(to)
                      ? 'bg-bg-elevated text-pastel-blue'
                      : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
                    }
                  `}
                >
                  <Icon className={`
                    mr-3 h-6 w-6
                    ${isActive(to) ? 'text-pastel-blue' : 'text-text-muted'}
                  `} />
                  {label}
                </Link>
              ))}
            </nav>

            {/* User Section */}
            <div className="border-t border-border p-4">
              <div className="flex items-center px-4 py-3 rounded-xl bg-bg-elevated">
                <div className="flex-1">
                  <p className="text-sm font-medium text-text-primary">
                    {user?.username}
                  </p>
                  <button
                    onClick={handleLogout}
                    className="text-xs text-text-muted hover:text-pastel-pink transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="lg:pl-72">
        <main className="py-8">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}