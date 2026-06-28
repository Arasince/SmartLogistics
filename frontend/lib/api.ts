export const API_BASE = "/api/backend";

export type Role = "platform_admin" | "company_admin" | "manager" | "warehouse" | "driver";

export type User = {
  id: number;
  name: string;
  email: string;
  role: Role;
  company_id: number | null;
  approval_status: string;
};

export type Company = {
  id: number;
  name: string;
  email_domain: string;
};

export type Truck = {
  id: number;
  company_id: number;
  plate_number: string;
  max_weight_kg: number;
  max_volume_m3: number;
  route_start: string;
  route_end: string;
  current_city: string;
  gps_lat: number;
  gps_lng: number;
  status: string;
  cold_chain_supported: boolean;
  assigned_driver_id?: number | null;
};

export type PackageItem = {
  id: number;
  company_id: number;
  package_code: string;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  volume_m3: number;
  weight_kg: number;
  destination_city: string;
  delivery_city: string;
  delivery_district: string;
  street_address: string;
  building_name: string;
  floor: string;
  apartment_or_unit: string;
  delivery_notes: string;
  contents: string;
  category: string;
  priority: string;
  fragile: boolean;
  cold_chain: boolean;
  hazardous: boolean;
  status: string;
  assigned_truck_id: number | null;
  qr_code_path: string | null;
};

export type Capacity = {
  truck_id: number;
  max_weight_kg: number;
  max_volume_m3: number;
  used_weight_kg: number;
  used_volume_m3: number;
  remaining_weight_kg: number;
  remaining_volume_m3: number;
  weight_usage_pct: number;
  volume_usage_pct: number;
  capacity_usage_pct: number;
};

export type Recommendation = {
  package: PackageItem;
  reason: string;
  estimated_weight_usage_pct_after: number;
  estimated_volume_usage_pct_after: number;
};

export type DriverLoadPackageResponse = {
  package: PackageItem;
  capacity: Capacity;
};

export async function api<T>(path: string, user?: User | null, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (user?.id) headers.set("X-User-Id", String(user.id));
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers, cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || res.statusText);
  }
  return res.json();
}
