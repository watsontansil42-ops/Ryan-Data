
// Netlify serverless function — fetches RYAN price data from Yahoo Finance server-side
export async function handler(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=60",
  };

  try {
    const symbol = event.queryStringParameters?.symbol || "RYAN";
    const range = event.queryStringParameters?.range || "1d";
    const interval = event.queryStringParameters?.interval || "1d";

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`;
    let res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!res.ok) {
      res = await fetch(
        `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        }
      );
      if (!res.ok) throw new Error("Yahoo Finance unavailable");
    }

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const meta = result?.meta;
    const timestamps = result?.timestamp || [];
    const closes = result?.indicators?.quote?.[0]?.close || [];

    // Build chart data points
    const chartData = timestamps.map((ts, i) => ({
      t: ts * 1000,
      c: closes[i] != null ? Math.round(closes[i] * 100) / 100 : null,
    })).filter(d => d.c != null);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        price: meta?.regularMarketPrice,
        prevClose: meta?.chartPreviousClose || meta?.previousClose,
        currency: meta?.currency,
        exchange: meta?.exchangeName,
        chart: chartData,
        ts: new Date().toISOString(),
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

