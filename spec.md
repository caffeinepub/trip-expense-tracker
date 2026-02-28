# Trip Expense Tracker

## Current State
- App is named "Manali Trip 2026" in the header and dashboard
- Pre-loaded with 5 sample Manali expenses (hotel, lunch, ski rental, dinner, taxi)
- Currency is hardcoded to INR (Indian Rupee, ₹) throughout
- No way to reset/clear expenses mid-trip
- No currency selection option

## Requested Changes (Diff)

### Add
- Currency selector dropdown: Indian Rupee (INR ₹), Thai Baht (THB ฿), Vietnamese Dong (VND ₫)
- Currency context/state at app level, passed down to all tabs
- `formatCurrency(amount, currency)` helper that formats amounts in the selected currency
- "Reset / New Settlement" button in the Settlements tab and/or Dashboard that clears all expenses and starts fresh (with confirmation dialog or toast undo)
- Currency exchange rate constants relative to INR (approximate): THB ~0.44, VND ~52

### Modify
- Header subtitle: change "Manali 2026" → "TRIP"
- Dashboard trip card title: change "Manali Trip 2026" → "TRIP"
- Initial expenses state: start with empty array `[]` instead of SAMPLE_EXPENSES (clear pre-loaded data)
- All `formatINR()` usages replaced with `formatCurrency(amount, currency)` that adapts to selected currency
- Amount label in Add Expense form: update dynamically based on selected currency symbol
- Add Expense split preview: show currency symbol dynamically
- Stats card "Per Person" icon: make currency-agnostic
- Dashboard header: place currency selector dropdown in the header bar

### Remove
- `SAMPLE_EXPENSES` constant and its pre-load from `useState`
- Hardcoded `formatINR` function (replace with multi-currency formatter)
- "Manali 2026" / "Manali Trip 2026" text references

## Implementation Plan
1. Add currency types and exchange rate constants
2. Add `formatCurrency(amount: number, currency: Currency): string` helper
3. Add currency state to App component, pass as prop to all tabs
4. Replace all `formatINR()` calls with `formatCurrency(amount, currency)`
5. Add currency selector `<Select>` in the app header
6. Update header subtitle and dashboard trip card title to "TRIP"
7. Initialize `expenses` state as `[]`
8. Add a "Reset Expenses" button in both Dashboard and Settlements tabs with a confirmation before wiping all expenses
9. Update amount field label/prefix symbol dynamically
