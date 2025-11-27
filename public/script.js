// API URL configuration
// Can be overridden 
const DEFAULT_API_URL = 'http://localhost:8000'


const apiURL = getApiUrl();
console.log('Using API:', apiURL);

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

const dataToFetch = ['indicators', 'time-periods'
]

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
        unLoad()
        outputDiv.innerHTML = createTable(data);
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

function getOutput() {

    fetchOutput();
    fetchMap();
    fetchChart();
}

initialize()
