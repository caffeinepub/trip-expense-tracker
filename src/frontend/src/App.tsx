import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Image,
  LayoutDashboard,
  ListOrdered,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  Mountain,
  Pencil,
  Plus,
  Receipt,
  RotateCcw,
  Settings,
  Share2,
  Shield,
  Trash2,
  TrendingUp,
  Upload,
  User,
  Wallet,
  X,
} from "lucide-react";
import { AnimatePresence, type Variants, motion } from "motion/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { exportToExcel, exportToPDF } from "./exportUtils";
import { useActor } from "./hooks/useActor";

// ── Types ──────────────────────────────────────────────────────────────────────

type Member = string;
const DEFAULT_MEMBERS: Member[] = ["Manoj", "Ramesh", "Abhijit", "Pradeep"];
const DEFAULT_PLACES: string[] = [
  "Bangkok",
  "Phu Quoc",
  "Phuket",
  "Phi Phi Island",
];

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

// ── Settlement Algorithm ─────────────────────────────────────────────────────
// ── Trip Context ──────────────────────────────────────────────────────────────

interface TripContextValue {
  members: Member[];
  places: string[];
}

const TripContext = createContext<TripContextValue>({
  members: DEFAULT_MEMBERS,
  places: DEFAULT_PLACES,
});

function useTripContext() {
  return useContext(TripContext);
}

// ── Avatar Helpers ─────────────────────────────────────────────────────────────

const MEMBER_COLOR_POOL = [
  "bg-blue-600",
  "bg-teal-600",
  "bg-indigo-600",
  "bg-cyan-600",
  "bg-purple-600",
  "bg-orange-600",
  "bg-rose-600",
  "bg-emerald-600",
];

function getMemberColor(members: Member[], member: Member): string {
  const idx = members.indexOf(member);
  return MEMBER_COLOR_POOL[(idx >= 0 ? idx : 0) % MEMBER_COLOR_POOL.length];
}

function getMemberInitials(member: Member): string {
  const parts = member.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return member.slice(0, 2).toUpperCase();
}

interface Settlement {
  from: Member;
  to: Member;
  amount: number;
}

function computeBalances(
  expenses: Expense[],
  members: Member[],
): Record<Member, number> {
  const balances: Record<Member, number> = {};
  for (const m of members) balances[m] = 0;

  for (const expense of expenses) {
    const share = expense.amount / (members.length || 1);
    // Payer gets credit for others' shares
    if (balances[expense.paidBy] !== undefined) {
      balances[expense.paidBy] += expense.amount - share;
    }
    // Everyone else owes their share
    for (const member of members) {
      if (member !== expense.paidBy) {
        balances[member] -= share;
      }
    }
  }

  return balances;
}

function simplifyDebts(
  balances: Record<Member, number>,
  members: Member[],
): Settlement[] {
  const settlements: Settlement[] = [];

  // Work with copies as mutable arrays
  const creditors: { member: Member; amount: number }[] = [];
  const debtors: { member: Member; amount: number }[] = [];

  for (const member of members) {
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

// ── Export Button ──────────────────────────────────────────────────────────────

function ExportButton({
  expenses,
  settlements,
  currency,
}: {
  expenses: Expense[];
  settlements: Settlement[];
  currency: Currency;
}) {
  function handleExportPDF() {
    try {
      exportToPDF(expenses, settlements, currency, formatCurrency);
      toast.success("PDF exported!", {
        description: "trip-expenses.pdf has been downloaded.",
      });
    } catch {
      toast.error("Failed to export PDF. Please try again.");
    }
  }

  function handleExportExcel() {
    try {
      exportToExcel(expenses, settlements, currency, formatCurrency);
      toast.success("Excel exported!", {
        description: "trip-expenses.xlsx has been downloaded.",
      });
    } catch {
      toast.error("Failed to export Excel. Please try again.");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="w-full font-body border-navy/30 text-navy hover:bg-navy hover:text-white"
        >
          <Download className="h-4 w-4 mr-2" />
          Export Data
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-48">
        <DropdownMenuItem
          className="font-body cursor-pointer"
          onClick={handleExportPDF}
        >
          <FileText className="h-4 w-4 mr-2 text-red-500" />
          Export as PDF
        </DropdownMenuItem>
        <DropdownMenuItem
          className="font-body cursor-pointer"
          onClick={handleExportExcel}
        >
          <FileSpreadsheet className="h-4 w-4 mr-2 text-green-600" />
          Export as Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
  const { members } = useTripContext();
  const sizeClass =
    size === "lg"
      ? "h-12 w-12 text-sm"
      : size === "md"
        ? "h-9 w-9 text-xs"
        : "h-7 w-7 text-xs";
  const colorClass = getMemberColor(members, member);
  const initials = getMemberInitials(member);
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-display font-bold text-white ${colorClass} ${sizeClass}`}
    >
      {initials}
    </span>
  );
}

// ── Loading Skeleton ───────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-44 rounded-xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-6 w-32" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

// ── Dashboard Tab ──────────────────────────────────────────────────────────────

function DashboardTab({
  expenses,
  currency,
  onReset,
  isResetting,
}: {
  expenses: Expense[];
  currency: Currency;
  onReset: () => void;
  isResetting?: boolean;
}) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const { members } = useTripContext();
  const totalSpend = expenses.reduce((sum, e) => sum + e.amount, 0);
  const perPerson = totalSpend / (members.length || 1);
  const balances = computeBalances(expenses, members);
  const settlements = simplifyDebts(balances, members);

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
              <p className="text-sm opacity-60 mt-1 font-body">
                {members.length} members
              </p>
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
            {members.map((m) => (
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
          {members.map((member) => {
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

      {/* Export Data */}
      <motion.div variants={itemVariants}>
        <div className="pt-2">
          <ExportButton
            expenses={expenses}
            settlements={settlements}
            currency={currency}
          />
        </div>
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
                  disabled={isResetting}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1 font-body"
                  onClick={() => {
                    onReset();
                    setShowResetConfirm(false);
                  }}
                  disabled={isResetting}
                >
                  {isResetting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  {isResetting ? "Resetting..." : "Yes, Reset"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Predefined Options ─────────────────────────────────────────────────────────

const DESCRIPTION_OPTIONS = [
  "Food",
  "Travel",
  "Drinks",
  "Cab",
  "Hotel",
  "Others",
];
// PLACE_OPTIONS now comes from TripContext

// ── Persistent last-used values ────────────────────────────────────────────────

let lastDescription = "";
let lastLocation = "";

// ── Add Expense Tab ────────────────────────────────────────────────────────────

function AddExpenseTab({
  onAdd,
  currency,
  isAdding,
}: {
  onAdd: (
    date: string,
    description: string,
    location: string,
    amount: number,
    paidBy: Member,
  ) => Promise<void>;
  currency: Currency;
  isAdding?: boolean;
}) {
  const { members, places } = useTripContext();
  const today = new Date().toISOString().split("T")[0];
  const currencyInfo = CURRENCIES.find((c) => c.value === currency)!;

  const [description, setDescription] = useState(lastDescription);
  const [location, setLocation] = useState(lastLocation);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [paidBy, setPaidBy] = useState<Member | "">("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const parsedAmount = Number.parseFloat(amount) || 0;
  const perPerson = parsedAmount / (members.length || 1);

  function validate() {
    const e: Record<string, string> = {};
    if (!amount || parsedAmount <= 0) e.amount = "Enter a valid amount";
    if (!date) e.date = "Date is required";
    if (!paidBy) e.paidBy = "Select who paid";
    return e;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    // Remember last used values
    lastDescription = description;
    lastLocation = location;

    try {
      await onAdd(date, description, location, parsedAmount, paidBy as Member);
      // Only reset the form after the backend confirms the save
      setAmount("");
      setDate(today);
      setPaidBy("");
      setErrors({});
      // Keep description and location as-is (remembered for next entry)
    } catch {
      // Error toast is handled in addMutation.onError — nothing to do here
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <div className="max-w-lg mx-auto">
        <Card className="shadow-card-md">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-teal flex items-center justify-center shrink-0">
                <Plus className="h-4 w-4 text-white" />
              </div>
              <div>
                <CardTitle className="font-display text-base">
                  Add New Expense
                </CardTitle>
                <p className="text-xs text-muted-foreground font-body">
                  Split equally among all {members.length} members
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Description + Location row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="font-body text-xs font-medium flex items-center gap-1">
                    <FileText className="h-3 w-3 text-muted-foreground" />
                    Category
                    <span className="text-muted-foreground font-normal">
                      (opt)
                    </span>
                  </Label>
                  <Select
                    value={description}
                    onValueChange={(v) => setDescription(v)}
                  >
                    <SelectTrigger className="font-body h-9 text-sm">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {DESCRIPTION_OPTIONS.map((opt) => (
                        <SelectItem key={opt} value={opt} className="font-body">
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="font-body text-xs font-medium flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-muted-foreground" />
                    Place
                    <span className="text-muted-foreground font-normal">
                      (opt)
                    </span>
                  </Label>
                  <Select
                    value={location}
                    onValueChange={(v) => setLocation(v)}
                  >
                    <SelectTrigger className="font-body h-9 text-sm">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {places.map((opt) => (
                        <SelectItem key={opt} value={opt} className="font-body">
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Amount + Date row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="amount"
                    className="font-body text-xs font-medium"
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
                      className={`pl-7 font-mono h-9 ${errors.amount ? "border-destructive" : ""}`}
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
                    className="font-body text-xs font-medium flex items-center gap-1"
                  >
                    <Calendar className="h-3 w-3 text-muted-foreground" />
                    Date
                  </Label>
                  <Input
                    id="date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={`font-body h-9 ${errors.date ? "border-destructive" : ""}`}
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
                <Label className="font-body text-xs font-medium flex items-center gap-1">
                  <User className="h-3 w-3 text-muted-foreground" />
                  Paid By
                </Label>
                <Select
                  value={paidBy}
                  onValueChange={(v) => setPaidBy(v as Member)}
                >
                  <SelectTrigger
                    className={`font-body h-9 ${errors.paidBy ? "border-destructive" : ""}`}
                  >
                    <SelectValue placeholder="Select who paid" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
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
                    <div className="rounded-lg bg-teal-light border border-teal/20 p-3">
                      <p className="text-xs font-body font-medium text-accent-foreground mb-2 flex items-center gap-1.5">
                        <Receipt className="h-3 w-3" />
                        Split Preview
                      </p>
                      <div className="grid grid-cols-4 gap-2">
                        {members.map((m) => (
                          <div key={m} className="text-center">
                            <MemberAvatar member={m} size="sm" />
                            <p className="text-xs font-body text-accent-foreground mt-1">
                              {m}
                            </p>
                            <p className="font-display font-bold text-xs text-accent-foreground amount-neutral">
                              {formatCurrency(perPerson, currency)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <Button
                type="submit"
                disabled={isAdding}
                className="w-full font-display font-semibold bg-navy hover:bg-navy-light text-white"
              >
                {isAdding ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                {isAdding ? "Adding..." : "Add Expense"}
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
  const { members } = useTripContext();
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const perPersonTotal = total / (members.length || 1);

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
                          {formatCurrency(
                            expense.amount / (members.length || 1),
                            currency,
                          )}
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
                        {formatCurrency(
                          expense.amount / (members.length || 1),
                          currency,
                        )}
                        /person
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
  isResetting,
}: {
  expenses: Expense[];
  currency: Currency;
  onReset: () => void;
  isResetting?: boolean;
}) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const { members } = useTripContext();
  const balances = computeBalances(expenses, members);
  const settlements = simplifyDebts(balances, members);

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
          {members.map((member) => {
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
            {members.map((member) => {
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

      {/* Export Data */}
      <div className="pt-2">
        <ExportButton
          expenses={expenses}
          settlements={settlements}
          currency={currency}
        />
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
                disabled={isResetting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1 font-body"
                onClick={() => {
                  onReset();
                  setShowResetConfirm(false);
                }}
                disabled={isResetting}
              >
                {isResetting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                {isResetting ? "Resetting..." : "Yes, Reset"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Settings Modal ────────────────────────────────────────────────────────────

function SettingsModal({
  open,
  onClose,
  initialMembers,
  initialPlaces,
  onSave,
  tripCode,
  onChangeTrip,
}: {
  open: boolean;
  onClose: () => void;
  initialMembers: string[];
  initialPlaces: string[];
  onSave: (members: string[], places: string[]) => void;
  tripCode: string;
  onChangeTrip: () => void;
}) {
  type EditItem = { id: number; value: string };
  const [editMembers, setEditMembers] = useState<EditItem[]>([]);
  const [editPlaces, setEditPlaces] = useState<EditItem[]>([]);
  const idRef = useRef(0);
  const nextId = useCallback(() => ++idRef.current, []);

  // Sync from props when opening
  useEffect(() => {
    if (open) {
      setEditMembers(initialMembers.map((v) => ({ id: nextId(), value: v })));
      setEditPlaces(initialPlaces.map((v) => ({ id: nextId(), value: v })));
    }
  }, [open, initialMembers, initialPlaces, nextId]);

  function handleSave() {
    const cleanMembers = editMembers.map((m) => m.value.trim()).filter(Boolean);
    const cleanPlaces = editPlaces.map((p) => p.value.trim()).filter(Boolean);
    if (cleanMembers.length === 0) {
      toast.error("At least one member is required.");
      return;
    }
    if (cleanPlaces.length === 0) {
      toast.error("At least one place is required.");
      return;
    }
    onSave(cleanMembers, cleanPlaces);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent
        className="max-w-md max-h-[85vh] overflow-y-auto"
        data-ocid="settings.modal"
      >
        <DialogHeader>
          <DialogTitle className="font-display text-base flex items-center gap-2">
            <Settings className="h-4 w-4 text-teal" />
            Trip Settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Trip Code Section */}
          <div className="rounded-lg bg-muted/50 border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-body text-muted-foreground uppercase tracking-wide">
                  Current Trip Code
                </p>
                <p className="font-mono font-bold text-lg text-foreground tracking-widest mt-0.5">
                  {tripCode}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="font-body text-xs border-destructive/40 text-destructive hover:bg-destructive hover:text-white"
                onClick={() => {
                  onClose();
                  onChangeTrip();
                }}
                data-ocid="settings.change_trip.button"
              >
                <LogOut className="h-3.5 w-3.5 mr-1" />
                Change Trip
              </Button>
            </div>
            <p className="text-xs text-muted-foreground font-body">
              Share this code with your group to sync expenses
            </p>
          </div>

          <Separator />

          {/* Members Section */}
          <div>
            <h3 className="font-display font-semibold text-sm text-foreground mb-3 flex items-center gap-1.5">
              <User className="h-4 w-4 text-muted-foreground" />
              Members ({editMembers.length})
            </h3>
            <div className="space-y-2">
              {editMembers.map((member, i) => (
                <div key={member.id} className="flex items-center gap-2">
                  <Input
                    value={member.value}
                    onChange={(e) => {
                      const updated = editMembers.map((m) =>
                        m.id === member.id
                          ? { ...m, value: e.target.value }
                          : m,
                      );
                      setEditMembers(updated);
                    }}
                    placeholder="Member name"
                    className="font-body text-sm h-9"
                    data-ocid={`settings.member.input.${i + 1}`}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 text-destructive hover:bg-destructive/10 shrink-0"
                    disabled={editMembers.length <= 1}
                    onClick={() =>
                      setEditMembers(
                        editMembers.filter((m) => m.id !== member.id),
                      )
                    }
                    data-ocid={`settings.member.delete_button.${i + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 font-body text-xs border-dashed w-full"
              onClick={() =>
                setEditMembers([...editMembers, { id: nextId(), value: "" }])
              }
              data-ocid="settings.add_member.button"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Member
            </Button>
          </div>

          <Separator />

          {/* Places Section */}
          <div>
            <h3 className="font-display font-semibold text-sm text-foreground mb-3 flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              Places ({editPlaces.length})
            </h3>
            <div className="space-y-2">
              {editPlaces.map((place, i) => (
                <div key={place.id} className="flex items-center gap-2">
                  <Input
                    value={place.value}
                    onChange={(e) => {
                      const updated = editPlaces.map((p) =>
                        p.id === place.id ? { ...p, value: e.target.value } : p,
                      );
                      setEditPlaces(updated);
                    }}
                    placeholder="Place name"
                    className="font-body text-sm h-9"
                    data-ocid={`settings.place.input.${i + 1}`}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 text-destructive hover:bg-destructive/10 shrink-0"
                    disabled={editPlaces.length <= 1}
                    onClick={() =>
                      setEditPlaces(editPlaces.filter((p) => p.id !== place.id))
                    }
                    data-ocid={`settings.place.delete_button.${i + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 font-body text-xs border-dashed w-full"
              onClick={() =>
                setEditPlaces([...editPlaces, { id: nextId(), value: "" }])
              }
              data-ocid="settings.add_place.button"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Place
            </Button>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            className="font-body"
            onClick={onClose}
            data-ocid="settings.cancel_button"
          >
            Cancel
          </Button>
          <Button
            className="font-body bg-navy hover:bg-navy-light text-white"
            onClick={handleSave}
            data-ocid="settings.save_button"
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Trip Code Screen ──────────────────────────────────────────────────────────

function TripCodeScreen({ onEnter }: { onEnter: (code: string) => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError("Please enter a trip code");
      return;
    }
    if (trimmed.length < 3) {
      setError("Trip code must be at least 3 characters");
      return;
    }
    onEnter(trimmed);
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="w-full max-w-sm"
      >
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex h-16 w-16 rounded-2xl bg-navy items-center justify-center mb-4 shadow-card-md">
            <Wallet className="h-8 w-8 text-white" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground tracking-tight">
            TRIP EXPENSES
          </h1>
          <p className="text-sm text-muted-foreground font-body mt-1">
            Track & split trip expenses with your group
          </p>
        </div>

        {/* Trip Code Card */}
        <Card className="shadow-card-md">
          <CardContent className="p-6 space-y-5">
            <div className="text-center">
              <div className="inline-flex h-10 w-10 rounded-full bg-teal/10 items-center justify-center mb-3">
                <Shield className="h-5 w-5 text-teal" />
              </div>
              <h2 className="font-display font-semibold text-base text-foreground">
                Enter Your Trip Code
              </h2>
              <p className="text-xs text-muted-foreground font-body mt-1">
                Everyone with the same code shares expenses
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Input
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    setError("");
                  }}
                  placeholder="Enter Trip Code (e.g. THAILAND2026)"
                  className="font-body text-sm h-11 text-center tracking-widest uppercase"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  data-ocid="tripcode.input"
                />
                {error && (
                  <p
                    className="text-xs text-destructive font-body text-center"
                    data-ocid="tripcode.error_state"
                  >
                    {error}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full font-display font-semibold bg-navy hover:bg-navy-light text-white h-11"
                data-ocid="tripcode.submit_button"
              >
                <ArrowRight className="h-4 w-4 mr-2" />
                Join Trip
              </Button>
            </form>

            <p className="text-center text-xs text-muted-foreground font-body">
              💡 Share this code with your group to sync expenses
            </p>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground font-body mt-6">
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
      </motion.div>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────────

export default function App() {
  const [tripCode, setTripCode] = useState<string>(() => {
    try {
      return localStorage.getItem("tripCode") || "";
    } catch {
      return "";
    }
  });
  const { actor, isFetching: isActorFetching } = useActor();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [currency, setCurrency] = useState<Currency>("INR");
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Dynamic members and places (localStorage-backed)
  const [members, setMembers] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("trip_members");
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) && parsed.length > 0
        ? parsed
        : DEFAULT_MEMBERS;
    } catch {
      return DEFAULT_MEMBERS;
    }
  });
  const [places, setPlaces] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("trip_places");
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) && parsed.length > 0
        ? parsed
        : DEFAULT_PLACES;
    } catch {
      return DEFAULT_PLACES;
    }
  });

  function handleSettingsSave(newMembers: string[], newPlaces: string[]) {
    setMembers(newMembers);
    setPlaces(newPlaces);
    try {
      localStorage.setItem("trip_members", JSON.stringify(newMembers));
      localStorage.setItem("trip_places", JSON.stringify(newPlaces));
    } catch {}
    toast.success("Settings saved!");
  }

  // ── Fetch expenses from backend ────────────────────────────────────────────
  // ── Offline cache helpers ──────────────────────────────────────────────────
  const CACHE_KEY = `trip_expenses_cache_${tripCode.toLowerCase()}`;

  function loadCachedExpenses() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : undefined;
    } catch {
      return undefined;
    }
  }

  function saveCachedExpenses(data: unknown) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch {}
  }

  const { data: rawExpenses, isLoading: isLoadingExpenses } = useQuery({
    queryKey: ["expenses", tripCode],
    queryFn: async () => {
      if (!actor) return [];
      const result = await actor.getExpenses(tripCode);
      saveCachedExpenses(result);
      return result;
    },
    enabled: !!actor && !isActorFetching,
    initialData: loadCachedExpenses,
    staleTime: 0,
    gcTime: 5 * 60_000, // Keep in memory for 5 minutes
    refetchOnWindowFocus: true,
    refetchInterval: 10_000, // Poll every 10s for real-time sync
  });

  // Map backend Expense (bigint id) → local Expense (string id)
  const expenses: Expense[] = (rawExpenses ?? []).map((e) => ({
    id: e.id.toString(),
    date: e.date,
    description: e.description,
    location: e.place,
    amount: e.amount,
    paidBy: e.paidBy as Member,
  }));

  // ── Add expense mutation ───────────────────────────────────────────────────
  const addMutation = useMutation({
    mutationFn: async ({
      date,
      description,
      location,
      amount,
      paidBy,
    }: {
      date: string;
      description: string;
      location: string;
      amount: number;
      paidBy: Member;
    }) => {
      if (!actor) throw new Error("Not connected");
      return actor.addExpense(
        tripCode,
        description,
        amount,
        paidBy,
        date,
        location,
        currency,
      );
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Expense added successfully!", {
        description: `${variables.description || "Expense"} — ${formatCurrency(variables.amount, currency)} split among ${members.length} members`,
      });
      setActiveTab("list");
    },
    onError: () => {
      toast.error("Failed to save expense. Please try again.");
    },
  });

  // ── Reset expenses mutation ────────────────────────────────────────────────
  const resetMutation = useMutation({
    mutationFn: async () => {
      if (!actor) throw new Error("Not connected");
      return actor.resetExpenses(tripCode);
    },
    onSuccess: () => {
      try {
        localStorage.removeItem(
          `trip_expenses_cache_${tripCode.toLowerCase()}`,
        );
      } catch {}
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("All expenses cleared. Starting fresh!");
    },
    onError: () => {
      toast.error("Failed to reset expenses. Please try again.");
    },
  });

  // ── Share handler ──────────────────────────────────────────────────────────
  async function handleShare() {
    const shareData = {
      title: "Trip Expense Tracker",
      text: "Track and split trip expenses among friends easily!",
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // User cancelled share
      }
    } else {
      try {
        await navigator.clipboard.writeText(window.location.href);
        toast.success("App link copied to clipboard!");
      } catch {
        toast.error("Could not share. Copy the URL from your browser.");
      }
    }
  }

  // ── Show trip code entry if no code set ──────────────────────────────────
  if (!tripCode) {
    return (
      <>
        <Toaster position="top-right" />
        <TripCodeScreen
          onEnter={(code) => {
            try {
              localStorage.setItem("tripCode", code);
            } catch {}
            setTripCode(code);
          }}
        />
      </>
    );
  }

  const isLoadingData = isActorFetching || isLoadingExpenses;

  return (
    <TripContext.Provider value={{ members, places }}>
      <div className="min-h-screen bg-background flex flex-col">
        <Toaster position="top-right" />

        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          initialMembers={members}
          initialPlaces={places}
          onSave={handleSettingsSave}
          tripCode={tripCode}
          onChangeTrip={() => {
            try {
              localStorage.removeItem("tripCode");
            } catch {}
            setTripCode("");
          }}
        />

        {/* App Header */}
        <header className="bg-navy text-white sticky top-0 z-40 shadow-md">
          <div className="max-w-5xl mx-auto px-4">
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
                {/* Trip code indicator */}
                <div className="hidden sm:flex items-center gap-1 text-white/60 text-xs font-body">
                  <div className="h-1.5 w-1.5 rounded-full bg-teal animate-pulse" />
                  <span className="hidden md:inline font-mono tracking-wider">
                    {tripCode}
                  </span>
                </div>

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

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-white hover:bg-white/10 hover:text-white"
                  onClick={() => setSettingsOpen(true)}
                  title="Settings"
                  data-ocid="settings.open_modal_button"
                >
                  <Settings className="h-4 w-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-white hover:bg-white/10 hover:text-white"
                  onClick={handleShare}
                  title="Share app"
                >
                  <Share2 className="h-4 w-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-white/70 hover:bg-white/10 hover:text-white font-body text-xs gap-1"
                  onClick={() => {
                    try {
                      localStorage.removeItem("tripCode");
                    } catch {}
                    setTripCode("");
                  }}
                  title="Change Trip"
                  data-ocid="header.change_trip.button"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Change Trip</span>
                </Button>

                <div className="hidden sm:flex items-center gap-1">
                  {members.map((m) => (
                    <MemberAvatar key={m} member={m} size="sm" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Tab Navigation */}
        <nav className="bg-card border-b border-border sticky top-14 z-30 shadow-xs">
          <div className="max-w-5xl mx-auto px-4">
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
          <div className="max-w-5xl mx-auto px-4 py-6">
            {isLoadingData ? (
              <DashboardSkeleton />
            ) : (
              <AnimatePresence mode="wait">
                {activeTab === "dashboard" && (
                  <motion.div key="dashboard">
                    <DashboardTab
                      expenses={expenses}
                      currency={currency}
                      onReset={() => resetMutation.mutate()}
                      isResetting={resetMutation.isPending}
                    />
                  </motion.div>
                )}
                {activeTab === "add" && (
                  <motion.div key="add">
                    <AddExpenseTab
                      onAdd={(date, description, location, amount, paidBy) =>
                        addMutation
                          .mutateAsync({
                            date,
                            description,
                            location,
                            amount,
                            paidBy,
                          })
                          .then(() => {})
                      }
                      currency={currency}
                      isAdding={addMutation.isPending}
                    />
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
                      onReset={() => resetMutation.mutate()}
                      isResetting={resetMutation.isPending}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-border bg-card py-4">
          <div className="max-w-5xl mx-auto px-4 text-center">
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
    </TripContext.Provider>
  );
}
