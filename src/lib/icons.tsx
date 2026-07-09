import {
  Sparkles,
  Utensils,
  Shirt,
  Wifi,
  Shield,
  Wrench,
  Bus,
  Plug,
  type LucideIcon,
} from "lucide-react";
import type { ServiceItem } from "./mockData";

export const SERVICE_ICONS: Record<ServiceItem["icon"], LucideIcon> = {
  sparkles: Sparkles,
  utensils: Utensils,
  shirt: Shirt,
  wifi: Wifi,
  shield: Shield,
  wrench: Wrench,
  bus: Bus,
  plug: Plug,
};
