import type { Db } from "../db/client.js";

/**
 * Free weather via open-meteo.com. Location stored in settings as
 * `{ lat: number, lon: number, name: string }`. Returns today's
 * high/low + current condition for the morning briefing.
 */

export interface WeatherSummary {
  location: string;
  temp_c: number;
  temp_high_c: number;
  temp_low_c: number;
  description: string;
}

export function getLocation(
  db: Db,
): { lat: number; lon: number; name: string } | null {
  const row = db.$raw.query("SELECT value FROM settings WHERE key = 'weather_location'").get() as
    | { value: string }
    | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as { lat: number; lon: number; name: string };
  } catch {
    return null;
  }
}

export function setLocation(
  db: Db,
  loc: { lat: number; lon: number; name: string } | null,
): { ok: true } {
  if (loc === null) {
    db.$raw.query("DELETE FROM settings WHERE key = 'weather_location'").run();
    return { ok: true };
  }
  db.$raw
    .query(
      "INSERT INTO settings(key, value) VALUES('weather_location', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(JSON.stringify(loc));
  return { ok: true };
}

const CODE_MAP: Record<number, string> = {
  0: "clear sky",
  1: "mainly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "fog",
  48: "rime fog",
  51: "light drizzle",
  55: "dense drizzle",
  61: "light rain",
  63: "moderate rain",
  65: "heavy rain",
  71: "light snow",
  73: "moderate snow",
  75: "heavy snow",
  80: "rain showers",
  81: "heavy rain showers",
  82: "violent rain showers",
  95: "thunderstorm",
  96: "thunderstorm w/ hail",
  99: "severe thunderstorm",
};

export async function currentWeather(db: Db): Promise<WeatherSummary | null> {
  const loc = getLocation(db);
  if (!loc) return null;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const j = (await res.json()) as {
    current?: { temperature_2m: number; weather_code: number };
    daily?: { temperature_2m_max: number[]; temperature_2m_min: number[] };
  };
  if (!j.current || !j.daily) return null;
  const code = j.current.weather_code;
  return {
    location: loc.name,
    temp_c: Math.round(j.current.temperature_2m),
    temp_high_c: Math.round(j.daily.temperature_2m_max[0] ?? j.current.temperature_2m),
    temp_low_c: Math.round(j.daily.temperature_2m_min[0] ?? j.current.temperature_2m),
    description: CODE_MAP[code] ?? `code ${code}`,
  };
}
