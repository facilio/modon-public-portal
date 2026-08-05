import {
  Sparkles,
  Utensils,
  Shirt,
  Wifi,
  Shield,
  Wrench,
  Bus,
  Plug,
  KeyRound,
  Package,
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

// Map a Facilio service NAME (custom_services_1) to an icon by keyword, since
// the module stores only a name. Unmatched names fall back to a neutral icon.
export function serviceIcon(name: string): LucideIcon {
  const n = name.toLowerCase();
  if (/clean|housekeep/.test(n)) return Sparkles;
  if (/cater|meal|mess|food|dining/.test(n)) return Utensils;
  if (/laundr/.test(n)) return Shirt;
  if (/wifi|wi-fi|internet|network/.test(n)) return Wifi;
  if (/secur|guard|safe/.test(n)) return Shield;
  if (/mainten|repair/.test(n)) return Wrench;
  if (/transport|bus|shuttle/.test(n)) return Bus;
  if (/access|card|badge/.test(n)) return KeyRound;
  if (/utilit|power|electric|water/.test(n)) return Plug;
  return Package;
}
