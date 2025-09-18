// Research Worker – Super Simple (Node.js, Chat Completions + Structured Outputs)
// ------------------------------------------------------------------------------
// package.json needs:
// {
//   "scripts": { "start": "node index.js" },
//   "dependencies": { "dotenv": "^16.4.5", "express": "^4.19.2" }
// }

const express = require('express');
const dotenv = require('dotenv');
dotenv.config();

const PORT = process.env.PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

const app = express();
app.use(express.json({ limit: '2mb' }));

// CORS (so Hoppscotch/Notion etc. can call it)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/healthz', (_req, res) => res.json({ ok: true }));
// ----- JSON schema we want the model to return (with required for all nested objects) -----
const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    company_name: { type: 'string' },
    website: { type: 'string' },
    verdict: { type: 'string', enum: ['qualify', 'review', 'disqualify'] },
    reasons: { type: 'array', items: { type: 'string' } },
    metrics: {
      type: 'object',
      additionalProperties: false,
      properties: {
        revenue_usd: { type: ['number', 'null'] },
        recurring_revenue_pct: { type: ['number', 'null'] },
        fte_count: { type: ['number', 'null'] },
        year_founded: { type: ['number', 'null'] },
        funding_total_usd: { type: ['number', 'null'] },
        funding_to_revenue_ratio: { type: ['number', 'null'] },
        debt_to_revenue_ratio: { type: ['number', 'null'] }
      },
      required: [
        'revenue_usd',
        'recurring_revenue_pct',
        'fte_count',
        'year_founded',
        'funding_total_usd',
        'funding_to_revenue_ratio',
        'debt_to_revenue_ratio'
      ]
    },
    attributes: {
      type: 'object',
      additionalProperties: false,
      properties: {
        geography: { type: ['string', 'null'] },
        operates_in_english: { type: ['boolean', 'null'] },
        vertical: { type: ['string', 'null'] },
        vms: { type: ['boolean', 'null'] },
        b2b: { type: ['boolean', 'null'] },
        software: { type: ['boolean', 'null'] },
        owns_ip: { type: ['boolean', 'null'] },
        mission_critical: { type: ['boolean', 'null'] },
        founder_over_50: { type: ['boolean', 'null'] },
        private_company: { type: ['boolean', 'null'] },
        broker_involved: { type: ['boolean', 'null'] },
        valuation_not_key: { type: ['boolean', 'null'] }
      },
      required: [
        'geography',
        'operates_in_english',
        'vertical',
        'vms',
        'b2b',
        'software',
        'owns_ip',
        'mission_critical',
        'founder_over_50',
        'private_company',
        'broker_involved',
        'valuation_not_key'
      ]
    },
    criteria_flags: {
      type: 'object',
      additionalProperties: false,
      properties: {
        size_revenue_over_3m: { type: ['boolean', 'null'] },
        vintage_over_15y: { type: ['boolean', 'null'] },
        employees_over_30: { type: ['boolean', 'null'] },
        aligned_vbu: { type: ['boolean', 'null'] },
        geo_ok_eu_na_english: { type: ['boolean', 'null'] },
        recurring_over_50: { type: ['boolean', 'null'] },
        owns_ip_true: { type: ['boolean', 'null'] },
        buy_and_hold_understood: { type: ['boolean', 'null'] },
        no_broker: { type: ['boolean', 'null'] },
        valuation_not_key: { type: ['boolean', 'null'] },
        founder_over_50_true: { type: ['boolean', 'null'] },
        debt_under_1x_rev: { type: ['boolean', 'null'] },
        auto_filter_disqualify: { type: ['boolean', 'null'] }
      },
      required: [
        'size_revenue_over_3m',
        'vintage_over_15y',
        'employees_over_30',
        'aligned_vbu',
        'geo_ok_eu_na_english',
        'recurring_over_50',
        'owns_ip_true',
        'buy_and_hold_understood',
        'no_broker',
        'valuation_not_key',
        'founder_over_50_true',
        'debt_under_1x_rev',
        'auto_filter_disqualify'
      ]
    },
    notes: { type: 'string' },
    sources_used: { type: 'array', items: { type: 'string' } }
  },
    required: [
    'company_name',
    'website',
    'verdict',
    'reasons',
    'metrics',
    'attributes',
    'criteria_flags',
    'notes',           // ← add this
    'sources_used'     // ← and this
  ]
};

// ---------- OpenAI call (Chat Completions + Structured Outputs) ----------
async function callOpenAI(company_name, website, evidence) {
  const body = {
    model: 'gpt-4.1-mini',
    messages: [
      {
        role: 'system',
        content:
          'You are an M&A analyst. Evaluate targets strictly against RobCo criteria (size >$3M rev, >15y, >30 FTE; alignment to VBU; EU/NA with English operations; >50% recurring; owns IP; buy-and-hold understood; no broker; valuation not key; founder >50%; debt/investment <1x revenue). Use only the inputs provided. If a field is unknown, set it to null and explain uncertainties in notes. Return JSON EXACTLY matching the JSON Schema.'
      },
      {
        role: 'user',
        content:
          `company_name: ${company_name}\nwebsite: ${website}\nevidence: ${JSON.stringify(evidence).slice(0, 20000)}`
      }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'qualification_output',
        schema,
        strict: true
      }
    }
  };

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const j = await r.json();
  if (!r.ok) throw new Error(`OpenAI error ${r.status}: ${JSON.stringify(j)}`);

  // Chat Completions returns the JSON in choices[0].message.content (string)
  const content = j?.choices?.[0]?.message?.content;
  const parsed = typeof content === 'string' ? safeParse(content) : null;
  return parsed ?? { raw: j, note: 'Could not parse JSON; see raw.' };
}

// ---------- Analyze endpoint ----------
app.post('/analyze', async (req, res) => {
  try {
    const { url, company_name } = req.body || {};
    if (!url) return res.status(400).json({ error: 'missing url' });

    const name = company_name || new URL(url).hostname;

    // TODO: replace with approved data sources (Grata, Companies House, etc.)
    const evidence = { note: 'stub evidence — wire real sources later' };

    if (!OPENAI_API_KEY) {
      return res.json({
        company_name: name,
        website: url,
        verdict: 'review',
        reasons: ['No OpenAI key set; returning stub'],
        metrics: {
          revenue_usd: null,
          recurring_revenue_pct: null,
          fte_count: null,
          year_founded: null,
          funding_total_usd: null,
          funding_to_revenue_ratio: null,
          debt_to_revenue_ratio: null
        },
        attributes: {
          geography: null,
          operates_in_english: null,
          vertical: null,
          vms: null,
          b2b: null,
          software: null,
          owns_ip: null,
          mission_critical: null,
          founder_over_50: null,
          private_company: null,
          broker_involved: null,
          valuation_not_key: null
        },
        criteria_flags: {
          size_revenue_over_3m: null,
          vintage_over_15y: null,
          employees_over_30: null,
          aligned_vbu: null,
          geo_ok_eu_na_english: null,
          recurring_over_50: null,
          owns_ip_true: null,
          buy_and_hold_understood: null,
          no_broker: null,
          valuation_not_key: null,
          founder_over_50_true: null,
          debt_under_1x_rev: null,
          auto_filter_disqualify: null
        },
        notes: 'Stub response because OPENAI_API_KEY is not set.',
        sources_used: []
      });
    }

    const result = await callOpenAI(name, url, evidence);
    return res.json(result);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'analysis_failed', message: String(e) });
  }
});

// ---------- Start server ----------
app.listen(PORT, () => {
  console.log(`Research Worker (simple) listening on http://localhost:${PORT}`);
});
