from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr


class CompanyCreate(BaseModel):
    name: str
    email_domain: str


class CompanyOut(CompanyCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class UserRegister(BaseModel):
    name: str
    email: EmailStr
    role: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    role: str
    company_id: int | None
    approval_status: str
    created_at: datetime


class TruckCreate(BaseModel):
    plate_number: str
    max_weight_kg: float
    max_volume_m3: float
    route_start: str
    route_end: str
    current_city: str
    gps_lat: float = 0
    gps_lng: float = 0
    status: str = "idle"
    cold_chain_supported: bool = False
    assigned_driver_id: int | None = None


class TruckLocationUpdate(BaseModel):
    current_city: str
    gps_lat: float | None = None
    gps_lng: float | None = None
    status: str | None = None


class TruckOut(TruckCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    created_at: datetime


class PackageCreate(BaseModel):
    length_cm: float
    width_cm: float
    height_cm: float
    weight_kg: float
    destination_city: str
    delivery_city: str | None = None
    delivery_district: str = ""
    street_address: str = ""
    building_name: str = ""
    floor: str = ""
    apartment_or_unit: str = ""
    delivery_notes: str = ""
    contents: str
    category: str
    priority: str = "normal"
    fragile: bool = False
    cold_chain: bool = False
    hazardous: bool = False
    status: str = "in_warehouse"


class PackageOut(PackageCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    package_code: str
    volume_m3: float
    assigned_truck_id: int | None
    qr_code_path: str | None
    created_at: datetime


class ScanInput(BaseModel):
    package_code: str
    truck_id: int | None = None
    event_type: str
    location_city: str


class ScanEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    package_id: int
    truck_id: int | None
    user_id: int
    event_type: str
    location_city: str
    timestamp: datetime


class CapacityOut(BaseModel):
    truck_id: int
    max_weight_kg: float
    max_volume_m3: float
    used_weight_kg: float
    used_volume_m3: float
    remaining_weight_kg: float
    remaining_volume_m3: float
    weight_usage_pct: float
    volume_usage_pct: float
    capacity_usage_pct: float


class RecommendationOut(BaseModel):
    package: PackageOut
    reason: str
    estimated_weight_usage_pct_after: float
    estimated_volume_usage_pct_after: float


class DriverLoadPackageInput(BaseModel):
    package_code: str
    truck_id: int
    user_id: int | None = None
    location_city: str


class DriverLoadPackageOut(BaseModel):
    package: PackageOut
    capacity: CapacityOut
