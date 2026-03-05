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
  Camera,
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
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { exportToExcel, exportToPDF } from "./exportUtils";
import { useActor } from "./hooks/useActor";
import { useInternetIdentity } from "./hooks/useInternetIdentity";

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

interface ItineraryEntry {
  id: string;
  date: string;
  activity: string;
  time: string;
  hotelName: string;
  hotelLocation: string;
  details: string;
  photoUrls?: string[];
}

const ITINERARY_STORAGE_KEY = "trip-itinerary";

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

type Tab = "dashboard" | "add" | "list" | "settlements" | "itinerary";

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
  {
    id: "itinerary",
    label: "Itinerary",
    icon: <Camera className="h-4 w-4" />,
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

// ── Photo Upload Utilities ─────────────────────────────────────────────────────

const MAX_PHOTO_SIZE_MB = 10;

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface UploadingPhoto {
  id: string;
  name: string;
  progress: number;
  error?: string;
  url?: string;
}

// ── Plan Itinerary Dialog ──────────────────────────────────────────────────────

function PlanItineraryDialog({
  onAdd,
  children,
  editEntry,
  onEdit,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  onAdd?: (entry: ItineraryEntry) => void;
  children?: React.ReactNode;
  editEntry?: ItineraryEntry;
  onEdit?: (entry: ItineraryEntry) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const isEditMode = !!editEntry;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;

  const [date, setDate] = useState(editEntry?.date ?? today);
  const [activity, setActivity] = useState(editEntry?.activity ?? "");
  const [time, setTime] = useState(editEntry?.time ?? "");
  const [hotelName, setHotelName] = useState(editEntry?.hotelName ?? "");
  const [hotelLocation, setHotelLocation] = useState(
    editEntry?.hotelLocation ?? "",
  );
  const [details, setDetails] = useState(editEntry?.details ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Photo state
  const [existingPhotos, setExistingPhotos] = useState<string[]>(
    editEntry?.photoUrls ?? [],
  );
  const [uploadingPhotos, setUploadingPhotos] = useState<UploadingPhoto[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync fields when editEntry changes (dialog reopened for a different entry)
  useEffect(() => {
    if (editEntry) {
      setDate(editEntry.date);
      setActivity(editEntry.activity);
      setTime(editEntry.time);
      setHotelName(editEntry.hotelName);
      setHotelLocation(editEntry.hotelLocation);
      setDetails(editEntry.details);
      setExistingPhotos(editEntry.photoUrls ?? []);
    }
  }, [editEntry]);

  async function handlePhotoFiles(files: FileList) {
    const validFiles = Array.from(files).filter((file) => {
      if (file.size > MAX_PHOTO_SIZE_MB * 1024 * 1024) {
        toast.warning(`${file.name} is over 10MB and was skipped.`);
        return false;
      }
      return true;
    });

    for (const file of validFiles) {
      const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setUploadingPhotos((prev) => [
        ...prev,
        { id: uploadId, name: file.name, progress: 0 },
      ]);

      try {
        // Simulate progress in steps while we do base64 conversion
        setUploadingPhotos((prev) =>
          prev.map((p) => (p.id === uploadId ? { ...p, progress: 30 } : p)),
        );
        const dataUrl = await fileToBase64(file);
        setUploadingPhotos((prev) =>
          prev.map((p) => (p.id === uploadId ? { ...p, progress: 80 } : p)),
        );
        // Small delay to show progress
        await new Promise((r) => setTimeout(r, 150));
        setUploadingPhotos((prev) =>
          prev.map((p) =>
            p.id === uploadId ? { ...p, progress: 100, url: dataUrl } : p,
          ),
        );
        // Move to confirmed after short delay
        await new Promise((r) => setTimeout(r, 300));
        setExistingPhotos((prev) => [...prev, dataUrl]);
        setUploadingPhotos((prev) => prev.filter((p) => p.id !== uploadId));
      } catch {
        setUploadingPhotos((prev) =>
          prev.map((p) =>
            p.id === uploadId
              ? { ...p, progress: 0, error: "Upload failed" }
              : p,
          ),
        );
        toast.error(`Failed to upload ${file.name}`);
        await new Promise((r) => setTimeout(r, 1500));
        setUploadingPhotos((prev) => prev.filter((p) => p.id !== uploadId));
      }
    }
  }

  function handleDropZone(e: React.DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      handlePhotoFiles(e.dataTransfer.files);
    }
  }

  function handleSave() {
    const e: Record<string, string> = {};
    if (!activity.trim()) e.activity = "Activity is required";
    if (!date) e.date = "Date is required";
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    const entry: ItineraryEntry = {
      id:
        editEntry?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      date,
      activity: activity.trim(),
      time,
      hotelName: hotelName.trim(),
      hotelLocation: hotelLocation.trim(),
      details: details.trim(),
      photoUrls: existingPhotos,
    };

    if (isEditMode && onEdit) {
      onEdit(entry);
      toast.success("Itinerary entry updated!", {
        description: `${entry.activity} on ${formatDateDisplay(date)}`,
      });
    } else if (onAdd) {
      onAdd(entry);
      toast.success("Itinerary entry added!", {
        description: `${activity} on ${formatDateDisplay(date)}`,
      });
      // Reset form only for add mode
      setActivity("");
      setTime("");
      setHotelName("");
      setHotelLocation("");
      setDetails("");
      setExistingPhotos([]);
    }
    setErrors({});
    setOpen(false);
  }

  const isUploading = uploadingPhotos.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <MapPin className="h-4 w-4 text-teal" />
            {isEditMode ? "Edit Itinerary Entry" : "Plan Itinerary"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Date + Time row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="font-body text-xs font-medium flex items-center gap-1">
                <Calendar className="h-3 w-3 text-muted-foreground" />
                Date *
              </Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`font-body h-9 ${errors.date ? "border-destructive" : ""}`}
                data-ocid="itinerary.dialog.date.input"
              />
              {errors.date && (
                <p className="text-xs text-destructive">{errors.date}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="font-body text-xs font-medium flex items-center gap-1">
                <Clock className="h-3 w-3 text-muted-foreground" />
                Time
                <span className="text-muted-foreground">(opt)</span>
              </Label>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="font-body h-9"
                data-ocid="itinerary.dialog.time.input"
              />
            </div>
          </div>

          {/* Activity */}
          <div className="space-y-1.5">
            <Label className="font-body text-xs font-medium">Activity *</Label>
            <Input
              type="text"
              placeholder="e.g. Visit Grand Palace, Boat Tour..."
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              className={`font-body h-9 ${errors.activity ? "border-destructive" : ""}`}
              data-ocid="itinerary.dialog.activity.input"
            />
            {errors.activity && (
              <p className="text-xs text-destructive">{errors.activity}</p>
            )}
          </div>

          {/* Hotel Name */}
          <div className="space-y-1.5">
            <Label className="font-body text-xs font-medium flex items-center gap-1">
              Hotel Name
              <span className="text-muted-foreground font-normal">(opt)</span>
            </Label>
            <Input
              type="text"
              placeholder="e.g. Marriott Bangkok"
              value={hotelName}
              onChange={(e) => setHotelName(e.target.value)}
              className="font-body h-9"
              data-ocid="itinerary.dialog.hotel_name.input"
            />
          </div>

          {/* Hotel Location */}
          <div className="space-y-1.5">
            <Label className="font-body text-xs font-medium flex items-center gap-1">
              <MapPin className="h-3 w-3 text-muted-foreground" />
              Hotel Location
              <span className="text-muted-foreground font-normal">(opt)</span>
            </Label>
            <Input
              type="text"
              placeholder="Address or landmark — opens in Google Maps"
              value={hotelLocation}
              onChange={(e) => setHotelLocation(e.target.value)}
              className="font-body h-9"
              data-ocid="itinerary.dialog.hotel_location.input"
            />
            {hotelLocation && (
              <p className="text-xs text-muted-foreground font-body">
                Will open in Google Maps
              </p>
            )}
          </div>

          {/* Details */}
          <div className="space-y-1.5">
            <Label className="font-body text-xs font-medium flex items-center gap-1">
              Notes / Details
              <span className="text-muted-foreground font-normal">(opt)</span>
            </Label>
            <Textarea
              placeholder="Meeting point, dress code, what to bring, bookings..."
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className="font-body text-sm resize-none"
              rows={3}
              data-ocid="itinerary.dialog.details.textarea"
            />
          </div>

          {/* Photo Upload Section */}
          <div className="space-y-2">
            <Label className="font-body text-xs font-medium flex items-center gap-1">
              <Camera className="h-3 w-3 text-muted-foreground" />
              Add Photos
              <span className="text-muted-foreground font-normal">(opt)</span>
            </Label>

            {/* Existing photos thumbnails */}
            {existingPhotos.length > 0 && (
              <div className="grid grid-cols-4 gap-1.5">
                {existingPhotos.map((url, idx) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: stable key for thumbnails
                    key={idx}
                    className="relative aspect-square rounded-md overflow-hidden border border-border group"
                  >
                    <img
                      src={url}
                      alt={`Trip ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setExistingPhotos((prev) =>
                          prev.filter((_, i) => i !== idx),
                        )
                      }
                      className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove photo"
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload progress indicators */}
            {uploadingPhotos.map((up) => (
              <div
                key={up.id}
                className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin text-teal shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-body truncate">{up.name}</p>
                  <Progress value={up.progress} className="h-1 mt-1" />
                </div>
                <span className="text-xs text-muted-foreground font-body shrink-0">
                  {up.progress}%
                </span>
              </div>
            ))}

            {/* Drop zone */}
            <button
              type="button"
              className="w-full border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-teal/60 hover:bg-teal-light/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDropZone}
              onClick={() => fileInputRef.current?.click()}
              data-ocid="itinerary.dialog.dropzone"
            >
              <Upload className="h-5 w-5 text-muted-foreground mx-auto mb-1.5" />
              <p className="text-xs font-body text-muted-foreground">
                Tap to select images or drag & drop
              </p>
              <p className="text-xs text-muted-foreground/60 font-body mt-0.5">
                Max 10MB per image
              </p>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  handlePhotoFiles(e.target.files);
                  e.target.value = "";
                }
              }}
              data-ocid="itinerary.dialog.upload_button"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            className="font-body"
            data-ocid="itinerary.dialog.cancel_button"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isUploading}
            className="font-display font-semibold bg-navy hover:bg-navy-light text-white"
            data-ocid="itinerary.dialog.save_button"
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : isEditMode ? (
              <Pencil className="h-4 w-4 mr-1.5" />
            ) : (
              <Plus className="h-4 w-4 mr-1.5" />
            )}
            {isUploading
              ? "Uploading..."
              : isEditMode
                ? "Save Changes"
                : "Add to Itinerary"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Itinerary Panel ────────────────────────────────────────────────────────────

function ItineraryPanel({
  entries,
  onAdd,
  onDelete,
  onEdit,
}: {
  entries: ItineraryEntry[];
  onAdd: (entry: ItineraryEntry) => void;
  onDelete: (id: string) => void;
  onEdit: (entry: ItineraryEntry) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [editingEntry, setEditingEntry] = useState<ItineraryEntry | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Group entries by date, sorted ascending
  const grouped = entries.reduce<Record<string, ItineraryEntry[]>>(
    (acc, entry) => {
      if (!acc[entry.date]) acc[entry.date] = [];
      acc[entry.date].push(entry);
      return acc;
    },
    {},
  );

  const sortedDates = Object.keys(grouped).sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime(),
  );

  function handleEditClick(entry: ItineraryEntry) {
    setEditingEntry(entry);
    setEditDialogOpen(true);
  }

  return (
    <Card className="shadow-card border border-border flex flex-col">
      {/* Edit dialog (controlled, no trigger child) */}
      {editingEntry && (
        <PlanItineraryDialog
          editEntry={editingEntry}
          onEdit={onEdit}
          open={editDialogOpen}
          onOpenChange={(o) => {
            setEditDialogOpen(o);
            if (!o) setEditingEntry(null);
          }}
        />
      )}

      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors rounded-t-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-navy flex items-center justify-center shrink-0">
                <Calendar className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="font-display font-bold text-sm text-foreground">
                Itinerary
              </span>
              {entries.length > 0 && (
                <Badge
                  variant="secondary"
                  className="font-body text-xs h-5 px-1.5"
                >
                  {entries.length}
                </Badge>
              )}
            </div>
            {isOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <Separator />
          <div className="max-h-[380px] overflow-y-auto overscroll-contain px-3 py-2 space-y-3">
            {entries.length === 0 ? (
              <div className="py-6 text-center">
                <MapPin className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                <p className="text-xs font-body text-muted-foreground">
                  No itinerary yet.
                </p>
                <p className="text-xs font-body text-muted-foreground">
                  Plan your trip!
                </p>
              </div>
            ) : (
              sortedDates.map((date) => (
                <div key={date}>
                  <p className="text-xs font-display font-bold text-navy uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" />
                    {formatDateDisplay(date)}
                  </p>
                  <div className="space-y-2 pl-1">
                    {grouped[date]
                      .sort((a, b) => a.time.localeCompare(b.time))
                      .map((entry) => (
                        <div
                          key={entry.id}
                          className="rounded-lg border border-border bg-card p-2.5 space-y-1"
                        >
                          {/* Header row: time + activity + action buttons */}
                          <div className="flex items-start justify-between gap-1">
                            <div className="flex items-start gap-1.5 flex-1 min-w-0">
                              {entry.time && (
                                <span className="inline-flex items-center gap-0.5 text-xs font-body text-muted-foreground shrink-0 mt-0.5">
                                  <Clock className="h-3 w-3" />
                                  {entry.time}
                                </span>
                              )}
                              <p className="font-display font-bold text-xs text-foreground leading-tight">
                                {entry.activity}
                              </p>
                            </div>
                            {/* Edit & Delete buttons */}
                            <div className="flex items-center gap-0.5 shrink-0 ml-1">
                              <button
                                type="button"
                                onClick={() => handleEditClick(entry)}
                                className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                title="Edit entry"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  onDelete(entry.id);
                                  toast.success("Entry removed");
                                }}
                                className="h-6 w-6 flex items-center justify-center rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                                title="Delete entry"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                          {entry.hotelName && (
                            <div className="flex items-center gap-1 text-xs font-body text-muted-foreground">
                              <MapPin className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate">
                                {entry.hotelName}
                              </span>
                            </div>
                          )}
                          {entry.hotelLocation && (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(entry.hotelLocation)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-body text-teal hover:underline"
                            >
                              <MapPin className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate max-w-[140px]">
                                {entry.hotelLocation}
                              </span>
                            </a>
                          )}
                          {entry.details && (
                            <p className="text-xs font-body text-muted-foreground leading-snug">
                              {entry.details}
                            </p>
                          )}
                          {/* Photo count badge */}
                          {entry.photoUrls && entry.photoUrls.length > 0 && (
                            <div className="flex items-center gap-1">
                              <Camera className="h-2.5 w-2.5 text-muted-foreground" />
                              <span className="text-xs font-body text-muted-foreground">
                                {entry.photoUrls.length} photo
                                {entry.photoUrls.length !== 1 ? "s" : ""}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              ))
            )}
          </div>
          <Separator />
          <div className="px-3 py-2.5">
            <PlanItineraryDialog onAdd={onAdd}>
              <Button
                variant="outline"
                size="sm"
                className="w-full font-body text-xs border-navy/30 text-navy hover:bg-navy hover:text-white h-8"
                data-ocid="itinerary.panel.open_modal_button"
              >
                <MapPin className="h-3.5 w-3.5 mr-1.5" />
                Plan Itinerary
              </Button>
            </PlanItineraryDialog>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// ── Photo Lightbox ─────────────────────────────────────────────────────────────

function PhotoLightbox({
  photos,
  initialIndex,
  onClose,
}: {
  photos: string[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  const handlePrev = useCallback(() => {
    setCurrentIndex((i) => (i - 1 + photos.length) % photos.length);
  }, [photos.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex((i) => (i + 1) % photos.length);
  }, [photos.length]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "ArrowRight") handleNext();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, handlePrev, handleNext]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled via useEffect above
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
      data-ocid="itinerary.lightbox.modal"
    >
      {/* Close button */}
      <button
        type="button"
        className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors z-10"
        onClick={onClose}
        data-ocid="itinerary.lightbox.close_button"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Counter */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-sm font-body bg-black/40 px-3 py-1 rounded-full">
        {currentIndex + 1} / {photos.length}
      </div>

      {/* Image */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only */}
      <div
        className="relative max-w-[90vw] max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={photos[currentIndex]}
          alt={`Trip view ${currentIndex + 1}`}
          className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
        />
      </div>

      {/* Prev / Next */}
      {photos.length > 1 && (
        <>
          <button
            type="button"
            className="absolute left-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            data-ocid="itinerary.lightbox.pagination_prev"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            className="absolute right-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            data-ocid="itinerary.lightbox.pagination_next"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}
    </div>
  );
}

// ── Itinerary Tab ──────────────────────────────────────────────────────────────

function ItineraryTab({
  entries,
  onAdd,
  onDelete,
  onEdit,
}: {
  entries: ItineraryEntry[];
  onAdd: (entry: ItineraryEntry) => void;
  onDelete: (id: string) => void;
  onEdit: (entry: ItineraryEntry) => void;
}) {
  const [editingEntry, setEditingEntry] = useState<ItineraryEntry | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{
    photos: string[];
    index: number;
  } | null>(null);

  // Group entries by date, sorted ascending
  const grouped = entries.reduce<Record<string, ItineraryEntry[]>>(
    (acc, entry) => {
      if (!acc[entry.date]) acc[entry.date] = [];
      acc[entry.date].push(entry);
      return acc;
    },
    {},
  );

  const sortedDates = Object.keys(grouped).sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime(),
  );

  function handleEditClick(entry: ItineraryEntry) {
    setEditingEntry(entry);
    setEditDialogOpen(true);
  }

  const containerVariants: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.06 } },
  };
  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 12 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
    },
  };

  return (
    <>
      {/* Photo Lightbox overlay */}
      {lightbox && (
        <PhotoLightbox
          photos={lightbox.photos}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}

      {/* Edit dialog (controlled) */}
      {editingEntry && (
        <PlanItineraryDialog
          editEntry={editingEntry}
          onEdit={onEdit}
          open={editDialogOpen}
          onOpenChange={(o) => {
            setEditDialogOpen(o);
            if (!o) setEditingEntry(null);
          }}
        />
      )}

      {/* Add dialog (controlled) */}
      <PlanItineraryDialog
        onAdd={onAdd}
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="space-y-5"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-navy flex items-center justify-center shrink-0">
              <Camera className="h-4.5 w-4.5 text-white" />
            </div>
            <div>
              <h1 className="font-display font-bold text-lg text-foreground">
                Itinerary
              </h1>
              <p className="text-xs font-body text-muted-foreground">
                Your trip plan with photos
              </p>
            </div>
            {entries.length > 0 && (
              <Badge
                variant="secondary"
                className="font-body text-xs h-5 px-1.5"
              >
                {entries.length}
              </Badge>
            )}
          </div>
          <Button
            onClick={() => setAddDialogOpen(true)}
            className="font-body text-xs bg-navy hover:bg-navy-light text-white h-8 px-3 gap-1.5"
            data-ocid="itinerary.add_entry.open_modal_button"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Add Entry</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>

        {/* Empty state */}
        {entries.length === 0 ? (
          <Card className="shadow-card" data-ocid="itinerary.empty_state">
            <CardContent className="py-16 text-center">
              <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                <MapPin className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <p className="font-display font-bold text-base text-foreground mb-1">
                No itinerary yet
              </p>
              <p className="text-sm text-muted-foreground font-body mb-5">
                Plan your activities, hotels, and upload photos for each day.
              </p>
              <Button
                onClick={() => setAddDialogOpen(true)}
                className="font-body bg-navy hover:bg-navy-light text-white"
                data-ocid="itinerary.empty.open_modal_button"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Plan Itinerary
              </Button>
            </CardContent>
          </Card>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-6"
          >
            {sortedDates.map((date) => (
              <motion.div key={date} variants={itemVariants}>
                {/* Date header */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-7 w-7 rounded-md bg-navy flex items-center justify-center shrink-0">
                    <Calendar className="h-3.5 w-3.5 text-white" />
                  </div>
                  <p className="font-display font-bold text-sm text-navy uppercase tracking-wider">
                    {formatDateDisplay(date)}
                  </p>
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs font-body text-muted-foreground">
                    {grouped[date].length} activit
                    {grouped[date].length !== 1 ? "ies" : "y"}
                  </span>
                </div>

                <div className="space-y-3 pl-2">
                  {grouped[date]
                    .sort((a, b) => a.time.localeCompare(b.time))
                    .map((entry, idx) => {
                      const photoCount = entry.photoUrls?.length ?? 0;
                      return (
                        <Card
                          key={entry.id}
                          className="shadow-card overflow-hidden"
                          data-ocid={`itinerary.item.${idx + 1}`}
                        >
                          <CardContent className="p-0">
                            {/* Entry header */}
                            <div className="px-4 pt-3 pb-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2 flex-1 min-w-0">
                                  {entry.time && (
                                    <span className="inline-flex items-center gap-0.5 text-xs font-body text-muted-foreground shrink-0 mt-0.5 bg-muted px-1.5 py-0.5 rounded">
                                      <Clock className="h-2.5 w-2.5" />
                                      {entry.time}
                                    </span>
                                  )}
                                  <div className="min-w-0">
                                    <p className="font-display font-bold text-sm text-foreground leading-tight">
                                      {entry.activity}
                                    </p>
                                    {photoCount > 0 && (
                                      <span className="inline-flex items-center gap-1 text-xs font-body text-muted-foreground mt-0.5">
                                        <Camera className="h-2.5 w-2.5" />
                                        {photoCount} photo
                                        {photoCount !== 1 ? "s" : ""}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {/* Edit & Delete */}
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleEditClick(entry)}
                                    className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                    title="Edit entry"
                                    data-ocid={`itinerary.edit_button.${idx + 1}`}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onDelete(entry.id);
                                      toast.success("Entry removed");
                                    }}
                                    className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                                    title="Delete entry"
                                    data-ocid={`itinerary.delete_button.${idx + 1}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Hotel info */}
                              {(entry.hotelName || entry.hotelLocation) && (
                                <div className="mt-2 space-y-1">
                                  {entry.hotelName && (
                                    <div className="flex items-center gap-1.5 text-xs font-body text-muted-foreground">
                                      <Image className="h-3 w-3 shrink-0" />
                                      <span className="font-medium text-foreground/80">
                                        {entry.hotelName}
                                      </span>
                                    </div>
                                  )}
                                  {entry.hotelLocation && (
                                    <a
                                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(entry.hotelLocation)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 text-xs font-body text-teal hover:underline"
                                      data-ocid={`itinerary.map_marker.${idx + 1}`}
                                    >
                                      <MapPin className="h-3 w-3 shrink-0" />
                                      <span className="truncate max-w-[200px]">
                                        {entry.hotelLocation}
                                      </span>
                                    </a>
                                  )}
                                </div>
                              )}

                              {/* Details/notes */}
                              {entry.details && (
                                <p className="mt-2 text-xs font-body text-muted-foreground leading-relaxed">
                                  {entry.details}
                                </p>
                              )}
                            </div>

                            {/* Photo grid */}
                            {photoCount > 0 && (
                              <>
                                <Separator />
                                <div className="p-3">
                                  <div className="grid grid-cols-3 gap-1.5">
                                    {(entry.photoUrls ?? []).map(
                                      (url, photoIdx) => (
                                        <button
                                          type="button"
                                          // biome-ignore lint/suspicious/noArrayIndexKey: stable index key
                                          key={photoIdx}
                                          onClick={() =>
                                            setLightbox({
                                              photos: entry.photoUrls ?? [],
                                              index: photoIdx,
                                            })
                                          }
                                          className="aspect-square rounded-md overflow-hidden hover:ring-2 hover:ring-teal transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                          data-ocid={`itinerary.canvas_target.${idx + 1}`}
                                          title="View photo"
                                        >
                                          <img
                                            src={url}
                                            alt={`Trip view ${photoIdx + 1}`}
                                            className="w-full h-full object-cover"
                                          />
                                        </button>
                                      ),
                                    )}
                                  </div>
                                </div>
                              </>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Bottom Add Entry button */}
        {entries.length > 0 && (
          <div className="pt-2">
            <Button
              variant="outline"
              className="w-full font-body border-navy/30 text-navy hover:bg-navy hover:text-white"
              onClick={() => setAddDialogOpen(true)}
              data-ocid="itinerary.bottom.open_modal_button"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Another Entry
            </Button>
          </div>
        )}
      </motion.div>
    </>
  );
}

// ── Dashboard Tab ──────────────────────────────────────────────────────────────

function DashboardTab({
  expenses,
  currency,
  onReset,
  isResetting,
  itineraryEntries,
  onAddItineraryEntry,
  onDeleteItineraryEntry,
  onEditItineraryEntry,
}: {
  expenses: Expense[];
  currency: Currency;
  onReset: () => void;
  isResetting?: boolean;
  itineraryEntries: ItineraryEntry[];
  onAddItineraryEntry: (entry: ItineraryEntry) => void;
  onDeleteItineraryEntry: (id: string) => void;
  onEditItineraryEntry: (entry: ItineraryEntry) => void;
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
    <div className="flex flex-col md:flex-row gap-6 items-start">
      {/* Left column: Itinerary Panel */}
      <div className="w-full md:w-72 shrink-0">
        <ItineraryPanel
          entries={itineraryEntries}
          onAdd={onAddItineraryEntry}
          onDelete={onDeleteItineraryEntry}
          onEdit={onEditItineraryEntry}
        />
      </div>

      {/* Right column: Dashboard content */}
      <div className="flex-1 min-w-0">
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
      </div>
    </div>
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
const PLACE_OPTIONS = ["Bangkok", "Phu Quoc", "Phuket", "Phi Phi Island"];

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
  const today = new Date().toISOString().split("T")[0];
  const currencyInfo = CURRENCIES.find((c) => c.value === currency)!;

  const [description, setDescription] = useState(lastDescription);
  const [location, setLocation] = useState(lastLocation);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [paidBy, setPaidBy] = useState<Member | "">("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const parsedAmount = Number.parseFloat(amount) || 0;
  const perPerson = parsedAmount / MEMBERS.length;

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
                  Split equally among all 4 members
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
                      {PLACE_OPTIONS.map((opt) => (
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
                    <div className="rounded-lg bg-teal-light border border-teal/20 p-3">
                      <p className="text-xs font-body font-medium text-accent-foreground mb-2 flex items-center gap-1.5">
                        <Receipt className="h-3 w-3" />
                        Split Preview
                      </p>
                      <div className="grid grid-cols-4 gap-2">
                        {MEMBERS.map((m) => (
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
  isResetting,
}: {
  expenses: Expense[];
  currency: Currency;
  onReset: () => void;
  isResetting?: boolean;
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

// ── Login Screen ───────────────────────────────────────────────────────────────

function LoginScreen() {
  const { login, isLoggingIn, isInitializing } = useInternetIdentity();

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
            Trip Splitter
          </h1>
          <p className="text-sm text-muted-foreground font-body mt-1">
            Track & split trip expenses with friends
          </p>
        </div>

        {/* Login Card */}
        <Card className="shadow-card-md">
          <CardContent className="p-6 space-y-5">
            {/* Members preview */}
            <div className="flex items-center justify-center gap-2">
              {MEMBERS.map((m) => (
                <MemberAvatar key={m} member={m} size="md" />
              ))}
            </div>
            <p className="text-center text-xs text-muted-foreground font-body">
              Manoj · Ramesh · Abhijit · Pradeep
            </p>

            <Separator />

            {/* Benefits */}
            <div className="space-y-2.5">
              {[
                {
                  id: "secure",
                  icon: <Shield className="h-4 w-4 text-teal" />,
                  text: "Secure login with your Google or Apple account",
                },
                {
                  id: "sync",
                  icon: <ArrowRight className="h-4 w-4 text-teal" />,
                  text: "Expenses sync automatically across all devices",
                },
                {
                  id: "shared",
                  icon: <CheckCircle2 className="h-4 w-4 text-teal" />,
                  text: "One login, shared data for the whole group",
                },
              ].map((item) => (
                <div key={item.id} className="flex items-start gap-2.5">
                  <span className="mt-0.5 shrink-0">{item.icon}</span>
                  <p className="text-xs text-foreground font-body">
                    {item.text}
                  </p>
                </div>
              ))}
            </div>

            <Button
              onClick={login}
              disabled={isLoggingIn || isInitializing}
              className="w-full font-display font-semibold bg-navy hover:bg-navy-light text-white"
            >
              {isLoggingIn ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4 mr-2" />
              )}
              {isLoggingIn ? "Connecting..." : "Login to Sync Data"}
            </Button>

            <p className="text-center text-xs text-muted-foreground font-body">
              Powered by Internet Identity · No passwords needed
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
  const { identity, clear, isInitializing } = useInternetIdentity();
  const { actor, isFetching: isActorFetching } = useActor();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [currency, setCurrency] = useState<Currency>("INR");

  // Registration promise -- kicked off once when actor is ready, awaited before every backend call
  const registrationRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!actor) {
      registrationRef.current = null;
      return;
    }
    registrationRef.current = (
      actor as unknown as Record<string, (s: string) => Promise<void>>
    )
      ._initializeAccessControlWithSecret("")
      .catch(() => {
        // Ignore -- user may already be registered, or authorization not required
      });
  }, [actor]);

  // ── Itinerary state (localStorage, frontend-only) ──────────────────────────
  const [itineraryEntries, setItineraryEntries] = useState<ItineraryEntry[]>(
    () => {
      try {
        const stored = localStorage.getItem(ITINERARY_STORAGE_KEY);
        return stored ? (JSON.parse(stored) as ItineraryEntry[]) : [];
      } catch {
        return [];
      }
    },
  );

  useEffect(() => {
    try {
      localStorage.setItem(
        ITINERARY_STORAGE_KEY,
        JSON.stringify(itineraryEntries),
      );
    } catch {
      // localStorage might not be available
    }
  }, [itineraryEntries]);

  function handleAddItineraryEntry(entry: ItineraryEntry) {
    setItineraryEntries((prev) => [...prev, entry]);
  }

  function handleDeleteItineraryEntry(id: string) {
    setItineraryEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function handleEditItineraryEntry(updated: ItineraryEntry) {
    setItineraryEntries((prev) =>
      prev.map((e) => (e.id === updated.id ? updated : e)),
    );
  }

  // ── Fetch expenses from backend ────────────────────────────────────────────
  const { data: rawExpenses, isLoading: isLoadingExpenses } = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      if (!actor) return [];
      // Wait for registration to complete before fetching
      if (registrationRef.current) await registrationRef.current;
      return actor.getExpenses();
    },
    enabled: !!actor && !isActorFetching,
  });

  // Map backend Expense (bigint id) → local Expense (string id)
  const expenses: Expense[] = (rawExpenses ?? []).map((e) => ({
    id: e.id.toString(),
    date: e.date,
    description: e.description,
    location: e.location,
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
      // Wait for registration before adding expense
      if (registrationRef.current) await registrationRef.current;
      return actor.addExpense(date, description, location, amount, paidBy);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Expense added successfully!", {
        description: `${variables.description || "Expense"} — ${formatCurrency(variables.amount, currency)} split among 4 members`,
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
      // Wait for registration before resetting
      if (registrationRef.current) await registrationRef.current;
      return actor.resetExpenses();
    },
    onSuccess: () => {
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

  // ── Show loading during identity initialization ────────────────────────────
  if (isInitializing) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="inline-flex h-12 w-12 rounded-xl bg-navy items-center justify-center">
            <Wallet className="h-6 w-6 text-white" />
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="font-body text-sm">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Show login if not authenticated ────────────────────────────────────────
  if (!identity) {
    return (
      <>
        <Toaster position="top-right" />
        <LoginScreen />
      </>
    );
  }

  // ── Logged in principal short form ────────────────────────────────────────
  const principalStr = identity.getPrincipal().toString();
  const shortPrincipal = `${principalStr.slice(0, 5)}…${principalStr.slice(-3)}`;

  const isLoadingData = isActorFetching || isLoadingExpenses;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Toaster position="top-right" />

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
              {/* Synced indicator */}
              <div className="hidden sm:flex items-center gap-1 text-white/60 text-xs font-body">
                <div className="h-1.5 w-1.5 rounded-full bg-teal animate-pulse" />
                <span className="hidden md:inline">{shortPrincipal}</span>
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
                onClick={handleShare}
                title="Share app"
              >
                <Share2 className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-white/70 hover:bg-white/10 hover:text-white font-body text-xs gap-1"
                onClick={clear}
                title="Logout"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </Button>

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
                    itineraryEntries={itineraryEntries}
                    onAddItineraryEntry={handleAddItineraryEntry}
                    onDeleteItineraryEntry={handleDeleteItineraryEntry}
                    onEditItineraryEntry={handleEditItineraryEntry}
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
              {activeTab === "itinerary" && (
                <motion.div key="itinerary">
                  <ItineraryTab
                    entries={itineraryEntries}
                    onAdd={handleAddItineraryEntry}
                    onDelete={handleDeleteItineraryEntry}
                    onEdit={handleEditItineraryEntry}
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
  );
}
