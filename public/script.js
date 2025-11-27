// API URL configuration
// Can be overridden
const DEFAULT_API_URL = 'http://localhost:8000'
const DEFAULT_AI_API_URL = 'http://localhost:3210'

function getApiUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const apiParam = urlParams.get('api');
    if (apiParam) return apiParam.replace(/\/$/, '');
    if (window.API_URL) return window.API_URL.replace(/\/$/, '');
    return DEFAULT_API_URL;
}

function getAiApiUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const aiParam = urlParams.get('ai_api');
    if (aiParam) return aiParam.replace(/\/$/, '');
    if (window.AI_API_URL) return window.AI_API_URL.replace(/\/$/, '');
    return DEFAULT_AI_API_URL;
}

const apiURL = getApiUrl();
const aiApiURL = getAiApiUrl();
console.log('Using API:', apiURL);
console.log('Using AI API:', aiApiURL);

const outputDiv = document.getElementById('output')
const submitButton = document.getElementById('submitButton')
let oldText = 'Submit'

function loading() {
    submitButton.innerText = 'Loading'
    submitButton.ariaDisabled = true
}

function unLoad() {
    submitButton.innerText = 'Submit';
    submitButton.ariaDisabled = false
}

function ErrorBtn() {
    submitButton.innerText = 'Error - try again';
    submitButton.ariaDisabled = false
}

let selectedIndicator = null
let selectedTimePeriod = null
let currentData = null // Store fetched data for AI context

const dataToFetch = ['indicators', 'time-periods']

async function initialize() {
    dataToFetch.forEach(async(data) => {
        const res = await fetch(`${apiURL}/${data}`)
        let responses = await res?.json();
        switch (data) {
            case 'time-periods':
                responses = responses.time_periods
                break;

            default:
                break;
        }
        const select = document.getElementById(data)
        console.log(responses)
        responses.forEach(response => {
            const option = document.createElement('option');
            option.value = response.id;
            switch (data) {
                case 'indicators':
                    option.textContent = `${response.name}`;
                    break;
                case 'time-periods':
                    option.textContent = `${response}`
                    option.value = response
                default:
                    break;
            }
            select.appendChild(option);
        })
    })
}

function createTable(data) {
    if (!data.data || data.data.length === 0) {
        return '<p>No data available</p>';
    }

    const rows = data.data;

    let html = `
        <div class="table-info">
            <strong>${data.indicator.name}</strong> |
            ${data.area_type} |
            ${data.time_period} |
            ${data.count} records
        </div>
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Area Name</th>
                        <th>Value (%)</th>
                        <th>Count</th>
                        <th>Total Patients</th>
                    </tr>
                </thead>
                <tbody>
    `;

    rows.forEach(row => {
        const value = row.value !== null ? row.value.toFixed(1) : '-';
        const count = row.count !== null ? row.count.toLocaleString() : '-';
        const denominator = row.denominator !== null ? row.denominator.toLocaleString() : '-';

        html += `
            <tr>
                <td>${row.area_name}</td>
                <td class="value-cell">${value}</td>
                <td>${count}</td>
                <td>${denominator}</td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    return html;
}

async function fetchOutput() {
    loading()
    if (!selectedIndicator) {
        outputDiv.innerHTML = '<p class="placeholder">Select an indicator to see data</p>';
        return;
    }

    outputDiv.innerHTML = '<p class="loading">Loading data...</p>';

    try {
        const response = await fetch(`${apiURL}/data?indicator_id=${selectedIndicator}`);
        const data = await response.json();
        currentData = data; // Store for AI context
        unLoad()
        outputDiv.innerHTML = createTable(data);

        // Fetch AI suggestions after data loads
        fetchAiSuggestions();
    } catch (error) {
        outputDiv.innerHTML = `<p class="error">Error: ${error.message}</p>`;
        ErrorBtn()
    }
}

async function fetchMap() {
    if (!selectedIndicator) return;

    const mapDiv = document.getElementById('map-output');
    if (!mapDiv) return;

    mapDiv.innerHTML = '<p class="loading">Generating map...</p>';

    try {
        const response = await fetch(`${apiURL}/map?indicator_id=${selectedIndicator}&format=base64`);
        const data = await response.json();
        mapDiv.innerHTML = `<img src="data:image/png;base64,${data.image}" alt="Map" />`;
    } catch (error) {
        mapDiv.innerHTML = `<p class="error">Error: ${error.message}</p>`;
    }
}

async function fetchChart() {
    if (!selectedIndicator) return;

    const chartDiv = document.getElementById('chart-output');
    if (!chartDiv) return;

    chartDiv.innerHTML = '<p class="loading">Generating chart...</p>';

    try {
        const response = await fetch(`${apiURL}/chart?indicator_id=${selectedIndicator}&format=base64`);
        const data = await response.json();
        chartDiv.innerHTML = `<img src="data:image/png;base64,${data.image}" alt="Chart" />`;
    } catch (error) {
        chartDiv.innerHTML = `<p class="error">Error: ${error.message}</p>`;
    }
}

function selectIndicator() {
    selectedIndicator = document.getElementById('indicators').value;
}

function selectTimePeriod() {
    selectedTimePeriod = document.getElementById('time-periods').value;
}

function getOutput() {
    fetchOutput();
    fetchMap();
    fetchChart();
}

// =============================================================================
// AI Functionality
// =============================================================================

async function fetchAiSuggestions() {
    const suggestionsDiv = document.getElementById('ai-suggestions');
    if (!suggestionsDiv || !selectedIndicator) {
        suggestionsDiv.innerHTML = '';
        return;
    }

    suggestionsDiv.innerHTML = '<span class="loading">Generating suggestions...</span>';

    try {
        const response = await fetch(`${aiApiURL}/suggest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                indicator_id: selectedIndicator,
                time_period: selectedTimePeriod,
                data_summary: currentData ? `${currentData.count} areas, values ranging from ${Math.min(...currentData.data.map(d => d.value).filter(v => v !== null))}% to ${Math.max(...currentData.data.map(d => d.value).filter(v => v !== null))}%` : null
            })
        });

        const data = await response.json();

        if (data.suggestions && data.suggestions.length > 0) {
            suggestionsDiv.innerHTML = data.suggestions.map(suggestion =>
                `<button class="ai-suggestion-btn" onclick="useSuggestion('${suggestion.replace(/'/g, "\\'")}')">${suggestion}</button>`
            ).join('');
        } else {
            suggestionsDiv.innerHTML = '';
        }
    } catch (error) {
        console.error('Failed to fetch suggestions:', error);
        suggestionsDiv.innerHTML = '<span class="error">Could not load suggestions</span>';
    }
}

function useSuggestion(text) {
    const queryInput = document.getElementById('ai-query');
    if (queryInput) {
        queryInput.value = text;
        queryInput.focus();
    }
}

async function submitAiQuery() {
    const queryInput = document.getElementById('ai-query');
    const responseDiv = document.getElementById('ai-response');
    const submitBtn = document.getElementById('ai-submit');

    const query = queryInput?.value?.trim();

    if (!query) {
        responseDiv.innerHTML = '<p class="error">Please enter a question</p>';
        return;
    }

    if (!selectedIndicator || !currentData) {
        responseDiv.innerHTML = '<p class="error">Please select an indicator and load data first</p>';
        return;
    }

    // Disable button and show loading
    submitBtn.disabled = true;
    submitBtn.innerText = 'Analyzing...';
    responseDiv.innerHTML = '';
    responseDiv.classList.add('streaming');

    try {
        const response = await fetch(`${aiApiURL}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                indicator_id: selectedIndicator,
                time_period: selectedTimePeriod || currentData?.time_period,
                query: query,
                data: currentData?.data || []
            })
        });

        if (!response.ok) {
            throw new Error('Failed to get AI response');
        }

        // Read the stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') {
                        break;
                    }
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.content) {
                            fullResponse += parsed.content;
                            responseDiv.innerHTML = formatMarkdown(fullResponse);
                        }
                        if (parsed.error) {
                            throw new Error(parsed.error);
                        }
                    } catch (e) {
                        // Ignore parse errors for incomplete chunks
                    }
                }
            }
        }

        responseDiv.classList.remove('streaming');

    } catch (error) {
        console.error('AI query error:', error);
        responseDiv.innerHTML = `<p class="error">Error: ${error.message}</p>`;
        responseDiv.classList.remove('streaming');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = 'Analyze';
    }
}

// Simple markdown formatter
function formatMarkdown(text) {
    return text
        // Headers
        .replace(/^### (.*$)/gm, '<h3>$1</h3>')
        .replace(/^## (.*$)/gm, '<h2>$1</h2>')
        .replace(/^# (.*$)/gm, '<h1>$1</h1>')
        // Bold
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        // Italic
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        // Code
        .replace(/`(.*?)`/g, '<code>$1</code>')
        // Unordered lists
        .replace(/^\- (.*$)/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
        // Line breaks
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>')
        // Wrap in paragraph
        .replace(/^(.*)$/, '<p>$1</p>')
        // Clean up empty paragraphs
        .replace(/<p><\/p>/g, '')
        .replace(/<p><br><\/p>/g, '');
}

// Allow Enter key to submit AI query
document.addEventListener('DOMContentLoaded', () => {
    const queryInput = document.getElementById('ai-query');
    if (queryInput) {
        queryInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitAiQuery();
            }
        });
    }
});

initialize()
