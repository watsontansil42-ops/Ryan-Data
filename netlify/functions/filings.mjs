// Netlify serverless function — fetches SEC EDGAR filings for RYAN
const CIK = "0001849253"; // Ryan Specialty Holdings CIK (zero-padded to 10 digits)
const CIK_PADDED = CIK.padStart(10, "0");
const UA = "AmwinsValDashboard admin@amwins.com"; // EDGAR requires a User-Agent

export async function handler(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=300",
  };

  const action = event.queryStringParameters?.action || "list";

  try {
    if (action === "list") {
      // Fetch recent filings from EDGAR submissions API
      const url = `https://efts.sec.gov/LATEST/search-index?q=%22Ryan+Specialty%22&dateRange=custom&startdt=2024-01-01&enddt=2026-12-31&forms=10-K,10-Q,8-K,DEF+14A,S-1,4,SC+13G,SC+13G/A,SC+13D,SC+13D/A,ARS&from=0&size=100`;
      
      // Use the submissions endpoint instead - more reliable
      const subUrl = `https://data.sec.gov/submissions/CIK${CIK_PADDED}.json`;
      const res = await fetch(subUrl, {
        headers: { "User-Agent": UA, "Accept": "application/json" },
      });
      if (!res.ok) throw new Error("EDGAR API error: " + res.status);
      const data = await res.json();

      const recent = data.filings?.recent;
      if (!recent) throw new Error("No filings data");

      const filings = [];
      const len = recent.accessionNumber?.length || 0;
      for (let i = 0; i < len && filings.length < 150; i++) {
        const form = recent.form[i];
        const date = recent.filingDate[i];
        const accession = recent.accessionNumber[i];
        const desc = recent.primaryDocDescription?.[i] || "";
        const primaryDoc = recent.primaryDocument?.[i] || "";
        const accClean = accession.replace(/-/g, "");

        const docUrl = primaryDoc
          ? `https://www.sec.gov/Archives/edgar/data/${CIK}/${accClean}/${primaryDoc}`
          : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${CIK}&type=${form}&dateb=&owner=include&count=40`;

        const indexUrl = `https://www.sec.gov/Archives/edgar/data/${CIK}/${accClean}/`;

        filings.push({
          form,
          date,
          accession,
          description: desc,
          url: docUrl,
          indexUrl,
        });
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          company: data.name || "Ryan Specialty Holdings, Inc.",
          cik: CIK,
          filings,
        }),
      };
    }

    if (action === "form4") {
      // Fetch a specific Form 4 XML and parse insider transaction details
      const accession = event.queryStringParameters?.accession;
      const doc = event.queryStringParameters?.doc;
      if (!accession || !doc) throw new Error("Missing accession or doc param");
      
      const accClean = accession.replace(/-/g, "");
      const xmlUrl = `https://www.sec.gov/Archives/edgar/data/${CIK}/${accClean}/${doc}`;
      const res = await fetch(xmlUrl, {
        headers: { "User-Agent": UA },
      });
      if (!res.ok) throw new Error("Form 4 fetch failed: " + res.status);
      const text = await res.text();

      // Basic XML parsing for Form 4 fields
      const getName = (tag) => {
        const m = text.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
        return m ? m[1].trim() : "";
      };
      const getAll = (tag) => {
        const matches = [];
        const re = new RegExp(`<${tag}>([^<]*)</${tag}>`, "g");
        let m;
        while ((m = re.exec(text)) !== null) matches.push(m[1].trim());
        return matches;
      };

      const rptOwnerName = getName("rptOwnerName");
      const officerTitle = getName("officerTitle");
      const isDirector = text.includes("<isDirector>1</isDirector>") || text.includes("<isDirector>true</isDirector>");
      const isOfficer = text.includes("<isOfficer>1</isOfficer>") || text.includes("<isOfficer>true</isOfficer>");

      // Parse transactions
      const transactions = [];
      const transCodeArr = getAll("transactionCode");
      const sharesArr = getAll("transactionShares");
      const priceArr = getAll("transactionPricePerShare");
      const adArr = getAll("transactionAcquiredDisposedCode");

      // Also try value tags
      const shareValues = getAll("value");

      for (let i = 0; i < transCodeArr.length; i++) {
        const code = transCodeArr[i];
        const shares = sharesArr[i] || shareValues[i * 3] || "";
        const price = priceArr[i] || shareValues[i * 3 + 1] || "";
        const ad = adArr[i] || "";

        transactions.push({
          code,
          shares: shares ? parseFloat(shares) : null,
          price: price ? parseFloat(price) : null,
          acquired: ad === "A",
          disposed: ad === "D",
        });
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          name: rptOwnerName,
          title: officerTitle,
          isDirector,
          isOfficer,
          transactions,
        }),
      };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: "Unknown action" }) };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
