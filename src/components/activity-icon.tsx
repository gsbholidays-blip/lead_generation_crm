import {
  UserPlus,
  RefreshCw,
  ArrowRightLeft,
  Phone,
  StickyNote,
  CalendarClock,
  CalendarCheck,
  CalendarX,
  CalendarOff,
  Mail,
  MessageCircle,
  Send,
  Trophy,
  XCircle,
  ShieldAlert,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export const ACTIVITY_ICONS: Record<string, LucideIcon> = {
  LEAD_CREATED: Sparkles,
  ASSIGNED: UserPlus,
  REASSIGNED: ArrowRightLeft,
  STATUS_CHANGED: RefreshCw,
  CALLED: Phone,
  NOTE_ADDED: StickyNote,
  FOLLOW_UP_SCHEDULED: CalendarClock,
  FOLLOW_UP_COMPLETED: CalendarCheck,
  FOLLOW_UP_MISSED: CalendarX,
  FOLLOW_UP_CANCELLED: CalendarOff,
  EMAIL_SENT: Mail,
  WHATSAPP_SENT: MessageCircle,
  WHATSAPP_REPLIED: Send,
  CONVERTED: Trophy,
  MARKED_LOST: XCircle,
  MARKED_SPAM: ShieldAlert,
  MARKED_DUPLICATE: ShieldAlert,
};

export function ActivityIcon({ type, className }: { type: string; className?: string }) {
  const Icon = ACTIVITY_ICONS[type] ?? Sparkles;
  return <Icon className={className} />;
}
