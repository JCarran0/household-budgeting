import { CreditCard, Loader2 } from 'lucide-react';
import { usePlaid } from '../providers/PlaidLinkProvider';

interface PlaidButtonProps {
  className?: string;
}

export function PlaidButton({ className = '' }: PlaidButtonProps) {
  const { openPlaid, isLoading, error } = usePlaid();

  return (
    <>
      <button
        onClick={openPlaid}
        disabled={isLoading}
        className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Loading...
          </>
        ) : (
          <>
            <CreditCard className="h-4 w-4 mr-2" />
            Connect Bank Account
          </>
        )}
      </button>
      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </>
  );
}