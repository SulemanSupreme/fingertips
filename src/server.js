import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import OpenAI from 'openai';

config();

const app = express();
const PORT = process.env.PORT || 3210;

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// =============================================================================
// Dynamic CORS - accepts same origin pattern
// e.g., localhost:3210 accepts any localhost:*
// e.g., fpai.namelus.dev accepts any *.namelus.dev
// =============================================================================
function getDynamicCorsOptions(req, callback) {
    const origin = req.header('Origin');
    let corsOptions = { origin: false };

    if (!origin) {
        // Allow requests with no origin (like mobile apps, curl, Postman)
        corsOptions = { origin: true };
    } else {
        try {
            const requestUrl = new URL(origin);
            const serverHost = req.hostname || 'localhost';

            // Check if same localhost
            if (requestUrl.hostname === 'localhost' && serverHost === 'localhost') {
                corsOptions = { origin: true };
            }
            // Check if same base domain (e.g., *.namelus.dev)
            else if (requestUrl.hostname.includes('.')) {
                const requestDomain = requestUrl.hostname.split('.').slice(-2).join('.');
                const serverDomain = serverHost.split('.').slice(-2).join('.');

                if (requestDomain === serverDomain) {
                    corsOptions = { origin: true };
                }
            }
            // Exact match
            else if (requestUrl.hostname === serverHost) {
                corsOptions = { origin: true };
            }
        } catch (e) {
            console.error('CORS origin parse error:', e);
        }
    }

    callback(null, corsOptions);
}

app.use(cors(getDynamicCorsOptions));
app.use(express.json());

// =============================================================================
// Indicator metadata for context
// =============================================================================
const INDICATOR_INFO = {
    94146: { name: "Type 1 - All 9 care processes", description: "% receiving all annual checks" },
    94147: { name: "Type 2 - All 9 care processes", description: "% receiving all annual checks" },
    94148: { name: "Type 1 - Retinal screening", description: "% getting eye exams (prevents blindness)" },
    94149: { name: "Type 2 - Retinal screening", description: "% getting eye exams" },
    94150: { name: "Type 1 - All 3 treatment targets", description: "% with HbA1c, BP & cholesterol under control" },
    94151: { name: "Type 2 - All 3 treatment targets", description: "% with HbA1c, BP & cholesterol under control" },
    94152: { name: "Type 1 - Statin prescription", description: "% prescribed statins for heart disease prevention" },
    94153: { name: "Type 2 - Statin prescription", description: "% prescribed statins for heart disease prevention" },
};

// =============================================================================
// POST /suggest - Generate 3 query suggestions based on data
// =============================================================================
app.post('/suggest', async (req, res) => {
    try {
        const { indicator_id, time_period, data_summary } = req.body;

        if (!indicator_id) {
            return res.status(400).json({ error: 'indicator_id is required' });
        }

        const indicator = INDICATOR_INFO[indicator_id] || { name: 'Unknown indicator', description: '' };

        const prompt = `You are analyzing NHS diabetes care data for England.

Current data context:
- Indicator: ${indicator.name} (${indicator.description})
- Time period: ${time_period || 'Latest'}
- Data summary: ${data_summary || 'ICB-level data showing % of patients receiving care'}

Generate exactly 3 short, specific questions a user might want to ask about this data. Each question should be:
1. Actionable and analytical
2. Related to the specific indicator
3. Under 15 words

Return ONLY a JSON array of 3 strings, no other text. Example format:
["Question 1?", "Question 2?", "Question 3?"]`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 200
        });

        const content = completion.choices[0].message.content.trim();

        // Parse JSON response
        let suggestions;
        try {
            suggestions = JSON.parse(content);
        } catch {
            // Fallback if parsing fails
            suggestions = [
                `Which areas have the lowest ${indicator.name.toLowerCase()} rates?`,
                `What's the national average for this indicator?`,
                `Are there regional patterns in the data?`
            ];
        }

        res.json({ suggestions });

    } catch (error) {
        console.error('Suggest error:', error);
        res.status(500).json({ error: 'Failed to generate suggestions' });
    }
});

// =============================================================================
// POST /analyze - Stream AI analysis of the data
// =============================================================================
app.post('/analyze', async (req, res) => {
    try {
        const { indicator_id, time_period, query, data } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'query is required' });
        }

        const indicator = INDICATOR_INFO[indicator_id] || { name: 'Unknown indicator', description: '' };

        // Format data for context
        let dataContext = '';
        if (data && Array.isArray(data)) {
            const top5 = data.slice(0, 5);
            const bottom5 = data.slice(-5);
            dataContext = `
Top 5 areas:
${top5.map((d, i) => `${i + 1}. ${d.area_name}: ${d.value}%`).join('\n')}

Bottom 5 areas:
${bottom5.map((d, i) => `${i + 1}. ${d.area_name}: ${d.value}%`).join('\n')}

Total areas: ${data.length}
`;
            // Calculate stats
            const values = data.map(d => d.value).filter(v => v !== null);
            if (values.length > 0) {
                const avg = values.reduce((a, b) => a + b, 0) / values.length;
                const min = Math.min(...values);
                const max = Math.max(...values);
                dataContext += `\nStatistics: Min ${min.toFixed(1)}%, Max ${max.toFixed(1)}%, Average ${avg.toFixed(1)}%`;
            }
        }

        const systemPrompt = `You are an expert health data analyst specializing in NHS diabetes care in England.

You are analyzing data about: ${indicator.name}
Description: ${indicator.description}
Time period: ${time_period || 'Latest available'}

Available data:
${dataContext}

Guidelines:
- Be concise but insightful
- Reference specific numbers and areas from the data
- Explain implications for patient care
- Suggest actionable insights where relevant
- Use plain language, avoid jargon
- Format with markdown for readability`;

        // Set headers for streaming
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const stream = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: query }
            ],
            temperature: 0.7,
            max_tokens: 1000,
            stream: true
        });

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
        }

        res.write('data: [DONE]\n\n');
        res.end();

    } catch (error) {
        console.error('Analyze error:', error);

        // If headers not sent, send JSON error
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to analyze data' });
        } else {
            res.write(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
            res.end();
        }
    }
});

// =============================================================================
// Health check
// =============================================================================
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        hasApiKey: !!process.env.OPENAI_API_KEY
    });
});

// =============================================================================
// Start server
// =============================================================================
app.listen(PORT, () => {
    console.log(`AI API running on http://localhost:${PORT}`);
    console.log(`OpenAI API key: ${process.env.OPENAI_API_KEY ? 'configured' : 'MISSING - set OPENAI_API_KEY in .env'}`);
});
