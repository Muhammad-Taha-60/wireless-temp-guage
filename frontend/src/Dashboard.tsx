import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ── Supabase ────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://owiqugejswriycdlkbxo.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93aXF1Z2Vqc3dyaXljZGxrYnhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDU1NDksImV4cCI6MjA5MzQ4MTU0OX0.F1AsMeWqy7vE0gfaFp8OcxYjTqg320RPoFfA9gxFYqk";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Types ────────────────────────────────────────────────────────────────────
interface SensorRow {
  id: number;
  temperature: number;
  humidity: number;
  created_at: string;
}

interface Derived {
  heatIndex: number;
  dewPoint: number;
  absHumidity: number;
  vapourPressure: number;
  wetBulb: number;
  specificHumidity: number;
  saturationDeficit: number;
}

type ComfortLevel = "good" | "warn" | "bad";

// ── Meteorology helpers ──────────────────────────────────────────────────────
function heatIndex(T: number, RH: number): number {
  const HI =
    -8.78469475556 +
    1.61139411 * T +
    2.33854883889 * RH -
    0.14611605 * T * RH -
    0.012308094 * T * T -
    0.0164248277778 * RH * RH +
    0.002211732 * T * T * RH +
    0.00072546 * T * RH * RH -
    0.000003582 * T * T * RH * RH;
  return round1(HI);
}

function dewPoint(T: number, RH: number): number {
  const a = 17.27,
    b = 237.7;
  const alpha = (a * T) / (b + T) + Math.log(RH / 100);
  return round1((b * alpha) / (a - alpha));
}

function absHumidity(T: number, RH: number): number {
  const es = 6.112 * Math.exp((17.67 * T) / (T + 243.5));
  return round1((216.7 * ((RH / 100) * es)) / (273.15 + T));
}

function vapourPressure(T: number, RH: number): number {
  const es = 6.112 * Math.exp((17.67 * T) / (T + 243.5));
  return round1((es * RH) / 100);
}

function wetBulb(T: number, RH: number): number {
  return round1(
    T * Math.atan(0.151977 * Math.sqrt(RH + 8.313659)) +
      Math.atan(T + RH) -
      Math.atan(RH - 1.676331) +
      0.00391838 * Math.pow(RH, 1.5) * Math.atan(0.023101 * RH) -
      4.686035
  );
}

function specificHumidity(T: number, RH: number): number {
  const es = 6.112 * Math.exp((17.67 * T) / (T + 243.5));
  const e = (RH / 100) * es;
  return round1((0.622 * e) / (1013.25 - e) * 1000);
}

function saturationDeficit(T: number, RH: number): number {
  const es = 6.112 * Math.exp((17.67 * T) / (T + 243.5));
  return round1(es - (RH / 100) * es);
}

function deriveAll(T: number, RH: number): Derived {
  return {
    heatIndex: heatIndex(T, RH),
    dewPoint: dewPoint(T, RH),
    absHumidity: absHumidity(T, RH),
    vapourPressure: vapourPressure(T, RH),
    wetBulb: wetBulb(T, RH),
    specificHumidity: specificHumidity(T, RH),
    saturationDeficit: saturationDeficit(T, RH),
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

// ── Comfort logic ────────────────────────────────────────────────────────────
function thermalComfort(T: number): [string, ComfortLevel] {
  if (T < 18) return ["Cold", "warn"];
  if (T <= 24) return ["Comfortable", "good"];
  if (T <= 28) return ["Warm", "warn"];
  return ["Hot", "bad"];
}

function humidityComfort(RH: number): [string, ComfortLevel] {
  if (RH < 30) return ["Too Dry", "warn"];
  if (RH <= 60) return ["Ideal", "good"];
  if (RH <= 70) return ["Moist", "warn"];
  return ["Too Humid", "bad"];
}

function overallComfort(T: number, RH: number): [string, ComfortLevel] {
  const [, tl] = thermalComfort(T);
  const [, hl] = humidityComfort(RH);
  if (tl === "good" && hl === "good") return ["Excellent", "good"];
  if (tl === "bad" || hl === "bad") return ["Poor", "bad"];
  return ["Fair", "warn"];
}

// ── Sub-components ───────────────────────────────────────────────────────────

function PulseDot() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: "#00D9A5",
        animation: "pulse 2s infinite",
      }}
    />
  );
}

function StatusPill() {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        background: "#111827",
        border: "0.5px solid #253347",
        borderRadius: 20,
        fontSize: 11,
        fontFamily: "'DM Mono', monospace",
        color: "#718096",
      }}
    >
      <PulseDot /> Live Feed
    </div>
  );
}

interface HeroCardProps {
  label: string;
  value: string;
  sub: string;
  accent: string;
  accentDim: string;
  icon: string;
}
function HeroCard({ label, value, sub, accent, accentDim, icon }: HeroCardProps) {
  return (
    <div
      style={{
        background: "#161D2E",
        border: "0.5px solid #1E2A40",
        borderRadius: 16,
        padding: 24,
        position: "relative",
        overflow: "hidden",
        flex: 1,
      }}
    >
      {/* glow bg */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 80% 20%, ${accent}, transparent 60%)`,
          opacity: 0.07,
          borderRadius: 16,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          fontSize: 10,
          letterSpacing: 3,
          textTransform: "uppercase",
          fontFamily: "'DM Mono', monospace",
          color: accent,
          marginBottom: 12,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 52,
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: -2,
          color: accent,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 12,
          fontFamily: "'DM Mono', monospace",
          color: "#718096",
          marginTop: 10,
        }}
      >
        {sub}
      </div>
      <div
        style={{
          position: "absolute",
          right: 20,
          top: "50%",
          transform: "translateY(-50%)",
          fontSize: 64,
          opacity: 0.12,
          pointerEvents: "none",
        }}
      >
        {icon}
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  sub: string;
  accent: string;
  fillPct: number;
}
function StatCard({ label, value, sub, accent, fillPct }: StatCardProps) {
  return (
    <div
      style={{
        background: "#161D2E",
        border: "0.5px solid #1E2A40",
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: 2,
          textTransform: "uppercase",
          fontFamily: "'DM Mono', monospace",
          color: "#4A5568",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5, color: accent }}>
        {value}
      </div>
      <div
        style={{
          fontSize: 11,
          fontFamily: "'DM Mono', monospace",
          color: "#718096",
          marginTop: 4,
        }}
      >
        {sub}
      </div>
      <div
        style={{
          height: 3,
          borderRadius: 2,
          background: "#1E2A40",
          marginTop: 10,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            borderRadius: 2,
            background: accent,
            width: `${Math.min(100, Math.max(0, fillPct))}%`,
            transition: "width 0.8s cubic-bezier(.4,0,.2,1)",
          }}
        />
      </div>
    </div>
  );
}

interface BadgeProps {
  text: string;
  level: ComfortLevel;
}
function Badge({ text, level }: BadgeProps) {
  const styles: Record<ComfortLevel, { bg: string; color: string; border: string }> = {
    good: { bg: "#0A4A3A", color: "#00FFB8", border: "#1A5A44" },
    warn: { bg: "#3A2800", color: "#FFD280", border: "#5A3800" },
    bad: { bg: "#3A1212", color: "#FFB3B3", border: "#5A1212" },
  };
  const s = styles[level];
  return (
    <span
      style={{
        padding: "3px 10px",
        borderRadius: 20,
        fontSize: 11,
        fontFamily: "'DM Mono', monospace",
        fontWeight: 500,
        background: s.bg,
        color: s.color,
        border: `0.5px solid ${s.border}`,
      }}
    >
      {text}
    </span>
  );
}

interface ComfortRowProps {
  label: string;
  children: React.ReactNode;
}
function ComfortRow({ label, children }: ComfortRowProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 8,
        fontSize: 13,
      }}
    >
      <span style={{ color: "#718096", fontFamily: "'DM Mono', monospace" }}>{label}</span>
      {children}
    </div>
  );
}

interface DerivedRowProps {
  label: string;
  value: string;
}
function DerivedRow({ label, value }: DerivedRowProps) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        padding: "8px 0",
        borderBottom: "0.5px solid #1E2A40",
      }}
    >
      <span style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: "#718096" }}>
        {label}
      </span>
      <span style={{ fontSize: 14, fontWeight: 500, color: "#E2E8F0" }}>{value}</span>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#161D2E",
        border: "0.5px solid #253347",
        borderRadius: 8,
        padding: "10px 14px",
        fontFamily: "'DM Mono', monospace",
        fontSize: 12,
      }}
    >
      <div style={{ color: "#718096", marginBottom: 6 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  );
};

// ── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [latest, setLatest] = useState<SensorRow | null>(null);
  const [history, setHistory] = useState<(SensorRow & { time: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: latestRows }, { data: histRows }] = await Promise.all([
      supabase
        .from("sensor_data")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("sensor_data")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    if (latestRows?.[0]) setLatest(latestRows[0]);
    if (histRows)
      setHistory(
        [...histRows].reverse().map((r) => ({
          ...r,
          time: new Date(r.created_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        }))
      );
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, 15000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  const T = latest?.temperature ?? 0;
  const RH = latest?.humidity ?? 0;
  const d = latest ? deriveAll(T, RH) : null;
  const updatedAt = latest
    ? new Date(latest.created_at).toLocaleTimeString()
    : "—";
  const todayStr = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const [tText, tLevel] = d ? thermalComfort(T) : ["—", "warn" as ComfortLevel];
  const [hText, hLevel] = d ? humidityComfort(RH) : ["—", "warn" as ComfortLevel];
  const [oText, oLevel] = d ? overallComfort(T, RH) : ["—", "warn" as ComfortLevel];

  return (
    <>
      {/* Global styles injected via <style> tag */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@400;500;700&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes spin   { to{transform:rotate(360deg)} }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0B0F1A; }
      `}</style>

      <div
        style={{
          minHeight: "100vh",
          background: "#0B0F1A",
          color: "#E2E8F0",
          fontFamily: "'Syne', sans-serif",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 20,
          maxWidth: 1100,
          margin: "0 auto",
        }}
      >
        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: 3,
                textTransform: "uppercase",
                color: "#4A5568",
                fontFamily: "'DM Mono', monospace",
                marginBottom: 4,
              }}
            >
              Sensor Node — KHI-01
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5, color: "#E2E8F0" }}>
              Environment Telemetry
            </h1>
            <div
              style={{
                fontSize: 12,
                color: "#718096",
                fontFamily: "'DM Mono', monospace",
                marginTop: 4,
              }}
            >
              {todayStr}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <StatusPill />
            <button
              onClick={fetchData}
              style={{
                background: "#111827",
                border: "0.5px solid #253347",
                borderRadius: 8,
                padding: "6px 12px",
                color: "#718096",
                fontFamily: "'DM Mono', monospace",
                fontSize: 11,
                cursor: "pointer",
                letterSpacing: 1,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                style={
                  loading
                    ? { display: "inline-block", animation: "spin 1s linear infinite" }
                    : undefined
                }
              >
                ↻
              </span>{" "}
              Refresh
            </button>
          </div>
        </div>

        {/* ── Hero Cards ── */}
        <div style={{ display: "flex", gap: 16 }}>
          <HeroCard
            label="Temperature"
            value={latest ? `${T.toFixed(1)}°C` : "—"}
            sub={`Updated ${updatedAt}`}
            accent="#00D9A5"
            accentDim="#0A4A3A"
            icon="🌡"
          />
          <HeroCard
            label="Humidity"
            value={latest ? `${Math.round(RH)}%` : "—"}
            sub="Relative humidity"
            accent="#7BB8FF"
            accentDim="#0D2448"
            icon="💧"
          />
        </div>

        {/* ── Stat Cards ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
          }}
        >
          <StatCard
            label="Feels Like"
            value={d ? `${d.heatIndex}°C` : "—"}
            sub="heat index"
            accent="#00D9A5"
            fillPct={d ? (d.heatIndex / 40) * 100 : 0}
          />
          <StatCard
            label="Dew Point"
            value={d ? `${d.dewPoint}°C` : "—"}
            sub="°C saturation"
            accent="#3D8EFF"
            fillPct={d ? ((d.dewPoint + 10) / 30) * 100 : 0}
          />
          <StatCard
            label="Abs. Humidity"
            value={d ? `${d.absHumidity} g/m³` : "—"}
            sub="g/m³"
            accent="#F5A623"
            fillPct={d ? (d.absHumidity / 30) * 100 : 0}
          />
          <StatCard
            label="Vapour Press."
            value={d ? `${d.vapourPressure} hPa` : "—"}
            sub="hPa"
            accent="#A78BFA"
            fillPct={d ? (d.vapourPressure / 40) * 100 : 0}
          />
        </div>

        {/* ── Chart ── */}
        <div
          style={{
            background: "#161D2E",
            border: "0.5px solid #1E2A40",
            borderRadius: 16,
            padding: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 20,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 500, color: "#E2E8F0" }}>
              Historical Trend — Last 20 Readings
            </span>
            <div style={{ display: "flex", gap: 16 }}>
              {[
                { color: "#00D9A5", label: "Temperature" },
                { color: "#3D8EFF", label: "Humidity" },
              ].map(({ color, label }) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11,
                    fontFamily: "'DM Mono', monospace",
                    color: "#718096",
                  }}
                >
                  <div
                    style={{ width: 8, height: 8, borderRadius: "50%", background: color }}
                  />
                  {label}
                </div>
              ))}
            </div>
          </div>

          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2A40" />
              <XAxis
                dataKey="time"
                stroke="#4A5568"
                tick={{
                  fill: "#4A5568",
                  fontSize: 10,
                  fontFamily: "'DM Mono', monospace",
                }}
              />
              <YAxis
                stroke="#4A5568"
                tick={{
                  fill: "#4A5568",
                  fontSize: 10,
                  fontFamily: "'DM Mono', monospace",
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="temperature"
                stroke="#00D9A5"
                strokeWidth={2}
                dot={{ r: 3, fill: "#00D9A5" }}
                name="Temp (°C)"
              />
              <Line
                type="monotone"
                dataKey="humidity"
                stroke="#3D8EFF"
                strokeWidth={2}
                dot={{ r: 3, fill: "#3D8EFF" }}
                name="Humidity (%)"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* ── Bottom Grid ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Comfort Index */}
          <div
            style={{
              background: "#161D2E",
              border: "0.5px solid #1E2A40",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: 2,
                textTransform: "uppercase",
                fontFamily: "'DM Mono', monospace",
                color: "#4A5568",
                marginBottom: 12,
              }}
            >
              Comfort Index
            </div>
            <ComfortRow label="Thermal comfort">
              <Badge text={tText} level={tLevel} />
            </ComfortRow>
            <ComfortRow label="Humidity level">
              <Badge text={hText} level={hLevel} />
            </ComfortRow>
            <ComfortRow label="Air quality est.">
              <Badge text="Nominal" level="good" />
            </ComfortRow>
            <ComfortRow label="Overall">
              <Badge text={oText} level={oLevel} />
            </ComfortRow>
          </div>

          {/* Derived Metrics */}
          <div
            style={{
              background: "#161D2E",
              border: "0.5px solid #1E2A40",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: 2,
                textTransform: "uppercase",
                fontFamily: "'DM Mono', monospace",
                color: "#4A5568",
                marginBottom: 12,
              }}
            >
              Derived Metrics
            </div>
            <DerivedRow
              label="Saturation deficit"
              value={d ? `${d.saturationDeficit} hPa` : "—"}
            />
            <DerivedRow label="Wet-bulb temp" value={d ? `${d.wetBulb} °C` : "—"} />
            <DerivedRow
              label="Specific humidity"
              value={d ? `${d.specificHumidity} g/kg` : "—"}
            />
            <DerivedRow label="Last updated" value={updatedAt} />
          </div>
        </div>
      </div>
    </>
  );
}
