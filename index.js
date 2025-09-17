// ----- OpenAI call (Responses API with structured outputs) -----
async function callOpenAI(company_name, website, evidence) {
  const body = {
    model: 'gpt-4.1-mini',
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
    // ⚠️ No `modalities` field — it's not supported.
    text: {
      format: 'json_schema',
      json_schema: { name: 'qualification_output', schema }
    }
  };

  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const j = await r.json();
  if (!r.ok) {
    throw new Error(`OpenAI error ${r.status}: ${JSON.stringify(j)}`);
  }

  // Extract structured JSON; fall back to text if provider returns it that way
  const out =
    j?.output?.[0]?.content?.[0]?.json ??
    (typeof j?.output_text === 'string' ? safeParse(j.output_text) : null);

  return out ?? j;
}
