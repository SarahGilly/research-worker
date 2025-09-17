// Research Worker – Super Simple (Node.js, no TypeScript)
// ------------------------------------------------------
// What you need installed: Node 18+ (so that global fetch exists) and npm.
// How to run:
//   1) npm init -y
//   2) npm i express dotenv
//   3) create .env with OPENAI_API_KEY=sk-... (optional at first)
//   4) node index.js
// Endpoints:
//   GET /healthz  -> { ok: true }
//   POST /analyze -> returns stub JSON unless OPENAI_API_KEY is set, then calls OpenAI Responses API

const express = require('express');
const dotenv = require('dotenv');
dotenv.config();

const PORT = process.env.PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/healthz', (req, res) => {
  res.json({ ok: true });
});

// Minimal JSON schema we want back
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
      }
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
      }
    },
    criteria_flags: {
      type: 'object',
      additionalProperties: false,
      properties: {
        size_revenue_over_3m: { type: ['boolean','null'] },
        vintage_over_15y: { type: ['boolean','null'] },
        employees_over_30: { type: ['boolean','null'] },
        aligned_vbu: { type: ['boolean','null'] },
        geo_ok_eu_na_english: { type: ['boolean','null'] },
        recurring_over_50: { type: ['boolean','null'] },
        owns_ip_true: { type: ['boolean','null'] },
        buy_and_hold_understood: { type: ['boolean','null'] },
        no_broker: { type: ['boolean','null'] },
        valuation_not_key: { type: ['boolean','null'] },
        founder_over_50_true: { type: ['boolean','null'] },
        debt_under_1x_rev: { type: ['boolean','null'] },
        auto_filter_disqualify: { type: ['boolean','null'] }
      }
    },
    notes: { type: 'string' },
    sources_used: { type: 'array', items: { type: 'string' } }
  },
  required: ['company_name','website','verdict','reasons','metrics','attributes','criteria_flags']
};

// Very small helper to call OpenAI Responses API
// --- replace your existing callOpenAI function with this ---
async function callOpenAI(company_name, website, evidence) {
  const body = {
    model: 'gpt-4.1-mini',

    // Messages
    input: [
      {
        role: 'system',
        content:
          'You are an M&A analyst. Evaluate targets strictly against RobCo criteria (size >$3M rev, >15y, >30 FTE; alignment to VBU; EU/NA with English operations; >50% recurring; owns IP; buy-and-hold understood; no broker; valuation not key; founder >50%; debt/investment <1x revenue). Use only the inputs provided. If a field is unknown, set it to null and explain uncertainties in notes. Return JSON EXACTLY matching the JSON Schema.'
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: `company_name: ${company_name}` },
          { type: 'text', text: `website: ${website}` },
          { type: 'text', text: `evidence: ${JSON.stringify(evidence).slice(0, 20000)}` }
        ]
      }
    ],

    // ✨ Structured Outputs (new Responses API shape)
    modalities: ['text'],
    text: {
      format: 'json_schema',
      json_schema: { name: 'qualification_output', schema } // <-- `schema` is the JSON schema object defined above
    }
  };

  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const j = await r.json();
  if (!r.ok) throw new Error(`OpenAI error ${r.status}: ${JSON.stringify(j)}`);

  // Try to extract structured JSON; fall back to text
  const out =
    j?.output?.[0]?.content?.[0]?.json ??
    (typeof j?.output_text === 'string' ? safeParse(j.output_text) : null);

  return out ?? j;
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}
