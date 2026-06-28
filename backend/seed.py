from pathlib import Path

import qrcode

from app.database import Base, SessionLocal, engine
from app.models import Company, Package, ScanEvent, Truck, User

QR_DIR = Path(__file__).parent / "app" / "qr_codes"
QR_DIR.mkdir(exist_ok=True)


def volume(length_cm: float, width_cm: float, height_cm: float) -> float:
    return round((length_cm * width_cm * height_cm) / 1_000_000, 4)


def qr_path(code: str) -> str:
    path = QR_DIR / f"{code}.png"
    qrcode.make(code).save(path)
    return f"/qr_codes/{code}.png"


def seed():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        aras = Company(name="Aras Logistics", email_domain="araslogistics.com")
        atlas = Company(name="Atlas Freight", email_domain="atlasfreight.com")
        db.add_all([aras, atlas])
        db.flush()

        users = [
            User(name="Pelin Platform", email="platform@smartcargo.demo", role="platform_admin", approval_status="approved"),
            User(name="Cem Aras", email="cem@araslogistics.com", role="company_admin", company_id=aras.id, approval_status="approved"),
            User(name="Deniz Warehouse", email="deniz@araslogistics.com", role="warehouse", company_id=aras.id, approval_status="approved"),
            User(name="Ece Manager", email="ece@araslogistics.com", role="manager", company_id=aras.id, approval_status="approved"),
            User(name="Mert Driver", email="mert@araslogistics.com", role="driver", company_id=aras.id, approval_status="approved"),
            User(name="Pending Ops", email="ops.pending@araslogistics.com", role="warehouse", company_id=aras.id, approval_status="pending"),
            User(name="Rejected Temp", email="temp@araslogistics.com", role="driver", company_id=aras.id, approval_status="rejected"),
            User(name="Atlas Admin", email="admin@atlasfreight.com", role="company_admin", company_id=atlas.id, approval_status="approved"),
        ]
        db.add_all(users)
        db.flush()

        trucks = [
            Truck(
                company_id=aras.id,
                plate_number="34 SC 1001",
                max_weight_kg=16000,
                max_volume_m3=75,
                route_start="Istanbul",
                route_end="Ankara",
                current_city="Kocaeli",
                gps_lat=40.7654,
                gps_lng=29.9408,
                status="in_transit",
                cold_chain_supported=True,
                assigned_driver_id=users[4].id,
            ),
            Truck(
                company_id=aras.id,
                plate_number="34 SC 2040",
                max_weight_kg=12000,
                max_volume_m3=58,
                route_start="Istanbul",
                route_end="Izmir",
                current_city="Istanbul",
                gps_lat=41.0082,
                gps_lng=28.9784,
                status="loading",
                cold_chain_supported=False,
            ),
            Truck(
                company_id=atlas.id,
                plate_number="06 AF 7788",
                max_weight_kg=14000,
                max_volume_m3=66,
                route_start="Ankara",
                route_end="Istanbul",
                current_city="Ankara",
                gps_lat=39.9334,
                gps_lng=32.8597,
                status="idle",
                cold_chain_supported=False,
            ),
        ]
        db.add_all(trucks)
        db.flush()

        package_rows = [
            (aras.id, "SC-SEED-001", 120, 80, 90, 850, "Ankara", "Ankara", "Cankaya", "Ataturk Bulvari", "Kizilay Is Merkezi", "5", "12", "Deliver to goods entrance before 16:00.", "Appliance parts", "industrial", "normal", False, False, False, "loaded", trucks[0].id),
            (aras.id, "SC-SEED-002", 90, 70, 70, 420, "Bolu", "Bolu", "Merkez", "Izzet Baysal Caddesi", "Kardelen Plaza", "2", "4", "Fragile crates. Keep upright.", "Glassware crates", "retail", "high", True, False, False, "loaded", trucks[0].id),
            (aras.id, "SC-SEED-003", 100, 100, 80, 600, "Ankara", "Ankara", "Yenimahalle", "Ivedik OSB 1354. Cadde", "Soguk Depo A", "Ground", "Dock 3", "Cold-chain handoff required.", "Fresh dairy pallets", "food", "high", False, True, False, "loaded", trucks[0].id),
            (aras.id, "SC-SEED-004", 80, 60, 60, 300, "Sakarya", "Sakarya", "Adapazari", "Cark Caddesi", "Ada Center", "1", "8", "Call receiver 10 minutes before arrival.", "Textile boxes", "retail", "normal", False, False, False, "in_warehouse", None),
            (aras.id, "SC-SEED-005", 100, 70, 65, 500, "Ankara", "Ankara", "Cankaya", "Tunalı Hilmi Caddesi", "Mercan Apartmani", "3", "7", "Fragile electronics. Do not stack.", "Electronics accessories", "electronics", "high", True, False, False, "in_warehouse", None),
            (aras.id, "SC-SEED-006", 140, 100, 90, 950, "Duzce", "Duzce", "Merkez", "Istanbul Caddesi", "Sanayi Sitesi Blok B", "Ground", "B-14", "Forklift available at site.", "Auto spare parts", "industrial", "normal", False, False, False, "in_warehouse", None),
            (aras.id, "SC-SEED-007", 70, 50, 50, 250, "Izmir", "Izmir", "Konak", "Sehit Nevres Bulvari", "Ege Han", "4", "18", "Leave with reception if buyer is unavailable.", "Cosmetics cartons", "retail", "normal", False, False, False, "in_warehouse", None),
            (aras.id, "SC-SEED-008", 80, 50, 40, 180, "Bolu", "Bolu", "Merkez", "Sanayi Caddesi", "Kimya Deposu", "Ground", "Hazmat Bay", "Hazardous material. Use PPE.", "Lab cleaning solvent", "chemicals", "normal", False, False, True, "in_warehouse", None),
            (aras.id, "SC-SEED-009", 120, 90, 80, 700, "Manisa", "Manisa", "Yunusemre", "Mimar Sinan Bulvari", "Lale Plaza", "6", "22", "Delivery window 13:00-17:00.", "Furniture fittings", "home", "low", False, False, False, "in_warehouse", None),
            (aras.id, "SC-SEED-010", 110, 80, 75, 650, "Ankara", "Ankara", "Etimesgut", "Baglica Bulvari", "Metro Market Depo", "Ground", "Cold Dock 2", "Cold-chain required. Receiver signs temperature log.", "Frozen seafood", "food", "high", False, True, False, "in_warehouse", None),
            (atlas.id, "SC-SEED-011", 90, 60, 60, 380, "Istanbul", "Istanbul", "Kadikoy", "Bagdat Caddesi", "Sahil Is Merkezi", "2", "10", "Book pallets for store opening.", "Book pallets", "retail", "normal", False, False, False, "in_warehouse", None),
            (atlas.id, "SC-SEED-012", 100, 70, 70, 520, "Kocaeli", "Kocaeli", "Gebze", "Organize Sanayi 1600. Sokak", "Makine Atolyesi", "Ground", "Gate 5", "Heavy tools. Deliver to loading bay.", "Machine tools", "industrial", "normal", False, False, False, "in_warehouse", None),
        ]
        packages = []
        for row in package_rows:
            (
                company_id,
                code,
                length,
                width,
                height,
                weight,
                destination,
                delivery_city,
                delivery_district,
                street_address,
                building_name,
                floor,
                apartment_or_unit,
                delivery_notes,
                contents,
                category,
                priority,
                fragile,
                cold_chain,
                hazardous,
                status,
                truck_id,
            ) = row
            packages.append(
                Package(
                    company_id=company_id,
                    package_code=code,
                    length_cm=length,
                    width_cm=width,
                    height_cm=height,
                    volume_m3=volume(length, width, height),
                    weight_kg=weight,
                    destination_city=destination,
                    delivery_city=delivery_city,
                    delivery_district=delivery_district,
                    street_address=street_address,
                    building_name=building_name,
                    floor=floor,
                    apartment_or_unit=apartment_or_unit,
                    delivery_notes=delivery_notes,
                    contents=contents,
                    category=category,
                    priority=priority,
                    fragile=fragile,
                    cold_chain=cold_chain,
                    hazardous=hazardous,
                    status=status,
                    assigned_truck_id=truck_id,
                    qr_code_path=qr_path(code),
                )
            )
        db.add_all(packages)
        db.flush()

        for package in packages:
            db.add(
                ScanEvent(
                    package_id=package.id,
                    truck_id=package.assigned_truck_id,
                    user_id=users[2].id if package.company_id == aras.id else users[7].id,
                    event_type="loaded" if package.assigned_truck_id else "created",
                    location_city="Istanbul" if package.company_id == aras.id else "Ankara",
                )
            )
        db.commit()
        print("Seeded SmartCargo demo data")
        print("Demo users:")
        for user in users[:5]:
            print(f"- {user.id}: {user.name} ({user.role})")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
