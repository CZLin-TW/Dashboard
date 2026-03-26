import { google } from "googleapis";

let sheetsClient: ReturnType<typeof google.sheets> | null = null;
let clientInitTime = 0;
const CACHE_TTL = 60_000; // 60 seconds

function getClient() {
  const now = Date.now();
  if (sheetsClient && now - clientInitTime < CACHE_TTL) {
    return sheetsClient;
  }

  let credsRaw = process.env.GOOGLE_CREDENTIALS ?? "{}";
  // Support file path: if value starts with { it's inline JSON, otherwise read from file
  if (!credsRaw.startsWith("{")) {
    const fs = require("fs");
    credsRaw = fs.readFileSync(credsRaw, "utf-8");
  }
  const creds = JSON.parse(credsRaw);
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  sheetsClient = google.sheets({ version: "v4", auth });
  clientInitTime = now;
  return sheetsClient;
}

const SPREADSHEET_ID = process.env.SPREADSHEET_ID ?? "";

export async function getSheetData(sheetName: string): Promise<Record<string, string>[]> {
  const client = getClient();
  const res = await client.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: sheetName,
    valueRenderOption: "FORMATTED_VALUE",
  });

  const rows = res.data.values;
  if (!rows || rows.length < 2) return [];

  const headers = rows[0] as string[];
  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((h, i) => {
      record[h] = (row[i] ?? "").toString();
    });
    return record;
  });
}

export async function appendSheetRow(sheetName: string, values: string[]): Promise<void> {
  const client = getClient();
  await client.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: sheetName,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });
}

export async function updateSheetRow(
  sheetName: string,
  rowIndex: number,
  values: string[]
): Promise<void> {
  const client = getClient();
  await client.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A${rowIndex + 2}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });
}

export async function deleteSheetRow(sheetName: string, rowIndex: number): Promise<void> {
  const client = getClient();
  const meta = await client.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: "sheets.properties",
  });
  const sheet = meta.data.sheets?.find(
    (s) => s.properties?.title === sheetName
  );
  if (!sheet?.properties?.sheetId && sheet?.properties?.sheetId !== 0) return;

  await client.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: sheet.properties.sheetId,
              dimension: "ROWS",
              startIndex: rowIndex + 1,
              endIndex: rowIndex + 2,
            },
          },
        },
      ],
    },
  });
}

export async function getFamilyMembers() {
  return getSheetData("家庭成員");
}
