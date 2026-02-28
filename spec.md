# Trip Expense Tracker

## Current State
New project. No existing code.

## Requested Changes (Diff)

### Add
- Full single-page React app (no backend) for 4 fixed friends: Manoj, Ramesh, Abhijit, Pradeep
- Expense model: { id, date, description, location, amount (₹), paidBy }
- Equal split logic: each member owes amount/4 to the payer
- 4 tabs: Dashboard, Add Expense, Expense List, Settlements
- Dashboard: total trip spend, net balance per person (owed vs owes), quick settlement summary
- Add Expense form: amount, description, location, date, paidBy dropdown
- Expense List: accounting-style table with columns — date, description, location, amount, paid by, share per person
- Settlements: simplified net settlement algorithm to minimize transactions; shows "X owes Y ₹Z"
- Pre-loaded sample expenses (3-4 entries across different payers/locations)
- Indian Rupee (₹) currency throughout
- Blues and greens color scheme, clean finance/accounting aesthetic
- Mobile-responsive layout

### Modify
- None (new project)

### Remove
- None (new project)

## Implementation Plan
1. Set up App.tsx with useState for expenses array, active tab state
2. Define Expense type and 4 members constant
3. Implement settlement calculation: compute net balances, then greedy debt-simplification algorithm
4. Build Dashboard tab: total, per-person balance cards, top settlements preview
5. Build Add Expense tab: controlled form with validation, appends to expenses state
6. Build Expense List tab: responsive table/card list sorted by date
7. Build Settlements tab: full list of simplified who-owes-whom
8. Add sample data pre-loaded into initial state
9. Apply blues/greens design system, mobile-responsive layout
