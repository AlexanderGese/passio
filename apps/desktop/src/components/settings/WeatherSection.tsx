import { useEffect, useState } from "react";
import { weatherApi } from "../../ipc";
import { Section } from "./_shared";

export function WeatherSection() {
  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [current, setCurrent] = useState<Awaited<ReturnType<typeof weatherApi.get>> | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function refresh() {
    try {
      setCurrent(await weatherApi.get());
    } catch {
      setCurrent(null);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);

  async function save() {
    const latN = Number(lat),
      lonN = Number(lon);
    if (!name.trim() || Number.isNaN(latN) || Number.isNaN(lonN)) {
      setStatus("enter a name + numeric lat/lon");
      return;
    }
    await weatherApi.setLocation({ name: name.trim(), lat: latN, lon: lonN });
    setStatus("saved");
    setTimeout(() => setStatus(null), 1500);
    await refresh();
  }
  async function clear() {
    await weatherApi.setLocation(null);
    setCurrent(null);
  }

  return (
    <div className="space-y-2 text-[14px]">
      <Section label="Location" hint="Used by the morning briefing to show today's weather. Free open-meteo API — no key needed.">
        <p className="mb-2 text-[14px] text-neutral-200">
          Used by the morning briefing. Free open-meteo API — no key needed.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Berlin"
            className="no-drag col-span-2 rounded-md border border-passio-border bg-[#241B30] p-1.5 focus:border-passio-pulp focus:outline-none"
          />
          <input
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            placeholder="latitude"
            className="no-drag rounded-md border border-passio-border bg-[#241B30] p-1.5 focus:border-passio-pulp focus:outline-none"
          />
          <input
            value={lon}
            onChange={(e) => setLon(e.target.value)}
            placeholder="longitude"
            className="no-drag rounded-md border border-passio-border bg-[#241B30] p-1.5 focus:border-passio-pulp focus:outline-none"
          />
        </div>
        <div className="mt-2 flex gap-1">
          <button
            type="button"
            onClick={save}
            className="rounded-md bg-passio-pulp/80 px-2 py-1 text-black hover:bg-passio-pulp"
          >
            save
          </button>
          {current && (
            <button
              type="button"
              onClick={clear}
              className="rounded-md bg-red-900/40 px-2 py-1 text-red-200 hover:bg-red-900/60"
            >
              clear
            </button>
          )}
        </div>
        {status && <p className="mt-2 text-[14px] text-emerald-300">{status}</p>}
      </Section>
      {current && (
        <Section label="Current">
          <p>
            {current.location} · {current.description} · {current.temp_c}°C (H {current.temp_high_c}/L {current.temp_low_c})
          </p>
        </Section>
      )}
    </div>
  );
}
