# User Stories - Household Budgeting Application

## Authentication & User Management

### Registration & Login
- A user should be able to register with a unique username and password
- A user should be able to use a passphrase with spaces (15+ characters) for better security
- A user should be able to see simplified password requirements (length-focused, not complexity)
- A user should be able to see helpful suggestions for creating memorable passphrases
- A user should be able to see password requirements during registration
- A user should be able to login with their username and password
- A user should be able to see error messages for invalid credentials
- A user should be able to stay logged in across browser sessions (JWT persistence)
- A user should be able to logout and have their session cleared
- A user should be able to change their password while logged in
- A user should be protected from brute force attacks (rate limiting after 5 failed attempts)

### Security
- A user should be automatically logged out after 60 minutes (JWT expiration)
- A user should have their password securely hashed (bcrypt)
- A user should be unable to access protected routes without authentication
- A user should receive clear error messages when their session expires

## Account Management

### Plaid Integration
- A user should be able to connect their bank accounts via Plaid Link
- A user should be able to see a helpful notification about "Continue as guest" option for Plaid
- A user should be able to connect multiple financial institutions
- A user should be able to see a list of all connected accounts
- A user should be able to view account details (name, type, balance, institution)
- A user should be able to see the official account name from the bank
- A user should be able to see when an account was last synced
- A user should be able to disconnect/remove linked accounts (not yet implemented)
- A user should be able to see account balances update after syncing
- A user should be able to reconnect accounts to get extended transaction history

### Account Types
- A user should be able to connect checking accounts
- A user should be able to connect savings accounts
- A user should be able to connect credit card accounts
- A user should be able to connect investment accounts
- A user should be able to connect loan accounts

## Transaction Management

### Transaction Syncing
- A user should be able to sync transactions from all connected accounts
- A user should be able to sync transactions starting from January 1, 2025
- A user should be able to request up to 2 years of transaction history (730 days)
- A user should be able to sync all available transactions, not just the first 100
- A user should be able to see pending transactions marked appropriately
- A user should be able to see transaction sync status and results
- A user should be able to manually trigger transaction sync
- A user should have transactions automatically deduplicated

### Transaction Viewing & Filtering
- A user should be able to view all their transactions in a table/list format
- A user should be able to search their transactions by description/merchant name
- A user should be able to type continuously in search without losing focus
- A user should have search queries debounced (300ms) to prevent excessive API calls
- A user should be able to filter their transactions by date range
- A user should be able to quickly filter by "This Month" (default selection)
- A user should be able to quickly filter by "Year to Date"
- A user should be able to select any past month of the current year from a dropdown
- A user should be able to use custom date ranges when needed
- A user should be able to filter their transactions by specific account
- A user should be able to select "All Accounts" or individual accounts from a dropdown
- A user should be able to see account names with institution in the filter dropdown
- A user should be able to filter their transactions by category
- A user should be able to filter their transactions by amount range (min/max)
- A user should be able to search for transactions with an exact amount (e.g., $19.99)
- A user should be able to adjust the tolerance for exact amount searches (±$0 to ±$5)
- A user should be able to quickly select common amounts ($10, $20, $50, $100, $200)
- A user should be able to toggle between "Range" and "Exact" amount search modes
- A user should be able to filter their transactions by tags they've created
- A user should NOT see a filter for pending transactions (since we don't sync them)
- A user should be able to filter to show/hide hidden transactions
- A user should be able to filter to show only uncategorized transactions
- A user should be able to combine the uncategorized filter with other filters
- A user should be able to see transaction details (amount, date, merchant, account)
- A user should see the correct total count of transactions (not 0)
- A user should not see transactions from other users' accounts

### Transaction Display
- A user should see rounded dollar amounts in the table for cleaner display
- A user should be able to hover to see exact amounts (to the cent) in tooltips
- A user should see user descriptions when available, with original names in tooltips
- A user should be able to hover over categories to see full category names
- A user should be able to hover over account icons to see institution details
- A user should see hidden/split transaction indicators next to action menu
- A user should NOT see a "Status" column for pending transactions
- A user should experience 1-second tooltip delays to avoid distraction
- A user should see tooltips that include account name, institution, and mask when available

### Smart Date Filtering
- A user should see transactions from the most recent month with data by default
- A user should see the current month selected if it contains transactions
- A user should see the most recent month with transactions if current month is empty
- A user should see "Year to Date" view if no transactions exist in the current year
- A user should see the date filter automatically adjust to show their data
- A user should not see an empty transaction list on first load due to date filters

### Transaction Editing
- A user should be able to edit a transaction's description
- A user should be able to revert to the original Plaid description
- A user should be able to change a transaction's category
- A user should be able to add tags to transactions
- A user should be able to remove tags from transactions
- A user should be able to add notes to transactions
- A user should be able to mark transactions as hidden from budgets
- A user should be able to unhide previously hidden transactions

### Transaction Splitting
- A user should be able to split a single transaction into multiple parts
- A user should be able to assign different categories to each split
- A user should be able to assign different amounts to each split
- A user should be able to add descriptions to split transactions
- A user should be able to see split transactions linked to the parent
- A user should have split amounts validated to equal the original amount
- A user should have the original transaction hidden when split

## Category Management

### Category Structure
- A user should be able to create their own top-level categories
- A user should be able to create subcategories under parent categories
- A user should be able to view their categories in a hierarchical tree structure
- A user should be able to see the total number of their categories
- A user should be able to initialize default categories for their account with one click
- A user should not see categories created by other users

### Category Properties
- A user should be able to name/rename categories
- A user should be able to mark categories as hidden (excluded from budget calculations)
- A user should be able to mark categories as savings categories
- A user should be able to map categories to Plaid categories
- A user should be able to search/filter categories by name
- A user should be able to show/hide hidden categories in the view

### Hidden Categories
- A user should be able to categorize transactions with hidden categories
- A user should see hidden categories in transaction categorization dropdowns
- A user should see "(Excluded from budgets)" label next to hidden categories
- A user should be able to create auto-categorization rules using hidden categories
- A user should NOT see hidden categories in budget creation/editing forms
- A user should be able to use hidden categories for transfers between accounts
- A user should have hidden category transactions excluded from budget calculations

### Category Operations
- A user should be able to edit existing categories
- A user should be able to delete categories
- A user should be able to see which Plaid category maps to each category
- A user should be able to see statistics (total, hidden count, savings count)

## Auto-Categorization

### Rule Management
- A user should be able to create their own auto-categorization rules
- A user should be able to set a description for each of their rules
- A user should be able to define a text pattern for matching
- A user should be able to assign one of their categories to each rule
- A user should be able to optionally set a custom user description for matching transactions
- A user should be able to enable/disable their individual rules
- A user should be able to edit their existing rules
- A user should be able to delete their rules
- A user should be able to search/filter their rules
- A user should not see or be affected by other users' auto-categorization rules

### Rule Priority
- A user should be able to see rules ordered by priority
- A user should be able to move rules up in priority
- A user should be able to move rules down in priority
- A user should understand that rules are applied in priority order
- A user should see priority numbers/badges on rules

### Rule Application
- A user should be able to manually trigger auto-categorization
- A user should be able to see how many transactions were categorized
- A user should be able to see how many transactions were processed
- A user should have rules applied only to uncategorized transactions
- A user should have rules match on "contains" pattern in descriptions
- A user should have pattern matching be case-insensitive
- A user should have matching transactions' descriptions replaced with custom text when specified
- A user should see the custom description applied immediately when rules are run
- A user should be able to see which transactions have custom descriptions in the UI
- A user should be warned if auto-categorization will override existing manual categorizations
- A user should be able to confirm or cancel when rules would change existing categories

## Budget Management

### Budget Creation
- A user should be able to create monthly budgets for their categories
- A user should be able to set budget amounts for their specific categories
- A user should be able to copy their budgets from the previous month
- A user should be able to edit their budget amounts inline
- A user should be able to delete their budgets
- A user should not see or affect other users' budgets

### Budget Navigation
- A user should be able to navigate between months
- A user should be able to see the current month highlighted
- A user should be able to quickly return to the current month
- A user should be able to see which months have budgets

### Budget Comparison
- A user should be able to see budgeted vs actual spending
- A user should be able to see remaining budget amounts
- A user should be able to see percentage of budget used
- A user should be able to see which categories are over budget
- A user should be able to see total budget vs total actual
- A user should be able to export budget comparisons to CSV

### Budget Visualization
- A user should be able to see progress bars for budget usage
- A user should be able to see color coding (green/yellow/red) for budget status
- A user should be able to see budget totals and summaries

## Reporting & Analytics

### Dashboard
- A user should be able to see a dashboard with key metrics
- A user should be able to see total income for the current month
- A user should be able to see total expenses for the current month
- A user should be able to see net income/loss
- A user should be able to see connected accounts summary with proper account names
- A user should be able to see recent transactions
- A user should be able to see the count of uncategorized transactions as a warning
- A user should be able to click the uncategorized transaction alert to go to the transactions page
- A user should be able to see "Income vs Spending" when no budget exists
- A user should be able to see "Monthly Budget Status" only when budgets are created
- A user should NOT see "Over Budget" status when no budget has been created
- A user should be able to see a link to create budgets when none exist

### Year-to-Date Summary
- A user should be able to see YTD total income
- A user should be able to see YTD total expenses
- A user should be able to see YTD net income
- A user should be able to see YTD average monthly spending
- A user should be able to see top spending categories YTD

### Cash Flow Analysis
- A user should be able to see income vs expenses over time
- A user should be able to view cash flow charts by month
- A user should be able to see cash flow trends
- A user should be able to see projected cash flow

### Spending Trends
- A user should be able to see spending by category over time
- A user should be able to see spending trends charts
- A user should be able to filter trends by date range
- A user should be able to see category breakdowns

### Category Analysis
- A user should be able to see top spending categories
- A user should be able to see spending percentages by category
- A user should be able to see category spending comparisons
- A user should be able to drill down into subcategories

## User Interface & Experience

### Navigation
- A user should be able to navigate between pages using the sidebar
- A user should be able to collapse/expand the sidebar
- A user should be able to see which page they're currently on
- A user should be able to access all major features from the navigation

### Responsive Design
- A user should be able to use the app on desktop computers
- A user should be able to use the app on tablets
- A user should be able to use the app on mobile devices
- A user should have the sidebar auto-collapse on small screens

### Dark Mode
- A user should be able to use the app in dark mode
- A user should have consistent theming across all pages
- A user should have readable contrast in dark mode

### Notifications
- A user should be able to see success notifications for completed actions
- A user should be able to see error notifications for failed actions
- A user should be able to see loading states during operations
- A user should be able to see helpful error messages

### Data Management
- A user should have their data automatically saved
- A user should have their data persisted between sessions
- A user should be able to refresh data without losing state
- A user should have optimistic updates for better responsiveness

## Data Privacy & Security

### Data Protection
- A user should have their financial data encrypted at rest
- A user should have their password never stored in plain text
- A user should have their Plaid tokens securely stored
- A user should have their session secured with JWT tokens

### Data Isolation
- A user should only see their own data
- A user should be unable to access other users' data
- A user should have their data isolated by user ID
- A user should have their own categories separate from other users
- A user should have their own tags separate from other users
- A user should have their own auto-categorization rules separate from other users
- A user should have their own budgets separate from other users
- A user should have their own transactions separate from other users

### Plaid Security
- A user should never have their bank credentials stored
- A user should authenticate directly with their bank via Plaid
- A user should be able to revoke Plaid access at any time

## Error Handling

### Connection Errors
- A user should see clear error messages when the server is unavailable
- A user should be able to retry failed operations
- A user should not lose data due to connection issues

### Validation Errors
- A user should see validation errors before submitting forms
- A user should see specific field-level error messages
- A user should be prevented from entering invalid data

### Sync Errors
- A user should be notified when account sync fails
- A user should be able to retry failed syncs
- A user should see partial success results when some accounts sync

## Performance

### Loading States
- A user should see loading indicators during data fetches
- A user should see skeleton screens for better perceived performance
- A user should not see layout shifts during loading

### Caching
- A user should have frequently accessed data cached
- A user should have category lists cached for quick access
- A user should have recent transactions cached

### Pagination
- A user should be able to load large transaction lists efficiently
- A user should be able to navigate through paginated results
- A user should see the total number of results

## Testing Scenarios

### Critical Path Tests
- A user should be able to complete the full flow: register → connect account → sync → categorize → budget
- A user should be able to recover from errors at any step
- A user should maintain data consistency across all operations

### Edge Cases
- A user should be able to handle accounts with no transactions
- A user should be able to handle months with no budgets
- A user should be able to handle categories with no transactions
- A user should be able to handle zero-amount transactions

## Future Enhancements (Mentioned but Not Yet Implemented)

### Planned Features
- A user should be able to set up recurring transactions
- A user should be able to forecast future cash flow
- A user should be able to set savings goals
- A user should be able to track investment performance
- A user should be able to generate tax reports
- A user should be able to share budgets with another user (spouse)
- A user should be able to export all data
- A user should be able to import data from other sources
- A user should be able to set budget alerts
- A user should be able to use mobile app versions

## Development & Deployment

### Local Development
- A developer should be able to run the app locally
- A developer should be able to run tests
- A developer should be able to see TypeScript errors
- A developer should be able to use hot module reloading

### Production Deployment
- A developer should be able to deploy via GitHub Actions
- A developer should be able to roll back deployments
- A developer should be able to monitor application health
- A developer should be able to view logs and metrics