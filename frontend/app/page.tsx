"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  API_BASE,
  api,
  Capacity,
  Company,
  DriverLoadPackageResponse,
  PackageItem,
  Recommendation,
  Truck,
  User
} from "@/lib/api";

type FleetRow = { truck: Truck; capacity: Capacity };
type ViewKey = "dashboard" | "companies" | "trucks" | "packages" | "recommendations" | "qr-reader";

const views: { key: ViewKey; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "companies", label: "Companies" },
  { key: "trucks", label: "Trucks" },
  { key: "packages", label: "Packages" },
  { key: "recommendations", label: "Recommendations" },
  { key: "qr-reader", label: "QR Reader" }
];

const demoRoles = [
  ["platform_admin", "Platform Admin"],
  ["company_admin", "Company Admin"],
  ["warehouse", "Warehouse"],
  ["manager", "Manager"],
  ["driver", "Driver"]
] as const;

function fmt(num: number, digits = 1) {
  return Number(num || 0).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function Progress({ value }: { value: number }) {
  return (
    <div className="progress">
      <span style={{ width: `${Math.min(value, 100)}%` }} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function AppShell({
  user,
  children,
  onLogout,
  activeView,
  onViewChange
}: {
  user: User;
  children: ReactNode;
  onLogout: () => void;
  activeView: ViewKey;
  onViewChange: (view: ViewKey) => void;
}) {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="mark">SC</div>
          <div>
            <strong>SmartCargo</strong>
            <span>Capacity intelligence</span>
          </div>
        </div>
        <nav>
          {views.map((view) => (
            <button
              className={activeView === view.key ? "active" : ""}
              key={view.key}
              onClick={() => onViewChange(view.key)}
              type="button"
            >
              {view.label}
            </button>
          ))}
        </nav>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <p>QR + GPS based logistics optimization platform.</p>
            <h1>{views.find((view) => view.key === activeView)?.label}</h1>
          </div>
          <div className="user-pill">
            <span>{user.name}</span>
            <button onClick={onLogout}>Switch demo user</button>
          </div>
        </header>
        {children}
      </section>
    </main>
  );
}

export default function Page() {
  const [users, setUsers] = useState<User[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [fleet, setFleet] = useState<FleetRow[]>([]);
  const [requests, setRequests] = useState<User[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [selectedTruckId, setSelectedTruckId] = useState<number | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");
  const [message, setMessage] = useState("");

  const companyId = user?.company_id || companies[0]?.id;
  const selectedTruck = trucks.find((truck) => truck.id === selectedTruckId) || trucks[0];

  async function loadDemoUsers() {
    const data = await api<User[]>("/demo-users");
    setUsers(data);
    const saved = localStorage.getItem("smartcargo-user");
    if (saved) {
      const parsed = JSON.parse(saved) as User;
      const fresh = data.find((item) => item.id === parsed.id);
      if (fresh) setUser(fresh);
    }
  }

  async function refresh(active = user) {
    if (!active) return;
    const companyList = await api<Company[]>("/companies", active);
    setCompanies(companyList);
    const activeCompanyId = active.company_id || companyList[0]?.id;
    if (!activeCompanyId) return;

    const [truckList, packageList] = await Promise.all([
      api<Truck[]>(`/companies/${activeCompanyId}/trucks`, active),
      api<PackageItem[]>(`/companies/${activeCompanyId}/packages`, active)
    ]);
    setTrucks(truckList);
    setPackages(packageList);
    if (!selectedTruckId && truckList[0]) setSelectedTruckId(truckList[0].id);
    const rows = await Promise.all(
      truckList.map(async (truck) => ({ truck, capacity: await api<Capacity>(`/trucks/${truck.id}/capacity`, active) }))
    );
    setFleet(rows);
    if (active.role === "company_admin" || active.role === "platform_admin") {
      setRequests(await api<User[]>(`/companies/${activeCompanyId}/join-requests`, active));
    }
  }

  async function loadRecommendations(truckId = selectedTruck?.id) {
    if (!user || !truckId) return;
    setRecommendations(await api<Recommendation[]>(`/trucks/${truckId}/recommendations`, user));
  }

  useEffect(() => {
    loadDemoUsers().catch((err) => setMessage(err.message));
  }, []);

  useEffect(() => {
    refresh().catch((err) => setMessage(err.message));
  }, [user?.id]);

  useEffect(() => {
    loadRecommendations().catch(() => setRecommendations([]));
  }, [selectedTruckId, user?.id, trucks.length]);

  function login(role: string) {
    const selected = users.find((item) => item.role === role && item.approval_status === "approved");
    if (!selected) return;
    localStorage.setItem("smartcargo-user", JSON.stringify(selected));
    setUser(selected);
    setMessage("");
  }

  if (!user) {
    return (
      <main className="landing">
        <section className="landing-panel">
          <div className="brand big">
            <div className="mark">SC</div>
            <strong>SmartCargo</strong>
          </div>
          <h1>QR + GPS based logistics optimization platform.</h1>
          <p>
            Track packages by QR code, monitor truck capacity by weight and volume, and recommend extra loads that reduce
            empty capacity on active routes.
          </p>
          <div className="login-grid">
            {demoRoles.map(([role, label]) => (
              <button key={role} onClick={() => login(role)}>
                Demo Login as {label}
              </button>
            ))}
          </div>
          {message && <p className="notice">{message}</p>}
        </section>
      </main>
    );
  }

  return (
    <AppShell
      user={user}
      onLogout={() => {
        localStorage.removeItem("smartcargo-user");
        setUser(null);
      }}
      activeView={activeView}
      onViewChange={setActiveView}
    >
      {message && <p className="notice">{message}</p>}
      {activeView === "dashboard" && (
        <DashboardView
          user={user}
          companyId={companyId}
          companies={companies}
          requests={requests}
          fleet={fleet}
          trucks={trucks}
          packages={packages}
          recommendations={recommendations}
          selectedTruck={selectedTruck}
          selectedTruckId={selectedTruck?.id || null}
          setSelectedTruckId={setSelectedTruckId}
          onRefresh={() => refresh(user)}
          setMessage={setMessage}
        />
      )}
      {activeView === "companies" && (
        <CompaniesView
          user={user}
          companies={companies}
          requests={requests}
          onRefresh={() => refresh(user)}
          setMessage={setMessage}
        />
      )}
      {activeView === "trucks" && <TruckTable fleet={fleet} />}
      {activeView === "packages" && <PackageTable packages={packages} showDelivery />}
      {activeView === "recommendations" && (
        <RecommendationsView
          trucks={trucks}
          recommendations={recommendations}
          selectedTruckId={selectedTruck?.id || null}
          setSelectedTruckId={setSelectedTruckId}
        />
      )}
      {activeView === "qr-reader" && companyId && (
        user.role === "driver" || user.role === "warehouse" ? (
          <QrReader
            user={user}
            trucks={trucks}
            fleet={fleet}
            onRefresh={() => refresh(user)}
            setMessage={setMessage}
          />
        ) : (
          <section className="panel">
            <h2>QR Reader</h2>
            <p className="muted">QR Reader is available for warehouse and driver demo users.</p>
          </section>
        )
      )}
    </AppShell>
  );
}

function DashboardView({
  user,
  companyId,
  companies,
  requests,
  fleet,
  trucks,
  packages,
  recommendations,
  selectedTruck,
  selectedTruckId,
  setSelectedTruckId,
  onRefresh,
  setMessage
}: {
  user: User;
  companyId?: number;
  companies: Company[];
  requests: User[];
  fleet: FleetRow[];
  trucks: Truck[];
  packages: PackageItem[];
  recommendations: Recommendation[];
  selectedTruck?: Truck;
  selectedTruckId: number | null;
  setSelectedTruckId: (id: number) => void;
  onRefresh: () => void;
  setMessage: (value: string) => void;
}) {
  if (user.role === "platform_admin") {
    return <PlatformAdmin user={user} companies={companies} onRefresh={onRefresh} setMessage={setMessage} />;
  }
  if (user.role === "company_admin" && companyId) {
    return (
      <CompanyAdmin
        user={user}
        companyId={companyId}
        requests={requests}
        fleet={fleet}
        packages={packages}
        onRefresh={onRefresh}
        setMessage={setMessage}
      />
    );
  }
  if (user.role === "warehouse" && companyId) {
    return <Warehouse user={user} companyId={companyId} trucks={trucks} packages={packages} onRefresh={onRefresh} setMessage={setMessage} />;
  }
  if (user.role === "manager") {
    return (
      <Manager
        fleet={fleet}
        trucks={trucks}
        packages={packages}
        recommendations={recommendations}
        selectedTruckId={selectedTruckId}
        setSelectedTruckId={setSelectedTruckId}
      />
    );
  }
  return (
    <Driver
      user={user}
      fleet={fleet}
      packages={packages}
      selectedTruck={selectedTruck}
      recommendations={recommendations}
      setMessage={setMessage}
      onRefresh={onRefresh}
    />
  );
}

function PlatformAdmin({
  user,
  companies,
  onRefresh,
  setMessage
}: {
  user: User;
  companies: Company[];
  onRefresh: () => void;
  setMessage: (value: string) => void;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await api<Company>("/companies", user, {
      method: "POST",
      body: JSON.stringify({
        name: form.get("name"),
        email_domain: form.get("email_domain")
      })
    });
    formElement.reset();
    setMessage("Company created.");
    onRefresh();
  }

  return (
    <div className="grid two">
      <section className="panel">
        <h2>Create company</h2>
        <form className="form" onSubmit={(event) => submit(event).catch((err) => setMessage(err.message))}>
          <Field label="Company name">
            <input name="name" required placeholder="Northline Cargo" />
          </Field>
          <Field label="Email domain">
            <input name="email_domain" required placeholder="northline.com" />
          </Field>
          <button>Create company</button>
        </form>
      </section>
      <section className="panel">
        <h2>Companies</h2>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Domain</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => (
              <tr key={company.id}>
                <td>{company.name}</td>
                <td>{company.email_domain}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function CompaniesView({
  user,
  companies,
  requests,
  onRefresh,
  setMessage
}: {
  user: User;
  companies: Company[];
  requests: User[];
  onRefresh: () => void;
  setMessage: (value: string) => void;
}) {
  if (user.role === "platform_admin") {
    return <PlatformAdmin user={user} companies={companies} onRefresh={onRefresh} setMessage={setMessage} />;
  }

  return (
    <div className="grid two">
      <section className="panel">
        <h2>Company</h2>
        <table>
          <tbody>
            {companies.map((company) => (
              <tr key={company.id}>
                <td><strong>{company.name}</strong><span className="muted">{company.email_domain}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {user.role === "company_admin" && (
        <CompanyRequests user={user} requests={requests} onRefresh={onRefresh} setMessage={setMessage} />
      )}
    </div>
  );
}

function CompanyRequests({
  user,
  requests,
  onRefresh,
  setMessage
}: {
  user: User;
  requests: User[];
  onRefresh: () => void;
  setMessage: (value: string) => void;
}) {
  async function decide(id: number, action: "approve" | "reject") {
    await api<User>(`/users/${id}/${action}`, user, { method: "POST" });
    setMessage(`Join request ${action}d.`);
    onRefresh();
  }

  return (
    <section className="panel">
      <h2>Pending employee join requests</h2>
      <table>
        <tbody>
          {requests.map((request) => (
            <tr key={request.id}>
              <td><strong>{request.name}</strong><span className="muted">{request.email}</span></td>
              <td>{request.role}</td>
              <td className="actions">
                <button onClick={() => decide(request.id, "approve").catch((err) => setMessage(err.message))}>Approve</button>
                <button className="secondary" onClick={() => decide(request.id, "reject").catch((err) => setMessage(err.message))}>Reject</button>
              </td>
            </tr>
          ))}
          {!requests.length && <tr><td>No pending requests.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

function CompanyAdmin({
  user,
  requests,
  fleet,
  packages,
  onRefresh,
  setMessage
}: {
  user: User;
  companyId: number;
  requests: User[];
  fleet: FleetRow[];
  packages: PackageItem[];
  onRefresh: () => void;
  setMessage: (value: string) => void;
}) {
  return (
    <>
      <Stats fleet={fleet} packages={packages} />
      <div className="grid two">
        <CompanyRequests user={user} requests={requests} onRefresh={onRefresh} setMessage={setMessage} />
        <TruckTable fleet={fleet} />
      </div>
      <PackageTable packages={packages} />
    </>
  );
}

function Warehouse({
  user,
  companyId,
  trucks,
  packages,
  onRefresh,
  setMessage
}: {
  user: User;
  companyId: number;
  trucks: Truck[];
  packages: PackageItem[];
  onRefresh: () => void;
  setMessage: (value: string) => void;
}) {
  const [created, setCreated] = useState<PackageItem | null>(null);

  async function createPackage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      length_cm: Number(form.get("length_cm")),
      width_cm: Number(form.get("width_cm")),
      height_cm: Number(form.get("height_cm")),
      weight_kg: Number(form.get("weight_kg")),
      destination_city: form.get("destination_city"),
      delivery_city: form.get("delivery_city") || form.get("destination_city"),
      delivery_district: form.get("delivery_district"),
      street_address: form.get("street_address"),
      building_name: form.get("building_name"),
      floor: form.get("floor"),
      apartment_or_unit: form.get("apartment_or_unit"),
      delivery_notes: form.get("delivery_notes"),
      contents: form.get("contents"),
      category: form.get("category"),
      priority: form.get("priority"),
      fragile: form.get("fragile") === "on",
      cold_chain: form.get("cold_chain") === "on",
      hazardous: form.get("hazardous") === "on"
    };
    const result = await api<PackageItem>(`/companies/${companyId}/packages`, user, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    setCreated(result);
    setMessage("Package created with QR code.");
    formElement.reset();
    onRefresh();
  }

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api<PackageItem>(`/packages/${form.get("package_id")}/assign-to-truck/${form.get("truck_id")}`, user, {
      method: "POST"
    });
    setMessage("Package assigned to truck.");
    onRefresh();
  }

  async function scan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api("/packages/scan", user, {
      method: "POST",
      body: JSON.stringify({
        package_code: form.get("package_code"),
        truck_id: form.get("truck_id") ? Number(form.get("truck_id")) : null,
        event_type: form.get("event_type"),
        location_city: form.get("location_city")
      })
    });
    setMessage("Scan event recorded.");
    onRefresh();
  }

  return (
    <div className="warehouse-layout">
      <section className="panel">
        <h2>Create package</h2>
        <form className="form compact" onSubmit={(event) => createPackage(event).catch((err) => setMessage(err.message))}>
          <Field label="Length cm"><input name="length_cm" type="number" required defaultValue={90} /></Field>
          <Field label="Width cm"><input name="width_cm" type="number" required defaultValue={60} /></Field>
          <Field label="Height cm"><input name="height_cm" type="number" required defaultValue={50} /></Field>
          <Field label="Weight kg"><input name="weight_kg" type="number" required defaultValue={320} /></Field>
          <Field label="Destination"><input name="destination_city" required defaultValue="Ankara" /></Field>
          <Field label="Delivery city"><input name="delivery_city" defaultValue="Ankara" /></Field>
          <Field label="District"><input name="delivery_district" defaultValue="Cankaya" /></Field>
          <Field label="Street address"><input name="street_address" defaultValue="Ataturk Bulvari" /></Field>
          <Field label="Building"><input name="building_name" defaultValue="Kizilay Is Merkezi" /></Field>
          <Field label="Floor"><input name="floor" defaultValue="5" /></Field>
          <Field label="Unit"><input name="apartment_or_unit" defaultValue="12" /></Field>
          <Field label="Contents"><input name="contents" required defaultValue="Retail cartons" /></Field>
          <Field label="Category"><input name="category" required defaultValue="retail" /></Field>
          <Field label="Delivery notes"><input name="delivery_notes" defaultValue="Call receiver before arrival." /></Field>
          <Field label="Priority">
            <select name="priority" defaultValue="normal">
              <option>low</option>
              <option>normal</option>
              <option>high</option>
            </select>
          </Field>
          <div className="checks">
            <label><input name="fragile" type="checkbox" /> Fragile</label>
            <label><input name="cold_chain" type="checkbox" /> Cold chain</label>
            <label><input name="hazardous" type="checkbox" /> Hazardous</label>
          </div>
          <button>Create and generate QR</button>
        </form>
        {created && (
          <div className="qr-result">
            <strong>{created.package_code}</strong>
            {created.qr_code_path && <img src={`${API_BASE}${created.qr_code_path}`} alt={`QR code for ${created.package_code}`} />}
            <span>QR stores only the package code.</span>
          </div>
        )}
      </section>
      <section className="panel">
        <h2>Assign package to truck</h2>
        <form className="form" onSubmit={(event) => assign(event).catch((err) => setMessage(err.message))}>
          <Field label="Package">
            <select name="package_id">
              {packages.filter((pkg) => !pkg.assigned_truck_id).map((pkg) => (
                <option key={pkg.id} value={pkg.id}>{pkg.package_code} to {pkg.destination_city}</option>
              ))}
            </select>
          </Field>
          <Field label="Truck">
            <select name="truck_id">
              {trucks.map((truck) => (
                <option key={truck.id} value={truck.id}>{truck.plate_number} {truck.route_start} to {truck.route_end}</option>
              ))}
            </select>
          </Field>
          <button>Assign load</button>
        </form>
        <h2>Simulated QR scan</h2>
        <form className="form" onSubmit={(event) => scan(event).catch((err) => setMessage(err.message))}>
          <Field label="Package code"><input name="package_code" required defaultValue={packages[0]?.package_code} /></Field>
          <Field label="Truck">
            <select name="truck_id">
              <option value="">No truck</option>
              {trucks.map((truck) => <option key={truck.id} value={truck.id}>{truck.plate_number}</option>)}
            </select>
          </Field>
          <Field label="Event">
            <select name="event_type">
              <option>scanned</option>
              <option>loaded</option>
              <option>delivered</option>
            </select>
          </Field>
          <Field label="Location"><input name="location_city" required defaultValue="Istanbul" /></Field>
          <button>Record scan</button>
        </form>
      </section>
      <PackageTable packages={packages} />
    </div>
  );
}

function Manager({
  fleet,
  trucks,
  packages,
  recommendations,
  selectedTruckId,
  setSelectedTruckId
}: {
  fleet: FleetRow[];
  trucks: Truck[];
  packages: PackageItem[];
  recommendations: Recommendation[];
  selectedTruckId: number | null;
  setSelectedTruckId: (id: number) => void;
}) {
  return (
    <>
      <Stats fleet={fleet} packages={packages} />
      <TruckTable fleet={fleet} />
      <section className="panel">
        <div className="panel-head">
          <h2>Recommendations</h2>
          <select value={selectedTruckId || ""} onChange={(event) => setSelectedTruckId(Number(event.target.value))}>
            {trucks.map((truck) => <option key={truck.id} value={truck.id}>{truck.plate_number}</option>)}
          </select>
        </div>
        <RecommendationCards recommendations={recommendations} />
      </section>
    </>
  );
}

function RecommendationsView({
  trucks,
  recommendations,
  selectedTruckId,
  setSelectedTruckId
}: {
  trucks: Truck[];
  recommendations: Recommendation[];
  selectedTruckId: number | null;
  setSelectedTruckId: (id: number) => void;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Recommendations</h2>
        <select value={selectedTruckId || ""} onChange={(event) => setSelectedTruckId(Number(event.target.value))}>
          {trucks.map((truck) => <option key={truck.id} value={truck.id}>{truck.plate_number}</option>)}
        </select>
      </div>
      <RecommendationCards recommendations={recommendations} />
    </section>
  );
}

function QrReader({
  user,
  trucks,
  fleet,
  onRefresh,
  setMessage
}: {
  user: User;
  trucks: Truck[];
  fleet: FleetRow[];
  onRefresh: () => void;
  setMessage: (value: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [manualCode, setManualCode] = useState("SC-SEED-004");
  const [packageItem, setPackageItem] = useState<PackageItem | null>(null);
  const [selectedTruckId, setSelectedTruckId] = useState<number | null>(null);
  const [scannerStatus, setScannerStatus] = useState("Camera scanner is idle.");
  const [loadResult, setLoadResult] = useState<Capacity | null>(null);

  const assignedTruck = useMemo(
    () => trucks.find((truck) => truck.assigned_driver_id === user.id) || trucks[0],
    [trucks, user.id]
  );
  const activeTruckId = selectedTruckId || assignedTruck?.id || null;
  const activeFleetRow = fleet.find((row) => row.truck.id === activeTruckId);
  const fitsTruck = Boolean(
    packageItem &&
      activeFleetRow &&
      (packageItem.assigned_truck_id === activeTruckId ||
        (packageItem.weight_kg <= activeFleetRow.capacity.remaining_weight_kg &&
          packageItem.volume_m3 <= activeFleetRow.capacity.remaining_volume_m3))
  );

  useEffect(() => {
    if (!selectedTruckId && assignedTruck) {
      setSelectedTruckId(assignedTruck.id);
    }
  }, [assignedTruck, selectedTruckId]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function fetchPackage(code: string) {
    const cleanCode = code.trim();
    if (!cleanCode) return;
    const result = await api<PackageItem>(`/packages/code/${encodeURIComponent(cleanCode)}`, user);
    setPackageItem(result);
    setManualCode(result.package_code);
    setLoadResult(null);
    setScannerStatus(`Loaded package ${result.package_code}.`);
  }

  async function startCamera() {
    const BrowserBarcodeDetector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    if (!BrowserBarcodeDetector) {
      setScannerStatus("Camera QR scanning is not supported in this browser. Use manual package code input.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerStatus("Camera access is not available in this browser. Use manual package code input.");
      return;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }

    const detector = new BrowserBarcodeDetector({ formats: ["qr_code"] });
    let stopped = false;
    setScannerStatus("Camera scanner running. Point it at a SmartCargo QR code.");

    const scan = async () => {
      if (stopped || !videoRef.current) return;
      try {
        const codes = await detector.detect(videoRef.current);
        const code = codes[0]?.rawValue;
        if (code) {
          stopped = true;
          stream.getTracks().forEach((track) => track.stop());
          await fetchPackage(code);
          return;
        }
      } catch {
        setScannerStatus("Camera scan failed. Use manual package code input.");
      }
      window.requestAnimationFrame(scan);
    };
    window.requestAnimationFrame(scan);
  }

  async function loadPackage() {
    if (!packageItem || !activeTruckId) return;
    const result = await api<DriverLoadPackageResponse>("/driver/load-package", user, {
      method: "POST",
      body: JSON.stringify({
        package_code: packageItem.package_code,
        truck_id: activeTruckId,
        user_id: user.id,
        location_city: activeFleetRow?.truck.current_city || packageItem.delivery_city || packageItem.destination_city
      })
    });
    setPackageItem(result.package);
    setLoadResult(result.capacity);
    setMessage("Package loaded to truck.");
    onRefresh();
  }

  return (
    <div className="qr-layout">
      <section className="panel">
        <h2>QR Reader</h2>
        <div className="scanner-box">
          <video ref={videoRef} muted playsInline />
          <p>{scannerStatus}</p>
        </div>
        <div className="inline-form">
          <button type="button" onClick={() => startCamera().catch((err) => setScannerStatus(err.message))}>Start camera scan</button>
        </div>
        <form className="inline-form" onSubmit={(event) => {
          event.preventDefault();
          fetchPackage(manualCode).catch((err) => setMessage(err.message));
        }}>
          <input value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder="SC-SEED-004" />
          <button>Fetch package</button>
        </form>
        <Field label="Truck for loading">
          <select value={activeTruckId || ""} onChange={(event) => setSelectedTruckId(Number(event.target.value))}>
            {trucks.map((truck) => (
              <option key={truck.id} value={truck.id}>{truck.plate_number} - {truck.route_start} to {truck.route_end}</option>
            ))}
          </select>
        </Field>
        {packageItem && activeFleetRow && (
          <div className={fitsTruck ? "fit-result ok" : "fit-result danger"}>
            {fitsTruck ? "Fits truck" : "Does not fit truck"}
            <span>
              Remaining {fmt(activeFleetRow.capacity.remaining_weight_kg)} kg / {fmt(activeFleetRow.capacity.remaining_volume_m3, 2)} m3
            </span>
          </div>
        )}
        {packageItem && (
          <button
            disabled={!fitsTruck || !activeTruckId}
            onClick={() => loadPackage().catch((err) => setMessage(err.message))}
            type="button"
          >
            Load to truck
          </button>
        )}
        {loadResult && (
          <p className="notice">
            Loaded. New capacity: {fmt(loadResult.weight_usage_pct)}% weight, {fmt(loadResult.volume_usage_pct)}% volume.
          </p>
        )}
      </section>
      {packageItem ? <PackageDetailCard packageItem={packageItem} trucks={trucks} /> : (
        <section className="panel">
          <h2>Package details</h2>
          <p className="muted">Scan a QR code or enter a package code to fetch full package data from the backend.</p>
        </section>
      )}
    </div>
  );
}

function WarningBadges({ packageItem }: { packageItem: PackageItem }) {
  const warnings: string[] = [];
  if (packageItem.hazardous) warnings.push("Hazardous");
  if (packageItem.fragile) warnings.push("Fragile");
  if (packageItem.cold_chain) warnings.push("Cold chain required");
  if (packageItem.priority === "high") warnings.push("High priority");
  if (!warnings.length) return <span className="badge neutral">No special warnings</span>;
  return (
    <div className="badges">
      {warnings.map((warning) => <span className="badge danger" key={warning}>{warning}</span>)}
    </div>
  );
}

function PackageDetailCard({ packageItem, trucks }: { packageItem: PackageItem; trucks: Truck[] }) {
  const truck = trucks.find((item) => item.id === packageItem.assigned_truck_id);
  return (
    <section className="panel package-card">
      <div className="panel-head">
        <h2>{packageItem.package_code}</h2>
        <span className="status">{packageItem.status}</span>
      </div>
      <WarningBadges packageItem={packageItem} />
      <div className="detail-grid">
        <div><span>Destination</span><strong>{packageItem.destination_city}</strong></div>
        <div><span>City</span><strong>{packageItem.delivery_city}</strong></div>
        <div><span>District</span><strong>{packageItem.delivery_district || "-"}</strong></div>
        <div><span>Street</span><strong>{packageItem.street_address || "-"}</strong></div>
        <div><span>Building</span><strong>{packageItem.building_name || "-"}</strong></div>
        <div><span>Floor</span><strong>{packageItem.floor || "-"}</strong></div>
        <div><span>Apartment / unit</span><strong>{packageItem.apartment_or_unit || "-"}</strong></div>
        <div><span>Assigned truck</span><strong>{truck ? truck.plate_number : "Unassigned"}</strong></div>
        <div><span>Contents</span><strong>{packageItem.contents}</strong></div>
        <div><span>Category</span><strong>{packageItem.category}</strong></div>
        <div><span>Weight</span><strong>{fmt(packageItem.weight_kg)} kg</strong></div>
        <div><span>Volume</span><strong>{fmt(packageItem.volume_m3, 3)} m3</strong></div>
        <div><span>Dimensions</span><strong>{fmt(packageItem.length_cm)} x {fmt(packageItem.width_cm)} x {fmt(packageItem.height_cm)} cm</strong></div>
        <div><span>Priority</span><strong>{packageItem.priority}</strong></div>
      </div>
      <div className="notes">
        <span>Delivery notes</span>
        <p>{packageItem.delivery_notes || "No delivery notes."}</p>
      </div>
    </section>
  );
}

function Driver({
  user,
  fleet,
  packages,
  selectedTruck,
  recommendations,
  setMessage,
  onRefresh
}: {
  user: User;
  fleet: FleetRow[];
  packages: PackageItem[];
  selectedTruck?: Truck;
  recommendations: Recommendation[];
  setMessage: (value: string) => void;
  onRefresh: () => void;
}) {
  const assigned = fleet.find((row) => row.truck.assigned_driver_id === user.id) || fleet[0];
  const truck = assigned?.truck || selectedTruck;
  const capacity = assigned?.capacity;
  const loadedPackages = useMemo(
    () => packages.filter((pkg) => pkg.assigned_truck_id === truck?.id && pkg.status !== "delivered"),
    [packages, truck?.id]
  );

  async function updateLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!truck) return;
    const form = new FormData(event.currentTarget);
    await api<Truck>(`/trucks/${truck.id}/location`, user, {
      method: "PATCH",
      body: JSON.stringify({ current_city: form.get("current_city"), status: "in_transit" })
    });
    setMessage("Truck location updated.");
    onRefresh();
  }

  if (!truck || !capacity) return <section className="panel">No assigned truck.</section>;

  return (
    <>
      <div className="grid two">
        <section className="panel">
          <h2>{truck.plate_number}</h2>
          <p className="route">{truck.route_start} to {truck.route_end}</p>
          <p>Current city: <strong>{truck.current_city}</strong></p>
          <Progress value={capacity.weight_usage_pct} />
          <p className="muted">{fmt(capacity.remaining_weight_kg)} kg and {fmt(capacity.remaining_volume_m3, 2)} m3 remaining</p>
          <form className="inline-form" onSubmit={(event) => updateLocation(event).catch((err) => setMessage(err.message))}>
            <input name="current_city" defaultValue={truck.current_city} />
            <button>Update current city</button>
          </form>
        </section>
        <section className="panel">
          <h2>Loaded packages</h2>
          <table>
            <tbody>
              {loadedPackages.map((pkg) => (
                <tr key={pkg.id}>
                  <td>{pkg.package_code}</td>
                  <td>{pkg.destination_city}</td>
                  <td>{fmt(pkg.weight_kg)} kg</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      <section className="panel">
        <h2>Suggested pickup loads</h2>
        <RecommendationCards recommendations={recommendations} />
      </section>
    </>
  );
}

function Stats({ fleet, packages }: { fleet: FleetRow[]; packages: PackageItem[] }) {
  const avgCapacity = fleet.length ? fleet.reduce((sum, row) => sum + row.capacity.capacity_usage_pct, 0) / fleet.length : 0;
  return (
    <section className="stats">
      <div className="stat"><span>Trucks</span><strong>{fleet.length}</strong></div>
      <div className="stat"><span>Packages</span><strong>{packages.length || "-"}</strong></div>
      <div className="stat"><span>Avg capacity used</span><strong>{fmt(avgCapacity)}%</strong></div>
      <div className="stat"><span>Open capacity</span><strong>{fmt(100 - avgCapacity)}%</strong></div>
    </section>
  );
}

function TruckTable({ fleet }: { fleet: FleetRow[] }) {
  return (
    <section className="panel">
      <h2>Company trucks overview</h2>
      <table>
        <thead>
          <tr>
            <th>Plate</th>
            <th>Route</th>
            <th>Current city</th>
            <th>Weight</th>
            <th>Volume</th>
            <th>Remaining</th>
          </tr>
        </thead>
        <tbody>
          {fleet.map(({ truck, capacity }) => (
            <tr key={truck.id}>
              <td><strong>{truck.plate_number}</strong><span className="muted">{truck.status}</span></td>
              <td>{truck.route_start} to {truck.route_end}</td>
              <td>{truck.current_city}</td>
              <td>{fmt(capacity.used_weight_kg)} / {fmt(capacity.max_weight_kg)} kg<Progress value={capacity.weight_usage_pct} /></td>
              <td>{fmt(capacity.used_volume_m3, 2)} / {fmt(capacity.max_volume_m3, 2)} m3<Progress value={capacity.volume_usage_pct} /></td>
              <td>{fmt(capacity.remaining_weight_kg)} kg<br />{fmt(capacity.remaining_volume_m3, 2)} m3</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function PackageTable({ packages, showDelivery = false }: { packages: PackageItem[]; showDelivery?: boolean }) {
  return (
    <section className="panel wide">
      <h2>Company packages overview</h2>
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Destination</th>
            {showDelivery && <th>Delivery address</th>}
            <th>Weight</th>
            <th>Volume</th>
            <th>Flags</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {packages.map((pkg) => (
            <tr key={pkg.id}>
              <td><strong>{pkg.package_code}</strong><span className="muted">{pkg.contents}</span></td>
              <td>{pkg.destination_city}</td>
              {showDelivery && (
                <td>
                  {pkg.delivery_city}, {pkg.delivery_district}
                  <span className="muted">{pkg.street_address} - {pkg.building_name} Floor {pkg.floor} Unit {pkg.apartment_or_unit}</span>
                </td>
              )}
              <td>{fmt(pkg.weight_kg)} kg</td>
              <td>{fmt(pkg.volume_m3, 3)} m3</td>
              <td>{[pkg.fragile && "fragile", pkg.cold_chain && "cold", pkg.hazardous && "hazard"].filter(Boolean).join(", ") || "none"}</td>
              <td>{pkg.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function RecommendationCards({ recommendations }: { recommendations: Recommendation[] }) {
  if (!recommendations.length) return <p className="muted">No suitable packages for this truck right now.</p>;
  return (
    <div className="recommendation-grid">
      {recommendations.map((item) => (
        <article className="recommendation" key={item.package.id}>
          <div>
            <strong>{item.package.package_code}</strong>
            <span>{item.package.destination_city}</span>
          </div>
          <p>{item.reason}</p>
          <dl>
            <div><dt>Weight</dt><dd>{fmt(item.package.weight_kg)} kg</dd></div>
            <div><dt>Volume</dt><dd>{fmt(item.package.volume_m3, 3)} m3</dd></div>
            <div><dt>After weight</dt><dd>{fmt(item.estimated_weight_usage_pct_after)}%</dd></div>
            <div><dt>After volume</dt><dd>{fmt(item.estimated_volume_usage_pct_after)}%</dd></div>
          </dl>
        </article>
      ))}
    </div>
  );
}
