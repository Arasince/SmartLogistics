from datetime import datetime
import os
from pathlib import Path
from uuid import uuid4

import qrcode
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import Base, engine, get_db
from .models import Company, Package, ScanEvent, Truck, User
from .schemas import (
    CapacityOut,
    CompanyCreate,
    CompanyOut,
    DriverLoadPackageInput,
    DriverLoadPackageOut,
    PackageCreate,
    PackageOut,
    RecommendationOut,
    ScanEventOut,
    ScanInput,
    TruckCreate,
    TruckLocationUpdate,
    TruckOut,
    UserOut,
    UserRegister,
)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="SmartCargo API")
frontend_origins = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8888",
    ).split(",")
    if origin.strip()
]
frontend_origin_regex = os.getenv("FRONTEND_ORIGIN_REGEX", r"https://.*\.netlify\.app")
app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_origin_regex=frontend_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

QR_DIR = Path(__file__).parent / "qr_codes"
QR_DIR.mkdir(exist_ok=True)
app.mount("/qr_codes", StaticFiles(directory=str(QR_DIR)), name="qr_codes")

ROUTE_CORRIDORS = {
    ("Istanbul", "Ankara"): ["Kocaeli", "Sakarya", "Duzce", "Bolu", "Ankara"],
    ("Istanbul", "Izmir"): ["Bursa", "Balikesir", "Manisa", "Izmir"],
    ("Ankara", "Istanbul"): ["Bolu", "Duzce", "Sakarya", "Kocaeli", "Istanbul"],
}


def current_user(db: Session = Depends(get_db), x_user_id: int | None = Header(default=None)) -> User:
    if x_user_id is None:
        user = db.scalar(select(User).where(User.role == "platform_admin"))
    else:
        user = db.get(User, x_user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Unknown demo user")
    return user


def require_company_access(company_id: int, user: User) -> None:
    if user.role == "platform_admin":
        return
    if user.approval_status != "approved" or user.company_id != company_id:
        raise HTTPException(status_code=403, detail="Company data is isolated")


def require_role(user: User, roles: set[str]) -> None:
    if user.role not in roles:
        raise HTTPException(status_code=403, detail="Insufficient role for this action")


def volume_m3(length_cm: float, width_cm: float, height_cm: float) -> float:
    return round((length_cm * width_cm * height_cm) / 1_000_000, 4)


def new_package_code(db: Session) -> str:
    while True:
        code = f"SC-{datetime.utcnow().strftime('%y%m%d')}-{uuid4().hex[:6].upper()}"
        if not db.scalar(select(Package).where(Package.package_code == code)):
            return code


def create_qr(package_code: str) -> str:
    filename = f"{package_code}.png"
    path = QR_DIR / filename
    img = qrcode.make(package_code)
    img.save(path)
    return f"/qr_codes/{filename}"


def calculate_capacity(truck: Truck) -> CapacityOut:
    loaded = [pkg for pkg in truck.packages if pkg.status in {"loaded", "in_transit"}]
    used_weight = round(sum(pkg.weight_kg for pkg in loaded), 2)
    used_volume = round(sum(pkg.volume_m3 for pkg in loaded), 4)
    remaining_weight = round(max(truck.max_weight_kg - used_weight, 0), 2)
    remaining_volume = round(max(truck.max_volume_m3 - used_volume, 0), 4)
    weight_pct = round((used_weight / truck.max_weight_kg) * 100, 1) if truck.max_weight_kg else 0
    volume_pct = round((used_volume / truck.max_volume_m3) * 100, 1) if truck.max_volume_m3 else 0
    return CapacityOut(
        truck_id=truck.id,
        max_weight_kg=truck.max_weight_kg,
        max_volume_m3=truck.max_volume_m3,
        used_weight_kg=used_weight,
        used_volume_m3=used_volume,
        remaining_weight_kg=remaining_weight,
        remaining_volume_m3=remaining_volume,
        weight_usage_pct=weight_pct,
        volume_usage_pct=volume_pct,
        capacity_usage_pct=round(max(weight_pct, volume_pct), 1),
    )


def has_food_or_fragile_loaded(truck: Truck) -> bool:
    return any(
        pkg.status in {"loaded", "in_transit"} and (pkg.fragile or pkg.category.lower() == "food")
        for pkg in truck.packages
    )


def has_hazardous_loaded(truck: Truck) -> bool:
    return any(pkg.status in {"loaded", "in_transit"} and pkg.hazardous for pkg in truck.packages)


@app.get("/")
def root():
    return {
        "service": "SmartCargo API",
        "status": "ok",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
def health():
    return {"status": "ok", "service": "SmartCargo API"}


@app.get("/demo-users", response_model=list[UserOut])
def demo_users(db: Session = Depends(get_db)):
    return db.scalars(select(User).order_by(User.role, User.id)).all()


@app.post("/companies", response_model=CompanyOut)
def create_company(payload: CompanyCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    require_role(user, {"platform_admin"})
    company = Company(**payload.model_dump())
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


@app.get("/companies", response_model=list[CompanyOut])
def list_companies(db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role == "platform_admin":
        return db.scalars(select(Company).order_by(Company.name)).all()
    require_company_access(user.company_id, user)
    return [db.get(Company, user.company_id)]


@app.get("/companies/{company_id}", response_model=CompanyOut)
def get_company(company_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    require_company_access(company_id, user)
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


@app.post("/users/register", response_model=UserOut)
def register_user(payload: UserRegister, db: Session = Depends(get_db)):
    domain = payload.email.split("@")[-1].lower()
    company = db.scalar(select(Company).where(Company.email_domain == domain))
    user = User(
        name=payload.name,
        email=payload.email,
        role=payload.role,
        company_id=company.id if company else None,
        approval_status="pending",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.get("/companies/{company_id}/join-requests", response_model=list[UserOut])
def join_requests(company_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    require_role(user, {"company_admin", "platform_admin"})
    require_company_access(company_id, user)
    return db.scalars(
        select(User).where(User.company_id == company_id, User.approval_status == "pending").order_by(User.created_at)
    ).all()


@app.post("/users/{user_id}/approve", response_model=UserOut)
def approve_user(user_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    require_role(user, {"company_admin", "platform_admin"})
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role != "platform_admin":
        require_company_access(target.company_id, user)
    target.approval_status = "approved"
    db.commit()
    db.refresh(target)
    return target


@app.post("/users/{user_id}/reject", response_model=UserOut)
def reject_user(user_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    require_role(user, {"company_admin", "platform_admin"})
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role != "platform_admin":
        require_company_access(target.company_id, user)
    target.approval_status = "rejected"
    db.commit()
    db.refresh(target)
    return target


@app.post("/companies/{company_id}/trucks", response_model=TruckOut)
def create_truck(company_id: int, payload: TruckCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    require_role(user, {"company_admin", "platform_admin"})
    require_company_access(company_id, user)
    truck = Truck(company_id=company_id, **payload.model_dump())
    db.add(truck)
    db.commit()
    db.refresh(truck)
    return truck


@app.get("/companies/{company_id}/trucks", response_model=list[TruckOut])
def list_trucks(company_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    require_company_access(company_id, user)
    return db.scalars(select(Truck).where(Truck.company_id == company_id).order_by(Truck.id)).all()


@app.get("/trucks/{truck_id}", response_model=TruckOut)
def get_truck(truck_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    truck = db.get(Truck, truck_id)
    if not truck:
        raise HTTPException(status_code=404, detail="Truck not found")
    require_company_access(truck.company_id, user)
    return truck


@app.patch("/trucks/{truck_id}/location", response_model=TruckOut)
def update_truck_location(
    truck_id: int,
    payload: TruckLocationUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    truck = db.get(Truck, truck_id)
    if not truck:
        raise HTTPException(status_code=404, detail="Truck not found")
    require_company_access(truck.company_id, user)
    truck.current_city = payload.current_city
    if payload.gps_lat is not None:
        truck.gps_lat = payload.gps_lat
    if payload.gps_lng is not None:
        truck.gps_lng = payload.gps_lng
    if payload.status is not None:
        truck.status = payload.status
    db.commit()
    db.refresh(truck)
    return truck


@app.get("/trucks/{truck_id}/capacity", response_model=CapacityOut)
def truck_capacity(truck_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    truck = db.get(Truck, truck_id)
    if not truck:
        raise HTTPException(status_code=404, detail="Truck not found")
    require_company_access(truck.company_id, user)
    return calculate_capacity(truck)


@app.post("/companies/{company_id}/packages", response_model=PackageOut)
def create_package(
    company_id: int,
    payload: PackageCreate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, {"company_admin", "warehouse", "platform_admin"})
    require_company_access(company_id, user)
    code = new_package_code(db)
    package_data = payload.model_dump()
    if not package_data.get("delivery_city"):
        package_data["delivery_city"] = package_data["destination_city"]
    package = Package(
        company_id=company_id,
        package_code=code,
        volume_m3=volume_m3(payload.length_cm, payload.width_cm, payload.height_cm),
        qr_code_path=create_qr(code),
        **package_data,
    )
    db.add(package)
    db.flush()
    db.add(ScanEvent(package_id=package.id, user_id=user.id, event_type="created", location_city="Warehouse"))
    db.commit()
    db.refresh(package)
    return package


@app.get("/companies/{company_id}/packages", response_model=list[PackageOut])
def list_packages(company_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    require_company_access(company_id, user)
    return db.scalars(select(Package).where(Package.company_id == company_id).order_by(Package.created_at.desc())).all()


@app.get("/packages/{package_id}", response_model=PackageOut)
def get_package(package_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    package = db.get(Package, package_id)
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")
    require_company_access(package.company_id, user)
    return package


@app.get("/packages/code/{package_code}", response_model=PackageOut)
def get_package_by_code(package_code: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    package = db.scalar(select(Package).where(Package.package_code == package_code))
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")
    require_company_access(package.company_id, user)
    return package


@app.post("/packages/{package_id}/assign-to-truck/{truck_id}", response_model=PackageOut)
def assign_to_truck(
    package_id: int,
    truck_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    package = db.get(Package, package_id)
    truck = db.get(Truck, truck_id)
    if not package or not truck:
        raise HTTPException(status_code=404, detail="Package or truck not found")
    if package.company_id != truck.company_id:
        raise HTTPException(status_code=400, detail="Package and truck must belong to the same company")
    require_company_access(package.company_id, user)
    capacity = calculate_capacity(truck)
    if package.weight_kg > capacity.remaining_weight_kg or package.volume_m3 > capacity.remaining_volume_m3:
        raise HTTPException(status_code=400, detail="Package exceeds remaining truck capacity")
    package.assigned_truck_id = truck.id
    package.status = "loaded"
    truck.status = "loading" if truck.status == "idle" else truck.status
    db.add(ScanEvent(package_id=package.id, truck_id=truck.id, user_id=user.id, event_type="loaded", location_city=truck.current_city))
    db.commit()
    db.refresh(package)
    return package


@app.post("/driver/load-package", response_model=DriverLoadPackageOut)
def driver_load_package(
    payload: DriverLoadPackageInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    active_user = user
    if payload.user_id is not None:
        if user.role != "platform_admin" and payload.user_id != user.id:
            raise HTTPException(status_code=403, detail="Cannot load packages as another user")
        target_user = db.get(User, payload.user_id)
        if not target_user:
            raise HTTPException(status_code=404, detail="User not found")
        active_user = target_user

    package = db.scalar(select(Package).where(Package.package_code == payload.package_code))
    truck = db.get(Truck, payload.truck_id)
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")
    if not truck:
        raise HTTPException(status_code=404, detail="Truck not found")
    require_company_access(package.company_id, active_user)
    if package.company_id != truck.company_id:
        raise HTTPException(status_code=400, detail="Package and truck must belong to the same company")
    if active_user.role == "driver" and truck.assigned_driver_id not in {None, active_user.id}:
        raise HTTPException(status_code=403, detail="Driver is not assigned to this truck")
    if package.assigned_truck_id and package.assigned_truck_id != truck.id:
        raise HTTPException(status_code=400, detail="Package is already assigned to another truck")

    capacity = calculate_capacity(truck)
    if package.assigned_truck_id != truck.id and (
        package.weight_kg > capacity.remaining_weight_kg or package.volume_m3 > capacity.remaining_volume_m3
    ):
        raise HTTPException(status_code=400, detail="This package exceeds remaining truck capacity.")

    package.assigned_truck_id = truck.id
    package.status = "in_transit" if truck.status == "in_transit" else "loaded"
    if truck.status == "idle":
        truck.status = "loading"
    db.add(
        ScanEvent(
            package_id=package.id,
            truck_id=truck.id,
            user_id=active_user.id,
            event_type="loaded",
            location_city=payload.location_city,
        )
    )
    db.commit()
    db.refresh(package)
    db.refresh(truck)
    return DriverLoadPackageOut(package=package, capacity=calculate_capacity(truck))


@app.post("/packages/scan", response_model=ScanEventOut)
def scan_package(payload: ScanInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    package = db.scalar(select(Package).where(Package.package_code == payload.package_code))
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")
    require_company_access(package.company_id, user)
    truck = db.get(Truck, payload.truck_id) if payload.truck_id else None
    if truck and truck.company_id != package.company_id:
        raise HTTPException(status_code=400, detail="Truck belongs to another company")
    if payload.event_type == "loaded":
        if not truck:
            raise HTTPException(status_code=400, detail="truck_id is required for loaded scans")
        capacity = calculate_capacity(truck)
        if package.assigned_truck_id != truck.id and (
            package.weight_kg > capacity.remaining_weight_kg or package.volume_m3 > capacity.remaining_volume_m3
        ):
            raise HTTPException(status_code=400, detail="Package exceeds remaining truck capacity")
        package.assigned_truck_id = truck.id
        package.status = "loaded"
    elif payload.event_type == "delivered":
        package.status = "delivered"
    elif payload.event_type == "unloaded":
        package.status = "in_warehouse"
        package.assigned_truck_id = None
    elif payload.event_type == "scanned":
        package.status = "in_transit" if package.assigned_truck_id else package.status
    event = ScanEvent(
        package_id=package.id,
        truck_id=truck.id if truck else None,
        user_id=user.id,
        event_type=payload.event_type,
        location_city=payload.location_city,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@app.get("/trucks/{truck_id}/recommendations", response_model=list[RecommendationOut])
def recommendations(truck_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    truck = db.get(Truck, truck_id)
    if not truck:
        raise HTTPException(status_code=404, detail="Truck not found")
    require_company_access(truck.company_id, user)
    capacity = calculate_capacity(truck)
    corridor = ROUTE_CORRIDORS.get((truck.route_start, truck.route_end), [truck.route_end])
    candidates = db.scalars(
        select(Package)
        .where(Package.company_id == truck.company_id, Package.assigned_truck_id.is_(None), Package.status != "delivered")
        .order_by(Package.priority.desc(), Package.created_at)
    ).all()
    output: list[RecommendationOut] = []
    blocks_hazardous = has_food_or_fragile_loaded(truck)
    hazardous_loaded = has_hazardous_loaded(truck)
    for package in candidates:
        if package.weight_kg > capacity.remaining_weight_kg or package.volume_m3 > capacity.remaining_volume_m3:
            continue
        if package.destination_city not in corridor and package.destination_city != truck.route_end:
            continue
        if package.hazardous and blocks_hazardous:
            continue
        if hazardous_loaded and (package.fragile or package.category.lower() == "food"):
            continue
        if package.cold_chain and not truck.cold_chain_supported:
            continue
        route_reason = "destination matches route end" if package.destination_city == truck.route_end else "destination is inside route corridor"
        flags = []
        if package.cold_chain:
            flags.append("cold-chain truck supported")
        if package.priority == "high":
            flags.append("high priority")
        reason = f"Fits remaining weight and volume; {route_reason}"
        if flags:
            reason += f"; {', '.join(flags)}"
        output.append(
            RecommendationOut(
                package=package,
                reason=reason,
                estimated_weight_usage_pct_after=round(
                    ((capacity.used_weight_kg + package.weight_kg) / truck.max_weight_kg) * 100, 1
                ),
                estimated_volume_usage_pct_after=round(
                    ((capacity.used_volume_m3 + package.volume_m3) / truck.max_volume_m3) * 100, 1
                ),
            )
        )
    return output
