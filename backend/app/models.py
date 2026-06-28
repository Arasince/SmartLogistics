from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, unique=True, index=True)
    email_domain: Mapped[str] = mapped_column(String, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    users: Mapped[list["User"]] = relationship(back_populates="company")
    trucks: Mapped[list["Truck"]] = relationship(back_populates="company")
    packages: Mapped[list["Package"]] = relationship(back_populates="company")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, index=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    role: Mapped[str] = mapped_column(String, index=True)
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"), nullable=True)
    approval_status: Mapped[str] = mapped_column(String, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    company: Mapped[Company | None] = relationship(back_populates="users")


class Truck(Base):
    __tablename__ = "trucks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    plate_number: Mapped[str] = mapped_column(String, unique=True, index=True)
    max_weight_kg: Mapped[float] = mapped_column(Float)
    max_volume_m3: Mapped[float] = mapped_column(Float)
    route_start: Mapped[str] = mapped_column(String, index=True)
    route_end: Mapped[str] = mapped_column(String, index=True)
    current_city: Mapped[str] = mapped_column(String)
    gps_lat: Mapped[float] = mapped_column(Float, default=0)
    gps_lng: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String, default="idle")
    cold_chain_supported: Mapped[bool] = mapped_column(Boolean, default=False)
    assigned_driver_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    company: Mapped[Company] = relationship(back_populates="trucks")
    packages: Mapped[list["Package"]] = relationship(back_populates="assigned_truck")


class Package(Base):
    __tablename__ = "packages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    package_code: Mapped[str] = mapped_column(String, unique=True, index=True)
    length_cm: Mapped[float] = mapped_column(Float)
    width_cm: Mapped[float] = mapped_column(Float)
    height_cm: Mapped[float] = mapped_column(Float)
    volume_m3: Mapped[float] = mapped_column(Float)
    weight_kg: Mapped[float] = mapped_column(Float)
    destination_city: Mapped[str] = mapped_column(String, index=True)
    delivery_city: Mapped[str] = mapped_column(String, default="")
    delivery_district: Mapped[str] = mapped_column(String, default="")
    street_address: Mapped[str] = mapped_column(String, default="")
    building_name: Mapped[str] = mapped_column(String, default="")
    floor: Mapped[str] = mapped_column(String, default="")
    apartment_or_unit: Mapped[str] = mapped_column(String, default="")
    delivery_notes: Mapped[str] = mapped_column(String, default="")
    contents: Mapped[str] = mapped_column(String)
    category: Mapped[str] = mapped_column(String, index=True)
    priority: Mapped[str] = mapped_column(String, default="normal")
    fragile: Mapped[bool] = mapped_column(Boolean, default=False)
    cold_chain: Mapped[bool] = mapped_column(Boolean, default=False)
    hazardous: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String, default="created")
    assigned_truck_id: Mapped[int | None] = mapped_column(ForeignKey("trucks.id"), nullable=True)
    qr_code_path: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    company: Mapped[Company] = relationship(back_populates="packages")
    assigned_truck: Mapped[Truck | None] = relationship(back_populates="packages")


class ScanEvent(Base):
    __tablename__ = "scan_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    package_id: Mapped[int] = mapped_column(ForeignKey("packages.id"), index=True)
    truck_id: Mapped[int | None] = mapped_column(ForeignKey("trucks.id"), nullable=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    event_type: Mapped[str] = mapped_column(String, index=True)
    location_city: Mapped[str] = mapped_column(String)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
