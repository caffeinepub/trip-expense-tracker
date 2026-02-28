import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  FileText,
  LayoutDashboard,
  ListOrdered,
  MapPin,
  Mountain,
  Plus,
  Receipt,
  RotateCcw,
  TrendingUp,
  User,
  Wallet,
} from "lucide-react";
import { AnimatePresence, type Variants, motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────────

type Member = "Manoj" | "Ramesh" | "Abhijit" | "Pradeep";
const MEMBERS: Member[] = ["Manoj", "Ramesh", "Abhijit", "Pradeep"];

interface Expense {
  id: string;
  date: string;
  description: string;
  location: string;
  amount: number;
  paidBy: Member;
}

// ── Currency ───────────────────────────────────────────────────────────────────

type Currency = "INR" | "THB" | "VND";

const CURRENCIES: { value: Currency; label: string; symbol: string }[] = [
  { value: "INR", label: "Indian Rupee (₹)", symbol: "₹" },
  { value: "THB", label: "Thai Baht (฿)", symbol: "฿" },
  { value: "VND", label: "Vietnam Dong (₫)", symbol: "₫" },
];

// Approximate conversion rates from INR
const EXCHANGE_RATES: Record<Currency, number> = {
  INR: 1,
  THB: 0.44,
  VND: 52,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCurrency(amount: number, currency: Currency): string {
  const converted = Math.abs(amount) * EXCHANGE_RATES[currency];
  const info = CURRENCIES.find((c) => c.value === currency)!;
  if (currency === "INR") {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(converted);
  }
  if (currency === "VND") {
    return `${info.symbol}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(converted))}`;
  }
  // THB
  return `${info.symbol}${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(converted)}`;
}

function formatDateDisplay(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

// ── Settlement Algorithm ───────────────────────────────────────────────────────

interface Settlement {
  from: Member;
  to: Member;
  amount: number;
}

function computeBalances(expenses: Expense[]): Record<Member, number> {
  const balances: Record<Member, number> = {
    Manoj: 0,
    Ramesh: 0,
    Abhijit: 0,
    Pradeep: 0,
  };

  for (const expense of expenses) {
    const share = expense.amount / MEMBERS.length;
    // Payer gets credit for others' shares
    balances[expense.paidBy] += expense.amount - share;
    // Everyone else owes their share
    for (const member of MEMBERS) {
      if (member !== expense.paidBy) {
        balances[member] -= share;
      }
    }
  }

  return balances;
}

function simplifyDebts(balances: Record<Member, number>): Settlement[] {
  const settlements: Settlement[] = [];

  // Work with copies as mutable arrays
  const creditors: { member: Member; amount: number }[] = [];
  const debtors: { member: Member; amount: number }[] = [];

  for (const member of MEMBERS) {
    const bal = Math.round(balances[member]);
    if (bal > 0) creditors.push({ member, amount: bal });
    else if (bal < 0) debtors.push({ member, amount: -bal });
  }

  // Greedy matching
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const credit = creditors[ci];
    const debt = debtors[di];
    const settled = Math.min(credit.amount, debt.amount);

    if (settled > 0) {
      settlements.push({
        from: debt.member,
        to: credit.member,
        amount: settled,
      });
    }

    credit.amount -= settled;
    debt.amount -= settled;

    if (credit.amount === 0) ci++;
    if (debt.amount === 0) di++;
  }

  return settlements;
}

// ── Avatar Colors ──────────────────────────────────────────────────────────────

const MEMBER_COLORS: Record<Member, string> = {
  Manoj: "bg-blue-600",
  Ramesh: "bg-teal-600",
  Abhijit: "bg-indigo-600",
  Pradeep: "bg-cyan-600",
};

const MEMBER_INITIALS: Record<Member, string> = {
  Manoj: "MN",
  Ramesh: "RM",
  Abhijit: "AB",
  Pradeep: "PR",
};

// ── Tab Type ───────────────────────────────────────────────────────────────────

type Tab = "dashboard" | "add" | "list" | "settlements";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: <LayoutDashboard className="h-4 w-4" />,
  },
  { id: "add", label: "Add Expense", icon: <Plus className="h-4 w-4" /> },
  { id: "list", label: "Expenses", icon: <ListOrdered className="h-4 w-4" /> },
  {
    id: "settlements",
    label: "Settlements",
    icon: <Wallet className="h-4 w-4" />,
  },
];

// ── Member Avatar ──────────────────────────────────────────────────────────────

function MemberAvatar({
  member,
  size = "sm",
}: { member: Member; size?: "sm" | "md" | "lg" }) {
  const sizeClass =
    size === "lg"
      ? "h-12 w-12 text-sm"
      : size === "md"
        ? "h-9 w-9 text-xs"
        : "h-7 w-7 text-xs";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-display font-bold text-white ${MEMBER_COLORS[member]} ${sizeClass}`}
    >
      {MEMBER_INITIALS[member]}
    </span>
  );
}

// ── Dashboard Tab ──────────────────────────────────────────────────────────────

function DashboardTab({
  expenses,
  currency,
  onReset,
}: {
  expenses: Expense[];
  currency: Currency;
  onReset: () => void;
}) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const totalSpend = expenses.reduce((sum, e) => sum + e.amount, 0);
  const perPerson = totalSpend / MEMBERS.length;
  const balances = computeBalances(expenses);
  const settlements = simplifyDebts(balances);

  const containerVariants: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.07 } },
  };
  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 16 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] },
    },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Trip Header */}
      <motion.div variants={itemVariants}>
        <div className="relative overflow-hidden rounded-xl bg-navy text-white p-6">
          {/* Background decoration */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full bg-white" />
            <div className="absolute -bottom-12 -left-4 w-40 h-40 rounded-full bg-white" />
          </div>
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Mountain className="h-4 w-4 opacity-70" />
                <span className="text-sm font-body opacity-70 tracking-wide uppercase">
                  Trip Expense Tracker
                </span>
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight">
                TRIP
              </h1>
              <p className="text-sm opacity-60 mt-1 font-body">4 members</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-body opacity-60 uppercase tracking-wide mb-1">
                Total Spend
              </p>
              <p className="font-display text-3xl font-bold amount-neutral text-white">
                {formatCurrency(totalSpend, currency)}
              </p>
              <p className="text-xs opacity-60 mt-1">
                {formatCurrency(perPerson, currency)} per person
              </p>
            </div>
          </div>
          <div className="relative mt-4 pt-4 border-t border-white/10 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {MEMBERS.map((m) => (
              <div key={m} className="text-center">
                <p className="text-xs opacity-50 mb-1">{m}</p>
                <p className="font-display font-semibold text-sm">
                  {formatCurrency(
                    expenses
                      .filter((e) => e.paidBy === m)
                      .reduce((s, e) => s + e.amount, 0),
                    currency,
                  )}
                </p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Stats Row */}
      <motion.div
        variants={itemVariants}
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {[
          {
            label: "Expenses",
            value: expenses.length,
            icon: <Receipt className="h-4 w-4" />,
          },
          {
            label: "Per Person",
            value: formatCurrency(perPerson, currency),
            icon: <TrendingUp className="h-4 w-4" />,
          },
          {
            label: "Settlements",
            value: settlements.length,
            icon: <ArrowRight className="h-4 w-4" />,
          },
          {
            label: "Total Spend",
            value: formatCurrency(totalSpend, currency),
            icon: <TrendingUp className="h-4 w-4" />,
          },
        ].map((stat) => (
          <Card key={stat.label} className="shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                {stat.icon}
                <span className="text-xs font-body">{stat.label}</span>
              </div>
              <p className="font-display font-bold text-lg text-foreground">
                {stat.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* Balance Cards */}
      <motion.div variants={itemVariants}>
        <h2 className="font-display font-bold text-base text-foreground mb-3 flex items-center gap-2">
          <span className="inline-block w-1.5 h-5 rounded-full bg-teal" />
          Member Balances
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {MEMBERS.map((member) => {
            const bal = Math.round(balances[member]);
            const isPositive = bal >= 0;
            return (
              <Card
                key={member}
                className={`shadow-card border-0 ${isPositive ? "bg-success-light" : "bg-destructive/5"}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <MemberAvatar member={member} size="md" />
                    <span className="font-display font-semibold text-sm text-foreground">
                      {member}
                    </span>
                  </div>
                  <p
                    className={`font-display font-bold text-xl ${isPositive ? "amount-positive" : "amount-negative"}`}
                  >
                    {isPositive ? "+" : "-"}
                    {formatCurrency(bal, currency)}
                  </p>
                  <p
                    className={`text-xs mt-1 font-body ${isPositive ? "text-success" : "text-destructive"}`}
                  >
                    {bal === 0
                      ? "All settled"
                      : isPositive
                        ? "gets back"
                        : "owes"}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </motion.div>

      {/* Quick Settlements Summary */}
      <motion.div variants={itemVariants}>
        <h2 className="font-display font-bold text-base text-foreground mb-3 flex items-center gap-2">
          <span className="inline-block w-1.5 h-5 rounded-full bg-teal" />
          Settlement Summary
        </h2>
        {settlements.length === 0 ? (
          <Card className="shadow-card">
            <CardContent className="p-6 text-center">
              <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-2" />
              <p className="font-display font-semibold text-foreground">
                All Settled!
              </p>
              <p className="text-sm text-muted-foreground font-body">
                Everyone is even.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {settlements.map((s) => (
              <div
                key={`${s.from}-${s.to}`}
                className="flex items-center justify-between bg-card rounded-lg px-4 py-3 shadow-xs border border-border"
              >
                <div className="flex items-center gap-2">
                  <MemberAvatar member={s.from} />
                  <span className="font-body text-sm text-foreground">
                    {s.from}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <ArrowRight className="h-4 w-4 text-teal" />
                  <span className="font-display font-bold amount-neutral text-foreground">
                    {formatCurrency(s.amount, currency)}
                  </span>
                  <ArrowRight className="h-4 w-4 text-teal" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-body text-sm text-foreground">
                    {s.to}
                  </span>
                  <MemberAvatar member={s.to} />
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Reset / New Settlement */}
      <motion.div variants={itemVariants}>
        <div className="pt-2">
          {!showResetConfirm ? (
            <Button
              variant="outline"
              className="w-full border-destructive text-destructive hover:bg-destructive hover:text-white font-body"
              onClick={() => setShowResetConfirm(true)}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset / New Settlement
            </Button>
          ) : (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
              <p className="text-sm font-body text-foreground text-center">
                This will delete all <strong>{expenses.length}</strong>{" "}
                expense(s) and start fresh. Are you sure?
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 font-body"
                  onClick={() => setShowResetConfirm(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1 font-body"
                  onClick={onReset}
                >
                  Yes, Reset
                </Button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Add Expense Tab ────────────────────────────────────────────────────────────

function AddExpenseTab({
  onAdd,
  currency,
}: {
  onAdd: (expense: Expense) => void;
  currency: Currency;
}) {
  const today = new Date().toISOString().split("T")[0];
  const currencyInfo = CURRENCIES.find((c) => c.value === currency)!;

  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [paidBy, setPaidBy] = useState<Member | "">("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const parsedAmount = Number.parseFloat(amount) || 0;
  const perPerson = parsedAmount / MEMBERS.length;

  function validate() {
    const e: Record<string, string> = {};
    if (!description.trim()) e.description = "Description is required";
    if (!location.trim()) e.location = "Location is required";
    if (!amount || parsedAmount <= 0) e.amount = "Enter a valid amount";
    if (!date) e.date = "Date is required";
    if (!paidBy) e.paidBy = "Select who paid";
    return e;
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    onAdd({
      id: Date.now().toString(),
      date,
      description: description.trim(),
      location: location.trim(),
      amount: parsedAmount,
      paidBy: paidBy as Member,
    });

    toast.success("Expense added successfully!", {
      description: `${description} — ${formatCurrency(parsedAmount, currency)} split among 4 members`,
    });

    setDescription("");
    setLocation("");
    setAmount("");
    setDate(today);
    setPaidBy("");
    setErrors({});
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <div className="max-w-lg mx-auto">
        <Card className="shadow-card-md">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-teal flex items-center justify-center">
                <Plus className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="font-display text-lg">
                  Add New Expense
                </CardTitle>
                <p className="text-xs text-muted-foreground font-body mt-0.5">
                  Cost will be split equally among all 4 members
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Description */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="description"
                  className="font-body text-sm font-medium flex items-center gap-1.5"
                >
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  Description
                </Label>
                <Input
                  id="description"
                  placeholder="e.g. Hotel stay, Dinner at restaurant"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={`font-body ${errors.description ? "border-destructive" : ""}`}
                />
                {errors.description && (
                  <p className="text-xs text-destructive font-body">
                    {errors.description}
                  </p>
                )}
              </div>

              {/* Location */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="location"
                  className="font-body text-sm font-medium flex items-center gap-1.5"
                >
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  Location / Place
                </Label>
                <Input
                  id="location"
                  placeholder="e.g. Bangkok, Ho Chi Minh City"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className={`font-body ${errors.location ? "border-destructive" : ""}`}
                />
                {errors.location && (
                  <p className="text-xs text-destructive font-body">
                    {errors.location}
                  </p>
                )}
              </div>

              {/* Amount + Date row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="amount"
                    className="font-body text-sm font-medium flex items-center gap-1.5"
                  >
                    Amount ({currencyInfo.symbol})
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">
                      {currencyInfo.symbol}
                    </span>
                    <Input
                      id="amount"
                      type="number"
                      placeholder="0"
                      min="1"
                      step="1"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className={`pl-7 font-mono ${errors.amount ? "border-destructive" : ""}`}
                    />
                  </div>
                  {errors.amount && (
                    <p className="text-xs text-destructive font-body">
                      {errors.amount}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="date"
                    className="font-body text-sm font-medium flex items-center gap-1.5"
                  >
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    Date
                  </Label>
                  <Input
                    id="date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={`font-body ${errors.date ? "border-destructive" : ""}`}
                  />
                  {errors.date && (
                    <p className="text-xs text-destructive font-body">
                      {errors.date}
                    </p>
                  )}
                </div>
              </div>

              {/* Paid By */}
              <div className="space-y-1.5">
                <Label className="font-body text-sm font-medium flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  Paid By
                </Label>
                <Select
                  value={paidBy}
                  onValueChange={(v) => setPaidBy(v as Member)}
                >
                  <SelectTrigger
                    className={`font-body ${errors.paidBy ? "border-destructive" : ""}`}
                  >
                    <SelectValue placeholder="Select who paid" />
                  </SelectTrigger>
                  <SelectContent>
                    {MEMBERS.map((m) => (
                      <SelectItem key={m} value={m} className="font-body">
                        <div className="flex items-center gap-2">
                          <MemberAvatar member={m} />
                          {m}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.paidBy && (
                  <p className="text-xs text-destructive font-body">
                    {errors.paidBy}
                  </p>
                )}
              </div>

              {/* Split Preview */}
              <AnimatePresence>
                {parsedAmount > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="rounded-lg bg-teal-light border border-teal/20 p-4">
                      <p className="text-xs font-body font-medium text-accent-foreground mb-2 flex items-center gap-1.5">
                        <Receipt className="h-3.5 w-3.5" />
                        Split Preview
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {MEMBERS.map((m) => (
                          <div key={m} className="text-center">
                            <MemberAvatar member={m} size="sm" />
                            <p className="text-xs font-body text-accent-foreground mt-1">
                              {m}
                            </p>
                            <p className="font-display font-bold text-sm text-accent-foreground amount-neutral">
                              {formatCurrency(perPerson, currency)}
                            </p>
                          </div>
                        ))}
                      </div>
                      <Separator className="my-3 bg-teal/20" />
                      <p className="text-xs text-center font-body text-accent-foreground">
                        Each member pays{" "}
                        <span className="font-bold">
                          {formatCurrency(perPerson, currency)}
                        </span>{" "}
                        of the total{" "}
                        <span className="font-bold">
                          {formatCurrency(parsedAmount, currency)}
                        </span>
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <Button
                type="submit"
                className="w-full font-display font-semibold bg-navy hover:bg-navy-light text-white"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Expense
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}

// ── Expense List Tab ───────────────────────────────────────────────────────────

function ExpenseListTab({
  expenses,
  currency,
}: {
  expenses: Expense[];
  currency: Currency;
}) {
  const sorted = [...expenses].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const perPersonTotal = total / MEMBERS.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="space-y-4"
    >
      {/* Desktop Table */}
      <div className="hidden sm:block">
        <Card className="shadow-card overflow-hidden">
          <CardHeader className="pb-0 pt-4 px-5">
            <div className="flex items-center justify-between">
              <CardTitle className="font-display text-base">
                All Expenses
              </CardTitle>
              <Badge variant="secondary" className="font-body text-xs">
                {expenses.length} entries
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0 mt-3">
            {expenses.length === 0 ? (
              <div className="p-10 text-center">
                <Receipt className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
                <p className="font-display font-semibold text-foreground">
                  No expenses yet
                </p>
                <p className="text-sm text-muted-foreground font-body mt-1">
                  Add your first expense to get started.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="font-display font-semibold text-xs uppercase tracking-wider text-muted-foreground pl-5">
                      Date
                    </TableHead>
                    <TableHead className="font-display font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                      Description
                    </TableHead>
                    <TableHead className="font-display font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                      Location
                    </TableHead>
                    <TableHead className="font-display font-semibold text-xs uppercase tracking-wider text-muted-foreground text-right">
                      Amount
                    </TableHead>
                    <TableHead className="font-display font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                      Paid By
                    </TableHead>
                    <TableHead className="font-display font-semibold text-xs uppercase tracking-wider text-muted-foreground text-right pr-5">
                      Per Person
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((expense, i) => (
                    <TableRow
                      key={expense.id}
                      className={`ledger-row transition-colors ${i % 2 === 1 ? "bg-muted/30" : ""}`}
                    >
                      <TableCell className="pl-5 font-body text-sm text-muted-foreground whitespace-nowrap">
                        {formatDateDisplay(expense.date)}
                      </TableCell>
                      <TableCell className="font-body text-sm font-medium text-foreground">
                        {expense.description}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1 text-xs font-body text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {expense.location}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="amount-neutral font-semibold text-sm text-foreground">
                          {formatCurrency(expense.amount, currency)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <MemberAvatar member={expense.paidBy} />
                          <span className="font-body text-sm text-foreground">
                            {expense.paidBy}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right pr-5">
                        <span className="amount-neutral text-sm text-muted-foreground">
                          {formatCurrency(expense.amount / 4, currency)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Total Row */}
                  <TableRow className="bg-navy/5 border-t-2 border-navy/20">
                    <TableCell
                      colSpan={3}
                      className="pl-5 font-display font-bold text-sm text-foreground"
                    >
                      Total ({expenses.length} expenses)
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="amount-neutral font-display font-bold text-base text-foreground">
                        {formatCurrency(total, currency)}
                      </span>
                    </TableCell>
                    <TableCell />
                    <TableCell className="text-right pr-5">
                      <span className="amount-neutral font-display font-bold text-sm text-foreground">
                        {formatCurrency(perPersonTotal, currency)}
                      </span>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Mobile Cards */}
      <div className="sm:hidden space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-base text-foreground">
            All Expenses
          </h2>
          <Badge variant="secondary" className="font-body text-xs">
            {expenses.length} entries
          </Badge>
        </div>
        {expenses.length === 0 ? (
          <Card className="shadow-card">
            <CardContent className="p-8 text-center">
              <Receipt className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="font-display font-semibold text-foreground">
                No expenses yet
              </p>
              <p className="text-sm text-muted-foreground font-body mt-1">
                Add your first expense to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {sorted.map((expense) => (
              <Card key={expense.id} className="shadow-card">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-body font-semibold text-sm text-foreground truncate">
                        {expense.description}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground font-body">
                          <MapPin className="h-3 w-3" />
                          {expense.location}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground font-body">
                          <Calendar className="h-3 w-3" />
                          {formatDateDisplay(expense.date)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="amount-neutral font-display font-bold text-base text-foreground">
                        {formatCurrency(expense.amount, currency)}
                      </p>
                      <p className="text-xs text-muted-foreground font-body mt-0.5">
                        {formatCurrency(expense.amount / 4, currency)}/person
                      </p>
                    </div>
                  </div>
                  <Separator className="my-2" />
                  <div className="flex items-center gap-2">
                    <MemberAvatar member={expense.paidBy} />
                    <span className="text-xs font-body text-muted-foreground">
                      Paid by{" "}
                      <span className="font-semibold text-foreground">
                        {expense.paidBy}
                      </span>
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
            {/* Mobile Total */}
            <Card className="shadow-card border-navy/20 bg-navy/5">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-display font-bold text-sm text-foreground">
                    Total Spend
                  </p>
                  <p className="text-xs text-muted-foreground font-body">
                    {expenses.length} expenses
                  </p>
                </div>
                <div className="text-right">
                  <p className="amount-neutral font-display font-bold text-lg text-foreground">
                    {formatCurrency(total, currency)}
                  </p>
                  <p className="text-xs text-muted-foreground font-body">
                    {formatCurrency(perPersonTotal, currency)}/person
                  </p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </motion.div>
  );
}

// ── Settlements Tab ────────────────────────────────────────────────────────────

function SettlementsTab({
  expenses,
  currency,
  onReset,
}: {
  expenses: Expense[];
  currency: Currency;
  onReset: () => void;
}) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const balances = computeBalances(expenses);
  const settlements = simplifyDebts(balances);

  const containerVariants: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.08 } },
  };
  const itemVariants: Variants = {
    hidden: { opacity: 0, x: -12 },
    visible: {
      opacity: 1,
      x: 0,
      transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
    },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="space-y-6"
    >
      {/* Info Banner */}
      <div className="rounded-lg bg-teal-light border border-teal/20 p-4 flex items-start gap-3">
        <div className="h-8 w-8 rounded-full bg-teal flex items-center justify-center shrink-0">
          <Wallet className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="font-display font-semibold text-sm text-accent-foreground">
            Simplified Settlements
          </p>
          <p className="text-xs text-muted-foreground font-body mt-0.5">
            These {settlements.length > 0 ? settlements.length : "zero"}{" "}
            transaction{settlements.length !== 1 ? "s" : ""} will settle all
            debts among the group with the fewest possible payments.
          </p>
        </div>
      </div>

      {/* Net Balance per person */}
      <div>
        <h2 className="font-display font-bold text-base text-foreground mb-3 flex items-center gap-2">
          <span className="inline-block w-1.5 h-5 rounded-full bg-teal" />
          Net Balances
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {MEMBERS.map((member) => {
            const bal = Math.round(balances[member]);
            const isPositive = bal >= 0;
            return (
              <Card
                key={member}
                className={`shadow-card border-0 ${isPositive ? "bg-success-light" : "bg-destructive/5"}`}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col items-center text-center gap-2">
                    <MemberAvatar member={member} size="lg" />
                    <p className="font-display font-semibold text-sm text-foreground">
                      {member}
                    </p>
                    <p
                      className={`font-display font-bold text-lg ${isPositive ? "amount-positive" : "amount-negative"}`}
                    >
                      {isPositive ? "+" : "-"}
                      {formatCurrency(bal, currency)}
                    </p>
                    <Badge
                      variant="outline"
                      className={`text-xs font-body ${
                        bal === 0
                          ? "border-muted-foreground text-muted-foreground"
                          : isPositive
                            ? "border-success text-success"
                            : "border-destructive text-destructive"
                      }`}
                    >
                      {bal === 0
                        ? "Settled"
                        : isPositive
                          ? "Gets back"
                          : "Owes"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Settlement Transactions */}
      <div>
        <h2 className="font-display font-bold text-base text-foreground mb-3 flex items-center gap-2">
          <span className="inline-block w-1.5 h-5 rounded-full bg-teal" />
          Who Pays Whom
        </h2>

        {settlements.length === 0 ? (
          <Card className="shadow-card">
            <CardContent className="p-8 text-center">
              <div className="h-14 w-14 rounded-full bg-success-light flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="h-7 w-7 text-success" />
              </div>
              <p className="font-display font-bold text-lg text-foreground">
                All Settled!
              </p>
              <p className="text-sm text-muted-foreground font-body mt-1">
                Everyone's expenses are perfectly balanced.
              </p>
            </CardContent>
          </Card>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-3"
          >
            {settlements.map((s) => (
              <motion.div key={`${s.from}-${s.to}`} variants={itemVariants}>
                <Card className="shadow-card overflow-hidden">
                  <CardContent className="p-0">
                    <div className="flex items-stretch">
                      {/* From (Debtor) */}
                      <div className="flex-1 bg-destructive/5 p-4 flex items-center gap-3">
                        <MemberAvatar member={s.from} size="md" />
                        <div>
                          <p className="font-body text-xs text-muted-foreground mb-0.5">
                            Pays
                          </p>
                          <p className="font-display font-bold text-sm text-foreground">
                            {s.from}
                          </p>
                        </div>
                      </div>

                      {/* Amount in middle */}
                      <div className="flex flex-col items-center justify-center px-4 bg-card border-x border-border py-2 shrink-0">
                        <p className="font-display font-bold text-lg text-teal amount-neutral">
                          {formatCurrency(s.amount, currency)}
                        </p>
                        <ArrowRight className="h-4 w-4 text-teal mt-0.5" />
                      </div>

                      {/* To (Creditor) */}
                      <div className="flex-1 bg-success-light p-4 flex items-center gap-3 justify-end">
                        <div className="text-right">
                          <p className="font-body text-xs text-muted-foreground mb-0.5">
                            Receives
                          </p>
                          <p className="font-display font-bold text-sm text-foreground">
                            {s.to}
                          </p>
                        </div>
                        <MemberAvatar member={s.to} size="md" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* All expense payers summary */}
      <div>
        <h2 className="font-display font-bold text-base text-foreground mb-3 flex items-center gap-2">
          <span className="inline-block w-1.5 h-5 rounded-full bg-teal" />
          Amount Paid by Each
        </h2>
        <Card className="shadow-card">
          <CardContent className="p-4 space-y-3">
            {MEMBERS.map((member) => {
              const paid = expenses
                .filter((e) => e.paidBy === member)
                .reduce((s, e) => s + e.amount, 0);
              const total = expenses.reduce((s, e) => s + e.amount, 0);
              const pct = total > 0 ? (paid / total) * 100 : 0;

              return (
                <div key={member} className="flex items-center gap-3">
                  <MemberAvatar member={member} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-body text-sm font-medium text-foreground">
                        {member}
                      </span>
                      <span className="amount-neutral text-sm font-semibold text-foreground">
                        {formatCurrency(paid, currency)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{
                          duration: 0.6,
                          ease: "easeOut",
                          delay: 0.1,
                        }}
                        className="h-full rounded-full bg-teal"
                      />
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground font-body w-10 text-right">
                    {pct.toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Reset / New Settlement */}
      <div className="pt-2">
        {!showResetConfirm ? (
          <Button
            variant="outline"
            className="w-full border-destructive text-destructive hover:bg-destructive hover:text-white font-body"
            onClick={() => setShowResetConfirm(true)}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset / New Settlement
          </Button>
        ) : (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
            <p className="text-sm font-body text-foreground text-center">
              This will delete all <strong>{expenses.length}</strong> expense(s)
              and start fresh. Are you sure?
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 font-body"
                onClick={() => setShowResetConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1 font-body"
                onClick={onReset}
              >
                Yes, Reset
              </Button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────────

export default function App() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [currency, setCurrency] = useState<Currency>("INR");

  function addExpense(expense: Expense) {
    setExpenses((prev) => [...prev, expense]);
    setActiveTab("list");
  }

  function handleReset() {
    setExpenses([]);
    toast.success("All expenses cleared. Starting fresh!");
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Toaster position="top-right" />

      {/* App Header */}
      <header className="bg-navy text-white sticky top-0 z-40 shadow-md">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-teal flex items-center justify-center">
                <Wallet className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="font-display font-bold text-sm leading-tight">
                  Trip Splitter
                </p>
                <p className="text-xs opacity-50 leading-tight font-body">
                  TRIP
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={currency}
                onValueChange={(v) => setCurrency(v as Currency)}
              >
                <SelectTrigger className="h-8 w-[130px] text-xs bg-white/10 border-white/20 text-white font-body">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem
                      key={c.value}
                      value={c.value}
                      className="text-xs font-body"
                    >
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="hidden sm:flex items-center gap-1">
                {MEMBERS.map((m) => (
                  <MemberAvatar key={m} member={m} size="sm" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="bg-card border-b border-border sticky top-14 z-30 shadow-xs">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex overflow-x-auto scrollbar-hide">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  type="button"
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm font-body font-medium whitespace-nowrap transition-colors border-b-2 -mb-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isActive
                      ? "border-teal text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  }`}
                >
                  {tab.icon}
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden text-xs">
                    {tab.label.split(" ")[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <AnimatePresence mode="wait">
            {activeTab === "dashboard" && (
              <motion.div key="dashboard">
                <DashboardTab
                  expenses={expenses}
                  currency={currency}
                  onReset={handleReset}
                />
              </motion.div>
            )}
            {activeTab === "add" && (
              <motion.div key="add">
                <AddExpenseTab onAdd={addExpense} currency={currency} />
              </motion.div>
            )}
            {activeTab === "list" && (
              <motion.div key="list">
                <ExpenseListTab expenses={expenses} currency={currency} />
              </motion.div>
            )}
            {activeTab === "settlements" && (
              <motion.div key="settlements">
                <SettlementsTab
                  expenses={expenses}
                  currency={currency}
                  onReset={handleReset}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card py-4">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-xs text-muted-foreground font-body">
            © {new Date().getFullYear()}.{" "}
            <a
              href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-teal transition-colors"
            >
              Built with ♥ using caffeine.ai
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
