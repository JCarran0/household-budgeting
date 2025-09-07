# AI UX Framework Guide - Mantine Implementation

> **Document Purpose**: This guide helps AI agents understand and modify the Mantine UI framework implementation in the Budget Tracker application, with a focus on implementing custom color palettes and theming.

## Table of Contents
1. [Current Implementation Overview](#current-implementation-overview)
2. [Mantine Package Structure](#mantine-package-structure)
3. [Color System Architecture](#color-system-architecture)
4. [Implementing Custom Color Palettes](#implementing-custom-color-palettes)
5. [Component Usage Patterns](#component-usage-patterns)
6. [Testing and Validation](#testing-and-validation)
7. [Migration Strategy](#migration-strategy)

## Current Implementation Overview

### Theme Configuration
The application currently uses a minimal theme configuration in `frontend/src/App.tsx:29-33`:

```typescript
const theme = createTheme({
  primaryColor: 'yellow',
  defaultRadius: 'md',
  cursorType: 'pointer',
});
```

### MantineProvider Setup
Located in `frontend/src/App.tsx:38`:
```typescript
<MantineProvider theme={theme} defaultColorScheme="dark">
```

**Key Settings:**
- **Primary Color**: `yellow` (uses Mantine's built-in yellow palette)
- **Default Color Scheme**: `dark` (dark mode by default)
- **Default Radius**: `md` (medium border radius for components)
- **Cursor Type**: `pointer` (cursor style for interactive elements)

## Mantine Package Structure

### Installed Packages (v8.2.7)
```json
{
  "@mantine/core": "^8.2.7",      // Core components and theme system
  "@mantine/charts": "^8.2.7",     // Chart components (uses Recharts)
  "@mantine/dates": "^8.2.7",      // Date picker components
  "@mantine/form": "^8.2.7",       // Form management and validation
  "@mantine/hooks": "^8.2.7",      // React hooks collection
  "@mantine/modals": "^8.2.7",     // Modal management system
  "@mantine/notifications": "^8.2.7" // Toast notifications
}
```

### Style Imports
Required CSS imports in `frontend/src/App.tsx:7-10`:
```typescript
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/charts/styles.css';
import '@mantine/notifications/styles.css';
```

## Color System Architecture

### Mantine Color Scale
Each color in Mantine has 10 shades (indexed 0-9):
- **0**: Lightest shade
- **9**: Darkest shade
- **Default usage**: Components typically use shade 6 in light mode, shade 8 in dark mode

### CSS Variables
Mantine exposes colors as CSS variables:
```css
--mantine-color-[colorName]-[shade]
/* Example: --mantine-color-yellow-6 */
```

### Current Color Usage
The application uses yellow as the primary color throughout:
- Navigation highlights
- Action buttons
- Progress indicators
- User avatars
- Brand icon (`IconPigMoney`)

## Implementing Custom Color Palettes

### Step 1: Install Color Generator (Optional)
```bash
cd frontend
npm install @mantine/colors-generator
```

### Step 2: Define Custom Color Palette
Create a new file `frontend/src/theme/colors.ts`:

```typescript
import { MantineColorsTuple } from '@mantine/core';

// Option A: Manual palette definition (10 shades required)
export const customBrand: MantineColorsTuple = [
  '#f0f9ff', // 0 - lightest
  '#e0f2fe',
  '#bae6fd',
  '#7dd3fc',
  '#38bdf8',
  '#0ea5e9', // 5 - base color
  '#0284c7',
  '#0369a1',
  '#075985',
  '#0c4a6e'  // 9 - darkest
];

// Option B: Using the generator (if installed)
import { generateColors } from '@mantine/colors-generator';
export const customBrand = generateColors('#0ea5e9');

// Define additional custom colors
export const customSuccess: MantineColorsTuple = [
  '#f0fdf4',
  '#dcfce7',
  '#bbf7d0',
  '#86efac',
  '#4ade80',
  '#22c55e', // base green
  '#16a34a',
  '#15803d',
  '#166534',
  '#14532d'
];

export const customDanger: MantineColorsTuple = [
  '#fef2f2',
  '#fee2e2',
  '#fecaca',
  '#fca5a5',
  '#f87171',
  '#ef4444', // base red
  '#dc2626',
  '#b91c1c',
  '#991b1b',
  '#7f1d1d'
];
```

### Step 3: Extend TypeScript Types
Create `frontend/src/theme/types.ts`:

```typescript
import { MantineColorsTuple } from '@mantine/core';

// Extend Mantine's color types
declare module '@mantine/core' {
  export interface MantineThemeColorsOverride {
    colors: Record<
      | 'brand'     // Custom primary brand color
      | 'success'   // Success states
      | 'danger'    // Error states
      | 'info'      // Information
      | 'warning'   // Warnings
      | DefaultMantineColor,  // Keep default colors
      MantineColorsTuple
    >;
  }
}
```

### Step 4: Update Theme Configuration
Modify `frontend/src/App.tsx`:

```typescript
import { createTheme, MantineProvider, virtualColor } from '@mantine/core';
import { customBrand, customSuccess, customDanger } from './theme/colors';

const theme = createTheme({
  // Color configuration
  colors: {
    brand: customBrand,
    success: customSuccess,
    danger: customDanger,
    // Virtual colors for light/dark mode variations
    primary: virtualColor({
      name: 'primary',
      dark: 'brand',
      light: 'brand',
    }),
  },
  primaryColor: 'brand', // Use custom brand color as primary
  
  // Component defaults
  defaultRadius: 'md',
  cursorType: 'pointer',
  
  // Additional theme customization
  fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
  headings: {
    fontWeight: '700',
  },
  
  // Component-specific styles
  components: {
    Button: {
      defaultProps: {
        variant: 'filled',
      },
    },
    Card: {
      defaultProps: {
        shadow: 'sm',
        padding: 'lg',
        radius: 'md',
      },
    },
  },
});
```

### Step 5: Using Custom Colors in Components

#### In Component Props
```typescript
// Using the primary color (brand)
<Button color="brand">Save Budget</Button>
<Badge color="success">Active</Badge>
<Alert color="danger">Error Message</Alert>

// Using specific shades
<Text c="brand.6">Branded text</Text>
<Paper bg="brand.0">Light brand background</Paper>
```

#### In Styles
```typescript
import { createStyles } from '@mantine/core';

const useStyles = createStyles((theme) => ({
  customCard: {
    backgroundColor: theme.colors.brand[0],
    borderLeft: `4px solid ${theme.colors.brand[6]}`,
    '&:hover': {
      backgroundColor: theme.colors.brand[1],
    },
  },
}));
```

## Component Usage Patterns

### Current Component Library Usage

#### Layout Components
- **AppShell**: Main application layout (`MantineLayout.tsx`)
- **NavLink**: Navigation items with active states
- **Burger**: Mobile/desktop menu toggle

#### Data Display
- **Card**: Dashboard statistics, account cards
- **Table**: Transaction lists
- **Badge**: Status indicators
- **Progress**: Budget usage visualization

#### Form Components
- **TextInput**, **PasswordInput**: Authentication forms
- **Select**, **MultiSelect**: Category selection
- **NumberInput**: Budget amounts
- **DatePicker**: Date range selection

#### Feedback
- **Notifications**: Toast messages (success/error)
- **Alert**: Inline warnings and errors
- **Loader**: Loading states
- **Tooltip**: Hover information

#### Modals
- **ModalsProvider**: Global modal management
- **Modal**: Transaction edit, split, preview modals

### Icon Usage
Using `@tabler/icons-react` throughout:
```typescript
import { 
  IconHome,        // Dashboard
  IconReceipt,     // Transactions
  IconCreditCard,  // Accounts
  IconCategory,    // Categories
  IconPigMoney,    // Budgets (also brand icon)
  IconChartBar,    // Reports
  IconSettings     // Admin
} from '@tabler/icons-react';
```

## Testing and Validation

### Color Accessibility Checklist
When implementing custom colors, validate:

1. **Contrast Ratios**
   - Text on background: minimum 4.5:1 for normal text
   - Large text: minimum 3:1
   - Interactive elements: minimum 3:1

2. **Dark Mode Compatibility**
   ```typescript
   // Test both schemes
   <MantineProvider defaultColorScheme="light">
   <MantineProvider defaultColorScheme="dark">
   ```

3. **Component States**
   - Default state
   - Hover state
   - Active/pressed state
   - Disabled state
   - Focus state (keyboard navigation)

### Testing Commands
```bash
# Start development server to preview changes
cd frontend
npm run dev

# Type checking
npm run type-check

# Linting
npm run lint
```

### Visual Testing Approach
1. Navigate through all main pages:
   - `/dashboard` - Check stats cards, charts
   - `/transactions` - Verify table colors, badges
   - `/accounts` - Test account cards, buttons
   - `/categories` - Check tree view, forms
   - `/budgets` - Validate progress bars, comparisons
   - `/reports` - Review charts, data visualizations

2. Test interactive states:
   - Click buttons
   - Hover over cards
   - Open modals
   - Submit forms
   - View notifications

## Migration Strategy

### Phase 1: Preparation
1. Create color palette definitions
2. Add TypeScript type extensions
3. Test colors in isolation

### Phase 2: Theme Update
1. Update `App.tsx` with new theme
2. Replace `primaryColor: 'yellow'` with `primaryColor: 'brand'`
3. Verify application loads without errors

### Phase 3: Component Migration
Gradually update hardcoded colors:

```typescript
// Before
<IconPigMoney color="var(--mantine-color-yellow-5)" />

// After
<IconPigMoney color="var(--mantine-color-brand-5)" />
```

### Phase 4: Testing & Refinement
1. Test all pages and components
2. Adjust shades for better contrast
3. Get user feedback
4. Fine-tune based on usage

## Quick Reference

### File Locations
```
frontend/
├── src/
│   ├── App.tsx                    # Theme configuration
│   ├── theme/                     # Custom theme files (to create)
│   │   ├── colors.ts             # Color palette definitions
│   │   └── types.ts              # TypeScript extensions
│   ├── components/
│   │   ├── MantineLayout.tsx    # Main layout using AppShell
│   │   └── auth/                 # Auth forms using Mantine
│   └── pages/                    # Page components with Mantine UI
```

### Common Patterns

#### Using Theme Colors in Custom CSS
```typescript
// Access theme in styles
const useStyles = createStyles((theme) => ({
  highlight: {
    color: theme.colors[theme.primaryColor][theme.colorScheme === 'dark' ? 4 : 6],
  },
}));
```

#### Conditional Styling
```typescript
<Card 
  bg={isActive ? 'brand.0' : undefined}
  style={{ borderColor: isActive ? 'var(--mantine-color-brand-6)' : undefined }}
>
```

#### Dynamic Color Selection
```typescript
const getStatusColor = (status: string) => {
  switch(status) {
    case 'success': return 'success';
    case 'error': return 'danger';
    case 'warning': return 'warning';
    default: return 'gray';
  }
};

<Badge color={getStatusColor(transaction.status)}>
  {transaction.status}
</Badge>
```

## Best Practices

1. **Consistency**: Use the same shade indices across similar components
2. **Semantic naming**: Use meaningful color names (brand, success, danger)
3. **Test both themes**: Always verify in light and dark modes
4. **Gradual rollout**: Implement colors section by section
5. **Document choices**: Comment why specific shades were chosen
6. **Accessibility first**: Prioritize readability over aesthetics
7. **Use CSS variables**: Leverage Mantine's CSS variables for consistency
8. **Avoid inline colors**: Define colors in theme, not in components

## Troubleshooting

### Common Issues

1. **TypeScript errors after adding custom colors**
   - Ensure type declarations are imported before theme creation
   - Restart TypeScript service: `npm run type-check`

2. **Colors not applying**
   - Check color name spelling
   - Verify theme is passed to MantineProvider
   - Clear browser cache

3. **Dark mode issues**
   - Test with explicit `colorScheme` prop
   - Use `useMantineColorScheme` hook for debugging

4. **Build errors**
   - Ensure all 10 shades are defined for custom colors
   - Check for circular dependencies in theme files

## Next Steps

1. **Review current yellow usage** - Search for `yellow` and `--mantine-color-yellow` references
2. **Create color palette** - Design or generate custom brand colors
3. **Implement gradually** - Start with primary color, then add secondary colors
4. **Document decisions** - Keep track of color choices and rationale
5. **Gather feedback** - Test with users before full rollout

## Additional Resources

- [Mantine Documentation](https://mantine.dev/)
- [Mantine Colors Generator](https://mantine.dev/colors-generator/)
- [Color Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Accessible Colors](https://accessible-colors.com/)
- [Tabler Icons](https://tabler.io/icons)

---

*This document provides comprehensive guidance for implementing custom color palettes in the Budget Tracker application. Follow the step-by-step instructions and best practices to ensure a smooth migration while maintaining accessibility and user experience.*