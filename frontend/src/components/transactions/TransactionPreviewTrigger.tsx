import { useState } from 'react';
import type { ReactNode, MouseEvent, KeyboardEvent } from 'react';
import { Box, Tooltip } from '@mantine/core';
import { TransactionPreviewModal } from './TransactionPreviewModal';

interface TransactionPreviewTriggerProps {
  categoryId: string | null; // null for "Uncategorized"
  categoryName: string;
  dateRange: { startDate: string; endDate: string };
  children: ReactNode; // The clickable content
  disabled?: boolean;
  className?: string;
  limit?: number; // Number of transactions to preview (default 25)
  showTooltip?: boolean; // Whether to show hover tooltip
  tooltipText?: string; // Custom tooltip text
  timeRangeFilter?: string; // Reports page time range filter (e.g., 'thisMonth', 'yearToDate')
}

export function TransactionPreviewTrigger({
  categoryId,
  categoryName,
  dateRange,
  children,
  disabled = false,
  className,
  limit = 25,
  showTooltip = true,
  tooltipText = "Click to preview transactions",
  timeRangeFilter,
}: TransactionPreviewTriggerProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Handle click event
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    
    // Prevent event propagation to avoid conflicts with parent handlers
    event.stopPropagation();
    
    setIsModalOpen(true);
  };

  // Handle keyboard navigation (Enter and Space keys)
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      setIsModalOpen(true);
    }
  };

  // Close modal
  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const triggerElement = (
    <Box
      className={className}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={disabled ? -1 : 0}
      style={{
        cursor: disabled ? 'not-allowed' : 'pointer',
        outline: 'none',
        transition: 'all 0.2s ease',
        borderRadius: 'var(--mantine-radius-sm)',
        opacity: disabled ? 0.6 : 1,
      }}
      data-disabled={disabled}
      role="button"
      aria-label={`Preview transactions for ${categoryName}`}
    >
      {children}
    </Box>
  );

  return (
    <>
      {showTooltip && !disabled ? (
        <Tooltip 
          label={tooltipText}
          openDelay={500}
          closeDelay={100}
          position="top"
          withArrow
        >
          {triggerElement}
        </Tooltip>
      ) : (
        triggerElement
      )}

      {/* Transaction Preview Modal */}
      <TransactionPreviewModal
        opened={isModalOpen}
        onClose={handleCloseModal}
        categoryId={categoryId}
        categoryName={categoryName}
        dateRange={dateRange}
        limit={limit}
        timeRangeFilter={timeRangeFilter}
      />
    </>
  );
}