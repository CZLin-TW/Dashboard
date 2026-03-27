const CWA_API_KEY = process.env.CWA_API_KEY ?? "";
const API_BASE = "https://opendata.cwa.gov.tw/api/v1/rest/datastore";

const CITY_MAP: Record<string, string> = {
  "臺北市": "F-D0047-063", "新北市": "F-D0047-071", "桃園市": "F-D0047-007",
  "臺中市": "F-D0047-075", "臺南市": "F-D0047-079", "高雄市": "F-D0047-067",
  "基隆市": "F-D0047-051", "新竹市": "F-D0047-055", "嘉義市": "F-D0047-059",
  "新竹縣": "F-D0047-011", "苗栗縣": "F-D0047-015", "彰化縣": "F-D0047-019",
  "南投縣": "F-D0047-023", "雲林縣": "F-D0047-027", "嘉義縣": "F-D0047-031",
  "屏東縣": "F-D0047-035", "宜蘭縣": "F-D0047-003", "花蓮縣": "F-D0047-039",
  "臺東縣": "F-D0047-043", "澎湖縣": "F-D0047-047", "金門縣": "F-D0047-087",
  "連江縣": "F-D0047-083",
};

interface WeatherPeriod {
  date: string;
  weather: string;
  minTemp: string;
  maxTemp: string;
  minFeelsLike: string;
  maxFeelsLike: string;
  rainProb: string;
}

export async function getWeather(city: string, location?: string): Promise<{
  city: string;
  location: string;
  periods: WeatherPeriod[];
} | { error: string }> {
  const normalizedCity = city.replace(/台/g, "臺");
  const dataId = CITY_MAP[normalizedCity];
  if (!dataId) return { error: `找不到城市: ${city}` };

  const params = new URLSearchParams({
    Authorization: CWA_API_KEY,
    elementName: "Wx,MinT,MaxT,MinAT,MaxAT,PoP12h",
  });
  if (location) params.set("locationName", location);

  const res = await fetch(`${API_BASE}/${dataId}?${params}`, {
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json();

  if (data.success !== "true" && data.success !== true) {
    return { error: "氣象 API 回應失敗" };
  }

  const locations = data.records?.Locations?.[0]?.Location;
  if (!locations?.length) return { error: `找不到地點: ${location ?? city}` };

  const loc = locations[0];
  const elements: Record<string, Array<{ StartTime: string; ElementValue: Array<{ Value: string }> }>> = {};
  for (const el of loc.WeatherElement) {
    elements[el.ElementName] = el.Time;
  }

  const periods: WeatherPeriod[] = [];
  const wxTimes = elements["Wx"] ?? [];
  for (let i = 0; i < Math.min(wxTimes.length, 6); i++) {
    const startTime = wxTimes[i].StartTime;
    const date = startTime.split("T")[0];
    periods.push({
      date,
      weather: wxTimes[i]?.ElementValue?.[0]?.Value ?? "",
      minTemp: elements["MinT"]?.[i]?.ElementValue?.[0]?.Value ?? "",
      maxTemp: elements["MaxT"]?.[i]?.ElementValue?.[0]?.Value ?? "",
      minFeelsLike: elements["MinAT"]?.[i]?.ElementValue?.[0]?.Value ?? "",
      maxFeelsLike: elements["MaxAT"]?.[i]?.ElementValue?.[0]?.Value ?? "",
      rainProb: elements["PoP12h"]?.[i]?.ElementValue?.[0]?.Value ?? "",
    });
  }

  return {
    city: normalizedCity,
    location: loc.LocationName,
    periods,
  };
}
